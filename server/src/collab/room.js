import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Persistor } from './persistor.js';
import { PS_AWARENESS, PS_SYNC_REQUEST, PS_UPDATE } from './pubsub.js';

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;

const ORIGIN_LOAD = 'persistence:load';
const ORIGIN_REMOTE = 'pubsub:remote';

/**
 * A connection as the room sees it (transport agnostic, so it is trivial to test):
 *   { role: 'editor' | 'viewer', user, send(Uint8Array), close(code, reason) }
 */
export class Room {
  constructor(id, { store, pubsub = null, logger, flushMs, compactEvery }) {
    this.id = id;
    this.logger = logger;
    this.pubsub = pubsub;
    this.conns = new Set();
    this.idleTimer = null;

    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null); // the server itself has no presence

    this.persistor = new Persistor({ boardId: id, store, logger, flushMs, compactEvery });

    this.doc.on('update', this.onDocUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
  }

  async init() {
    this.pubsub?.subscribe(this.id, (type, payload) => this.onPubSub(type, payload));
    await this.persistor.load(this.doc, ORIGIN_LOAD);
    // Ask other instances holding this board for edits that are not in the database yet.
    this.pubsub?.publish(this.id, PS_SYNC_REQUEST, Y.encodeStateVector(this.doc));
  }

  get size() {
    return this.conns.size;
  }

  // --- document / awareness fan-out ---------------------------------------------

  onDocUpdate = (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const conn of this.conns) if (conn !== origin) conn.send(message);

    if (origin === ORIGIN_LOAD || origin === ORIGIN_REMOTE) return;
    this.persistor.push(update);
    this.pubsub?.publish(this.id, PS_UPDATE, update);
  };

  onAwarenessUpdate = ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    if (origin && typeof origin === 'object' && this.conns.has(origin)) {
      // remember which awareness clients belong to which socket so we can clean up on close
      added.forEach((clientId) => origin.clientIds.add(clientId));
      removed.forEach((clientId) => origin.clientIds.delete(clientId));
    }
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const conn of this.conns) if (conn !== origin) conn.send(message);

    if (origin !== ORIGIN_REMOTE) this.pubsub?.publish(this.id, PS_AWARENESS, update);
  };

  onPubSub(type, payload) {
    if (type === PS_UPDATE) {
      Y.applyUpdate(this.doc, payload, ORIGIN_REMOTE);
    } else if (type === PS_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, payload, ORIGIN_REMOTE);
    } else if (type === PS_SYNC_REQUEST) {
      const diff = Y.encodeStateAsUpdate(this.doc, payload);
      if (diff.length > 2) this.pubsub.publish(this.id, PS_UPDATE, diff);
    }
  }

  // --- connections ------------------------------------------------------------

  addConnection(conn) {
    clearTimeout(this.idleTimer);
    conn.clientIds = new Set();
    this.conns.add(conn);

    // 1) sync step 1: "here is my state vector, send me what I am missing"
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    conn.send(encoding.toUint8Array(encoder));

    // 2) everybody who is already here
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys())),
      );
      conn.send(encoding.toUint8Array(awarenessEncoder));
    }
  }

  removeConnection(conn) {
    if (!this.conns.delete(conn)) return;
    awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(conn.clientIds ?? []), null);
  }

  /** Handles one binary message coming from a client. */
  receive(conn, data) {
    try {
      const decoder = decoding.createDecoder(data instanceof Uint8Array ? data : new Uint8Array(data));
      const type = decoding.readVarUint(decoder);

      if (type === MSG_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        if (conn.role === 'viewer') {
          // Read-only access is enforced HERE, not in the UI: viewers may ask for
          // state (step 1) but every write (step 2 / update) is silently dropped.
          const subType = decoding.readVarUint(decoder);
          if (subType !== syncProtocol.messageYjsSyncStep1) return;
          syncProtocol.readSyncStep1(decoder, encoder, this.doc);
        } else {
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn);
        }
        if (encoding.length(encoder) > 1) conn.send(encoding.toUint8Array(encoder));
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
      }
    } catch (err) {
      this.logger.warn({ err, boardId: this.id }, 'malformed collaboration message');
    }
  }

  /** Force pending edits into the database (used by tests and on shutdown). */
  flush() {
    return this.persistor.flush();
  }

  async destroy({ persist = true } = {}) {
    clearTimeout(this.idleTimer);
    this.pubsub?.unsubscribe(this.id);
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    if (persist) await this.persistor.close();
    else this.persistor.discard();
    for (const conn of this.conns) conn.close?.(1001, 'room closed');
    this.conns.clear();
    this.awareness.destroy();
    this.doc.destroy();
  }
}
