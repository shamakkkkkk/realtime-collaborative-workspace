export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const round1 = (v) => Math.round(v * 10) / 10;

/** Axis-aligned bounding box of any element. */
export function bounds(el) {
  if (el.type === 'arrow') {
    return {
      x: Math.min(el.x, el.x2),
      y: Math.min(el.y, el.y2),
      w: Math.abs(el.x2 - el.x),
      h: Math.abs(el.y2 - el.y),
    };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

export function unionBounds(list) {
  if (!list.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const item of list) {
    x1 = Math.min(x1, item.x);
    y1 = Math.min(y1, item.y);
    x2 = Math.max(x2, item.x + item.w);
    y2 = Math.max(y2, item.y + item.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function intersects(a, b) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function rectFromPoints(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Flat [x0,y0,x1,y1,...] -> smooth SVG path (quadratic curves through midpoints). */
export function pathFromPoints(pts) {
  if (!pts || pts.length < 2) return '';
  if (pts.length < 4) return `M ${pts[0]} ${pts[1]} L ${pts[0] + 0.01} ${pts[1]}`;
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2;
    const my = (pts[i + 1] + pts[i + 3]) / 2;
    d += ` Q ${pts[i]} ${pts[i + 1]} ${mx} ${my}`;
  }
  d += ` L ${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
  return d;
}

/** Line with an arrow head at (x2, y2). */
export function arrowPath(el, head = 16) {
  const { x, y, x2, y2 } = el;
  const angle = Math.atan2(y2 - y, x2 - x);
  const spread = 0.5;
  const h1x = x2 - head * Math.cos(angle - spread);
  const h1y = y2 - head * Math.sin(angle - spread);
  const h2x = x2 - head * Math.cos(angle + spread);
  const h2y = y2 - head * Math.sin(angle + spread);
  return `M ${x} ${y} L ${x2} ${y2} M ${h1x} ${h1y} L ${x2} ${y2} L ${h2x} ${h2y}`;
}

/**
 * New rectangle when dragging a corner handle. `handle` is nw | ne | sw | se,
 * the opposite corner stays fixed. Flipping over the anchor is allowed.
 */
export function resizeBox(orig, handle, point, min = 24) {
  let x1 = orig.x;
  let y1 = orig.y;
  let x2 = orig.x + orig.w;
  let y2 = orig.y + orig.h;
  if (handle.includes('w')) x1 = point.x;
  if (handle.includes('e')) x2 = point.x;
  if (handle.includes('n')) y1 = point.y;
  if (handle.includes('s')) y2 = point.y;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, w: Math.max(min, Math.abs(x2 - x1)), h: Math.max(min, Math.abs(y2 - y1)) };
}

/** Camera that shows all elements with some padding. */
export function fitCamera(list, viewport, padding = 96) {
  const boxes = list.map(bounds);
  const box = unionBounds(boxes);
  if (!box) return { x: viewport.width / 2, y: viewport.height / 2, zoom: 1 };
  const zoom = clamp(
    Math.min((viewport.width - padding * 2) / Math.max(box.w, 1), (viewport.height - padding * 2) / Math.max(box.h, 1)),
    0.1,
    1.5,
  );
  return {
    x: viewport.width / 2 - (box.x + box.w / 2) * zoom,
    y: viewport.height / 2 - (box.y + box.h / 2) * zoom,
    zoom,
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable, pleasant colour per user id. */
export function colorForUser(id) {
  const hue = hashString(id) % 360;
  return `hsl(${hue} 78% 62%)`;
}

export const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
