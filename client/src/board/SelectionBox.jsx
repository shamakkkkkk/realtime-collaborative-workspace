import { bounds, unionBounds } from './geometry.js';
import { BOX_TYPES } from './constants.js';

const CORNERS = [
  { id: 'nw', cursor: 'nwse-resize', fx: 0, fy: 0 },
  { id: 'ne', cursor: 'nesw-resize', fx: 1, fy: 0 },
  { id: 'sw', cursor: 'nesw-resize', fx: 0, fy: 1 },
  { id: 'se', cursor: 'nwse-resize', fx: 1, fy: 1 },
];

export default function SelectionBox({ elements, selection, zoom, readOnly }) {
  const selected = elements.filter((e) => selection.has(e.id));
  if (selected.length === 0) return null;

  const box = unionBounds(selected.map(bounds));
  const pad = 5 / zoom;
  const border = 1.5 / zoom;
  const size = 10 / zoom;
  const x = box.x - pad;
  const y = box.y - pad;
  const w = box.w + pad * 2;
  const h = box.h + pad * 2;

  const single = selected.length === 1 && !readOnly ? selected[0] : null;

  const handleStyle = (left, top, cursor) => ({
    left: left - size / 2,
    top: top - size / 2,
    width: size,
    height: size,
    borderWidth: border,
    cursor,
  });

  return (
    <>
      <div className="sel-box" style={{ left: x, top: y, width: w, height: h, borderWidth: border }} />
      {single && BOX_TYPES.includes(single.type) &&
        CORNERS.map((c) => (
          <div
            key={c.id}
            className="handle"
            data-handle={c.id}
            style={handleStyle(x + c.fx * w, y + c.fy * h, c.cursor)}
          />
        ))}
      {single && single.type === 'arrow' && (
        <>
          <div className="handle" data-handle="p1" style={handleStyle(single.x, single.y, 'move')} />
          <div className="handle" data-handle="p2" style={handleStyle(single.x2, single.y2, 'move')} />
        </>
      )}
    </>
  );
}
