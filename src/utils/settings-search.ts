export type SettingsTab = "general" | "display" | "stacking" | "interop" | "collaboration" | "cloudBackup" | "parsers" | "developer" | "about";
export interface SettingsSearchEntry { tab: SettingsTab; id: string; target: string; label: string; description: string; category: string }
// Index translated descriptions only. Configuration values and credentials never enter the index.
const specifications: [SettingsTab, string, string, string][] = [
  ["general", "settings.language", "settings.languageDesc", "settings.language"],
  ["general", "settings.defaultView", "settings.defaultViewDesc", "settings.defaultView"],
  ["general", "settings.autoScan", "settings.autoScanDesc", "settings.autoScan"],
  ["general", "settings.startupScanInterval", "settings.startupScanIntervalDesc", "settings.autoScan"],
  ["general", "settings.autoCheckUpdate", "settings.autoCheckUpdateDesc", "settings.autoCheckUpdate"],
  ["general", "settings.suppressedWarnings", "settings.suppressedWarningsDesc", "settings.suppressedWarnings"],
  ["general", "settings.desktopShortcut", "settings.desktopShortcutDesc", "settings.desktopShortcut"],
  ["display", "settings.theme", "settings.themeDesc", "settings.theme"],
  ["display", "settings.blurNsfw", "settings.blurNsfwDesc", "settings.blurNsfw"],
  ["display", "settings.showBadges", "settings.showBadgesDesc", "settings.showBadges"],
  ["display", "settings.thumbResolution", "settings.thumbResolutionDesc", "settings.thumbResolution"],
  ["display", "settings.thumbnailCacheBudget", "settings.thumbnailCacheBudgetDesc", "settings.thumbnailCacheBudget"],
  ["display", "settings.cacheManagement", "", "settings.cacheManagement"],
  ["stacking", "settings.allowMultipleStacks", "settings.allowMultipleStacksDesc", "settings.allowMultipleStacks"],
  ["stacking", "settings.autoStack", "settings.autoStackDesc", "settings.autoStack"],
  ["stacking", "settings.stackThreshold", "settings.stackThresholdDesc", "settings.stackThreshold"],
  ["stacking", "settings.stackTimeWindow", "settings.stackTimeWindowDesc", "settings.stackTimeWindow"],
  ["interop", "interop.comfyUrl", "", "interop.comfyUrl"],
  ["interop", "interop.webuiUrl", "", "interop.webuiUrl"],
  ["collaboration", "settings.storageBackend", "review.remoteUnavailable", "settings.storageBackend"],
  ["collaboration", "settings.clientId", "settings.clientIdDesc", "settings.clientId"],
  ["collaboration", "settings.syncStatus", "settings.lastSynced", "settings.syncStatus"],
  ["cloudBackup", "settings.cloudBackup.provider", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.localPath", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.webdavEndpoint", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.webdavUser", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.webdavPassword", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.s3Endpoint", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.s3Bucket", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.s3Region", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.s3AccessKey", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.s3SecretKey", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.s3Prefix", "", "settings.cloudBackup.provider"],
  ["cloudBackup", "settings.cloudBackup.syncStrategy", "", "settings.cloudBackup.syncStrategy"],
  ["cloudBackup", "settings.cloudBackup.concurrency", "", "settings.cloudBackup.concurrency"],
  ["cloudBackup", "settings.cloudBackup.bandwidthLimit", "settings.cloudBackup.bandwidthLimitDesc", "settings.cloudBackup.bandwidthLimit"],
  ["cloudBackup", "settings.cloudBackup.remoteMediaPrefix", "", "settings.cloudBackup.remoteMediaPrefix"],
  ["cloudBackup", "settings.cloudBackup.dryRun", "", "settings.cloudBackup.dryRun"],
  ["developer", "settings.allowOverrideExistingPrompt", "settings.allowOverrideExistingPromptDesc", "settings.allowOverrideExistingPrompt"],
  ["general", "settings.tabs.general", "", "category-general"],
  ["display", "settings.tabs.display", "", "category-display"],
  ["stacking", "settings.tabs.stacking", "", "category-stacking"],
  ["interop", "interop.title", "", "category-interop"],
  ["collaboration", "settings.tabs.collaboration", "", "category-collaboration"],
  ["cloudBackup", "settings.tabs.cloudBackup", "", "category-cloudBackup"],
  ["parsers", "settings.tabs.parsers", "", "category-parsers"],
  ["developer", "settings.developer", "", "category-developer"],
  ["about", "settings.tabs.about", "", "category-about"],
  ["collaboration", "settings.rootMappingsTitle", "settings.rootMappingsDesc", "category-collaboration"],
  ["cloudBackup", "settings.cloudBackup.automaticTitle", "settings.cloudBackup.automaticHint", "category-cloudBackup"],
  ["about", "settings.storageTitle", "settings.storageNotice", "category-about"]
];
const categories: Record<SettingsTab, string> = {
  "general": "settings.tabs.general",
  "display": "settings.tabs.display",
  "stacking": "settings.tabs.stacking",
  "interop": "interop.title",
  "collaboration": "settings.tabs.collaboration",
  "cloudBackup": "settings.tabs.cloudBackup",
  "parsers": "settings.tabs.parsers",
  "developer": "settings.developer",
  "about": "settings.tabs.about"
};
function textAt(translations: unknown, key: string): string {
  let value = translations;
  for (const part of key.split(".")) value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
  return typeof value === "string" ? value : "";
}
export function settingsSearchIndex(translations: unknown): SettingsSearchEntry[] {
  return specifications.map(([tab, id, description, target]) => ({ tab, id, target,
    label: textAt(translations, id), description: textAt(translations, description), category: textAt(translations, categories[tab]) })).filter(entry => entry.label);
}
function normalize(text: string): string { return text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim(); }
export function searchSettings(index: SettingsSearchEntry[], query: string): SettingsSearchEntry[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return index.filter(entry => {
    const text = normalize(`${entry.label} ${entry.description} ${entry.category}`);
    return tokens.every(token => text.includes(token));
  });
}
