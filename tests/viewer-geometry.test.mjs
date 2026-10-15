import assert from 'node:assert/strict';
import test from 'node:test';
import { fitImageScale, clampViewerScale, zoomTranslation } from '../src/utils/viewer-geometry.ts';

test('fit zoom accounts for aspect ratio, canvas space, and display density without upscaling', () => {
  assert.equal(fitImageScale({ width: 2000, height: 1000 }, { width: 1048, height: 548 }), 0.5);
  assert.equal(fitImageScale({ width: 2000, height: 1000 }, { width: 1048, height: 548 }, 2), 1);
  assert.equal(fitImageScale({ width: 100, height: 100 }, { width: 1048, height: 548 }), 1);
  assert.equal(fitImageScale({ width: 1000, height: 4000 }, { width: 548, height: 1048 }), 0.25);
  assert.equal(fitImageScale({ width: 0, height: 0 }, { width: 1048, height: 548 }), 1);
});

test('pointer anchored zoom preserves the same image point and guards invalid scale', () => {
  const current = { x: 20, y: -10 }, pointer = { x: 100, y: 70 };
  const next = zoomTranslation(current, pointer, 0.5, 1);
  assert.equal((pointer.x - current.x) / 0.5, (pointer.x - next.x) / 1);
  assert.equal((pointer.y - current.y) / 0.5, (pointer.y - next.y) / 1);
  assert.equal(clampViewerScale(Infinity), 1);
  assert.equal(clampViewerScale(-2), 0.001);
  assert.equal(clampViewerScale(100), 8);
});
