import assert from 'node:assert/strict';
import test from 'node:test';
import {nextTick} from 'vue';
import {withProductionComponent} from './helpers/production-component.mjs';

test('graph UI escapes workflow text and exposes selection, search and active-node state', async () => {
  const source=JSON.stringify({1:{class_type:'CLIPTextEncode',inputs:{text:'<script>alert(1)</script>'}},
    2:{class_type:'KSampler',inputs:{positive:['1',0],seed:42}}});
  await withProductionComponent('WorkflowGraph',{source,activeNodeId:'2'},async()=>assert.fail('no IPC'),
    async({controls:c,render,props})=>{
      let html=await render();
      assert.match(html,/data-node-id="2"/);
      assert.match(html,/sampler executing/);
      c.select('1'); html=await render();
      assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.doesNotMatch(html,/<script>/);
      assert.match(html,/aria-pressed="true"/);
      c.query.value='KSampler';
      assert.equal(c.matchCount.value,1);
      c.setZoom(999);assert.equal(c.zoom.value,2.5);
      props.source='broken';await nextTick();
      assert.equal(c.selectedId.value,null);
      assert.match(await render(),/Invalid workflow JSON/);
    });
});
