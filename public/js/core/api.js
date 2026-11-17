// The one fetch wrapper. Every API call in the new client rides this module —
// no raw fetch anywhere else — so the session's CSRF header, the JSON error
// shape, and one auth-expiry signal live in exactly one file.
//
// Transport contract (matches the backend):
//   - sends / accepts JSON (or FormData untouched, for uploads); 204 -> null.
//   - mutating methods carry X-CSRF-Token (once setCsrfToken has the value
//     /api/me delivered) and, where the caller passes one, Idempotency-Key.
//   - a failed status throws an Error whose extras carry the JSON body's
//     additive fields (the ban card's banned/reason/expiresAt), whose .status
//     is the HTTP status, and whose .message is the server's `error` string.
//   - a 401 emits store's "auth:unauthorized" — main.js registers exactly one
//     listener (after boot's own gating settles) that routes to the landing;
//     listeners before that point (the boot redeem itself) stay silent, which
//     is what keeps a refused SSO ticket from ping-ponging against Accounts.

import { emit } from "./store.js";

let csrfToken = "";

export const setCsrfToken = (token) => {
  csrfToken = typeof token === "string" ? token : "";
};

export const AUTH_EVENT = "auth:unauthorized";

export const api = async (path, { method = "GET", body, idempotencyKey, signal } = {}) => {
  const headers = { Accept: "application/json" };
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (mutating && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  if (mutating && typeof idempotencyKey === "string" && idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    signal,
    body: body === undefined ? undefined :
      body instanceof FormData ? body : JSON.stringify(body),
  });
  if (response.status === 401) emit(AUTH_EVENT);
  if (response.status === 204) return null;
  let result;
  try {
    result = await response.json();
  } catch {
    const error = new Error(
      response.ok ? `Invalid response (${response.status})` : `Request failed (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const message = typeof result?.error === "string" && result.error
      ? result.error
      : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    // Copy the JSON body's extra fields onto the error ("error", "message"
    // and "status" are skipped — they already live on the Error).
    if (result && typeof result === "object") {
      for (const [key, value] of Object.entries(result)) {
        if (key !== "error" && key !== "message" && key !== "status") error[key] = value;
      }
    }
    throw error;
  }
  return result;
};
