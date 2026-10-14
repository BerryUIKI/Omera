import { t } from "../i18n";

export function migrationMessage(value: unknown): string {
  const raw = String(value ?? "");
  const messages = { ...t.value.legacyMigration, ...t.value.setup };
  if (raw in messages) return messages[raw as keyof typeof messages];
  const code = raw.match(/\[([A-Z_]+)\]/)?.[1];
  const keys: Record<string, keyof typeof t.value.setup> = {
    DESTINATION_EXISTS: "destinationExists", SOURCE_BUSY: "sourceBusy", SOURCE_CHANGED: "sourceChanged",
    SOURCE_DESTINATION_OVERLAP: "destinationExists", PLAN_EXPIRED: "planExpired", SPACE_UNKNOWN: "spaceUnknown",
    INSUFFICIENT_SPACE: "insufficientSpace", INTEGRITY_FAILED: "integrityFailed", UNSUPPORTED_SCHEMA: "integrityFailed",
    CONFIG_MIGRATION_FAILED: "configFailed", CLEANUP_PROTECTED: "integrityFailed",
  };
  return messages[code && keys[code] ? keys[code] : "genericError"];
}

export function databaseDirectory(path: string): string {
  let normalized = path;
  if (normalized.startsWith("\\\\?\\UNC\\")) normalized = "\\\\" + normalized.slice(8);
  else if (normalized.startsWith("\\\\?\\")) normalized = normalized.slice(4);
  normalized = normalized.replace(/\\/g, "/");
  const separator = normalized.lastIndexOf("/");
  const directory = separator < 0 ? "" : normalized.slice(0, separator) || "/";
  return /^[a-z]:$/i.test(directory) ? directory + "/" : directory;
}
