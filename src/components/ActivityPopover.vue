<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import { computed, onUnmounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { backgroundTasks, dismissTask } from "../utils/background-tasks";
import { formatBytes } from "../utils/image";
import { comfyMonitor } from "../utils/comfy-monitor";
import { t } from "../i18n";
import { getThumbnailDiagnostics, type ThumbnailDiagnosticsSummary } from "../utils/thumbnail";
import type { ScanProgress } from "../types";

export interface WatcherStatus {
  is_active: boolean;
  watched_roots_count: number;
  pending_journal_count: number;
  last_reconcile_time: number | null;
  last_error: string | null;
}

const props = defineProps<{
  open: boolean;
  scanProgress: ScanProgress | null;
  thumbProgress?: { current: number; total: number; active: boolean } | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "openThumbnailDiagnostics"): void;
  (e: "openComfyStudio"): void;
}>();

const watcherStatus = ref<WatcherStatus | null>(null);
const thumbDiag = ref<ThumbnailDiagnosticsSummary | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

let generation = 0;
let refreshing = false;
async function refresh() {
  if (!props.open || refreshing) return;
  refreshing = true;
  const requestGeneration = generation;
  try {
    const [watcher, thumbnails] = await Promise.allSettled([
      invoke<WatcherStatus>("get_watcher_status"), getThumbnailDiagnostics(),
    ]);
    if (!props.open || generation !== requestGeneration) return;
    if (watcher.status === "fulfilled") watcherStatus.value = watcher.value;
    if (thumbnails.status === "fulfilled") thumbDiag.value = thumbnails.value;
  } finally { refreshing = false; }
}
function showOutput(path: string) {
  void invoke("reveal_in_file_manager", { path }).catch(console.error);
}

watch(
  () => props.open,
  (val) => {
    generation++;
    if (val) {
      refresh();
      if (!pollTimer) pollTimer = setInterval(refresh, 2000);
    } else if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  generation++;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

const formattedLastReconcile = computed(() => {
  if (!watcherStatus.value?.last_reconcile_time) return "—";
  const date = new Date(watcherStatus.value.last_reconcile_time * 1000);
  return date.toLocaleTimeString();
});
</script>

<template>
  <div v-if="open" class="activity-popover-container" @click.stop @keydown.esc.stop="emit('close')">
    <div class="popover-header">
      <div class="header-title">
        <AppIcon name="activity" />
        <span>{{ t.statusbar.activity }}</span>
      </div>
      <button type="button" class="close-btn" @click="emit('close')" :aria-label="t.updater.close">✕</button>
    </div>

    <div class="popover-body">
      <section class="activity-card">
        <div class="card-title"><strong>ComfyUI</strong><button type="button" class="action-link" @click="emit('openComfyStudio')">{{ t.comfy.queueTitle }} ↗</button></div>
        <p>{{ t.comfy[comfyMonitor.state.status] }}</p>
        <p v-if="comfyMonitor.state.snapshot">{{ t.comfy.running }}: {{ comfyMonitor.state.snapshot.running_total }} · {{ t.comfy.pending }}: {{ comfyMonitor.state.snapshot.pending_total }}</p>
        <p v-if="comfyMonitor.state.snapshot && !comfyMonitor.state.fresh">{{ t.comfy.stale }}</p>
      </section>
      <section class="task-list" :aria-label="t.tasks.title">
        <p v-if="!backgroundTasks.length" class="empty-tasks">{{ t.tasks.empty }}</p>
        <article v-for="task in backgroundTasks" :key="task.id" class="activity-card" :class="{ 'task-failed': task.status === 'failed' }">
          <div class="card-title"><strong>{{ t.tasks[task.kind] }}</strong><span>{{ t.tasks[task.status] }}</span></div>
          <template v-if="task.progress">
            <p v-if="task.progress.detail" class="task-detail">{{ task.progress.detail }}</p>
            <progress v-if="task.status === 'running'" :max="task.progress.total || 1"
              :value="task.progress.total ? Math.min(task.progress.current, task.progress.total) : undefined"
              :aria-label="t.tasks[task.kind]" />
            <p>{{ task.kind !== 'export' ? formatBytes(task.progress.current) : task.progress.current }}
              <template v-if="task.progress.total"> / {{ task.kind !== 'export' ? formatBytes(task.progress.total) : task.progress.total }}</template>
            </p>
          </template>
          <p v-if="task.error" class="task-error">{{ task.error }}</p>
          <div class="task-actions">
            <button v-if="task.outputPath" type="button" class="action-link" @click="showOutput(task.outputPath)">{{ t.tasks.output }}</button>
            <button v-if="task.status !== 'running'" type="button" class="action-link" @click="dismissTask(task.id)">{{ t.tasks.dismiss }}</button>
          </div>
        </article>
      </section>
      <!-- Section 1: Watcher Health -->
      <div class="activity-card">
        <div class="card-title">
          <div class="title-left">
            <span
              class="health-dot"
              :class="{
                healthy: watcherStatus?.is_active && !watcherStatus?.last_error,
                degraded: watcherStatus?.last_error,
                inactive: !watcherStatus?.is_active,
              }"
            ></span>
            <strong>{{ watcherStatus?.is_active ? t.statusbar.watcherActive : t.statusbar.ready }}</strong>
          </div>
          <span v-if="watcherStatus?.watched_roots_count" class="badge">
            {{ watcherStatus.watched_roots_count }} {{ t.tasks.roots }}
          </span>
        </div>

        <div class="card-metrics">
          <div class="metric-row">
            <span class="label">{{ t.tasks.pendingChanges }}</span>
            <span class="value">{{ watcherStatus?.pending_journal_count ?? 0 }}</span>
          </div>
          <div class="metric-row">
            <span class="label">{{ t.tasks.lastReconciled }}</span>
            <span class="value">{{ formattedLastReconcile }}</span>
          </div>
          <div v-if="watcherStatus?.last_error" class="metric-row error-row">
            <span class="label">{{ t.tasks.status }}</span>
            <span class="value error-msg" :title="watcherStatus.last_error">
              {{ watcherStatus.last_error }}
            </span>
          </div>
        </div>
      </div>

      <!-- Section 2: Thumbnail Engine -->
      <div class="activity-card">
        <div class="card-title">
          <strong>{{ t.tasks.thumbnails }}</strong>
          <button
            type="button"
            class="action-link"
            @click="emit('openThumbnailDiagnostics'); emit('close')"
          >
            {{ t.tasks.diagnostics }} ↗
          </button>
        </div>

        <div class="card-metrics">
          <div class="metric-row">
            <span class="label">{{ t.tasks.inFlight }}</span>
            <span class="value">{{ thumbDiag?.frontend.inFlightCount ?? 0 }}</span>
          </div>
          <div class="metric-row">
            <span class="label">{{ t.tasks.queuedBatches }}</span>
            <span class="value">{{ thumbDiag?.frontend.queuedBatchCount ?? 0 }}</span>
          </div>
          <div class="metric-row">
            <span class="label">{{ t.tasks.memoryCache }}</span>
            <span class="value">{{ thumbDiag?.frontend.memoryCacheSize ?? 0 }} {{ t.statusbar.items }}</span>
          </div>
          <div class="metric-row">
            <span class="label">{{ t.tasks.cacheHits }}</span>
            <span class="value">
              {{ (thumbDiag?.backend?.reused_tier_hits ?? 0) + (thumbDiag?.backend?.manifest_hits ?? 0) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Section 3: Library Scanner -->
      <div v-if="scanProgress && (scanProgress.discovering || scanProgress.found > 0)" class="activity-card">
        <div class="card-title">
          <strong>{{ t.tasks.scanner }}</strong>
          <span class="badge">{{ scanProgress.discovering ? t.tasks.discovering : t.tasks.running }}</span>
        </div>
        <div class="card-metrics">
          <div class="metric-row">
            <span class="label">{{ t.tasks.processed }}</span>
            <span class="value">{{ scanProgress.scanned }} / {{ scanProgress.found }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.activity-popover-container {
  position: absolute;
  bottom: 32px;
  right: 12px;
  width: min(380px, calc(100vw - 24px));
  background: var(--color-bg-primary, #1e2025);
  border: 1px solid var(--border-color-strong, rgba(255, 255, 255, 0.16));
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.45);
  z-index: 1000;
  overflow: hidden;
  font-family: inherit;
  color: var(--color-text-primary, #e2e8f0);
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--color-bg-secondary, #282b30);
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  font-size: 0.8rem;
  font-weight: 600;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary, #fff);
}

.popover-body {
  padding: 12px;
  max-height: min(65vh, 600px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.activity-card {
  background: var(--color-bg-secondary, #25282e);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
  border-radius: 6px;
  padding: 8px 10px;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.78rem;
  margin-bottom: 6px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #64748b;
}

.health-dot.healthy {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

.health-dot.degraded {
  background: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
}

.health-dot.inactive {
  background: #94a3b8;
}

.badge {
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-secondary, #94a3b8);
}

.action-link {
  background: transparent;
  border: none;
  color: var(--badge-cyan-text, #155e75);
  font-size: 0.72rem;
  cursor: pointer;
  padding: 0;
}

.action-link:hover {
  text-decoration: underline;
}

.card-metrics {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
}

.label {
  color: var(--color-text-muted, #94a3b8);
}

.value {
  font-weight: 500;
  color: var(--color-text-primary, #f1f5f9);
}

.error-msg {
  color: #f87171;
  max-width: 170px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<style scoped>
.task-list { display: grid; gap: 8px; font-size: 13px; }
.task-list h3 { margin: 0; font-size: 14px; }
.task-list p { margin: 6px 0; overflow-wrap: anywhere; }
.task-list progress { width: 100%; accent-color: var(--color-accent); }
.task-failed { border-color: var(--color-danger, #ef4444); }
.task-error { color: var(--color-danger, #ef4444); white-space: pre-wrap; }
.task-actions { display: flex; gap: 12px; justify-content: flex-end; }
.task-actions button { min-height: 32px; }
</style>
