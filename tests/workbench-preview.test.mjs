import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTick } from 'vue';
import { withProductionComponent } from './helpers/production-component.mjs';
const first = { id: 1, path: '/first.png', container: 'png', size_bytes: 1024, modified_at: 1, metadata: { width: 1600, height: 900 } };
const second = { ...first, id: 2, path: '/second.png' };
const stubInspector = code => code.replace(/import InspectorPane from [^;]+;/, 'const InspectorPane = { render: () => null };');
test('production workbench retains fit zoom, loaded-page navigation, and explicit full-screen escape', async () => {
  let release;
  const loadMore = () => new Promise(resolve => release = resolve);
  await withProductionComponent('LightboxModal', { file: first, files: [first], embedded: true, hasMore: true, loadMore }, async () => null, async ({ controls, props, events }) => {
    controls.canvasSize.value = { width: 848, height: 498 };
    assert.equal(controls.currentScale.value, .5);
    controls.actualSize(); assert.equal(controls.currentScale.value, 1);
    controls.fullScreen.value = true; controls.closeViewer(); assert.equal(controls.fullScreen.value, false); assert.equal(events.length, 0);
    props.detailsOpen = false; await nextTick(); assert.equal(controls.showDetails.value, false);
    controls.showDetails.value = true; await nextTick(); assert.deepEqual(events.at(-1), ['update:detailsOpen', true]);
    const pending = controls.next(); assert.equal(controls.navigationBusy.value, true);
    await controls.next(); props.files = [first, second]; release(); await pending;
    assert.deepEqual(events.at(-1), ['navigate', second]);
    props.file = second; await nextTick(); assert.equal(controls.fitMode.value, true);
    controls.revealedNsfw.value = true; props.file = { ...second, is_nsfw: true }; await nextTick(); assert.equal(controls.revealedNsfw.value, false);
    const count = events.length;
    controls.handleKeyDown({ key: 'ArrowLeft', defaultPrevented: true }); assert.equal(events.length, count);
    controls.closeViewer(); assert.deepEqual(events.at(-1), ['close']);
  }, stubInspector);
});
test('late page navigation cannot change an image the user has already left', async () => {
  let release;
  await withProductionComponent('LightboxModal', { file: first, files: [first], embedded: true, hasMore: true, loadMore: () => new Promise(resolve => release = resolve) }, async () => null, async ({ controls, props, events }) => {
    const pending = controls.next(); props.files = [first, second]; props.file = second; await nextTick(); release(); await pending;
    assert.deepEqual(events, []);
  }, stubInspector);
});

test('pending next-page navigation is cancelled by a selection round trip or a new media revision', async () => {
  for (const change of ['round-trip', 'revision']) {
    let release;
    await withProductionComponent('LightboxModal', { file: first, files: [first], embedded: true, hasMore: true,
      loadMore: () => new Promise(resolve => release = resolve) }, async () => null, async ({ controls, props, events }) => {
      const pending = controls.next();
      if (change === 'round-trip') { props.file = second; await nextTick(); props.file = first; }
      else props.file = { ...first, modified_at: 2 };
      await nextTick(); props.files = [first, second]; release(); await pending;
      assert.deepEqual(events, [], change);
      assert.equal(controls.navigationBusy.value, false);
    }, stubInspector);
  }
});
