import { computed, ref, shallowRef } from "vue";
import type { en } from "./locales/en";

export type LocaleKey = "en" | "zh-CN" | "zh-TW" | "ja" | "de" | "fr" | "es";
export type LocaleSetting = "auto" | LocaleKey;
type Catalog = typeof en;

export function createCatalogState(options: {
  initialSetting: LocaleSetting;
  fallback: Catalog;
  resolve: (setting: LocaleSetting) => LocaleKey;
  loaders: Record<LocaleKey, () => Promise<Catalog>>;
  persist: (setting: LocaleSetting) => void;
}) {
  const setting = ref<LocaleSetting>(options.initialSetting);
  const active = shallowRef({ locale: "en" as LocaleKey, catalog: options.fallback });
  const loaded = new Map<LocaleKey, Promise<Catalog>>([["en", Promise.resolve(options.fallback)]]);
  let revision = 0;

  function load(locale: LocaleKey): Promise<Catalog> {
    let pending = loaded.get(locale);
    if (!pending) {
      pending = options.loaders[locale]().catch(error => {
        loaded.delete(locale);
        throw error;
      });
      loaded.set(locale, pending);
    }
    return pending;
  }

  async function select(next: LocaleSetting, persist = true) {
    const request = ++revision;
    const locale = options.resolve(next);
    let catalog: Catalog;
    try { catalog = await load(locale); }
    catch (error) { if (request === revision) throw error; return; }
    if (request !== revision) return;
    active.value = { locale, catalog };
    setting.value = next;
    if (persist) options.persist(next);
  }

  return {
    setting,
    locale: computed(() => active.value.locale),
    messages: computed(() => active.value.catalog),
    prepare: (next: LocaleSetting) => load(options.resolve(next)),
    select,
  };
}
