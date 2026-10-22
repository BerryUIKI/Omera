import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTick } from 'vue';
import { withProductionComponent } from './helpers/production-component.mjs';
import { setLocale } from '../src/i18n/index.ts';

const model = { model_name: 'flux1-dev.safetensors', model_hash: 'ABC123', count: 2 };
const info = {
  hash: 'abc123',
  model_id: 42,
  model_name: 'Flux Model',
  model_type: 'Checkpoint',
  version_id: 100,
  version_name: 'v1.0',
  base_model: 'Flux.1 D',
  trained_words: ['flux trigger'],
  description: 'A model description',
  preview_url: 'https://image.civitai.com/a.jpg',
  download_url: null,
  latest_version_id: 101,
  latest_version_name: 'v1.1',
  latest_version_created_at: '2025-02-01T00:00:00Z',
  update_available: true,
};

async function flush() {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

test('Model Manager looks up Civitai and renders the preview and update badge', async () => {
  await setLocale('en');
  const calls = [];
  await withProductionComponent(
    'ModelManagerModal',
    { show: true },
    async (command, args) => {
      calls.push([command, args]);
      switch (command) {
        case 'get_checkpoint_models':
          return [model];
        case 'list_model_cache':
        case 'list_civitai_cache':
          return [];
        case 'lookup_civitai_model':
          return info;
        case 'fetch_civitai_preview':
          return '/previews/abc123.jpg';
        default:
          return null;
      }
    },
    async ({ controls, render }) => {
      await flush();
      let html = await render();
      assert.match(html, /Look up on Civitai/);

      await controls.lookupModel(controls.models.value[0]);
      await flush();
      html = await render();
      assert.match(html, /Flux Model/);
      assert.match(html, /Update available/);
      assert.match(html, /v1\.1/);
      assert.match(html, /previews\/abc123\.jpg/);
      assert.deepEqual(
        calls.find(([name]) => name === 'lookup_civitai_model'),
        ['lookup_civitai_model', { hash: 'abc123', refresh: false }],
      );
    },
  );
});

test('LoRA Manager looks up Civitai and applies remote trigger words', async () => {
  await setLocale('en');
  let applied = false;
  const lora = {
    id: 1,
    name: 'detail_tweaker',
    hash: 'abc123',
    trigger_words: ['existing trigger'],
    preview_url: null,
    description: null,
    weight_default: 0.8,
    created_at: '',
    updated_at: '',
  };
  const appliedLora = {
    ...lora,
    trigger_words: ['existing trigger', 'flux trigger'],
    description: info.description,
    preview_url: info.preview_url,
  };
  const calls = [];
  await withProductionComponent(
    'LoraManagerModal',
    { show: true },
    async (command, args) => {
      calls.push([command, args]);
      switch (command) {
        case 'list_loras':
          return applied ? [appliedLora] : [lora];
        case 'list_civitai_cache':
          return applied ? [info] : [];
        case 'lookup_civitai_model':
          return info;
        case 'fetch_civitai_preview':
          return '/previews/abc123.jpg';
        case 'apply_civitai_to_lora':
          applied = true;
          return appliedLora;
        default:
          return null;
      }
    },
    async ({ controls, render }) => {
      await flush();
      await controls.lookupLora(controls.loras.value[0]);
      await flush();
      let html = await render();
      assert.match(html, /Flux Model/);
      assert.match(html, /Apply Civitai metadata/);

      await controls.applyCivitai(controls.loras.value[0]);
      await flush();
      html = await render();
      assert.match(html, /flux trigger/);
      assert.match(html, /Civitai metadata applied/);
      assert.deepEqual(
        calls.find(([name]) => name === 'apply_civitai_to_lora'),
        ['apply_civitai_to_lora', { loraId: 1, hash: 'abc123' }],
      );
    },
    (code) => code.replace(
      /import \{ open as openDialog \} from [^;]+;/,
      'const openDialog = async () => null;',
    ),
  );
});
