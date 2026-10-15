import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { settingsSearchIndex, searchSettings } from '../src/utils/settings-search.ts';
import { setLocale, t } from '../src/i18n/index.ts';
import { withProductionComponent } from './helpers/production-component.mjs';
test('settings discovery uses translated descriptions and distinct stable jump targets', async () => {
  for (const locale of ['en', 'zh-CN', 'ja', 'zh-TW', 'fr', 'de', 'es']) {
    await setLocale(locale); const index = settingsSearchIndex(t.value);
    assert.ok(index.length > 40); assert.equal(new Set(index.map(entry => entry.id)).size, index.length);
    const theme = index.find(entry => entry.id === 'settings.theme');
    assert.ok(searchSettings(index, theme.label).some(entry => entry.id === theme.id));
    assert.equal(index.find(entry => entry.id === 'settings.cloudBackup.s3SecretKey').target, 'settings.cloudBackup.provider');
  }
  await setLocale('en'); const index = settingsSearchIndex(t.value);
  assert.ok(searchSettings(index, 'thumbnail cache').some(entry => entry.id === 'settings.thumbnailCacheBudget'));
  assert.deepEqual(searchSettings(index, '  '), []); assert.deepEqual(searchSettings(index, 'does-not-exist'), []);
  assert.deepEqual(searchSettings(index, 'secret-production-token'), []);
});
test('search ignores case and accents while requiring every query token', () => {
  const entry = { tab: 'general', id: 'x', target: 'x', label: 'Préférences', description: 'Images locales', category: 'Général' };
  assert.deepEqual(searchSettings([entry], 'PREFERENCES locales'), [entry]);
  assert.deepEqual(searchSettings([entry], 'preferences missing'), []);
});
test('production theme choices expose five radio options without applying a draft', async () => {
  await setLocale('en');
  await withProductionComponent('ThemePicker', { modelValue: 'graphite' }, async () => null, async ({ render, props }) => {
    let html = await render(); assert.equal((html.match(/type="radio"/g) || []).length, 5);
    assert.match(html, /value="graphite" checked/);
    props.modelValue = 'light'; html = await render(); assert.match(html, /value="light" checked/);
  });
});

test('production search navigation focuses the checked theme and Escape clears search before closing', async () => {
  const source = fs.readFileSync('src/components/SettingsModal.vue','utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const ast = ts.createSourceFile('settings.ts',source,ts.ScriptTarget.Latest,true);
  const focused = [], events = [];
  const element = { scrollIntoView() {}, querySelector: selector => ({ focus: () => focused.push(selector) }) };
  const context = vm.createContext({ nextTick: async () => {}, activeTab:{value:'general'}, searchQuery:{value:'theme'}, focusedSetting:{value:''},
    settingsContent:{value:{querySelector: () => element}}, handleListSnapshots: () => assert.fail('unexpected snapshot load'), emit:(...args)=>events.push(args) });
  for (const name of ['selectTab','openSearchResult','closeSettings']) {
    const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text===name);
    vm.runInContext(ts.transpile(fn.getText(ast),{target:ts.ScriptTarget.ESNext}),context);
  }
  await context.openSearchResult({tab:'display',target:'settings.theme'});
  assert.equal(context.activeTab.value,'display'); assert.equal(context.searchQuery.value,'');
  assert.equal(focused[0], 'input[type="radio"]:checked:not(:disabled)');
  context.searchQuery.value='missing'; context.closeSettings(); assert.equal(events.length,0); assert.equal(context.searchQuery.value,'');
  context.closeSettings(); assert.deepEqual(events,[['close']]);
});
