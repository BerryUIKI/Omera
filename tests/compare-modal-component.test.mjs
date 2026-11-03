import test from 'node:test';
import assert from 'node:assert/strict';
import {withProductionComponent} from './helpers/production-component.mjs';
test('comparison keeps image zoom, selects pairs, caps options and mounts prompt details only in explicit diff mode',async()=>{
  const images=Array.from({length:205},(_,id)=>({id,path:`/${id}.png`,metadata:{steps:0}}));
  await withProductionComponent('CompareModal',{images},async()=>assert.fail('no eager hydration'),async({controls:c,render,props})=>{
    assert.equal(c.leftImage.value.path,'/0.png');assert.equal(c.rightImage.value.path,'/1.png');
    assert.equal(c.choices.value.length,200);let html=await render();
    assert.match(html,/compare-viewport/);assert.doesNotMatch(html,/fixture-diff/);assert.match(html,/Steps: 0/);
    c.onWheel({preventDefault(){},deltaY:-1});assert.equal(c.zoom.value,1.15);
    c.mode.value='diff';html=await render();assert.match(html,/fixture-diff/);assert.doesNotMatch(html,/compare-viewport/);
    props.images=[];await import('vue').then(v=>v.nextTick());assert.equal(c.leftImage.value,null);
  },code=>code.replace(/const PromptDiffPanel = defineAsyncComponent\([^;]+;/,'const PromptDiffPanel = {ssrRender(_ctx,push){push(`<div class="fixture-diff"></div>`);},render:()=>null};'));
});
