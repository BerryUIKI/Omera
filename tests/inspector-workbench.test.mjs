import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTick } from 'vue';
import { withProductionComponent } from './helpers/production-component.mjs';
import { rawMetadata } from '../src/utils/inspector.ts';
import { setLocale } from '../src/i18n/index.ts';

const photo = { id: 1, path: '/reference.jpg', container: 'jpg', size_bytes: 2048, modified_at: 100,
  metadata: { width: 1200, height: 800, format: null, raw: null, parameters: null } };
const generated = { ...photo, id: 2, path: '/generated.png', metadata: { ...photo.metadata,
  format: 'StableDiffusion', prompt: 'A violet forest', seed: '0', steps: 0, cfg_scale: 0, raw: 'original parameters' } };
test('Inspector raw metadata preserves the original data and legacy fallback', () => {
  assert.equal(rawMetadata(null), '');
  assert.equal(rawMetadata(photo), '');
  assert.equal(rawMetadata(generated), 'original parameters');
  assert.equal(rawMetadata({ ...photo, metadata: { parameters: 'fallback' } }), 'fallback');
});

test('production Inspector puts generation before organization in one flow and expands raw data on demand', async () => {
  await setLocale('en');
  await withProductionComponent('InspectorPane', { file: photo, embedded: true }, async () => [], async ({ controls, props, render, events }) => {
    let html = await render();
    assert.match(html, /No tags yet/); assert.match(html, /Add Tag/); assert.match(html, /Add to album/);
    assert.match(html, /1200 × 800/); assert.match(html, /2.0 KB/);
    assert.doesNotMatch(html, />Generation Parameters<|>Negative Prompt<|>Raw Data</);
    props.file = generated; await nextTick();
    html = await render(); assert.match(html, /A violet forest/); assert.match(html, /Generation Parameters/);
    assert.match(html, /No tags yet/); assert.match(html, /Add to album/);
    assert.ok(html.indexOf('A violet forest') < html.indexOf('No tags yet'));
    assert.ok(html.indexOf('Generation Parameters') < html.indexOf('No tags yet'));
    assert.ok(html.indexOf('No tags yet') < html.indexOf('Raw Data'));
    assert.doesNotMatch(html, /role="tab|original parameters/);
    assert.match(html, /Seed/); assert.match(html, /Steps/); assert.match(html, /CFG/);
    controls.rawExpanded.value = true;
    html = await render(); assert.match(html, /<details[^>]*open/); assert.match(html, /original parameters/);
    await controls.setRating(5);
    assert.deepEqual(events.at(-1), ['curated', { fileId: 2, patch: { rating: 5 } }]);
    props.file = { ...generated, rating: 5 }; await nextTick();
    assert.equal(controls.rawExpanded.value, true);
    props.file = photo; await nextTick();
    assert.equal(controls.rawExpanded.value, false);
    assert.doesNotMatch(await render(), />Generation Parameters<|>Raw Data<|original parameters/);
  });
});

test('slow tag/LoRA replies cannot overwrite the newly selected image', async () => {
  const pending = [];
  await withProductionComponent('InspectorPane', { file: generated, embedded: true }, (command, args) => {
    if (args.fileId === 2) return new Promise(resolve => pending.push([command, resolve]));
    return Promise.resolve(command === 'get_file_tags' ? [{ id: 3, name: 'Current tag' }] : []);
  }, async ({ controls, props }) => {
    props.file = photo; await nextTick(); await nextTick();
    for (const [command, resolve] of pending) resolve(command === 'get_file_tags' ? [{ id: 4, name: 'Stale tag' }] : [{ name: 'stale LoRA' }]);
    await nextTick(); await nextTick();
    assert.equal(controls.fileTags.value[0].name, 'Current tag');
    assert.equal(controls.detectedLoras.value.length, 0);
  });
});

test('classifying a previously revealed photo as sensitive masks it without collapsing raw data', async () => {
  await setLocale('en');
  await withProductionComponent('InspectorPane', { file: { ...generated, is_nsfw: true } }, async () => [], async ({ controls, props, render }) => {
    controls.revealedNsfw.value = true; controls.rawExpanded.value = true;
    props.file = { ...generated, is_nsfw: false }; await nextTick();
    props.file = { ...generated, is_nsfw: true }; await nextTick();
    assert.equal(controls.revealedNsfw.value, false);
    assert.equal(controls.rawExpanded.value, true);
    assert.match(await render(), /class="blurred"/);
  });
});
