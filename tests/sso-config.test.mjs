import test from "node:test";
import assert from "node:assert/strict";

import { handleSsoRoutes } from "../api/sso.mjs";
import { HttpError, json } from "../api/core/http.mjs";
import { RATE_LIMIT_BINDINGS } from "../constants.mjs";

const ORIGIN = "https://goobercord.itswempo.workers.dev";
const PEPPER = "forum-matching-test-pepper-0123456789abcdef";

function envWithLimiters(extra = {}) {
  const env = {
    PASSWORD_PEPPER: PEPPER,
    GOOBER_DB: {
      prepare() {
        return {
          bind() { return this; },
          first: async () => null,
        };
      },
    },
    ...extra,
  };
  for (const binding of Object.values(RATE_LIMIT_BINDINGS)) {
    env[binding] = { limit: async () => ({ success: true }) };
  }
  return env;
}

test("SSO redemption reports missing relay configuration instead of claiming ticket expiry", async () => {
  const request = new Request(ORIGIN + "/api/auth/sso/redeem", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "CF-Connecting-IP": "198.51.100.7",
    },
    body: JSON.stringify({ wt: "a".repeat(64) }),
  });

  let response;
  try {
    response = await handleSsoRoutes(
      request,
      envWithLimiters(),
      new URL(request.url),
      "/api/auth/sso/redeem",
      "POST",
      undefined,
    );
  } catch (error) {
    assert.ok(error instanceof HttpError);
    response = json(error.payload || { error: error.message }, error.status, error.headers);
  }

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /shared RELAY_TOKEN/);
});
