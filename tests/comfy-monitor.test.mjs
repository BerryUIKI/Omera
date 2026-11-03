import assert from 'node:assert/strict';
import test from 'node:test';
import {createComfyMonitor} from '../src/utils/comfy-monitor.ts';
import {readFileSync} from 'node:fs';

const session=id=>({session_id:id,client_id:'client-'+id,endpoint:'http://fixture/'+id});
const snapshot={running:[{prompt_id:'a',number:1,graph_json:'{}'}],pending:[],running_total:1,pending_total:0,
  recent:[],devices:[],history_error:null,stats_error:null};
const message=(kind,fields={})=>({type:'execution',message:{kind,prompt_id:'a',node:null,value:null,max:null,queue_remaining:null,error:null,...fields}});

test('frontend consumes the exact Rust serialization fixture',async()=>{
  const events=JSON.parse(readFileSync('tests/fixtures/comfy-monitor.json','utf8'));
  let receive;
  const monitor=createComfyMonitor({start:async(_,cb)=>{receive=cb;return session('dto');},stop:async()=>{}});
  await monitor.connect('fixture');for(const event of events)receive(event);
  assert.equal(monitor.state.status,'connected');
  assert.equal(monitor.state.snapshot.running[0].prompt_id,'fixture-job');
  assert.equal(monitor.state.snapshot.devices[0].vram_free,4000);
  assert.equal(monitor.state.node,'3');assert.equal(monitor.state.max,8);
  await monitor.disconnect();
});

test('connect is explicit; progress, terminal messages and reconnect snapshots remain consistent',async()=>{
  let receive,starts=0;
  const monitor=createComfyMonitor({start:async(_,cb)=>{starts++;receive=cb;return session('1');},stop:async()=>{}});
  assert.equal(starts,0);await monitor.connect('http://fixture');
  receive({type:'connection',status:'connected',error:null});receive({type:'snapshot',snapshot});
  receive(message('execution_start'));receive(message('executing',{node:'3'}));receive(message('progress',{node:'3',value:2,max:8}));
  assert.equal(monitor.state.node,'3');assert.equal(monitor.state.value,2);
  receive({type:'connection',status:'reconnecting',error:'offline'});
  assert.equal(monitor.state.node,null);assert.equal(monitor.state.fresh,false);
  receive(message('executing',{prompt_id:null,node:'9'}));assert.equal(monitor.state.node,null);
  receive({type:'snapshot',snapshot});receive(message('progress',{node:'3',value:100,max:8}));
  assert.equal(monitor.state.value,8);
  receive(message('execution_error',{error:'fixture failure'}));
  assert.equal(monitor.state.activePromptId,null);assert.equal(monitor.state.error,'fixture failure');
  await monitor.disconnect();assert.equal(monitor.state.snapshot,null);
});
test('late start and callbacks are fenced on disconnect; endpoint changes retire old sessions',async()=>{
  let resolve,oldReceive;const stops=[];
  const pending=new Promise(done=>{resolve=done;});
  const monitor=createComfyMonitor({start:async(_,cb)=>{oldReceive=cb;return pending;},stop:async id=>stops.push(id)});
  const opening=monitor.connect('http://old');await new Promise(done=>setImmediate(done));
  const closing=monitor.disconnect();resolve(session('old'));await opening;await closing;
  assert.deepEqual(stops,['old']);oldReceive({type:'snapshot',snapshot});
  assert.equal(monitor.state.snapshot,null);assert.equal(monitor.state.status,'disconnected');
});
test('rapid endpoint changes serialize native lifetimes and ignore the previous channel',async()=>{
  const callbacks=[],calls=[];
  const monitor=createComfyMonitor({start:async(endpoint,cb)=>{callbacks.push(cb);calls.push(endpoint);return session(endpoint);},stop:async id=>calls.push('stop:'+id)});
  await monitor.connect('one');await monitor.connect('two');
  callbacks[0]({type:'connection',status:'error',error:'late'});
  assert.equal(monitor.state.error,null);assert.deepEqual(calls,['one','stop:one','two']);
  await monitor.disconnect();assert.equal(calls.at(-1),'stop:two');
});
