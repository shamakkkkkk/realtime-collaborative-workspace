import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Room, MSG_AWARENESS, MSG_SYNC } from '../src/collab/room.js';
import { MemoryStore } from '../src/collab/memory-store.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/** A tiny y-websocket-like client wired straight into a Room (no sockets). */
class TestClient {
  constructor(room, role = 'editor') {
    this.room = room;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.conn = {
      role,
      user: { id: `user-${role}`, name: role },
      send: (bytes) => this.fromServer(bytes),
      close() {},
    };

    // local edits -> server
    this.doc.on('update', (update, origin) => {
      if (origin === this) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      room.receive(this.conn, encoding.toUint8Array(encoder));
    });
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin === this) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, added.concat(updated, removed)),
      );
      room.receive(this.conn, encoding.toUint8Array(encoder));
    });

    room.addConnection(this.conn);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    room.receive(this.conn, encoding.toUint8Array(encoder));
  }

  fromServer(bytes) {
    const decoder = decoding.createDecoder(bytes);
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
      if (encoding.length(encoder) > 1) this.room.receive(this.conn, encoding.toUint8Array(encoder));
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
    }
  }

  get elements() {
    return this.doc.getMap('elements');
  }

  destroy() {
    this.awareness.destroy(); // clears the awareness heartbeat interval
    this.doc.destroy();
  }
}

async function finish(room, ...clients) {
  clients.forEach((c) => c.destroy());
  await room.destroy();
}

async function makeRoom(store = new MemoryStore()) {
  const room = new Room('board-1', { store, logger: silent, flushMs: 5, compactEvery: 3 });
  await room.init();
  return { room, store };
}

test('edits propagate between editors', async () => {
  const { room } = await makeRoom();
  const a = new TestClient(room);
  const b = new TestClient(room);

  a.elements.set('n1', 'sticky');
  assert.equal(b.elements.get('n1'), 'sticky');

  b.elements.set('n2', 'rect');
  assert.equal(a.elements.get('n2'), 'rect');
  await finish(room, a, b);
});

test('a late joiner receives the full state', async () => {
  const { room } = await makeRoom();
  const a = new TestClient(room);
  a.elements.set('n1', 'sticky');
  const late = new TestClient(room);
  assert.equal(late.elements.get('n1'), 'sticky');
  await finish(room, a, late);
});

test('viewers can read but their writes are dropped by the server', async () => {
  const { room } = await makeRoom();
  const editor = new TestClient(room, 'editor');
  const viewer = new TestClient(room, 'viewer');

  editor.elements.set('n1', 'from-editor');
  assert.equal(viewer.elements.get('n1'), 'from-editor');

  viewer.elements.set('evil', 'from-viewer');
  assert.equal(editor.elements.get('evil'), undefined);
  assert.equal(room.doc.getMap('elements').get('evil'), undefined);
  await finish(room, editor, viewer);
});

test('presence is broadcast and cleaned up on disconnect', async () => {
  const { room } = await makeRoom();
  const a = new TestClient(room);
  const b = new TestClient(room);

  a.awareness.setLocalState({ user: { name: 'Ada' } });
  assert.equal(b.awareness.getStates().get(a.doc.clientID)?.user.name, 'Ada');

  room.removeConnection(a.conn);
  assert.equal(b.awareness.getStates().has(a.doc.clientID), false);
  await finish(room, a, b);
});

test('state survives a restart (persistence + compaction)', async () => {
  const { room, store } = await makeRoom();
  const a = new TestClient(room);
  for (let i = 0; i < 7; i++) {
    a.elements.set(`n${i}`, `value-${i}`);
    await room.flush(); // one log row per edit -> triggers compaction (every 3)
  }
  a.destroy();
  await room.destroy();

  const { room: reborn } = await makeRoom(store);
  const b = new TestClient(reborn);
  for (let i = 0; i < 7; i++) assert.equal(b.elements.get(`n${i}`), `value-${i}`);

  const snapshot = store.snapshots.get('board-1');
  assert.ok(snapshot && snapshot.length > 0, 'a compacted snapshot exists');
  assert.ok(store.updates.get('board-1').length < 7, 'the log was folded into the snapshot');
  await finish(reborn, b);
});
