<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { t } from '../i18n';
import type { ImageFile, ExtractedMetadata } from '../types';
import { useComparisonDetails } from '../utils/comparison-details';
import { diffPrompts, visibleDiff } from '../utils/prompt-diff';
const props = defineProps<{left: ImageFile | null; right: ImageFile | null}>();
const {files, partial, loading} = useComparisonDetails(() => [props.left, props.right],
  fileId => invoke<ImageFile | null>('get_file_details', {fileId}));
type PromptKey = 'prompt' | 'negative_prompt' | 'clip_l_prompt' | 't5xxl_prompt';
const active = ref<PromptKey>('prompt');
const copied = ref<number | null>(null), copyFailed = ref(false);
const tabs = computed(() => [
  {key: 'prompt' as const, label: t.value.preview.prompt},
  {key: 'negative_prompt' as const, label: t.value.preview.negativePrompt},
  ...(['clip_l_prompt', 't5xxl_prompt'] as const).filter(key => files.value.some(f => f?.metadata?.[key]))
    .map(key => ({key, label: key === 'clip_l_prompt' ? t.value.preview.clipLPrompt : t.value.preview.t5xxlPrompt})),
]);
watch(tabs, () => {if (!tabs.value.some(tab => tab.key === active.value)) active.value = 'prompt';});
const originals = computed(() => files.value.map(f => f?.metadata?.[active.value] ?? ''));
const diff = computed(() => diffPrompts(originals.value[0] ?? '', originals.value[1] ?? ''));
const sides = computed(() => [visibleDiff(diff.value.left), visibleDiff(diff.value.right)]);
const params = computed(() => {
  const p = t.value.preview;
  const fields: [keyof ExtractedMetadata, string][] = [['model_name',p.modelName],['model_hash',p.modelHash],
    ['seed',p.seed],['sampler',p.sampler],['steps',p.steps],['cfg_scale',p.cfgScale],
    ['guidance_scale',p.guidanceScale],['distilled_cfg_scale',p.distilledCfgScale],['shift',p.shift],['schedule_type',p.scheduleType]];
  const rows = fields.map(([key,label]) => ({key, label, values: files.value.map(f => f?.metadata?.[key] ?? null)}));
  rows.push({key:'width',label:p.dimensions,values:files.value.map(f=>f?.metadata?.width != null || f?.metadata?.height != null
    ? `${f.metadata.width ?? '?'} × ${f.metadata.height ?? '?'}` : null)});
  return rows.filter(row => row.values.some(value => value !== null));
});
watch(() => [props.left, props.right, active.value], () => {copied.value = null; copyFailed.value = false;});
async function copy(side: number) {
  const text = originals.value[side] ?? '';
  try {await navigator.clipboard.writeText(text); if (originals.value[side] === text) copied.value = side;}
  catch {copyFailed.value = true;}
}
</script>
<template>
  <section class="prompt-diff-panel" :aria-label="t.compare.promptDiff" :aria-busy="loading">
    <p v-if="loading" role="status">{{ t.compare.loadingDetails }}</p>
    <template v-else>
      <p v-if="partial.some(Boolean)" class="notice" role="status">{{ t.compare.partialDetails }}</p>
      <div v-if="params.length" class="parameter-scroll">
        <table><thead><tr><th>{{ t.preview.generationParams }}</th><th>A</th><th>B</th></tr></thead>
          <tbody><tr v-for="row in params" :key="row.key" :class="{changed: row.values[0] !== row.values[1]}">
            <th scope="row">{{ row.label }}</th><td v-for="(value,i) in row.values" :key="i">{{ value ?? t.compare.unknown }}</td>
          </tr></tbody>
        </table>
      </div>
      <div class="prompt-tabs" :aria-label="t.compare.promptDiff">
        <button v-for="tab in tabs" :key="tab.key" type="button" :aria-pressed="active === tab.key" @click="active = tab.key">{{ tab.label }}</button>
      </div>
      <div class="diff-legend"><ins>+ {{ t.compare.added }}</ins><del>− {{ t.compare.removed }}</del><mark>↔ {{ t.compare.weightChanged }}</mark></div>
      <p v-if="diff.coarse" class="notice">{{ t.compare.longDiff }}</p>
      <p v-if="originals.some(text => text.length > 20000)" class="notice">{{ t.compare.truncated }}</p>
      <p v-if="!diff.changed && originals[0] && !partial.some(Boolean)" role="status">{{ t.compare.noChanges }}</p>
      <p v-if="copyFailed" role="status">{{ t.compare.copyFailed }}</p>
      <div class="diff-panes">
        <article v-for="(parts,side) in sides" :key="side" :aria-label="side === 0 ? t.compare.slotA : t.compare.slotB">
          <header><strong>{{ side === 0 ? 'A' : 'B' }}</strong><button type="button" :disabled="!originals[side]" @click="copy(side)">{{ copied === side ? t.preview.copied : t.compare.copyOriginal }}</button></header>
          <div class="diff-text" tabindex="0"><span v-if="!originals[side]" class="empty">{{ t.compare.emptyPrompt }}</span><template v-for="(part,i) in parts" :key="i"><ins v-if="part.kind === 'added'">{{ part.text }}</ins><del v-else-if="part.kind === 'removed'">{{ part.text }}</del><mark v-else-if="part.kind === 'weight'" :title="`${t.compare.weightChanged}: ${part.from} → ${part.to}`">{{ part.text }}</mark><span v-else>{{ part.text }}</span></template></div>
        </article>
      </div>
    </template>
  </section>
</template>
<style scoped>
.prompt-diff-panel { flex:1; min-height:0; display:flex; flex-direction:column; gap:10px; padding:16px; overflow:hidden; color:var(--text-primary); background:var(--color-bg-primary); }
p { margin:0; font-size:12px; } .notice,.empty { color:var(--text-secondary); }
.parameter-scroll { max-height:26vh; overflow:auto; flex-shrink:0; }
table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12px; }
th,td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--border-color); overflow-wrap:anywhere; }
th { font-weight:600; } .changed td { background:var(--color-bg-tertiary); font-weight:600; }
.prompt-tabs,.diff-legend { display:flex; gap:8px; flex-wrap:wrap; flex-shrink:0; }
button { min-height:32px; padding:5px 10px; border:1px solid var(--border-color); border-radius:6px; color:inherit; background:var(--color-bg-secondary); cursor:pointer; }
button[aria-pressed=true] { border-color:var(--color-accent); color:var(--color-accent); } button:disabled { opacity:.5; cursor:default; }
.diff-legend { font-size:12px; } ins { background:#14784244; color:inherit; text-decoration:underline; } del { background:#b5304244; color:inherit; } mark { background:#b5821c55; color:inherit; text-decoration:underline dotted; }
.diff-panes { display:flex; flex:1; min-height:100px; gap:12px; overflow:hidden; }
article { flex:1; min-width:0; display:flex; flex-direction:column; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; }
header { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--color-bg-secondary); }
.diff-text { flex:1; min-height:0; overflow:auto; padding:14px; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.8; font-size:13px; }
@media(max-width:600px) { .prompt-diff-panel { padding:8px; gap:6px; } .diff-panes { gap:6px; } th,td { padding:5px; } }
</style>
