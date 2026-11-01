import catalog from "../i18n/locales/release-notes.json";
import type { LocaleKey } from "../i18n/catalog-state";
import type { GitHubRelease } from "./updater";

const bundled: Record<string, Partial<Record<LocaleKey, string>>> = catalog.releases;

/** Prefer release-provided translations, then a version-exact bundled fallback. */
export function selectReleaseNotes(release: Pick<GitHubRelease, "tag_name" | "body">, locale: LocaleKey): string {
  const body = typeof release.body === "string" ? release.body.trim() : "";
  const published = new Map<string, string>();
  for (const match of body.matchAll(/<!-- omera-release-notes:([a-zA-Z-]+) -->\r?\n([\s\S]*?)\r?\n<!-- \/omera-release-notes -->/g)) {
    if (match[2].trim()) published.set(match[1], match[2].trim());
  }
  const version = release.tag_name?.replace(/^v/, "") ?? "";
  return published.get(locale) || bundled[version]?.[locale] || published.get("en") || body;
}
