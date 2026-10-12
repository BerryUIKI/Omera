import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { en } from '../src/i18n/locales/en.ts';
import { zhCN } from '../src/i18n/locales/zh-CN.ts';
import { zhTW } from '../src/i18n/locales/zh-TW.ts';
import { ja } from '../src/i18n/locales/ja.ts';
import { de } from '../src/i18n/locales/de.ts';
import { fr } from '../src/i18n/locales/fr.ts';
import { es } from '../src/i18n/locales/es.ts';
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/automatic-backup-status.json','utf8'));
const escapeHtml = text => text.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function component(locale, run) {
  const { descriptor } = parse(fs.readFileSync('src/components/AutomaticBackupSettings.vue','utf8'));
  const script = compileScript(descriptor,{id:'automatic-backup'});
  const template = compileTemplate({id:'automatic-backup',filename:'AutomaticBackupSettings.vue',
    source:descriptor.template.content,ssr:true,compilerOptions:{bindingMetadata:script.bindings}});
  let code = script.content.replace('export default','const component =')
    .replace(/import \{ currentLocale, t \} from [^;]+;/, `const currentLocale={value:'en'}; const t={value:${JSON.stringify(locale)}};`)
    .replace(/import \{ normalizeBackupInterval \} from [^;]+;/,
      `import { normalizeBackupInterval } from ${JSON.stringify(pathToFileURL(path.resolve('src/utils/automatic-backup.ts')).href)};`);
  code += '\n'+template.code.replace('export function ssrRender','function ssrRender')+'\ncomponent.ssrRender=ssrRender; export default component;';
  const temporary = path.resolve('tests',`.tmp-backup-${Math.random()}.mjs`);
  fs.writeFileSync(temporary,ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}}).outputText);
  try { await run((await import(pathToFileURL(temporary).href)).default); }
  finally { fs.unlinkSync(temporary); }
}
test('backup controls and saved worker states render in every locale',async()=>{
  for(const locale of [en,zhCN,zhTW,ja,de,fr,es]) await component(locale,async panel=>{
    const text=locale.settings.cloudBackup;
    const props={enabled:true,intervalDays:2,status:fixture,loading:false,error:'',saving:false};
    let html=await renderToString(createSSRApp(panel,props));
    for(const key of ['automaticTitle','automaticEnabled','automaticInterval','automaticHint','savedStatus','lastSuccess','lastAttempt','nextDue','lastSnapshot'])
      assert.ok(html.includes(escapeHtml(text[key])),key);
    assert.ok(html.includes(escapeHtml(text.statusScheduled.replace('{days}','7'))),'saved interval differs from draft');
    assert.match(html,/type="checkbox" checked/);
    assert.match(html,/type="number" min="1" max="365" step="1" value="2"/);
    for(const [status,key] of [[null,'statusLoading'],[{...fixture,enabled:false},'statusDisabled'],
      [{...fixture,running:true},'statusRunning'],[{...fixture,last_error:'offline'},'statusRetry'],
      [{...fixture,enabled:false,last_error:'invalid state'},'statusPaused']]) {
      html=await renderToString(createSSRApp(panel,{...props,status,loading:status===null}));
      assert.ok(html.includes(escapeHtml(text[key])),key);
    }
    html=await renderToString(createSSRApp(panel,{...props,status:null,error:'status read failed'}));
    assert.ok(html.includes(escapeHtml(text.statusUnavailable)));
    assert.match(html,/role="alert"/);
    assert.ok(html.includes('status read failed'));
    const events=[];
    const state=panel.setup(props,{expose(){},emit:(...args)=>events.push(args)});
    state.changeEnabled({target:{checked:false}});
    state.editInterval({target:{valueAsNumber:2}});
    state.changeInterval({target:{valueAsNumber:900,value:'900'}});
    assert.deepEqual(events,[['update:enabled',false],['update:intervalDays',2],['update:intervalDays',365]]);
  });
});
test('status interface agrees with the shared Rust serialization fixture',()=>{
  const ast=ts.createSourceFile('types.ts',fs.readFileSync('src/types.ts','utf8'),ts.ScriptTarget.Latest,true);
  const type=ast.statements.find(node=>ts.isInterfaceDeclaration(node)&&node.name.text==='AutomaticBackupStatus');
  assert.deepEqual(type.members.map(member=>member.name.text).sort(),Object.keys(fixture).sort());
});
