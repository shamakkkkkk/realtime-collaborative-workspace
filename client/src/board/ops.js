import * as Y from 'yjs';
import { newId } from './geometry.js';

export const LOCAL = 'local'; // transaction origin tracked by the UndoManager

const BOX = new Set(['sticky', 'rect', 'ellipse', 'text']);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const MAX_TEXT = 5000;

/** Returns a clean element or null. Protects the shared document from bad clipboard data. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const color = typeof raw.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(raw.color) ? raw.color : '#ffd166';
  if (BOX.has(raw.type)) {
    if (![raw.x, raw.y, raw.w, raw.h].every(finite)) return null;
    const text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_TEXT) : '';
    return { type: raw.type, x: raw.x, y: raw.y, w: raw.w, h: raw.h, color, text };
  }
  if (raw.type === 'arrow') {
    if (![raw.x, raw.y, raw.x2, raw.y2].every(finite)) return null;
    return { type: 'arrow', x: raw.x, y: raw.y, x2: raw.x2, y2: raw.y2, color };
  }
  if (raw.type === 'pen') {
    if (![raw.x, raw.y, raw.w, raw.h].every(finite)) return null;
    if (!Array.isArray(raw.points) || raw.points.length < 2 || raw.points.length > 20000) return null;
    if (!raw.points.every(finite)) return null;
    return { type: 'pen', x: raw.x, y: raw.y, w: raw.w, h: raw.h, points: raw.points, color, width: finite(raw.width) ? raw.width : 3 };
  }
  return null;
}

/** All mutations of the board go through here. */
export function createOps({ doc, elements, store, userId }) {
  const nextZ = () => {
    const list = store.getSnapshot();
    return list.length ? list[list.length - 1].z + 1 : 1;
  };

  const write = (ymap, patch) => {
    for (const [key, value] of Object.entries(patch)) {
      if (ymap.get(key) !== value) ymap.set(key, value);
    }
  };

  return {
    create(props) {
      const id = props.id ?? newId();
      const full = { ...props, id, z: nextZ(), by: userId };
      doc.transact(() => {
        const ymap = new Y.Map();
        for (const [key, value] of Object.entries(full)) ymap.set(key, value);
        elements.set(id, ymap);
      }, LOCAL);
      return id;
    },

    update(id, patch) {
      const ymap = elements.get(id);
      if (!ymap) return;
      doc.transact(() => write(ymap, patch), LOCAL);
    },

    /** patches: { [id]: patch } applied as ONE transaction (one undo step, one network message). */
    updateMany(patches) {
      doc.transact(() => {
        for (const [id, patch] of Object.entries(patches)) {
          const ymap = elements.get(id);
          if (ymap) write(ymap, patch);
        }
      }, LOCAL);
    },

    remove(ids) {
      doc.transact(() => {
        for (const id of ids) elements.delete(id);
      }, LOCAL);
    },

    /**
     * Inserts copies of `items` (plain element objects, e.g. from the clipboard).
     * Input is untrusted, so everything is validated and clamped first.
     */
    insert(items, offset = 28) {
      const created = [];
      doc.transact(() => {
        let z = nextZ();
        for (const raw of items) {
          const copy = sanitize(raw);
          if (!copy) continue;
          copy.id = newId();
          copy.z = z++;
          copy.by = userId;
          copy.x += offset;
          copy.y += offset;
          if (copy.type === 'arrow') {
            copy.x2 += offset;
            copy.y2 += offset;
          }
          const ymap = new Y.Map();
          for (const [key, value] of Object.entries(copy)) ymap.set(key, value);
          elements.set(copy.id, ymap);
          created.push(copy.id);
        }
      }, LOCAL);
      return created;
    },

    duplicate(ids, offset = 28) {
      const items = ids.map((id) => elements.get(id)?.toJSON()).filter(Boolean);
      return this.insert(items, offset);
    },
  };
}
