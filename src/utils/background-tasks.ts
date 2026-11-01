import { computed, reactive, readonly } from "vue";

export type TaskKind = "export" | "modelDownload" | "updateDownload";
export type TaskStatus = "running" | "completed" | "failed" | "canceled";
export interface TaskProgress { current: number; total: number; detail?: string }
export interface BackgroundTask {
  id: number;
  kind: TaskKind;
  status: TaskStatus;
  progress: TaskProgress | null;
  error?: string;
  outputPath?: string;
}
const tasks = reactive<BackgroundTask[]>([]);
let sequence = 0;
const historyLimit = 20;
export const backgroundTasks = readonly(tasks);
export const activeTaskCount = computed(() => tasks.filter(task => task.status === "running").length);
export function isTaskActive(kind: TaskKind) {
  return tasks.some(task => task.kind === kind && task.status === "running");
}
export function dismissTask(id: number) {
  const index = tasks.findIndex(task => task.id === id && task.status !== "running");
  if (index >= 0) tasks.splice(index, 1);
}
function trimHistory() {
  const completed = tasks.filter(task => task.status !== "running");
  for (const task of completed.slice(historyLimit)) dismissTask(task.id);
}

/** Own progress subscriptions for the whole operation, independently of dialogs. */
export async function runBackgroundTask<T>(kind: TaskKind, operation: (update: (progress: TaskProgress) => void) => Promise<T>, options: {
  subscribe?: (update: (progress: TaskProgress) => void) => Promise<() => void>;
  result?: (value: T) => { error?: string; outputPath?: string };
} = {}): Promise<T> {
  if (isTaskActive(kind)) throw new Error(`Task already running: ${kind}`);
  tasks.unshift({ id: ++sequence, kind, status: "running", progress: null });
  const task = tasks[0];
  let unsubscribe: (() => void) | undefined;
  const update = (progress: TaskProgress) => {
      if (task.status !== "running") return;
      task.progress = {
        current: Number.isFinite(progress.current) ? Math.max(0, progress.current) : 0,
        total: Number.isFinite(progress.total) ? Math.max(0, progress.total) : 0,
        detail: progress.detail?.slice(0, 500),
      };
  };
  try {
    if (options.subscribe) unsubscribe = await options.subscribe(update);
    const value = await operation(update);
    const result = options.result?.(value);
    task.error = result?.error?.slice(0, 6000);
    task.outputPath = result?.outputPath;
    task.status = task.error ? "failed" : "completed";
    return value;
  } catch (error) {
    task.error = String(error).slice(0, 6000);
    task.status = /cancelled|canceled/i.test(task.error) ? "canceled" : "failed";
    throw error;
  } finally {
    try { unsubscribe?.(); } finally { trimHistory(); }
  }
}
