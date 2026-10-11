import { onScopeDispose, ref, watch, type Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { AutomaticBackupStatus } from "../types";

export function normalizeBackupInterval(days: number): number {
  return Number.isFinite(days) ? Math.max(1, Math.min(365, Math.round(days))) : 7;
}

/** Poll only this tab's lifetime; old requests cannot publish into a reopened tab. */
export function useAutomaticBackupStatus(
  active: Readonly<Ref<boolean>>,
  load = () => invoke<AutomaticBackupStatus>("cloud_backup_get_schedule_status"),
) {
  const status = ref<AutomaticBackupStatus | null>(null);
  const error = ref("");
  const loading = ref(false);
  let epoch = 0;
  let pendingEpoch: number | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  async function refresh() {
    if (!active.value || disposed || pendingEpoch === epoch) return;
    const requestEpoch = epoch;
    pendingEpoch = requestEpoch;
    loading.value = true;
    try {
      const value = await load();
      if (requestEpoch !== epoch || disposed) return;
      status.value = value;
      error.value = "";
    } catch (cause) {
      if (requestEpoch !== epoch || disposed) return;
      status.value = null;
      error.value = String(cause);
    } finally {
      if (pendingEpoch === requestEpoch) pendingEpoch = null;
      if (requestEpoch === epoch && !disposed) loading.value = false;
    }
  }

  const stopWatch = watch(active, (isActive) => {
    epoch++;
    clearInterval(timer);
    timer = undefined;
    status.value = null;
    error.value = "";
    loading.value = false;
    if (isActive) {
      void refresh();
      timer = setInterval(() => void refresh(), 30_000);
    }
  }, { immediate: true, flush: "sync" });

  onScopeDispose(() => {
    disposed = true;
    epoch++;
    clearInterval(timer);
    stopWatch();
  });
  return { status, error, loading, refresh };
}
