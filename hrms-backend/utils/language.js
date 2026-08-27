// Shared by every backend Gemini prompt builder that needs to tell the model
// which language to reply in (appChatPrompt.js, performanceInsightPrompt.js).
// Anything other than "vi" — including an omitted value or a typo like "vn"
// — deliberately falls back to English, matching the frontend's own default
// in LanguageContext.jsx.
export function languageNameFor(language) {
  return language === "vi" ? "Vietnamese" : "English";
}
