/**
 * Gemini client: plain fetch, injectable fetchImpl, AbortController timeout —
 * same shape as exchangeRate.js. Unlike the FX client it throws on failure;
 * an AI insight has no sensible fallback value.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
// gemini-3.6-flash "thinks" by default (thinkingBudget: 0 is rejected) and measured ~15s per call.
export const GEMINI_FETCH_TIMEOUT_MS = 30_000;

function apiUrlFor(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

/** The plain-text answer from a generateContent response. Separate from the fetch so it unit-tests on fixtures. */
export function extractGeminiText(json) {
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini response did not contain any text.");
  }
  return text.trim();
}

/** extractGeminiText + JSON.parse, with a clear error on truncated output. */
export function extractGeminiJson(json) {
  const text = extractGeminiText(json);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini response was not valid JSON.");
  }
}

async function askGeminiOnce(prompt, { apiKey, model, fetchImpl, timeoutMs, json }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Thinking tokens (~700-800 measured) share this budget with the visible
    // output; without headroom the reply is cut off with finishReason MAX_TOKENS.
    const generationConfig = { temperature: 0.4, maxOutputTokens: json ? 2000 : 1200 };
    if (json) generationConfig.responseMimeType = "application/json";

    const response = await fetchImpl(apiUrlFor(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = new Error(`Gemini API responded with HTTP ${response.status}`);
      err.status = 502;
      throw err;
    }
    const body = await response.json();
    return json ? extractGeminiJson(body) : extractGeminiText(body);
  } catch (err) {
    if (!err.status) err.status = 502;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends `prompt`; returns text, or a parsed object with `{json: true}`.
 * Throws on any failure. Retries once on a transient one — latency is
 * bimodal (3s to 30s+ for the same prompt), so one retry converts most
 * timeouts into a reply. A missing API key (503) is not retried.
 */
export async function askGemini(prompt, {
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = GEMINI_FETCH_TIMEOUT_MS,
  json = false,
  attempts = 2,
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

  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await askGeminiOnce(prompt, { apiKey, model, fetchImpl, timeoutMs, json });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export default askGemini;
