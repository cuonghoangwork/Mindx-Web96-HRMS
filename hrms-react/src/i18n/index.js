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
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import vi from "./locales/vi.json";

export const SUPPORTED_LANGUAGES = ["en", "vi"];
export const DEFAULT_LANGUAGE = "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false, // React already escapes output
  },
  returnEmptyString: false,
});

export default i18n;
