import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arrowPath,
  bounds,
  clamp,
  fitCamera,
  hexToRgba,
  intersects,
  pathFromPoints,
  rectFromPoints,
  resizeBox,
  unionBounds,
} from '../src/board/geometry.js';

test('bounds handles boxes and arrows in any direction', () => {
  assert.deepEqual(bounds({ type: 'rect', x: 10, y: 20, w: 30, h: 40 }), { x: 10, y: 20, w: 30, h: 40 });
  assert.deepEqual(bounds({ type: 'arrow', x: 100, y: 100, x2: 40, y2: 160 }), { x: 40, y: 100, w: 60, h: 60 });
});

test('unionBounds and intersects', () => {
  const u = unionBounds([
    { x: 0, y: 0, w: 10, h: 10 },
    { x: 20, y: 5, w: 10, h: 10 },
  ]);
  assert.deepEqual(u, { x: 0, y: 0, w: 30, h: 15 });
  assert.equal(unionBounds([]), null);
  assert.equal(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 }), true);
  assert.equal(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 }), false);
});

test('rectFromPoints normalises drag direction', () => {
  assert.deepEqual(rectFromPoints({ x: 50, y: 60 }, { x: 10, y: 20 }), { x: 10, y: 20, w: 40, h: 40 });
});

test('resizeBox keeps the opposite corner fixed and enforces a minimum size', () => {
  const orig = { x: 100, y: 100, w: 200, h: 100 };
  assert.deepEqual(resizeBox(orig, 'se', { x: 400, y: 250 }), { x: 100, y: 100, w: 300, h: 150 });
  assert.deepEqual(resizeBox(orig, 'nw', { x: 50, y: 60 }), { x: 50, y: 60, w: 250, h: 140 });
  const tiny = resizeBox(orig, 'se', { x: 101, y: 101 }, 24);
  assert.equal(tiny.w, 24);
  assert.equal(tiny.h, 24);
});

test('fitCamera centres content and clamps zoom', () => {
  const cam = fitCamera([{ type: 'rect', x: 0, y: 0, w: 100, h: 100 }], { width: 1000, height: 800 });
  assert.equal(cam.zoom, 1.5);
  assert.ok(Math.abs(cam.x + 50 * cam.zoom - 500) < 1e-6);
  assert.ok(Math.abs(cam.y + 50 * cam.zoom - 400) < 1e-6);
  assert.deepEqual(fitCamera([], { width: 1000, height: 800 }), { x: 500, y: 400, zoom: 1 });
});

test('path helpers produce valid SVG path data', () => {
  assert.equal(pathFromPoints([]), '');
  assert.match(pathFromPoints([0, 0, 10, 10]), /^M 0 0 L/);
  assert.match(pathFromPoints([0, 0, 10, 10, 20, 0, 30, 10]), /^M 0 0 Q .* L 30 10$/);
  assert.match(arrowPath({ x: 0, y: 0, x2: 100, y2: 0 }), /^M 0 0 L 100 0 M /);
});

test('hexToRgba and clamp', () => {
  assert.equal(hexToRgba('#ff8000', 0.5), 'rgba(255, 128, 0, 0.5)');
  assert.equal(hexToRgba('#fff', 1), 'rgba(255, 255, 255, 1)');
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
});
