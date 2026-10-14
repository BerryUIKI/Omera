import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc';
import { createRenderer, createSSRApp, h, nextTick, reactive } from 'vue';
import { renderToString } from 'vue/server-renderer';

/** Execute production setup in a live Vue scope and render its current state with the production template. */
export async function withProductionComponent(name, initialProps, invoke, run, transform = code => code) {
  const key = `component_${randomUUID()}`;
  globalThis[key] = invoke;
  const previousWindow = globalThis.window;
  globalThis.window ??= { addEventListener() {}, removeEventListener() {},
    __TAURI_INTERNALS__: { convertFileSrc: file => `asset:/${file}` } };
  const filename = path.resolve(`src/components/${name}.vue`);
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'));
  const script = compileScript(descriptor, { id: name });
  const template = compileTemplate({ source: descriptor.template.content, filename, id: name,
    ssr: true, ssrCssVars: [], compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
  let code = transform(script.content)
    .replace(/import \{ invoke \} from [^;]+;/, `const invoke = (...args) => globalThis[${JSON.stringify(key)}](...args);`)
    .replace(/import \{ getThumbnailUrl \} from [^;]+;/, 'const getThumbnailUrl = async file => "thumbnail:" + file.id;')
    .replace(/import \{ useFileCuration, type CurationChange \} from [^;]+;/,
      `import { useFileCuration as createCuration } from ${JSON.stringify(pathToFileURL(path.resolve('src/utils/file-curation.ts')).href)}; const useFileCuration = (get, publish) => createCuration(get, publish, (...args) => globalThis[${JSON.stringify(key)}](...args));`)
    .replace(/from ["'](\.\.?\/[^"']+)["']/g, (_, specifier) => {
      let resolved = path.resolve(path.dirname(filename), specifier);
      if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
      else if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
      return 'from ' + JSON.stringify(pathToFileURL(resolved).href);
    }).replace('export default', 'const component =');
  code += '\n' + template.code.replace('export function ssrRender', 'function ssrRender') + '\ncomponent.ssrRender=ssrRender; export default component;';
  const temporary = path.resolve('tests', `.tmp-component-${randomUUID()}.mjs`);
  fs.writeFileSync(temporary, ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext,
  } }).outputText);
  let mounted;
  try {
    const component = (await import(pathToFileURL(temporary).href)).default;
    const setup = component.setup;
    let controls;
    const events = [];
    component.setup = (props, context) => controls = setup(props, { ...context,
      emit: (...args) => events.push(args) });
    const renderer = createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null });
    const props = reactive(initialProps);
    const live = { ...component, render: () => h('div'), ssrRender: undefined };
    mounted = renderer.createApp({ render: () => h(live, { ...props }) });
    mounted.mount({});
    const render = async () => {
      const server = { ...component, setup: () => controls };
      const app = createSSRApp({ render: () => h(server, { ...props }) });
      app.directive('dialog', { getSSRProps: () => ({}) });
      return renderToString(app);
    };
    await nextTick();
    await run({ controls, events, props, render });
  } finally {
    mounted?.unmount();
    fs.unlinkSync(temporary);
    delete globalThis[key];
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}
