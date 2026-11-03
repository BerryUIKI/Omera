import assert from 'node:assert/strict';
import test from 'node:test';
import {nextTick} from 'vue';
import {withProductionComponent} from './helpers/production-component.mjs';
import {setLocale} from '../src/i18n/index.ts';
import {releaseLocales} from '../scripts/generate-release-notes.mjs';
const file=(id,prompt)=>({id,path:`/${id}.png`,modified_at:1,metadata:{prompt,steps:id===1?0:20,seed:String(id)}});
test('production prompt panel hydrates only its pair, escapes HTML and renders semantic weight and parameter differences',async()=>{
  const calls=[];
  await withProductionComponent('PromptDiffPanel',{left:file(1,null),right:file(2,null)},async(cmd,args)=>{
    calls.push([cmd,args]);return file(args.fileId,args.fileId===1?'cat, (light:1.2) <script>':'cat, (light:1.5) <img>');
  },async({controls:c,render})=>{
    await new Promise(r=>setImmediate(r));await nextTick();
    assert.deepEqual(calls.map(c=>c[1].fileId),[1,2]);
    const html=await render();assert.match(html,/<mark[^>]*1.2 → 1.5/);assert.match(html,/&lt;/);
    assert.doesNotMatch(html,/<script>/);assert.match(html,/<td>0<\/td>/);
    const translated=new Set();for(const locale of releaseLocales){await setLocale(locale);translated.add(await render());}
    assert.equal(translated.size,7);await setLocale('en');
    c.active.value='negative_prompt';await nextTick();assert.match(await render(),/No prompt metadata/);
  });
});
