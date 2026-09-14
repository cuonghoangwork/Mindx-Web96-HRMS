/**
 * i18next config. No auto-detection — LanguageContext owns the choice.
 * Resources are per-page under one default namespace, so keys are dot-paths
 * like `t("dashboard.title")`. Only the default locale is bundled: vi.json
 * (~108 kB) is fetched by loadLanguage(), which LanguageProvider awaits
 * before switching.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["en", "vi"];
export const DEFAULT_LANGUAGE = "en";

// One literal import() per locale — Vite cannot split a templated path.
const LAZY_LOCALES = {
  vi: () => import("./locales/vi.json"),
};

const loadedLocales = new Set([DEFAULT_LANGUAGE]);

/**
 * Registers `language`'s dictionary before i18next switches to it. Resolves
 * immediately for the default or an unknown language — a rejection would
 * leave LanguageProvider gated forever, and fallbackLng already covers it.
 */
export async function loadLanguage(language) {
  if (loadedLocales.has(language) || !LAZY_LOCALES[language]) return;
  const module = await LAZY_LOCALES[language]();
  // deep merge + overwrite: the bundle is authoritative.
  i18n.addResourceBundle(language, "translation", module.default, true, true);
  loadedLocales.add(language);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false, // React already escapes output
  },
  returnEmptyString: false,
});

export default i18n;
