import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoxElement, DraftStroke, VectorElement } from './Elements.jsx';
import SelectionBox from './SelectionBox.jsx';
import {
  bounds,
  clamp,
  intersects,
  rectFromPoints,
  resizeBox,
  round1,
} from './geometry.js';
import { MAX_ZOOM, MIN_ZOOM, TEXT_TYPES } from './constants.js';

const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

/**
 * Infinite canvas. Pan/zoom is a single CSS transform on the "world" layer, so
 * text stays crisp and all shapes are plain DOM/SVG nodes.
 */
export default function Canvas(props) {
  const {
    elements, ops, awareness, remote, cam, setCam, tool, setTool, color,
    selection, setSelection, editingId, setEditingId, readOnly,
  } = props;

  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const spaceRef = useRef(false);
  const lastDownRef = useRef({ time: 0, x: 0, y: 0, key: null });
  const cursorRef = useRef({ frame: 0, point: null });
  const [draft, setDraft] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);

  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);

  // Handlers live in a stable closure and read the freshest props through this ref.
  const latest = useRef(null);
  latest.current = {
    elements, byId, ops, awareness, cam, setCam, tool, setTool, color,
    selection, setSelection, editingId, setEditingId, readOnly,
  };

  const handlers = useMemo(() => {
    const L = () => latest.current;

    const toWorld = (clientX, clientY) => {
      const rect = rootRef.current.getBoundingClientRect();
      const { cam: c } = L();
      return { x: (clientX - rect.left - c.x) / c.zoom, y: (clientY - rect.top - c.y) / c.zoom };
    };

    const broadcastCursor = (point) => {
      const state = cursorRef.current;
      state.point = point;
      if (state.frame) return;
      state.frame = requestAnimationFrame(() => {
        state.frame = 0;
        L().awareness.setLocalStateField('cursor', state.point);
      });
    };

    function beginDrag(drag) {
      dragRef.current = drag;
      const move = (e) => onDragMove(e, drag);
      const up = (e) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        dragRef.current = null;
        onDragEnd(e, drag);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    function onDragMove(e, drag) {
      const { ops: o, cam: c, setSelection: setSel, setCam: setCamera, elements: list } = L();
      if (drag.kind === 'pan') {
        setCamera({ ...drag.cam, x: drag.cam.x + e.clientX - drag.sx, y: drag.cam.y + e.clientY - drag.sy });
        return;
      }
      const p = toWorld(e.clientX, e.clientY);

      if (drag.kind === 'move') {
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) * c.zoom < 3) return; // click, not drag
        drag.moved = true;
        const patches = {};
        for (const [id, orig] of drag.origs) {
          patches[id] =
            orig.x2 !== undefined
              ? { x: orig.x + dx, y: orig.y + dy, x2: orig.x2 + dx, y2: orig.y2 + dy }
              : { x: orig.x + dx, y: orig.y + dy };
        }
        o.updateMany(patches);
      } else if (drag.kind === 'resize') {
        if (drag.handle === 'p1') o.update(drag.id, { x: p.x, y: p.y });
        else if (drag.handle === 'p2') o.update(drag.id, { x2: p.x, y2: p.y });
        else o.update(drag.id, resizeBox(drag.orig, drag.handle, p, drag.orig.type === 'text' ? 40 : 24));
      } else if (drag.kind === 'marquee') {
        const rect = rectFromPoints(drag.start, p);
        setMarquee(rect);
        const next = new Set(drag.base);
        for (const el of list) if (intersects(bounds(el), rect)) next.add(el.id);
        if (!sameSet(next, L().selection)) setSel(next);
      } else if (drag.kind === 'shape') {
        drag.rect = rectFromPoints(drag.start, p);
        o.update(drag.id, drag.rect);
      } else if (drag.kind === 'arrow') {
        drag.end = p;
        o.update(drag.id, { x2: p.x, y2: p.y });
      } else if (drag.kind === 'pen') {
        const last = drag.points.length;
        const lx = drag.points[last - 2];
        const ly = drag.points[last - 1];
        if (Math.hypot(p.x - lx, p.y - ly) * c.zoom < 2) return;
        drag.points.push(round1(p.x), round1(p.y));
        setDraft({ points: drag.points.slice(), color: drag.color });
      }
    }

    function onDragEnd(e, drag) {
      const { ops: o, setSelection: setSel, setTool: setT } = L();
      if (drag.kind === 'pan') {
        setPanning(false);
      } else if (drag.kind === 'marquee') {
        setMarquee(null);
      } else if (drag.kind === 'shape') {
        if (!drag.rect || (drag.rect.w < 8 && drag.rect.h < 8)) {
          const w = 180;
          const h = 120;
          o.update(drag.id, { x: drag.start.x - w / 2, y: drag.start.y - h / 2, w, h });
        }
        setSel(new Set([drag.id]));
        setT('select');
      } else if (drag.kind === 'arrow') {
        if (!drag.end || Math.hypot(drag.end.x - drag.start.x, drag.end.y - drag.start.y) < 8) o.remove([drag.id]);
        else setSel(new Set([drag.id]));
        setT('select');
      } else if (drag.kind === 'pen') {
        const pts = drag.points;
        if (pts.length < 4) pts.push(pts[0] + 0.1, pts[1]);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
          minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
        }
        o.create({
          type: 'pen',
          x: minX,
          y: minY,
          w: Math.max(maxX - minX, 1),
          h: Math.max(maxY - minY, 1),
          points: pts.map((v, i) => round1(v - (i % 2 ? minY : minX))),
          color: drag.color,
          width: 3,
        });
        setDraft(null);
      }
    }

    function onPointerDown(e) {
      if (e.target.tagName === 'TEXTAREA') return;
      if (e.button !== 0 && e.button !== 1) return;
      const S = L();

      if (S.editingId) {
        // leaving an empty text element removes it (unmounting does not always fire blur)
        const editing = S.byId.get(S.editingId);
        if (editing?.type === 'text' && !(editing.text || '').trim()) S.ops.remove([editing.id]);
        S.setEditingId(null);
      }

      const wantsPan =
        e.button === 1 || S.tool === 'hand' || spaceRef.current || (S.readOnly && e.button === 0);
      if (wantsPan) {
        setPanning(true);
        beginDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, cam: S.cam });
        return;
      }

      const p = toWorld(e.clientX, e.clientY);
      const handle = e.target.closest?.('[data-handle]')?.dataset.handle;
      const id = e.target.closest?.('[data-id]')?.dataset.id;

      if (S.tool === 'select') {
        // manual double-click detection (pointer capture would swallow dblclick targets)
        const key = id ?? '__canvas__';
        const last = lastDownRef.current;
        const now = performance.now();
        const isDouble =
          !handle && last.key === key && now - last.time < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6;
        lastDownRef.current = { time: now, x: e.clientX, y: e.clientY, key: isDouble ? null : key };

        if (isDouble) {
          if (id) {
            const el = S.byId.get(id);
            if (el && TEXT_TYPES.includes(el.type)) {
              S.setSelection(new Set([id]));
              S.setEditingId(id);
            }
          } else {
            const newId = S.ops.create({
              type: 'sticky', x: p.x - 110, y: p.y - 90, w: 220, h: 180, color: S.color, text: '',
            });
            S.setSelection(new Set([newId]));
            S.setEditingId(newId);
          }
          return;
        }

        if (handle) {
          const single = [...S.selection][0];
          const el = S.byId.get(single);
          if (el) beginDrag({ kind: 'resize', handle, id: single, orig: { x: el.x, y: el.y, w: el.w, h: el.h, type: el.type } });
          return;
        }

        if (id) {
          let sel = S.selection;
          if (e.shiftKey) {
            sel = new Set(sel);
            if (sel.has(id)) sel.delete(id);
            else sel.add(id);
            S.setSelection(sel);
            if (!sel.has(id)) return;
          } else if (!sel.has(id)) {
            sel = new Set([id]);
            S.setSelection(sel);
          }
          const origs = new Map();
          for (const sid of sel) {
            const el = S.byId.get(sid);
            if (el) origs.set(sid, { x: el.x, y: el.y, x2: el.x2, y2: el.y2 });
          }
          beginDrag({ kind: 'move', start: p, origs, moved: false });
          return;
        }

        const base = e.shiftKey ? new Set(S.selection) : new Set();
        if (!e.shiftKey && S.selection.size) S.setSelection(new Set());
        beginDrag({ kind: 'marquee', start: p, base });
        return;
      }

      // ---- creation tools ----
      if (S.tool === 'sticky') {
        const newId = S.ops.create({
          type: 'sticky', x: p.x - 110, y: p.y - 90, w: 220, h: 180, color: S.color, text: '',
        });
        S.setSelection(new Set([newId]));
        S.setEditingId(newId);
        S.setTool('select');
      } else if (S.tool === 'text') {
        const newId = S.ops.create({
          type: 'text', x: p.x, y: p.y, w: 260, h: 36, color: S.color, text: '',
        });
        S.setSelection(new Set([newId]));
        S.setEditingId(newId);
        S.setTool('select');
      } else if (S.tool === 'rect' || S.tool === 'ellipse') {
        const newId = S.ops.create({
          type: S.tool, x: p.x, y: p.y, w: 1, h: 1, color: S.color, text: '',
        });
        beginDrag({ kind: 'shape', id: newId, start: p, rect: null });
      } else if (S.tool === 'arrow') {
        const newId = S.ops.create({
          type: 'arrow', x: p.x, y: p.y, x2: p.x, y2: p.y, color: S.color,
        });
        beginDrag({ kind: 'arrow', id: newId, start: p, end: null });
      } else if (S.tool === 'pen') {
        setDraft({ points: [p.x, p.y], color: S.color });
        beginDrag({ kind: 'pen', points: [round1(p.x), round1(p.y)], color: S.color });
      }
    }

    function onPointerMove(e) {
      const p = toWorld(e.clientX, e.clientY);
      broadcastCursor({ x: round1(p.x), y: round1(p.y) });
    }

    function onPointerLeave() {
      broadcastCursor(null);
    }

    return { onPointerDown, onPointerMove, onPointerLeave };
  }, []);

  // wheel: pan, ctrl/cmd (or trackpad pinch) = zoom around the pointer
  useEffect(() => {
    const el = rootRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const { cam: c, setCam: setCamera } = latest.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const dy = clamp(e.deltaY, -40, 40);
        const zoom = clamp(c.zoom * Math.exp(-dy * 0.01), MIN_ZOOM, MAX_ZOOM);
        const wx = (sx - c.x) / c.zoom;
        const wy = (sy - c.y) / c.zoom;
        setCamera({ x: sx - wx * zoom, y: sy - wy * zoom, zoom });
      } else {
        setCamera({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    // Safari reports trackpad pinch as gesture events instead of ctrl+wheel
    let gestureCam = null;
    const onGestureStart = (e) => {
      e.preventDefault();
      gestureCam = latest.current.cam;
    };
    const onGestureChange = (e) => {
      e.preventDefault();
      const c0 = gestureCam ?? latest.current.cam;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const zoom = clamp(c0.zoom * e.scale, MIN_ZOOM, MAX_ZOOM);
      const wx = (sx - c0.x) / c0.zoom;
      const wy = (sy - c0.y) / c0.zoom;
      latest.current.setCam({ x: sx - wx * zoom, y: sy - wy * zoom, zoom });
    };
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  }, []);

  // hold Space to pan
  useEffect(() => {
    const typing = (e) => ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
    const down = (e) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      spaceRef.current = true;
      setSpaceDown(true);
    };
    const up = (e) => {
      if (e.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // stable identity so memoised elements are not re-rendered on every frame
  const finishEditing = useCallback((id, value) => {
    const { setEditingId: setEditing, byId: map, ops: o } = latest.current;
    setEditing(null);
    if (map.get(id)?.type === 'text' && !value.trim()) o.remove([id]);
  }, []);

  const boxes = elements.filter((e) => e.type !== 'pen' && e.type !== 'arrow');
  const vectors = elements.filter((e) => e.type === 'pen' || e.type === 'arrow');

  let grid = 28 * cam.zoom;
  while (grid < 14) grid *= 2;

  const cursorClass = panning
    ? 'cursor-grabbing'
    : spaceDown || tool === 'hand' || readOnly
      ? 'cursor-grab'
      : tool === 'select'
        ? ''
        : 'cursor-cross';

  return (
    <div
      ref={rootRef}
      className={`canvas ${cursorClass}`}
      style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${cam.x}px ${cam.y}px` }}
      onPointerDown={handlers.onPointerDown}
      onMouseDown={(e) => {
        // stops the browser from moving focus away from a text editor that was just opened
        if (e.target.tagName !== 'TEXTAREA') e.preventDefault();
      }}
      onPointerMove={handlers.onPointerMove}
      onPointerLeave={handlers.onPointerLeave}
    >
      <div
        className="world"
        style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}
      >
        {boxes.map((el) => (
          <BoxElement
            key={el.id}
            el={el}
            editing={editingId === el.id}
            remoteColor={remote.selections.get(el.id)}
            ops={ops}
            onEditDone={finishEditing}
          />
        ))}

        <svg className="vector-layer">
          {vectors.map((el) => (
            <VectorElement key={el.id} el={el} />
          ))}
          <DraftStroke draft={draft} />
        </svg>

        <SelectionBox elements={elements} selection={selection} zoom={cam.zoom} readOnly={readOnly} />

        {marquee && (
          <div
            className="marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderWidth: 1 / cam.zoom }}
          />
        )}
      </div>

      {remote.cursors.map((c) => (
        <div
          key={c.clientId}
          className="remote-cursor"
          style={{ transform: `translate(${c.x * cam.zoom + cam.x}px, ${c.y * cam.zoom + cam.y}px)` }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ color: c.color }}>
            <path d="M4 3l16 7.5-6.8 2.2L10.5 20z" fill="currentColor" stroke="#0a0c12" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span style={{ background: c.color }}>{c.name}</span>
        </div>
      ))}

      {elements.length === 0 && !readOnly && (
        <div className="empty-hint">
          <strong>Empty board</strong>
          <span>Double-click anywhere to drop a sticky note, or pick a tool below.</span>
        </div>
      )}
    </div>
  );
}
