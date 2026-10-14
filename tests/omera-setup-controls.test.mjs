import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc';
import { createSSRApp, createRenderer, h, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { setLocale, currentLocaleSetting } from '../src/i18n/index.ts';

async function controlsFor(name, props, invoke, run) {
  const key = `setup_${randomUUID()}`;
  globalThis[key] = invoke;
  const expose = name === 'OnboardingModal'
    ? 'initialize, directory, locale, changeLanguage, finishSetup, error, legacyDiscoveredSourcesCount'
    : 'loadStatus, sourceId, directory, preview, analyze, start, close, reviewCleanup, clean, approved, cleanup, result';
  const { descriptor } = parse(fs.readFileSync(`src/components/${name}.vue`, 'utf8')
    .replace('</script>', `defineExpose({ ${expose} });\n</script>`));
  const script = compileScript(descriptor, { id: name });
  const template = compileTemplate({ source: descriptor.template.content, filename: name,
    id: name, ssr: true, ssrCssVars: [], compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
  let code = script.content.replace('export default', 'const component =')
    .replace(/import \{ invoke \} from [^;]+;/, `const invoke = (...args) => globalThis[${JSON.stringify(key)}](...args);`)
    .replace(/import \{ open \} from [^;]+;/, 'const open = async () => null;')
    .replace(/import \{ saveAppConfig[^;]+;/, 'const saveAppConfig = config => invoke("save_app_config", { config });')
    .replace(/import LegacyMigrationModal from [^;]+;/, 'const LegacyMigrationModal = { render: () => null };')
    .replace('from "../i18n"', 'from "../src/i18n/index.ts"')
    .replace('from "../utils/legacy-migration"', 'from "../src/utils/legacy-migration.ts"')
    .replace('from "../utils/image"', 'from "../src/utils/image.ts"');
  code += '\n' + template.code.replace('export function ssrRender', 'function ssrRender') + '\ncomponent.ssrRender=ssrRender; export default component;';
  const file = path.resolve('tests', `.tmp-setup-${randomUUID()}.mjs`);
  fs.writeFileSync(file, ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext } }).outputText);
  try {
    const component = (await import(pathToFileURL(file).href)).default;
    let controls;
    const events = [];
    const setup = component.setup;
    component.setup = (props, context) => setup(props, { ...context, expose(value) { controls = value; } });
    const app = createSSRApp({ render: () => h(component, { ...props, onClose: () => events.push('close') }) });
    app.directive('dialog', { getSSRProps: () => ({}) });
    const html = await renderToString(app);
    // Mount the production setup in a minimal host so watchers and lifecycle remain active.
    component.render = () => h("div");
    delete component.ssrRender;
    const renderer = createRenderer({
      createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
      parentNode: () => null, nextSibling: () => null,
    });
    const mounted = renderer.createApp(component, { ...props, onClose: () => events.push('close') });
    mounted.mount({});
    try { await nextTick(); await run({ controls, events, html }); }
    finally { mounted.unmount(); }
  } finally { fs.unlinkSync(file); delete globalThis[key]; }
}

test('welcome detects legacy libraries, saves language, and retains failed setup for retry', async () => {
  setLocale('en');
  let failSave = true;
  let failLocation = true;
  const calls = [];
  await controlsFor('OnboardingModal', {}, async (command, args) => {
    calls.push([command, args]);
    if (command === 'get_storage_paths') return { database_file: 'F:\\Library\\omera.db' };
    if (command === 'get_legacy_migration_status') return { stage: 'discovered', discovered_sources: [{}, {}] };
    if (command === 'get_app_config') return { locale: 'en', config_revision: 1 };
    if (command === 'save_app_config' && failSave) throw Error('save failed');
    if (command === 'set_library_directory' && failLocation) throw Error('location failed');
  }, async ({ controls, events, html }) => {
    assert.match(html, /Application language/);
    assert.match(html, /Database directory/);
    await controls.initialize();
    assert.equal(controls.legacyDiscoveredSourcesCount.value, 2);
    assert.equal(controls.directory.value, 'F:/Library');
    controls.locale.value = 'zh-CN'; await controls.changeLanguage();
    assert.equal(currentLocaleSetting.value, 'en');
    failSave = false; controls.locale.value = 'zh-CN'; await controls.changeLanguage();
    assert.equal(currentLocaleSetting.value, 'zh-CN');
    await controls.finishSetup(false); assert.deepEqual(events, []);
    assert.match(controls.error.value, /location failed/);
    failLocation = false; await controls.finishSetup(false);
    assert.deepEqual(events, ['close']);
    assert.deepEqual(calls.at(-1), ['set_library_directory', { directory: 'F:/Library', completeSetup: true }]);
  });
});

const source = { source_id: 'legacy', is_locked: false };
test('an import failure invalidates the safe preview before retry', async () => {
  await controlsFor('LegacyMigrationModal', { show: true }, async (command) => {
    if (command === 'get_legacy_migration_status') return { discovered_sources: [source], active_receipt: null };
    if (command === 'start_legacy_migration') throw '[DESTINATION_EXISTS] target changed';
  }, async ({ controls }) => {
    await controls.loadStatus(); await nextTick();
    controls.preview.value = { plan_id: 'ready', conflicts: [], available_space_bytes: 100, required_space_bytes: 10 };
    await controls.start();
    assert.equal(controls.preview.value, null);
  });
});

test('migration rejects stale previews and conflicts, and waits for verified restart', async () => {
  const calls = [];
  let resolvePreview;
  await controlsFor('LegacyMigrationModal', { show: true }, async (command, args) => {
    calls.push([command, args]);
    if (command === 'get_legacy_migration_status') return { discovered_sources: [source], active_receipt: null };
    if (command === 'preview_legacy_migration') return new Promise(resolve => { resolvePreview = resolve; });
    if (command === 'start_legacy_migration') return { status: 'awaiting_restart' };
  }, async ({ controls, events }) => {
    await controls.loadStatus(); await nextTick();
    const stale = controls.analyze(); controls.directory.value = 'F:/new'; await nextTick();
    resolvePreview({ plan_id: 'stale' }); await stale;
    assert.equal(controls.preview.value, null);
    controls.preview.value = { plan_id: 'conflict', conflicts: ['[DESTINATION_EXISTS]'], available_space_bytes: 100, required_space_bytes: 10 };
    await controls.start(); assert.ok(!calls.some(([command]) => command === 'start_legacy_migration'));
    controls.preview.value = { ...controls.preview.value, plan_id: 'ready', conflicts: [] };
    await controls.start(); await controls.close();
    assert.deepEqual(events, []);
    assert.deepEqual(calls.at(-1), ['start_legacy_migration', { planId: 'ready' }]);
  });
});

test('verified import asks for cleanup and sends only an explicitly approved preview ID', async () => {
  const calls = [];
  const receipt = { receipt_id: 'receipt', activated_at: 1, cleanup_status: 'pending' };
  await controlsFor('LegacyMigrationModal', { show: true }, async (command, args) => {
    calls.push([command, args]);
    if (command === 'get_legacy_migration_status') return { stage: 'cleanup_available', discovered_sources: [], active_receipt: receipt };
    if (command === 'preview_legacy_cleanup') return { preview_id: 'review', items: [{ path: 'F:/legacy/berry.db', eligible: true }], total_size_bytes: 100 };
    if (command === 'confirm_legacy_cleanup') return { status: 'partially_cleaned', cleaned_count: 0, failed_count: 1, errors: ['trash unavailable'], cleaned_bytes: 0 };
  }, async ({ controls, events }) => {
    await controls.loadStatus(); await controls.reviewCleanup();
    await controls.clean(); assert.ok(!calls.some(([command]) => command === 'confirm_legacy_cleanup'));
    controls.approved.value = true; await controls.clean();
    assert.deepEqual(calls.at(-1), ['confirm_legacy_cleanup', { previewId: 'review', confirmed: true }]);
    assert.equal(controls.result.value.failed_count, 1); assert.deepEqual(events, []);
    await controls.close();
    assert.deepEqual(calls.at(-1), ['defer_legacy_cleanup', { receiptId: 'receipt' }]);
    assert.deepEqual(events, ['close']);
  });
});
