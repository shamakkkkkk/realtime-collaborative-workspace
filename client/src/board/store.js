import * as Y from 'yjs';

/**
 * Bridges the CRDT (Y.Map of Y.Maps) and React.
 *
 * Every element lives in `elements` as a Y.Map, so two people editing different
 * properties of the same shape (one moves, one recolours) both win. The store
 * keeps a plain-object cache and only re-creates objects of elements that
 * actually changed, so React.memo can skip everything else while somebody drags.
 */
export function createElementsStore(elements) {
  const cache = new Map(); // id -> plain object
  const listeners = new Set();
  let snapshot = [];

  const rebuild = () => {
    snapshot = Array.from(cache.values()).sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
  };

  const refresh = (id) => {
    const ymap = elements.get(id);
    if (ymap instanceof Y.Map) cache.set(id, ymap.toJSON());
    else cache.delete(id);
  };

  elements.forEach((_, id) => refresh(id));
  rebuild();

  const observer = (events) => {
    const dirty = new Set();
    for (const event of events) {
      if (event.target === elements) {
        event.changes.keys.forEach((_, key) => dirty.add(key));
      } else if (event.path.length > 0) {
        dirty.add(event.path[0]);
      }
    }
    dirty.forEach(refresh);
    rebuild();
    listeners.forEach((fn) => fn());
  };
  elements.observeDeep(observer);

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => snapshot,
    destroy() {
      elements.unobserveDeep(observer);
      listeners.clear();
    },
  };
}
