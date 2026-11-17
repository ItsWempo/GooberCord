// The boot's stamp contract: <meta name="app-build"> (VERSION@SHA) compared
// against /api/version's { version, build } every 60s; a successor offers a
// reload strip, never an auto-reload. compareBuild + the strip pin without a
// browser (main.js's browser boot is guarded so node can import the pure
// pieces).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { compareBuild, buildStaleStrip } from "../public/js/main.js";

const HERE = dirname(new URL(import.meta.url).pathname);
const MAIN = readFileSync(join(HERE, "../public/js/main.js"), "utf8");

test("an empty side never flags (a dev boot without vars is quiet)", () => {
  assert.deepEqual(compareBuild("", { version: "0.1.0", build: "abc" }), { stale: false });
  assert.deepEqual(compareBuild("0.1.0@abc", {}), { stale: false });
  assert.deepEqual(compareBuild("0.1.0@abc", null), { stale: false });
});

test("a deployed successor (a changed build) flags; the same stamp does not", () => {
  assert.deepEqual(compareBuild("0.1.0@abc", { version: "0.2.0", build: "def" }), { stale: true });
  assert.deepEqual(compareBuild("0.2.0@def", { version: "0.2.0", build: "def" }), { stale: false });
  assert.deepEqual(
    compareBuild("0.1.0@abc", { version: "0.1.0", build: "abc123" }),
    { stale: true },
    "the SHA half must match too — a version-only match is not the same build",
  );
});

test("no build component compares the version part only (dev servers)", () => {
  assert.deepEqual(
    compareBuild("0.1.0@whatever", { version: "0.1.0", build: "" }),
    { stale: false },
  );
  assert.deepEqual(
    compareBuild("0.1.0@whatever", { version: "0.2.0", build: "" }),
    { stale: true },
  );
});

test("the offer is a strip the member acts on: hidden by default, a quiet Reload", () => {
  // A minimal document stub is enough for the builder to run.
  const created = {};
  const doc = {
    createElement: (tag) => (created[tag] = {
      children: [], hidden: undefined, id: undefined,
      append: (...nodes) => created[tag].children.push(...nodes),
      addEventListener: () => {},
    }),
  };
  const strip = buildStaleStrip(doc);
  assert.equal(strip.id, "stale-build-strip");
  assert.equal(strip.hidden, true, "served hidden; the interval unhides it");
  const reload = strip.children.find((child) => child.textContent === "Reload");
  assert.ok(reload, "a Reload affordance exists");
  assert.ok(strip.children[0].includes("A new build is available."));
});

test("the interval checks /api/version and only ever offers, never auto-reloads", () => {
  assert.match(MAIN, /api\("\/api\/version"\)/);
  assert.match(MAIN, /60000/);
  assert.match(MAIN, /removeAttribute\("hidden"\)/);
  assert.doesNotMatch(MAIN, /location\.reload\(\)(?![\s\S]*button)/);
});

test("the auth-expiry signal lands on Accounts, with exactly one listener registered", () => {
  assert.match(MAIN, /store\.on\(AUTH_EVENT/);
  assert.match(MAIN, /registerUnauthorizedHandler\(\)/);
  assert.match(MAIN, /wempoAccountsSignInUrl\(win\.location\.origin\)/);
  assert.match(MAIN, /if \(typeof window !== "undefined"\)/,
    "the browser boot is guarded so the pure exports pin in node");
});
