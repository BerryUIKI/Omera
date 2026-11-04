import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {withProductionComponent} from './helpers/production-component.mjs';
import {comfyMonitor} from '../src/utils/comfy-monitor.ts';
import {setLocale} from '../src/i18n/index.ts';
import {releaseLocales} from '../scripts/generate-release-notes.mjs';

test('queue UI renders native snapshots, exact node progress, unknowns and seven translated states',async()=>{
  const original={...comfyMonitor.state};
  const events=JSON.parse(readFileSync('tests/fixtures/comfy-monitor.json','utf8'));
  const snapshot=events.find(e=>e.type==='snapshot').snapshot;
  Object.assign(comfyMonitor.state,{endpoint:'http://fixture',status:'connected',snapshot,
    activePromptId:'fixture-job',node:'3',value:2,max:8,fresh:true});
  try {
    await withProductionComponent('ComfyStudioModal',{},async command=>{
      assert.equal(command,'list_folders');
      return [{id:42,path:'/local/output',folder_type:'link'},{id:43,path:'/vault',folder_type:'managed'}];
    },
      async({controls:c,render})=>{
        assert.equal(c.selected.value.prompt_id,'fixture-job');
        let html=await render();
        assert.match(html,/local\/output/);assert.doesNotMatch(html,/\/vault/);
        assert.equal(c.outputFolderId.value,null);
        assert.match(html,/Fixture GPU/);assert.match(html,/25%/);
        assert.match(html,/<progress[^>]*value="2"[^>]*max="8"/);
        const translated=new Set();
        for(const locale of releaseLocales){await setLocale(locale);translated.add(await render());}
        assert.equal(translated.size,7);
        await setLocale('en');
        c.state.snapshot={...snapshot,devices:[{name:'CPU',device_type:'cpu',vram_free:null,vram_total:null}],history_error:'fixture'};
        c.state.value=0;c.state.max=0;
        html=await render();assert.match(html,/Unknown \/ Unknown/);assert.match(html,/History is unavailable/);
        assert.doesNotMatch(html,/<progress/);
        c.state.snapshot={...snapshot,running:[],running_total:0};
        assert.equal(c.selected.value,undefined);
      },code=>code.replace(/import WorkflowGraph from [^;]+;/,'const WorkflowGraph = {ssrRender(){},render:()=>null};'));
  } finally {Object.assign(comfyMonitor.state,original);await setLocale('en');}
});
