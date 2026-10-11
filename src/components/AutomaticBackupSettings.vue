<script setup lang="ts">
import { computed } from "vue";
import type { AutomaticBackupStatus } from "../types";
import { currentLocale, t } from "../i18n";
import { normalizeBackupInterval } from "../utils/automatic-backup";

const props = defineProps<{
  enabled: boolean;
  intervalDays: number;
  status: AutomaticBackupStatus | null;
  loading: boolean;
  error: string;
  saving: boolean;
}>();
const emit = defineEmits<{
  (event: "update:enabled", value: boolean): void;
  (event: "update:intervalDays", value: number): void;
}>();
const text = computed(() => t.value.settings.cloudBackup);
const stateLabel = computed(() => {
  if (props.error) return text.value.statusUnavailable;
  if (!props.status) return props.loading ? text.value.statusLoading : text.value.statusUnavailable;
  if (props.status.running) return text.value.statusRunning;
  if (!props.status.enabled) return props.status.last_error ? text.value.statusPaused : text.value.statusDisabled;
  if (props.status.last_error) return text.value.statusRetry;
  return text.value.statusScheduled.replace("{days}", String(props.status.interval_days));
});
function date(seconds: number | null): string {
  return seconds === null ? text.value.never : new Date(seconds * 1000).toLocaleString(currentLocale.value);
}
function changeEnabled(event: Event) {
  emit("update:enabled", (event.target as HTMLInputElement).checked);
}
function changeInterval(event: Event) {
  const input = event.target as HTMLInputElement;
  const value = normalizeBackupInterval(input.valueAsNumber);
  input.value = String(value);
  emit("update:intervalDays", value);
}
</script>

<template>
  <section class="automatic-backup" :aria-label="text.automaticTitle">
    <h5>{{ text.automaticTitle }}</h5>
    <label class="automatic-enable">
      <input type="checkbox" :checked="enabled" :disabled="saving" @change="changeEnabled" />
      <span>{{ text.automaticEnabled }}</span>
    </label>
    <label class="automatic-interval">
      <span>{{ text.automaticInterval }}</span>
      <input type="number" min="1" max="365" step="1" :value="intervalDays"
        :disabled="!enabled || saving" @change="changeInterval" />
    </label>
    <p class="automatic-hint">{{ text.automaticHint }}</p>
    <div aria-live="polite">
      <p><strong>{{ text.savedStatus }}:</strong> {{ stateLabel }}</p>
      <dl v-if="status">
        <dt>{{ text.lastSuccess }}</dt><dd>{{ date(status.last_success_at) }}</dd>
        <dt>{{ text.lastAttempt }}</dt><dd>{{ date(status.last_attempt_at) }}</dd>
        <dt>{{ text.nextDue }}</dt><dd>{{ status.next_due_at === null ? '—' : date(status.next_due_at) }}</dd>
        <dt v-if="status.last_snapshot">{{ text.lastSnapshot }}</dt><dd v-if="status.last_snapshot">{{ status.last_snapshot }}</dd>
      </dl>
      <p v-if="error || status?.last_error" class="automatic-error" role="alert">
        {{ text.lastError }}: {{ error || status?.last_error }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.automatic-backup { margin: 16px 0; padding: 16px; border: 1px solid var(--color-border); border-radius: 8px; }
h5 { margin: 0 0 12px; font-size: 1rem; }
.automatic-enable, .automatic-interval { display: flex; align-items: center; gap: 10px; margin: 12px 0; }
.automatic-interval { justify-content: space-between; flex-wrap: wrap; }
input[type="number"] { width: 80px; padding: 6px; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 4px; }
.automatic-hint { color: var(--color-text-muted); font-size: .85rem; line-height: 1.5; }
dl { display: grid; grid-template-columns: minmax(90px, auto) minmax(0, 1fr); gap: 8px 16px; font-size: .85rem; }
dt { color: var(--color-text-muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.automatic-error { color: var(--color-danger, #f87171); overflow-wrap: anywhere; }
</style>
