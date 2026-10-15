import { en } from "./locales/en";
import { createCatalogState, type LocaleKey, type LocaleSetting } from "./catalog-state";
import { useNotification } from "../utils/notification";
export type { LocaleKey, LocaleSetting } from "./catalog-state";

export interface LocaleOption {
  key: LocaleSetting;
  label: string;
}

export const SUPPORTED_LOCALES: LocaleOption[] = [
  { key: "auto", get label() { return t.value.settings.languageAuto; } },
  { key: "zh-CN", label: "简体中文" },
  { key: "zh-TW", label: "繁體中文" },
  { key: "en", label: "English" },
  { key: "ja", label: "日本語" },
  { key: "de", label: "Deutsch" },
  { key: "fr", label: "Français" },
  { key: "es", label: "Español" },
];

export function getSystemLocale(): LocaleKey {
  try {
    const navLang = navigator.language || "";
    if (navLang.startsWith("zh-TW") || navLang.startsWith("zh-HK")) return "zh-TW";
    if (navLang.startsWith("zh")) return "zh-CN";
    if (navLang.startsWith("ja")) return "ja";
    if (navLang.startsWith("de")) return "de";
    if (navLang.startsWith("fr")) return "fr";
    if (navLang.startsWith("es")) return "es";
  } catch {
    // fallback
  }
  return "en";
}

function getInitialSetting(): LocaleSetting {
  try {
    let saved = localStorage.getItem("omera_locale") as LocaleSetting | null;
    if (!saved) {
      saved = localStorage.getItem("berry_locale") as LocaleSetting | null;
      if (saved) {
        localStorage.setItem("omera_locale", saved);
      }
    }
    if (saved && SUPPORTED_LOCALES.some(option => option.key === saved)) {
      return saved;
    }
  } catch {
    // fallback
  }
  return "auto";
}

const catalogs = createCatalogState({
  initialSetting: getInitialSetting(), fallback: en,
  resolve: setting => setting === "auto" ? getSystemLocale() : setting,
  loaders: {
    en: async () => en,
    "zh-CN": () => import("./locales/zh-CN").then(module => module.zhCN),
    "zh-TW": () => import("./locales/zh-TW").then(module => module.zhTW),
    ja: () => import("./locales/ja").then(module => module.ja),
    de: () => import("./locales/de").then(module => module.de),
    fr: () => import("./locales/fr").then(module => module.fr),
    es: () => import("./locales/es").then(module => module.es),
  },
  persist: setting => {
    try { localStorage.setItem("omera_locale", setting); } catch { /* Storage may be unavailable. */ }
  },
});
export const currentLocaleSetting = catalogs.setting;
export const currentLocale = catalogs.locale;
export const t = catalogs.messages;

// Prepare before saving preferences, without publishing a draft language.
export async function prepareLocale(setting: LocaleSetting) {
  try { await catalogs.prepare(setting); }
  catch { throw new Error(t.value.settings.languageLoadFailed); }
}

export async function setLocale(setting: LocaleSetting) {
  try { await catalogs.select(setting); }
  catch { useNotification().showError(t.value.settings.languageLoadFailed); }
}

export async function initializeLocale() {
  try { await catalogs.select(currentLocaleSetting.value, false); }
  catch { useNotification().showError(t.value.settings.languageLoadFailed); }
}
