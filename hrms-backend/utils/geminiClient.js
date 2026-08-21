/**
 * geminiClient.js — task 5 (Ask AI insight), Google AI Studio (Gemini).
 *
 * Same shape as utils/exchangeRate.js's fetchLiveFxRate: plain fetch, no
 * SDK, an injectable fetchImpl for tests, an AbortController timeout. The
 * one real difference is what callers do on failure — the FX job has a
 * sensible fallback rate to fall back to, an AI insight doesn't, so this
 * throws and lets performanceController decide the HTTP response instead
 * of masking the failure with a default value.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
// gemini-3.6-flash does extended "thinking" by default (no way to disable it -
// thinkingConfig.thinkingBudget: 0 is rejected with 400 INVALID_ARGUMENT for
// this model) and real calls have measured ~15s — well past the FX-rate
// client's 8s. 30s gives real headroom instead of racing the model's own latency.
export const GEMINI_FETCH_TIMEOUT_MS = 30_000;

function apiUrlFor(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

/**
 * Pulls the plain-text answer out of a Gemini generateContent response.
 * Kept separate from the network call so it's unit testable against
 * fixture JSON with no network involved.
 */
export function extractGeminiText(json) {
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini response did not contain any text.");
  }
  return text.trim();
}

/**
 * Sends `prompt` to Gemini and returns the plain-text response.
 * Throws on any failure (missing API key, network error, non-2xx,
 * unparseable body, timeout) — callers decide what to do about that.
 */
export async function askGemini(prompt, {
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = GEMINI_FETCH_TIMEOUT_MS,
} = {}) {
  if (!apiKey) {
    const err = new Error("AI insight isn't configured yet (GEMINI_API_KEY is unset).");
    err.status = 503;
    throw err;
  }
  if (typeof fetchImpl !== "function") {
    const err = new Error("No fetch implementation available to call the Gemini API.");
    err.status = 502;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(apiUrlFor(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = new Error(`Gemini API responded with HTTP ${response.status}`);
      err.status = 502;
      throw err;
    }
    const json = await response.json();
    return extractGeminiText(json);
  } catch (err) {
    if (!err.status) err.status = 502;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export default askGemini;
