// API client — talks to the hrms-backend Express API.
// Handles JWT access/refresh tokens (see hrms-backend/utils/tokens.js +
// middleware/auth.js for the server side of this contract).

export const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1";

const ACCESS_KEY = "hrms-access-token";
const REFRESH_KEY = "hrms-refresh-token";

export function getTokens() {
  return {
    access: localStorage.getItem(ACCESS_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
  };
}

export function setTokens({ access_token, refresh_token } = {}) {
  if (access_token) localStorage.setItem(ACCESS_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

let refreshPromise = null;

async function refreshAccessToken() {
  const { refresh } = getTokens();
  if (!refresh) throw new Error("No refresh token available");

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.message || "Session expired");
        setTokens(data.data);
        return data.data.access_token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * apiFetch("/employees", { method: "POST", body: {...} })
 * - Automatically attaches `Authorization: Bearer <access_token>` when auth !== false
 * - On a 401, transparently refreshes the access token once and retries
 * - Unwraps JSON and throws on { success: false } or non-2xx responses
 */
export async function apiFetch(
  path,
  { method = "GET", body, auth = true, retry = true } = {},
) {
  const { access } = getTokens();
  const headers = { "Content-Type": "application/json" };
  if (auth && access) headers.Authorization = `Bearer ${access}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error(
      `Could not reach the backend at ${API_BASE}. Is hrms-backend running? (${networkErr.message})`,
    );
  }

  if (res.status === 401 && auth && retry) {
    try {
      await refreshAccessToken();
      return apiFetch(path, { method, body, auth, retry: false });
    } catch {
      clearTokens();
      localStorage.removeItem("hrms-user");
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      throw new Error("Session expired. Please sign in again.");
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export function qs(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : "";
}
