import assert from 'node:assert/strict';
import test from 'node:test';
import {withProductionComponent} from './helpers/production-component.mjs';
import {comfyMonitor} from '../src/utils/comfy-monitor.ts';
test('status and activity summaries expose measured GPU memory and explicit unknowns',async()=>{
  const original={...comfyMonitor.state};
  Object.assign(comfyMonitor.state,{status:'connected',fresh:true,snapshot:{running_total:1,pending_total:2,
    running:[],pending:[],recent:[],devices:[{name:'Fixture GPU',device_type:'cuda',vram_free:0,vram_total:8589934592}]}});
  try {
    await withProductionComponent('StatusBar',{totalCount:0,filteredCount:0,selectedCount:0,info:null,progress:null},async()=>null,
      async({render})=>{const html=await render();assert.match(html,/VRAM/);assert.match(html,/0 B \/ 8\.0 GB/);},
      code=>code.replace(/import ActivityPopover from [^;]+;/,'const ActivityPopover = {render:()=>null};')
        .replace(/import ThumbnailDiagnosticsModal from [^;]+;/,'const ThumbnailDiagnosticsModal = {render:()=>null};'));
    await withProductionComponent('ActivityPopover',{open:true,scanProgress:null},async()=>null,async({render})=>{
      const html=await render();assert.match(html,/Fixture GPU/);assert.match(html,/0 B \/ 8\.0 GB/);
      comfyMonitor.state.snapshot={...comfyMonitor.state.snapshot,devices:[{name:'Unknown GPU',device_type:'cuda',vram_free:null,vram_total:null}]};
      assert.match(await render(),/Unknown \/ Unknown/);
    });
  }finally{Object.assign(comfyMonitor.state,original);}
});
