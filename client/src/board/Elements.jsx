import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { arrowPath, hexToRgba, pathFromPoints } from './geometry.js';

/** In-place text editor used by sticky notes, shapes and text elements. */
function TextEditor({ el, ops, onDone, autoGrow }) {
  const [value, setValue] = useState(el.text || '');
  const ref = useRef(null);
  const mountedAt = useRef(performance.now());

  // The editor is opened from a pointerdown handler. Right AFTER that handler the
  // browser performs its default "mousedown" action and moves focus to <body>,
  // which used to close the editor instantly. So: focus now, and again just after.
  useEffect(() => {
    const node = ref.current;
    const focus = () => {
      if (!node.isConnected || document.activeElement === node) return;
      node.focus({ preventScroll: true });
      node.setSelectionRange(node.value.length, node.value.length);
    };
    focus();
    const t1 = setTimeout(focus, 0);
    const t2 = setTimeout(focus, 80);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    if (!autoGrow) return;
    const node = ref.current;
    node.style.height = 'auto';
    const height = Math.max(36, node.scrollHeight);
    node.style.height = `${height}px`;
    if (Math.abs(height - el.h) > 1) ops.update(el.id, { h: height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="editor"
      value={value}
      spellCheck={false}
      onChange={(e) => {
        setValue(e.target.value);
        ops.update(el.id, { text: e.target.value });
      }}
      onBlur={() => {
        // a blur right after opening is the browser's focus shuffle, not the user leaving
        if (performance.now() - mountedAt.current < 300 && document.hasFocus()) {
          ref.current?.focus({ preventScroll: true });
          return;
        }
        onDone(el.id, value);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') e.currentTarget.blur();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}

/** sticky | rect | ellipse | text  (rendered as HTML so text wraps natively) */
export const BoxElement = memo(function BoxElement({ el, editing, remoteColor, ops, onEditDone }) {
  const style = {
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    zIndex: el.z,
    outline: remoteColor ? `2px solid ${remoteColor}` : undefined,
    outlineOffset: remoteColor ? 4 : undefined,
    '--c': el.color,
  };

  if (el.type === 'sticky') {
    style.background = el.color;
  } else if (el.type === 'rect' || el.type === 'ellipse') {
    style.background = hexToRgba(el.color, 0.16);
    style.borderColor = el.color;
  }

  const editor = editing ? (
    <TextEditor el={el} ops={ops} onDone={onEditDone} autoGrow={el.type === 'text'} />
  ) : (
    <div className="el-text">{el.text}</div>
  );

  return (
    <div className={`el ${el.type}`} data-id={el.id} style={style}>
      {editor}
    </div>
  );
});

/** pen | arrow (rendered as SVG) */
export const VectorElement = memo(function VectorElement({ el }) {
  const d = useMemo(
    () => (el.type === 'pen' ? pathFromPoints(el.points) : arrowPath(el)),
    [el],
  );
  const width = el.type === 'pen' ? el.width || 3 : 3;
  const transform = el.type === 'pen' ? `translate(${el.x} ${el.y})` : undefined;
  return (
    <g transform={transform}>
      <path
        d={d}
        fill="none"
        stroke={el.color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
      {/* fat invisible stroke = comfortable click target */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={18} pointerEvents="stroke" data-id={el.id} />
    </g>
  );
});

export function DraftStroke({ draft }) {
  if (!draft) return null;
  return (
    <path
      d={pathFromPoints(draft.points)}
      fill="none"
      stroke={draft.color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}
