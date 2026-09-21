import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { colorForUser } from './geometry.js';
import { createElementsStore } from './store.js';
import { createOps, LOCAL } from './ops.js';

/**
 * One collaborative session = one Y.Doc + one WebSocket provider.
 * Auth is the httpOnly session cookie, which the browser attaches to the
 * WebSocket handshake automatically (same origin).
 */
export function createSession({ boardId, user }) {
  const doc = new Y.Doc();
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const provider = new WebsocketProvider(`${protocol}://${window.location.host}/ws`, boardId, doc);
  const awareness = provider.awareness;

  awareness.setLocalStateField('user', {
    id: user.id,
    name: user.name,
    color: colorForUser(user.id),
  });

  const elements = doc.getMap('elements');
  const store = createElementsStore(elements);
  const ops = createOps({ doc, elements, store, userId: user.id });

  // Per-user undo/redo: only THIS user's changes are undone, never a teammate's.
  const undo = new Y.UndoManager(elements, {
    trackedOrigins: new Set([LOCAL]),
    captureTimeout: 500,
  });

  return {
    doc,
    provider,
    awareness,
    elements,
    store,
    ops,
    undo,
    destroy() {
      undo.destroy();
      store.destroy();
      provider.destroy();
      doc.destroy();
    },
  };
}
