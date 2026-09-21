import * as Y from 'yjs';

/** In-memory twin of PgStore. Used by the test-suite. */
export class MemoryStore {
  constructor() {
    this.snapshots = new Map();
    this.updates = new Map();
    this.nextId = 1;
  }

  async load(boardId) {
    return {
      snapshot: this.snapshots.get(boardId) ?? null,
      updates: [...(this.updates.get(boardId) ?? [])],
    };
  }

  async append(boardId, payload) {
    const id = this.nextId++;
    const list = this.updates.get(boardId) ?? [];
    list.push({ id, payload: new Uint8Array(payload) });
    this.updates.set(boardId, list);
    return id;
  }

  async compact(boardId) {
    const list = this.updates.get(boardId) ?? [];
    if (list.length === 0) return 0;
    const doc = new Y.Doc();
    const snap = this.snapshots.get(boardId);
    if (snap) Y.applyUpdate(doc, snap);
    for (const u of list) Y.applyUpdate(doc, u.payload);
    this.snapshots.set(boardId, Y.encodeStateAsUpdate(doc));
    doc.destroy();
    this.updates.set(boardId, []);
    return list.length;
  }
}
