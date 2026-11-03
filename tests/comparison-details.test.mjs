import test from 'node:test';
import assert from 'node:assert/strict';
import {effectScope, shallowRef, nextTick} from 'vue';
import {useComparisonDetails} from '../src/utils/comparison-details.ts';
const file=id=>({id,path:`/${id}.png`,modified_at:1,metadata:null});
const tick=async()=>{await nextTick();await new Promise(r=>setImmediate(r));};
test('pair hydration fences stale selections and disposal; missing or mismatched records stay partial',async()=>{
  const pair=shallowRef([file(1),file(2)]),pending=[];const scope=effectScope();
  const state=scope.run(()=>useComparisonDetails(()=>pair.value,id=>new Promise(resolve=>pending.push({id,resolve}))));
  assert.equal(pending.length,2);pair.value=[file(3),file(4)];await tick();
  pending[0].resolve(file(1));pending[1].resolve(file(2));await tick();
  assert.equal(state.loading.value,true);assert.equal(state.files.value[0],null);
  pending[2].resolve({...file(3),metadata:{prompt:'full'}});pending[3].resolve(file(99));await tick();
  assert.equal(state.files.value[0].metadata.prompt,'full');assert.deepEqual(state.partial.value,[false,true]);
  pair.value=[file(1),file(2)];await tick();scope.stop();
  pending[4].resolve(file(1));pending[5].resolve(file(2));await tick();
  assert.equal(state.files.value[0],null);
});
