import assert from 'node:assert/strict';
import test from 'node:test';
import {parseWorkflowGraph,graphLimits} from '../src/utils/workflow-graph.ts';

test('API graph retains directed dependencies and highlights meaningful node categories', () => {
  const graph = parseWorkflowGraph(JSON.stringify({prompt:{
    1:{class_type:'CLIPTextEncode',inputs:{text:'<script>🌸</script>'}},
    2:{class_type:'LoraLoader',inputs:{strength_model:0.8}},
    3:{class_type:'KSampler',inputs:{positive:['1',0],model:['2',0],seed:123}},
    4:{class_type:'ControlNetApply',inputs:{positive:['1',0]}},
  }}));
  assert.equal(graph.error,null);
  assert.deepEqual(graph.nodes.map(n=>n.category),['prompt','lora','sampler','controlnet']);
  assert.equal(graph.edges.length,3);
  assert.ok(graph.nodes[2].x>graph.nodes[0].x);
  assert.equal(graph.nodes[0].details.text,'<script>🌸</script>');
});
test('UI positions, tuple/object links, disconnected and cyclic nodes remain usable', () => {
  const graph=parseWorkflowGraph(JSON.stringify({workflow:{nodes:[
    {id:1,type:'KSampler',pos:[-100,40]}, {id:2,type:'CLIPTextEncode',pos:[200,40]},
    {id:3,type:'Custom'}, {id:4,type:'Custom'},
  ],links:[[1,1,0,2,0,'X'],{origin_id:2,target_id:1,target_slot:0},[3,999,0,1,0,'X']]}}));
  assert.equal(graph.edges.length,2);
  assert.equal(graph.dropped,1);
  assert.equal(graph.nodes[1].x-graph.nodes[0].x,300);
  assert.ok(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
});
test('invalid documents, duplicate IDs and oversized graphs are bounded without throwing', () => {
  assert.equal(parseWorkflowGraph('oops').error,'invalid');
  assert.equal(parseWorkflowGraph('[]').error,'invalid');
  assert.equal(parseWorkflowGraph('{}').error,'empty');
  assert.equal(parseWorkflowGraph('x'.repeat(graphLimits.bytes+1)).error,'limit');
  const nodes=Array.from({length:501},(_,id)=>({id,type:'Custom'}));
  assert.equal(parseWorkflowGraph(JSON.stringify({nodes})).error,'limit');
  assert.equal(parseWorkflowGraph(JSON.stringify({nodes:[{id:1,type:'A'},{id:1,type:'B'}]})).nodes.length,1);
});
