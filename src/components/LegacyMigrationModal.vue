<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n";
import { formatBytes } from "../utils/image";
import { migrationMessage } from "../utils/legacy-migration";
import type { LegacyMigrationStatus, LegacyMigrationPreview, LegacyMigrationJob, LegacyCleanupPreview, LegacyCleanupResult } from "../types";

const props = defineProps<{ show: boolean; destinationDirectory?: string }>();
const emit = defineEmits<{ (e: "close"): void; (e: "migrated"): void }>();
const status = ref<LegacyMigrationStatus | null>(null);
const preview = ref<LegacyMigrationPreview | null>(null);
const job = ref<LegacyMigrationJob | null>(null);
const cleanup = ref<LegacyCleanupPreview | null>(null);
const result = ref<LegacyCleanupResult | null>(null);
const sourceId = ref("");
const directory = ref(props.destinationDirectory || "");
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const approved = ref(false);
let generation = 0;
const receipt = computed(() => status.value?.active_receipt ?? job.value?.receipt);
const canClean = computed(() => !!receipt.value?.activated_at && ["pending", "deferred", "partially_cleaned"].includes(receipt.value.cleanup_status));
const restarting = computed(() => job.value?.status === "awaiting_restart" || status.value?.stage === "awaiting_restart");
const sources = computed(() => status.value?.discovered_sources || []);
const ready = computed(() => !!preview.value && !preview.value.conflicts.length && preview.value.available_space_bytes != null && preview.value.available_space_bytes >= preview.value.required_space_bytes);
watch(() => props.show, (show) => {
  generation++;
  if (show) { status.value = null; preview.value = null; job.value = null; cleanup.value = null; result.value = null; error.value = ""; approved.value = false; directory.value = props.destinationDirectory || ""; void loadStatus(); }
}, { immediate: true });
watch([sourceId, directory], () => { generation++; preview.value = null; error.value = ""; }, { flush: "sync" });
watch(() => props.destinationDirectory, (value) => { directory.value = value || ""; });
onBeforeUnmount(() => { generation++; });

async function loadStatus() {
  loading.value = true; error.value = "";
  const request = generation;
  try {
    const next = await invoke<LegacyMigrationStatus>("get_legacy_migration_status");
    if (request !== generation || !props.show) return;
    status.value = next;
    sourceId.value = next.discovered_sources.find(source => !source.is_locked)?.source_id || "";
    if (canClean.value) emit("migrated");
  } catch (e) { if (request === generation) error.value = String(e); }
  finally { loading.value = false; }
}
async function pickDirectory() {
  try { const value = await open({ directory: true, multiple: false }); if (typeof value === "string") directory.value = value; }
  catch (e) { error.value = String(e); }
}
async function analyze() {
  if (!sourceId.value || loading.value || busy.value) return;
  loading.value = true; error.value = "";
  const request = generation;
  try {
    const next = await invoke<LegacyMigrationPreview>("preview_legacy_migration", { sourceId: sourceId.value, destinationDirectory: directory.value || null });
    if (request === generation && props.show) preview.value = next;
  } catch (e) { if (request === generation) error.value = String(e); }
  finally { loading.value = false; }
}
async function start() {
  if (!ready.value || busy.value || !preview.value) return;
  busy.value = true; error.value = "";
  try {
    job.value = await invoke<LegacyMigrationJob>("start_legacy_migration", { planId: preview.value.plan_id });
    if (job.value.status === "failed") {
      error.value = job.value.error ? `[${job.value.error.code}] ${job.value.error.context || ""}` : "MIGRATION_FAILED";
      preview.value = null;
    }
  } catch (e) { error.value = String(e); preview.value = null; }
  finally { busy.value = false; }
}
async function reviewCleanup() {
  if (!receipt.value || busy.value) return;
  busy.value = true; error.value = ""; approved.value = false;
  try { cleanup.value = await invoke<LegacyCleanupPreview>("preview_legacy_cleanup", { receiptId: receipt.value.receipt_id }); }
  catch (e) { error.value = String(e); }
  finally { busy.value = false; }
}
async function clean() {
  if (!cleanup.value || !approved.value || busy.value) return;
  busy.value = true; error.value = "";
  try {
    result.value = await invoke<LegacyCleanupResult>("confirm_legacy_cleanup", { previewId: cleanup.value.preview_id, confirmed: true });
    cleanup.value = null;
    if (receipt.value) receipt.value.cleanup_status = result.value.status;
  } catch (e) { error.value = String(e); cleanup.value = null; approved.value = false; }
  finally { busy.value = false; }
}
async function close() {
  if (busy.value || restarting.value) return;
  if (canClean.value && receipt.value) {
    busy.value = true;
    try { await invoke("defer_legacy_cleanup", { receiptId: receipt.value.receipt_id }); }
    catch (e) { error.value = String(e); busy.value = false; return; }
    busy.value = false;
  }
  generation++; emit("close");
}
</script>

<template>
  <div v-if="show" class="modal-backdrop" v-dialog="close" @click.self="close">
    <div class="modal-dialog legacy-migration-dialog" role="dialog" aria-modal="true" :aria-label="t.legacyMigration.title">
      <div class="modal-header">
        <div class="header-titles"><h3>📦 {{ t.legacyMigration.title }}</h3><p class="subtitle">{{ t.setup.cacheNotice }}</p></div>
        <button type="button" class="btn-close" :aria-label="t.legacyMigration.close" :disabled="busy || restarting" @click="close">✕</button>
      </div>
      <div class="modal-body">
        <div v-if="error" class="alert-box error" role="alert">
          <p>{{ migrationMessage(error) }}</p>
          <details><summary>{{ t.legacyMigration.errorDetails }}</summary><code>{{ error }}</code></details>
        </div>
        <div v-if="loading" class="loading-state">{{ t.setup.checkingLegacy }}</div>
        <div v-else-if="restarting" class="alert-box success" role="status">{{ t.setup.restartNotice }}</div>
        <div v-else-if="result" class="stage-pane">
          <h4>{{ result.failed_count ? t.setup.partialCleanup : t.setup.cleaned }}</h4>
          <p>{{ formatBytes(result.cleaned_bytes) }}</p>
          <details v-if="result.errors.length"><summary>{{ t.legacyMigration.errorDetails }}</summary><p v-for="detail in result.errors" :key="detail">{{ detail }}</p></details>
          <button v-if="result.failed_count" class="btn-secondary" @click="result = null; reviewCleanup()">{{ t.review.retry }}</button>
        </div>
        <div v-else-if="cleanup" class="stage-pane">
          <h4>{{ t.setup.cleanupReview }} · {{ formatBytes(cleanup.total_size_bytes) }}</h4>
          <div v-for="item in cleanup.items" :key="item.path" class="receipt-card cleanup-item">
            <strong>{{ item.eligible ? t.setup.eligible : t.setup.protected }} · {{ formatBytes(item.size_bytes) }}</strong>
            <code>{{ item.path }}</code><span v-if="item.reason">{{ migrationMessage(item.reason) }}</span>
          </div>
          <label v-if="cleanup.items.some(item => item.eligible)" class="cleanup-approval"><input v-model="approved" type="checkbox" :disabled="busy" />{{ t.setup.cleanupConfirm }}</label>
          <p v-else>{{ t.setup.noCleanup }}</p>
        </div>
        <div v-else-if="canClean" class="stage-pane complete-pane">
          <h4>{{ t.legacyMigration.completeTitle }}</h4><p>{{ t.legacyMigration.completeDesc }}</p>
          <code>{{ receipt?.destination_db }}</code>
          <h4>{{ t.legacyMigration.cleanupPromptTitle }}</h4><p>{{ t.legacyMigration.cleanupPromptDesc }}</p>
          <p>{{ t.legacyMigration.sourcePreservedNotice }}</p>
        </div>
        <div v-else-if="busy" class="stage-pane progress-pane"><h4>{{ t.legacyMigration.migrating }}</h4><p>{{ t.legacyMigration.sourcePreservedNotice }}</p></div>
        <div v-else-if="preview" class="stage-pane">
          <h4>{{ t.legacyMigration.previewTitle }}</h4>
          <div class="plan-summary-grid">
            <div class="summary-card"><span>{{ t.legacyMigration.destinationTarget }}</span><code>{{ preview.destination_db }}</code></div>
            <div class="summary-card"><span>{{ t.legacyMigration.requiredSpace }}</span><strong>{{ formatBytes(preview.required_space_bytes) }}</strong></div>
            <div class="summary-card"><span>{{ t.legacyMigration.availableSpace }}</span><strong>{{ preview.available_space_bytes == null ? t.legacyMigration.spaceUnknown : formatBytes(preview.available_space_bytes) }}</strong></div>
          </div>
          <ul v-if="preview.conflicts.length" class="alert-box warning"><li v-for="conflict in preview.conflicts" :key="conflict">{{ migrationMessage(conflict) }}</li></ul>
          <div v-else class="alert-box success">{{ t.legacyMigration.noConflicts }}</div>
          <h5>{{ t.legacyMigration.exclusionsTitle }}</h5><ul><li v-for="item in preview.exclusions" :key="item">{{ migrationMessage(item) }}</li></ul>
        </div>
        <div v-else class="stage-pane">
          <h4>{{ t.legacyMigration.discoveredTitle }}</h4><p>{{ t.legacyMigration.discoveredDesc }}</p>
          <p v-if="!sources.length">{{ t.setup.noSources }}</p>
          <div class="source-cards" role="radiogroup" :aria-label="t.legacyMigration.sourceLabel">
            <label v-for="source in sources" :key="source.source_id" class="source-card" :class="{ selected: sourceId === source.source_id, locked: source.is_locked }">
              <input v-model="sourceId" type="radio" name="legacy-source" :value="source.source_id" :disabled="source.is_locked || loading" />
              <div class="card-info"><strong>{{ source.identifier }}</strong><p>{{ source.is_locked ? t.legacyMigration.isLocked : t.legacyMigration.isUnlocked }}</p>
                <div class="card-meta-grid"><span>{{ t.legacyMigration.fileCount }}: {{ source.file_count }}</span><span>{{ t.legacyMigration.dbSize }}: {{ formatBytes(source.database_size_bytes) }}</span><span>{{ t.legacyMigration.totalSize }}: {{ formatBytes(source.total_size_bytes) }}</span></div>
                <code class="card-path">{{ source.root_path }}</code>
              </div>
            </label>
          </div>
          <div class="directory-picker"><span>{{ t.setup.databaseDirectory }}</span><code v-if="directory">{{ directory }}</code><button class="btn-secondary" @click="pickDirectory">{{ t.setup.chooseDirectory }}</button></div>
          <p>{{ t.setup.locationHint }}</p>
          <button v-if="error" class="btn-secondary" @click="loadStatus">{{ t.review.retry }}</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" :disabled="busy || restarting" @click="close">{{ canClean ? t.legacyMigration.skipCleanupButton : t.legacyMigration.close }}</button>
        <div class="footer-actions">
          <button v-if="cleanup" class="btn-primary" :disabled="!approved || busy || !cleanup.items.some(item => item.eligible)" @click="clean">{{ t.setup.eligible }}</button>
          <button v-else-if="canClean && !result" class="btn-primary" :disabled="busy" @click="reviewCleanup">{{ t.legacyMigration.cleanupPreviewButton }}</button>
          <template v-else-if="preview && !restarting && !result">
            <button class="btn-secondary" :disabled="busy" @click="preview = null; job = null; error = ''">{{ t.legacyMigration.backToSources }}</button>
            <button class="btn-primary" :disabled="!ready || busy" @click="start">{{ t.legacyMigration.startMigration }}</button>
          </template>
          <button v-else-if="!result && !restarting" class="btn-primary" :disabled="!sourceId || loading || busy" @click="analyze">{{ t.legacyMigration.previewButton }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.legacy-migration-dialog {
  background: var(--color-bg-primary, #1e1e2e);
  color: var(--color-text-primary, #cdd6f4);
  border: 1px solid var(--border-color, #313244);
  border-radius: 12px;
  width: 100%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #313244);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-titles h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary, #cdd6f4);
}

.header-titles .subtitle {
  margin: 4px 0 0 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary, #a6adc8);
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.1rem;
  color: var(--color-text-secondary, #a6adc8);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.btn-close:hover {
  background: var(--color-bg-secondary, #181825);
  color: var(--color-text-primary, #cdd6f4);
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.stage-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text-primary, #cdd6f4);
}

.section-desc {
  margin: 4px 0 12px 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary, #a6adc8);
}

.source-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-card {
  display: flex;
  gap: 14px;
  padding: 14px 16px;
  background: var(--color-bg-secondary, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.source-card:hover:not(.locked) {
  border-color: var(--color-accent, #89b4fa);
}

.source-card.selected {
  border-color: var(--color-accent, #89b4fa);
  background: rgba(137, 180, 250, 0.08);
}

.source-card.locked {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-radio {
  margin-top: 2px;
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--color-text-primary, #cdd6f4);
}

.card-lock-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}

.badge-unlocked {
  background: rgba(166, 227, 161, 0.15);
  color: #a6e3a1;
}

.badge-locked {
  background: rgba(243, 139, 168, 0.15);
  color: #f38ba8;
}

.card-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
  font-size: 0.82rem;
}

.meta-item {
  display: flex;
  gap: 4px;
  color: var(--color-text-secondary, #a6adc8);
}

.meta-val {
  color: var(--color-text-primary, #cdd6f4);
}

.card-path {
  font-size: 0.78rem;
  color: var(--color-text-secondary, #a6adc8);
  word-break: break-all;
}

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.plan-header h4 {
  margin: 0;
  font-size: 1.1rem;
}

.plan-source-badge {
  background: rgba(137, 180, 250, 0.15);
  color: #89b4fa;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.plan-summary-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 12px;
}

.summary-card {
  padding: 12px;
  background: var(--color-bg-secondary, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-card.warning-bg {
  border-color: #f38ba8;
  background: rgba(243, 139, 168, 0.08);
}

.summary-label {
  font-size: 0.78rem;
  color: var(--color-text-secondary, #a6adc8);
}

.summary-val {
  font-size: 0.92rem;
  word-break: break-all;
}

.alert-box {
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.alert-box.error {
  background: rgba(243, 139, 168, 0.12);
  border: 1px solid #f38ba8;
  color: #f38ba8;
}

.alert-box.warning {
  background: rgba(249, 226, 175, 0.12);
  border: 1px solid #f9e2af;
  color: #f9e2af;
}

.alert-box.success {
  background: rgba(166, 227, 161, 0.12);
  border: 1px solid #a6e3a1;
  color: #a6e3a1;
}

.conflict-section,
.exclusion-section {
  padding: 12px 14px;
  background: var(--color-bg-secondary, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
}

.conflict-title,
.exclusion-title {
  margin: 0 0 8px 0;
  font-size: 0.9rem;
}

.conflict-list,
.exclusion-list {
  margin: 0;
  padding-left: 20px;
  font-size: 0.82rem;
  color: var(--color-text-secondary, #a6adc8);
}

.progress-pane,
.complete-pane,
.failed-pane {
  align-items: center;
  text-align: center;
  padding: 24px 0;
}

.spinner-large {
  font-size: 2.2rem;
  display: inline-block;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.progress-bar-container {
  width: 100%;
  max-width: 440px;
  height: 8px;
  background: var(--color-bg-secondary, #181825);
  border-radius: 4px;
  overflow: hidden;
  margin: 12px 0 4px 0;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-accent, #89b4fa);
  transition: width 0.3s ease;
}

.progress-percentage {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-accent, #89b4fa);
}

.source-preservation-notice {
  font-size: 0.82rem;
  color: var(--color-text-secondary, #a6adc8);
  margin-top: 16px;
}

.complete-hero,
.failed-hero {
  font-size: 3rem;
  margin-bottom: 8px;
}

.receipt-card {
  width: 100%;
  max-width: 460px;
  padding: 16px;
  background: var(--color-bg-secondary, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  text-align: left;
  font-size: 0.85rem;
}

.receipt-row {
  display: flex;
  justify-content: space-between;
}

.source-safe {
  color: #a6e3a1;
  font-weight: 500;
  margin-top: 4px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color, #313244);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-actions {
  display: flex;
  gap: 10px;
}

.btn-primary {
  background: var(--color-accent, #89b4fa);
  color: #11111b;
  border: none;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-bg-secondary, #181825);
  color: var(--color-text-primary, #cdd6f4);
  border: 1px solid var(--border-color, #313244);
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color, #313244);
}
.cleanup-item { max-width: none; box-sizing: border-box; margin-top: 0; padding: 12px; }
.cleanup-approval { display: flex; align-items: start; gap: 10px; margin-top: 0; }
.directory-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 18px; }
code, .summary-card strong { overflow-wrap: anywhere; min-width: 0; }
.alert-box { display: block; }
@media (max-width: 600px) { .plan-summary-grid { grid-template-columns: 1fr; } .modal-footer { gap: 10px; flex-wrap: wrap; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
.stage-pane h4, .stage-pane h5, .stage-pane p, .stage-pane ul { margin: 0; }
.stage-pane h4 { font-size: 1.05rem; }
.stage-pane h5 { font-size: 0.9rem; }
.stage-pane ul { font-size: 0.86rem; line-height: 1.5; padding-left: 20px; color: var(--color-text-secondary); }
.source-card > input { align-self: flex-start; margin-top: 3px; }
</style>
