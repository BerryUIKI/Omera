import assert from 'node:assert/strict';
import test from 'node:test';
import { readPanelWidths, fitPanelWidths } from '../src/utils/panel-layout.ts';
import { withProductionComponent } from './helpers/production-component.mjs';

test('panel preferences reject corrupt input and reserve gallery space at narrow/wide sizes', () => {
  assert.deepEqual(readPanelWidths(() => null), { sidebar:220, inspector:280 });
  assert.deepEqual(readPanelWidths(key => key.includes('sidebar') ? 'garbage' : '9999'), { sidebar:220, inspector:480 });
  for (const viewport of [960, 1280, 1920]) {
    const fit = fitPanelWidths({sidebar:380,inspector:480}, viewport);
    assert.ok(viewport - fit.sidebar - fit.inspector - 12 >= 320);
    assert.ok(fit.sidebar >= 220 && fit.inspector >= 260);
  }
  assert.deepEqual(fitPanelWidths({sidebar:380,inspector:480}, 1280), {sidebar:380,inspector:480});
  const largeCards = fitPanelWidths({sidebar:380,inspector:480},960,true,true,384);
  assert.ok(960 - largeCards.sidebar - largeCards.inspector - 12 >= 384);
});

test('production resize handle bounds dragging, cancels without saving, and supports keyboard/reset', async () => {
  await withProductionComponent('PanelResizeHandle', { modelValue:280,min:260,max:480,initial:280,side:'right',label:'Resize',hint:'Hint' },
    () => {}, async ({controls:c,events,props,render}) => {
      c.begin({button:0,pointerId:1,clientX:500,currentTarget:{setPointerCapture(){}},preventDefault(){}});
      c.move({pointerId:1,clientX:100});
      assert.deepEqual(events.at(-1), ['update:modelValue',480]);
      c.cancel();
      assert.deepEqual(events.at(-1), ['update:modelValue',280]);
      assert.equal(events.filter(e=>e[0]==='change').length,0);
      c.keydown({key:'ArrowLeft',shiftKey:false,preventDefault(){}});
      assert.deepEqual(events.at(-2), ['update:modelValue',290]);
      props.modelValue=290;
      c.reset();
      assert.deepEqual(events.at(-2), ['update:modelValue',280]);
      assert.match(await render(), /role="separator"/);
    });
});
