<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import WorkflowGraph from "./WorkflowGraph.vue";
import { comfyMonitor } from "../utils/comfy-monitor";
import { loadAppConfig } from "../utils/config";
import { formatBytes } from "../utils/image";
import { t } from "../i18n";
const emit = defineEmits<{ close: [] }>();
const state = comfyMonitor.state;
const endpoint = ref(state.endpoint);
const configError = ref("");
const selectedId = ref<string | null>(null);
const selected = computed(() => [...(state.snapshot?.running ?? []), ...(state.snapshot?.pending ?? [])]
  .find(item => item.prompt_id === selectedId.value));
const outcome = (status: string) => status === "completed" ? t.value.comfy.completed : status === "failed" ? t.value.comfy.failed : t.value.comfy.unknown;
const progress = computed(() => state.max > 0 ? Math.round(state.value / state.max * 100) : null);
watch(() => state.snapshot, snapshot => {
  const items = [...(snapshot?.running ?? []), ...(snapshot?.pending ?? [])];
  if (!items.some(item => item.prompt_id === selectedId.value)) selectedId.value = items[0]?.prompt_id ?? null;
}, { immediate: true });
onMounted(async () => {
  if (endpoint.value) return;
  try { endpoint.value = (await loadAppConfig()).comfyui_url; }
  catch (error) { configError.value = String(error); }
});
function connect() { configError.value = ""; void comfyMonitor.connect(endpoint.value.trim()); }
function disconnect() { void comfyMonitor.disconnect(); }
</script>

<template>
  <div class="comfy-overlay" v-dialog="() => emit('close')" @click.self="emit('close')">
    <section class="comfy-dialog" role="dialog" aria-modal="true" :aria-label="t.comfy.queueTitle">
      <header><h3>{{ t.comfy.queueTitle }}</h3><button type="button" :aria-label="t.updater.close" @click="emit('close')">×</button></header>
      <form class="connection-tools" @submit.prevent="connect">
        <label>{{ t.comfy.endpoint }}<input v-model="endpoint" type="url" maxlength="2048" required :placeholder="'http://127.0.0.1:8188'" /></label>
        <button type="submit" :disabled="!endpoint.trim() || (state.status === 'connecting' && !state.session)">{{ state.session ? t.comfy.reconnect : t.comfy.connect }}</button>
        <button type="button" :disabled="state.status === 'disconnected'" @click="disconnect">{{ t.comfy.disconnect }}</button>
        <span class="connection-status" role="status">{{ t.comfy[state.status] }}</span>
      </form>
      <p class="monitor-hint">{{ t.comfy.monitorHint }}</p>
      <p v-if="configError || state.error" class="comfy-error" role="alert">{{ configError || state.error }}</p>
      <p v-if="state.snapshot && !state.fresh" class="stale-notice">{{ t.comfy.stale }}</p>
      <div class="studio-content">
        <aside class="queue-side">
          <section>
            <h4>{{ t.comfy.running }} ({{ state.snapshot?.running_total ?? '—' }})</h4>
            <p v-if="state.activePromptId" class="execution-detail">{{ t.comfy.currentNode }}: {{ state.node ?? t.comfy.unknown }}
              <span v-if="progress !== null"> · {{ progress }}% ({{ state.value }} / {{ state.max }})</span>
            </p>
            <progress v-if="state.activePromptId && state.max > 0" :value="state.value" :max="state.max" :aria-label="t.comfy.nodeProgress" />
            <button v-for="item in state.snapshot?.running ?? []" :key="item.prompt_id" type="button" class="queue-item"
              :aria-pressed="selectedId === item.prompt_id" @click="selectedId = item.prompt_id"><strong>{{ t.comfy.running }}</strong><span>{{ item.prompt_id }}</span></button>
            <p v-if="state.snapshot && !state.snapshot.running.length" class="empty-label">{{ t.comfy.noRunning }}</p>
          </section>
          <section>
            <h4>{{ t.comfy.pending }} ({{ state.snapshot?.pending_total ?? '—' }})</h4>
            <button v-for="(item, index) in state.snapshot?.pending ?? []" :key="item.prompt_id" type="button" class="queue-item"
              :aria-pressed="selectedId === item.prompt_id" @click="selectedId = item.prompt_id"><strong>{{ t.comfy.position }} {{ index + 1 }}</strong><span>{{ item.prompt_id }}</span></button>
            <p v-if="state.snapshot && !state.snapshot.pending.length" class="empty-label">{{ t.comfy.noPending }}</p>
            <p v-if="state.snapshot && state.snapshot.pending_total > state.snapshot.pending.length">{{ t.comfy.queueBound }}</p>
          </section>
          <section>
            <h4>{{ t.comfy.recent }}</h4>
            <p v-if="state.snapshot?.history_error" class="comfy-error">{{ t.comfy.historyUnavailable }}</p>
            <article v-for="item in state.snapshot?.recent ?? []" :key="item.prompt_id" class="history-item"><strong>{{ outcome(item.status) }}</strong><span>{{ item.prompt_id }}</span><p v-if="item.error" class="comfy-error">{{ item.error }}</p></article>
            <p v-if="state.snapshot && !state.snapshot.recent.length && !state.snapshot.history_error" class="empty-label">{{ t.comfy.noRecent }}</p>
          </section>
          <section>
            <h4>{{ t.comfy.devices }}</h4>
            <p v-if="state.snapshot?.stats_error" class="comfy-error">{{ t.comfy.statsUnavailable }}</p>
            <article v-for="(device, index) in state.snapshot?.devices ?? []" :key="index" class="device-item">
              <strong>{{ device.name }} ({{ device.device_type }})</strong><p>{{ device.device_type === 'cpu' ? t.comfy.memory : t.comfy.vram }}:
                {{ device.vram_free === null ? t.comfy.unknown : formatBytes(device.vram_free) }} / {{ device.vram_total === null ? t.comfy.unknown : formatBytes(device.vram_total) }}</p>
            </article>
          </section>
        </aside>
        <div class="live-graph">
          <WorkflowGraph v-if="selected?.graph_json" :source="selected.graph_json" :active-node-id="selected.prompt_id === state.activePromptId ? state.node : null" />
          <p v-else>{{ state.status === 'disconnected' ? t.comfy.connectHint : t.comfy.noQueueGraph }}</p>
        </div>
      </div>
      <footer>{{ t.comfy.backgroundHint }} <span v-if="state.lastUpdated">{{ t.comfy.lastUpdated }}: {{ new Date(state.lastUpdated).toLocaleTimeString() }}</span></footer>
    </section>
  </div>
</template>

<style scoped>
.comfy-overlay { position: fixed; inset: 0; z-index: 2200; background: #0009; display: grid; place-items: center; }
.comfy-dialog { width: min(1400px,96vw); height: 92vh; padding: 16px; display: flex; flex-direction: column; gap: 10px; color: var(--color-text-primary); background: var(--color-bg-primary); border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }h3 { margin: 0; font-size: 16px; }h4 { margin: 0 0 8px; font-size: 13px; }
button,input { min-height: 32px; background: var(--color-bg-secondary); color: inherit; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px; font: inherit; }
button { cursor: pointer; }button:disabled { opacity: .5; cursor: default; }button:focus-visible,input:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.connection-tools { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }.connection-tools label { display: grid; gap: 4px; flex: 1; min-width: 180px; }.connection-tools input { width: 100%; }
.connection-status { padding: 8px; }.monitor-hint,.stale-notice,footer { color: var(--color-text-secondary); margin: 0; line-height: 1.5; }
.comfy-error { color: var(--color-danger,#ef4444); overflow-wrap: anywhere; margin: 4px 0; }
.studio-content { flex: 1; min-height: 0; display: grid; grid-template-columns: 270px minmax(0,1fr); gap: 16px; }
.queue-side { overflow: auto; padding-right: 8px; }.queue-side section { margin-bottom: 16px; }.queue-side p { line-height: 1.5; overflow-wrap: anywhere; }
.queue-item { display: flex; flex-direction: column; align-items: start; gap: 4px; width: 100%; margin: 6px 0; text-align: left; overflow-wrap: anywhere; }
.queue-item[aria-pressed=true] { border-color: var(--color-accent); background: var(--color-bg-hover); }.queue-item span { font-size: 12px; }
.history-item,.device-item { padding: 8px 0; border-bottom: 1px solid var(--border-color); overflow-wrap: anywhere; }.history-item span { display: block; margin-top: 4px; color: var(--color-text-secondary); }
progress { width: 100%; accent-color: var(--color-accent); }.live-graph { min-width: 0; min-height: 0; }.empty-label { color: var(--color-text-secondary); }footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 12px; }
@media(max-width:1000px) { .studio-content { grid-template-columns: 1fr; grid-template-rows: minmax(110px,30%) minmax(230px,1fr); }.queue-side { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; } }
</style>
