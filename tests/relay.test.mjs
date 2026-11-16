import test from "node:test";
import assert from "node:assert/strict";

import { relayVerify } from "../api/relay.mjs";

const REAL_FETCH = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

test("relayVerify rejects a successful HTTP response with a malformed JSON shape", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ accepted: true }), { status: 200 });
  const result = await relayVerify(
    { RELAY_TOKEN: "r".repeat(64) },
    "wempos",
    "correct-horse-battery",
  );
  assert.equal(result, null);
});

test("relayVerify treats malformed relay-token headers as an unavailable relay", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response(JSON.stringify({ valid: true }), { status: 200 });
  };
  const result = await relayVerify(
    { RELAY_TOKEN: "valid-prefix\ninvalid-header" },
    "wempos",
    "correct-horse-battery",
  );
  assert.equal(result, null);
  assert.equal(called, false, "invalid header construction must fail before fetch");
});

test("relayVerify accepts only a boolean valid field", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ valid: true }), { status: 200 });
  const result = await relayVerify(
    { RELAY_TOKEN: "r".repeat(64) },
    "wempos",
    "correct-horse-battery",
  );
  assert.deepEqual(result, { valid: true });
});
