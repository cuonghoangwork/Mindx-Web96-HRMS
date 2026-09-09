/**
 * i18n/index.js — task 6.1 (i18n kickoff).
 *
 * i18next core config, no auto-detection plugin — language choice is owned
 * by LanguageContext.jsx (mirrors ThemeContext.jsx's localStorage pattern)
 * rather than sniffed from the browser, so behavior stays predictable and
 * consistent with how theme already works in this app.
 *
 * Resources are split per-page (dashboard, attendance, settings,
 * notifications, ...) under a single default namespace so
 * `useTranslation()` needs no namespace argument at call sites — keys are
 * just dot-paths like `t("dashboard.title")`.
 *
 * ONLY THE DEFAULT LOCALE IS BUNDLED. en.json and vi.json are ~90 kB and
 * ~108 kB of JSON; importing both statically put 94 kB raw / 26 kB gzipped of
 * dictionary nobody was reading into the initial chunk, for every user. vi is
 * fetched on demand by loadLanguage() below, which LanguageProvider awaits
 * before it calls changeLanguage.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["en", "vi"];
export const DEFAULT_LANGUAGE = "en";

// Everything except the default locale. Vite needs a literal import() per
// entry to statically discover the chunk, so this cannot be built from
// SUPPORTED_LANGUAGES with a template string — a dynamic path would either
// fail to split or pull in every JSON file in the directory.
const LAZY_LOCALES = {
  vi: () => import("./locales/vi.json"),
};

const loadedLocales = new Set([DEFAULT_LANGUAGE]);

/**
 * Ensure `language`'s dictionary is registered before i18next switches to it.
 *
 * Idempotent and safe to call for the default language or an unknown one — it
 * resolves immediately in both cases, so callers do not need to special-case
 * anything. Resolving rather than throwing on an unknown language matters:
 * fallbackLng already covers a missing dictionary with English, and a rejected
 * promise here would leave LanguageProvider gated forever.
 */
export async function loadLanguage(language) {
  if (loadedLocales.has(language) || !LAZY_LOCALES[language]) return;
  const module = await LAZY_LOCALES[language]();
  // `true, true` = deep merge, overwrite existing keys. Matters on a
  // re-entrant call: the bundle is authoritative over whatever is registered.
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
