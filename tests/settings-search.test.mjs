import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsSearchIndex, searchSettings } from '../src/utils/settings-search.ts';
import { setLocale, t } from '../src/i18n/index.ts';
import { withProductionComponent } from './helpers/production-component.mjs';
test('settings discovery uses translated descriptions and distinct stable jump targets', () => {
  for (const locale of ['en', 'zh-CN', 'ja', 'zh-TW', 'fr', 'de', 'es']) {
    setLocale(locale); const index = settingsSearchIndex(t.value);
    assert.ok(index.length > 40); assert.equal(new Set(index.map(entry => entry.id)).size, index.length);
    const theme = index.find(entry => entry.id === 'settings.theme');
    assert.ok(searchSettings(index, theme.label).some(entry => entry.id === theme.id));
    assert.equal(index.find(entry => entry.id === 'settings.cloudBackup.s3SecretKey').target, 'settings.cloudBackup.provider');
  }
  setLocale('en'); const index = settingsSearchIndex(t.value);
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
  setLocale('en');
  await withProductionComponent('ThemePicker', { modelValue: 'graphite' }, async () => null, async ({ render, props }) => {
    let html = await render(); assert.equal((html.match(/type="radio"/g) || []).length, 5);
    assert.match(html, /value="graphite" checked/);
    props.modelValue = 'light'; html = await render(); assert.match(html, /value="light" checked/);
  });
});
