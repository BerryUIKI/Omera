import { listen } from "@tauri-apps/api/event";

/** Dispose successful registrations even when a companion legacy listener fails. */
export async function subscribeTaskEvents<T>(names: string[], handler: (payload: T) => void) {
  const registrations = await Promise.allSettled(names.map(name => listen<T>(name, event => handler(event.payload))));
  const dispose = () => {
    for (const result of registrations) if (result.status === "fulfilled") result.value();
  };
  const failed = registrations.find(result => result.status === "rejected");
  if (failed?.status === "rejected") {
    dispose();
    throw failed.reason;
  }
  return dispose;
}
