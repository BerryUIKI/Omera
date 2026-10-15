import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogState } from '../src/i18n/catalog-state.ts';
import { en } from '../src/i18n/locales/en.ts';

function fixture(overrides = {}) {
  const calls = [], persisted = [];
  const state = createCatalogState({ initialSetting: 'en', fallback: en,
    resolve: setting => setting === 'auto' ? 'ja' : setting,
    loaders: Object.fromEntries(['en','zh-CN','zh-TW','ja','de','fr','es'].map(locale => [locale, async () => {
      calls.push(locale);
      return overrides[locale] ? overrides[locale]() : { ...en, app: { ...en.app, title: locale } };
    }])), persist: setting => persisted.push(setting) });
  return { state, calls, persisted };
}

test('catalogs load only on demand, deduplicate preparations, and keep language drafts inactive', async () => {
  const { state, calls, persisted } = fixture();
  assert.deepEqual(calls, []);
  await Promise.all([state.prepare('fr'), state.prepare('fr')]);
  assert.deepEqual(calls, ['fr']);
  assert.equal(state.locale.value, 'en'); assert.equal(state.messages.value, en);
  assert.deepEqual(persisted, []);
  await state.select('fr');
  assert.equal(state.locale.value, 'fr'); assert.equal(state.messages.value.app.title, 'fr');
  assert.deepEqual(calls, ['fr']); assert.deepEqual(persisted, ['fr']);
  await state.select('auto', false);
  assert.equal(state.setting.value, 'auto'); assert.equal(state.locale.value, 'ja');
  assert.deepEqual(persisted, ['fr']);
});

test('late catalog replies cannot override a newer choice, including a round trip', async () => {
  let release;
  const { state, persisted } = fixture({ fr: () => new Promise(resolve => release = resolve) });
  const pending = state.select('fr');
  await state.select('en');
  release({ ...en, app: { ...en.app, title: 'late' } }); await pending;
  assert.equal(state.locale.value, 'en'); assert.equal(state.messages.value, en);
  assert.deepEqual(persisted, ['en']);
});

test('failed catalog loads retain the active language and preference and can be retried', async () => {
  let fail = true;
  const { state, calls, persisted } = fixture({ de: () => {
    if (fail) throw Error('chunk unavailable');
    return en;
  } });
  await assert.rejects(state.select('de'), /chunk unavailable/);
  assert.equal(state.setting.value, 'en'); assert.equal(state.locale.value, 'en');
  assert.equal(state.messages.value, en); assert.deepEqual(persisted, []);
  fail = false; await state.select('de');
  assert.deepEqual(calls, ['de','de']); assert.deepEqual(persisted, ['de']);
});

test('a failed stale choice does not reject or affect the newer language', async () => {
  let reject;
  const { state } = fixture({ es: () => new Promise((_, failure) => reject = failure) });
  const pending = state.select('es');
  await state.select('en'); reject(Error('old failure')); await pending;
  assert.equal(state.locale.value, 'en');
});

test('startup loads a legacy saved language before use without rewriting its preference', async () => {
  const storage = new Map([['berry_locale', 'fr']]);
  const writes = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { writes.push([key, value]); storage.set(key, value); },
  } });
  try {
    const locale = await import('../src/i18n/index.ts?legacy-startup');
    assert.equal(locale.currentLocaleSetting.value, 'fr');
    await locale.initializeLocale();
    assert.equal(locale.currentLocale.value, 'fr');
    assert.equal(locale.t.value.settings.language, (await import('../src/i18n/locales/fr.ts')).fr.settings.language);
    assert.deepEqual(writes, [['omera_locale', 'fr']]);
    assert.equal(storage.get('berry_locale'), 'fr');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
