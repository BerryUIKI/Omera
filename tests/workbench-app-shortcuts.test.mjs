import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
function setup() {
  const script = fs.readFileSync('src/App.vue','utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const ast = ts.createSourceFile('app.ts',script,ts.ScriptTarget.Latest,true);
  const state = vm.createContext({ document:{activeElement:null}, isEditableTarget:target=>!!target?.editable,
    hasActiveDialog:()=>false, lightboxFile:{value:{path:'/preview.png'}},
    settingsModalOpen:{value:false}, helpGuideDrawerOpen:{value:false}, shortcutsHelpModalOpen:{value:false},
    sidebarOpen:{value:true}, addFolderModalOpen:{value:false},
    onToggleGlobalMasking:()=>assert.fail('gallery masking shortcut leaked'), onUndo:()=>assert.fail('gallery undo leaked'),
    onStackSelected:()=>assert.fail('gallery stack shortcut leaked') });
  const fn = ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='handleWindowKeyDown');
  vm.runInContext(ts.transpile(fn.getText(ast),{target:ts.ScriptTarget.ESNext}),state);
  return state;
}
const event = (key, modifiers={}) => ({key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,defaultPrevented:false,target:null,
  preventDefault(){this.defaultPrevented=true;},...modifiers});
test('embedded preview keeps app navigation/preferences/help shortcuts available without gallery mutations', () => {
  const cases = [[event(',',{ctrlKey:true}),'settingsModalOpen'], [event(',',{metaKey:true}),'settingsModalOpen'],
    [event('F1'),'helpGuideDrawerOpen'],[event('?'),'shortcutsHelpModalOpen'],[event('b'),'sidebarOpen'],[event('o',{ctrlKey:true}),'addFolderModalOpen']];
  for (const [key, ref] of cases) { const state=setup(); const before=state[ref].value; state.handleWindowKeyDown(key);
    assert.equal(state[ref].value,!before,ref); assert.equal(key.defaultPrevented,true,ref); }
  const state=setup();
  for (const key of [event('M',{shiftKey:true}),event('z',{ctrlKey:true}),event('g',{ctrlKey:true})]) state.handleWindowKeyDown(key);
});
test('app shortcuts still yield to dialogs, editable focus and previously handled keys', () => {
  for (const block of ['dialog','input','focus','handled']) {
    const state=setup(), key=event(',',{ctrlKey:true});
    if(block==='dialog')state.hasActiveDialog=()=>true;
    if(block==='input')key.target={editable:true};
    if(block==='focus')state.document.activeElement={editable:true};
    if(block==='handled')key.defaultPrevented=true;
    state.handleWindowKeyDown(key); assert.equal(state.settingsModalOpen.value,false,block);
  }
});
