// Phase-2 Kitskey migration pin: worker.mjs stopped carrying its second copy
// of the error mapping. The ONE classifier (errorReply) and the ONE dispatch
// chain (dispatch) come from the vendored framework; this file holds the line
// on the public behavior that must NOT have moved in the swap — the two 404
// copies, the shared 500 for a non-HttpError, and the console label (GC's
// twin carried the FORUM's "Forum request failed:" literal since the
// vendoring; it was DELIBERATELY renamed to GC's own in the follow-up commit
// — a separate act with these pins capturing the new label).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../worker.mjs";

const WORKER_SOURCE = readFileSync(new URL("../worker.mjs", import.meta.url), "utf8");

// A db stub that answers every read nothing — enough for the dispatch tier
// (filter priming reads site_settings, keeps the secret when it's absent)
// to reach the route chain.
function stubDb() {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 1 } }),
          };
        },
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1 } }),
      };
    },
  };
}

const okEnv = (overrides = {}) => ({
  GOOBER_DB: stubDb(),
  GC_READ_RATE_LIMITER: { limit: async () => ({ success: true }) },
  GC_WRITE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  ...overrides,
});

// --- structural: the copy is gone, the vendor is consumed ----------------------

test("worker.mjs no longer carries its own apiError — the classifier is the vendor's", () => {
  assert.ok(!/function apiError/.test(WORKER_SOURCE), "the inline second copy is gone");
  assert.match(WORKER_SOURCE, /import \{ dispatch, errorReply \} from "\.\/api\/vendor\/http\.mjs"/);
  assert.match(WORKER_SOURCE, /errorReply\(error, "GooberCord request failed:"\)/,
    "the console label is GC's OWN (deliberately renamed from the vendored-forum literal)");
});

test("the not-found tail stays THROWN 404s classified through the chain, not a rival shape", () => {
  const tail = WORKER_SOURCE.slice(WORKER_SOURCE.indexOf("function notFound"));
  assert.match(tail, /That API endpoint does not exist\./);
  assert.match(tail, /Not found\./, "the tail keeps BOTH the api copy and the bare copy");
  assert.match(WORKER_SOURCE, /dispatch\(API_HANDLERS, notFound\)/,
    "the chain is the vendor dispatch, not an inlined handlers-for-loop");
});

// --- behavior: the swap cannot answer differently than the inline twin did ----

test("an unknown /api/ path answers the api 404 copy WITH the security header set", async () => {
  const response = await worker.fetch(new Request("https://goobercord.test/api/no-such-lane"), okEnv(), undefined);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "That API endpoint does not exist." });
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
});

test("a non-HttpError inside the chain takes the shared 500 and never echoes the error", async () => {
  const captured = [];
  const original = console.error;
  console.error = (...args) => captured.push(args);
  try {
    const response = await worker.fetch(
      new Request("https://goobercord.test/api/no-such-lane", { method: "POST" }),
      okEnv({ GC_WRITE_RATE_LIMITER: { limit: async () => { throw new Error("limiter exploded"); } } }),
      undefined,
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Something went wrong. Please try again." });
    assert.deepEqual(captured[0][0], "GooberCord request failed:", "the renamed label survives the classifier verbatim");
  } finally {
    console.error = original;
  }
});
