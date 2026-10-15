import assert from 'node:assert/strict';
import test from 'node:test';
import { useFileCuration, applyCurationChange } from '../src/utils/file-curation.ts';

test('curation uses registered command arguments and patches only confirmed fields', async () => {
  const original = { id: 7, path: '/a.png', metadata: { prompt: 'keep' }, rating: 3 };
  const calls = [], changes = [];
  const controller = useFileCuration(() => original, value => changes.push(value), async (...args) => calls.push(args));
  await controller.run({ kind: 'rating', value: null });
  await controller.run({ kind: 'favorite', value: true });
  await controller.run({ kind: 'sensitive', value: false });
  assert.deepEqual(calls, [
    ['set_file_rating', { fileId: 7, rating: null }],
    ['set_file_favorite', { fileId: 7, isFavorite: true }],
    ['set_file_nsfw', { fileId: 7, isNsfw: false }],
  ]);
  assert.equal(original.rating, 3);
  const latest = { ...original, path: '/moved.png', metadata: { prompt: 'newer' } };
  assert.deepEqual(applyCurationChange(latest, changes[1]), { ...latest, is_favorite: true });
  assert.equal(applyCurationChange({ ...latest, id: 8 }, changes[1]).is_favorite, undefined);
});

test('navigation during a write cannot retarget it; duplicate and rejected writes never publish', async () => {
  let selected = { id: 1 }, release;
  const changes = [];
  const controller = useFileCuration(() => selected, change => changes.push(change), () => new Promise(resolve => { release = resolve; }));
  const pending = controller.run({ kind: 'favorite', value: true });
  selected = { id: 2 };
  assert.equal(await controller.run({ kind: 'rating', value: 5 }), false);
  release(); await pending;
  assert.deepEqual(changes, [{ fileId: 1, patch: { is_favorite: true } }]);
  const rejected = useFileCuration(() => selected, change => changes.push(change), async () => { throw 'write failed'; });
  assert.equal(await rejected.run({ kind: 'rating', value: 5 }), false);
  assert.equal(rejected.error.value, 'write failed');
  assert.equal(changes.length, 1);
  assert.equal(rejected.busy.value, false);
});
