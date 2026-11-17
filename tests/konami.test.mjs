// The Konami egg (owner's direct ask): the code (↑↑↓↓←→←→BA) shatters the
// WHOLE SITE into pieces that fly and fall, then reassemble cleanly.
// House rules pinned: one listener (the once-guard), the trajectory never
// touches a style-attribute string (CSSOM custom properties only), the
// teardown is real (vars removed), and reduced motion gets a calm dissolve
// in the stylesheet, not a JS branch.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const KONAMI = js("public/js/konami.js");
const APP = js("public/js/routes/app.js");
const CSS = js("public/styles.css");

test("the code is the code: ↑↑↓↓←→←→BA, read one key per press", () => {
  const code = KONAMI.slice(KONAMI.indexOf("const CODE = ["), KONAMI.indexOf("];", KONAMI.indexOf("const CODE = [")));
  const keys = [...code.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
    "b", "a",
  ]);
  // The doubled arrows share a key, so the tracker must accept a step
  // forward on a repeat — not treat the second ↑ as a mistake.
  assert.match(KONAMI, /key === CODE\[progress\]\.toLowerCase\(\)/,
    "the match is case-insensitive on BOTH sides — a keydown gives a lowercased key and the arrows carry capitals");
  assert.match(KONAMI, /progress = key === CODE\[0\]\.toLowerCase\(\) \? 1 : 0;/,
    "a restart lands on the first arrow");
});

test("one listener for the whole page: the once-guard, and the track never blocks keys", () => {
  assert.match(KONAMI, /let installed = false;/);
  assert.match(KONAMI, /if \(installed\) return;[\s\S]*?installed = true;/,
    "renderAppPage re-renders; a listener stack would shatter many times over");
  assert.match(KONAMI, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey \|\| event\.repeat\) \{/,
    "modifier and auto-repeat presses are never code input");
  assert.doesNotMatch(KONAMI, /preventDefault/, "the code only ever rides a clean keyboard");
  assert.doesNotMatch(KONAMI, /\.innerHTML/, "CSP-safe module");
  assert.doesNotMatch(KONAMI, /\.cssText|setAttribute\("style"/, "no style-attribute strings");
  assert.match(KONAMI, /style\.setProperty\("--konami-dx", String\(Math\.round\([^;]+\)\) \+ "px"\)/,
    "validated numbers, wrapped in units by the stylesheet's transform");
});

test("the shatter is bounded and unwinds: cap, stride, per-piece vars, real teardown", () => {
  assert.match(KONAMI, /PIECE_CAP = 140;/, "every node would thrash the animation queue");
  const pick = KONAMI.slice(KONAMI.indexOf("const stride ="), KONAMI.indexOf("for (const piece of pieces)"));
  assert.ok(pick.length > 40, "the stride slice is real");
  assert.match(pick, /index % stride === 0/, "a stride sample keeps the shatter dense but cheap");
  const shatter = KONAMI.slice(KONAMI.indexOf("function shatter()"), KONAMI.indexOf('win.addEventListener("keydown"'));
  assert.ok(shatter.length > 400, "the shatter slice is real (got " + shatter.length + ")");
  for (const prop of ["--konami-dx", "--konami-dy", "--konami-rot", "--konami-delay"]) {
    assert.match(shatter, new RegExp('setProperty\\("' + prop + '"'), prop + " is set per piece");
  }
  const teardown = KONAMI.slice(KONAMI.indexOf("flight = win.setTimeout"), KONAMI.indexOf('win.addEventListener("keydown"'));
  for (const prop of ["--konami-dx", "--konami-dy", "--konami-rot", "--konami-delay"]) {
    assert.match(teardown, new RegExp('style\\.removeProperty\\("' + prop + '"\\)'), prop + " is removed");
  }
  assert.match(teardown, /classList\.remove\("konami-piece"\);[\s\S]*?style\.removeProperty/,
    "the class goes too — the animation lives on the class, so this is the reassembly");
  assert.match(KONAMI, /FLIGHT_MS \+ 400/, "the teardown outruns the 2.2s flight plus delay");
  assert.match(KONAMI, /if \(flight\) return;/, "a second completed code mid-flight is a no-op");
});

test("the wiring: install beside the quick switcher, before anything else renders", () => {
  const spot = APP.slice(APP.indexOf("bindQuickSwitcher(doc, win);"), APP.indexOf("bindQuickSwitcher(doc, win);") + 60);
  assert.match(spot, /installKonami\(doc, win\);/, "the install sits in renderAppPage, one call per page");
  assert.match(APP, /import \{ installKonami \} from "\.\.\/konami\.js";/);
});

test("the stylesheet: the flight keyframes and the reduced-motion dissolve, tokens only", () => {
  const block = CSS.slice(CSS.indexOf(".konami-piece {"), CSS.indexOf(".composer .composer-actions {"));
  assert.ok(block.length > 400 && block.length < 3000, "the block is the konami block (got " + block.length + ")");
  assert.match(block, /animation: konami-fly 2\.2s ease-in both;/);
  assert.match(block, /translate\(var\(--konami-dx, 0px\), var\(--konami-dy, 0px\)\) rotate\(var\(--konami-rot, 0deg\)\)/,
    "the pieces read the per-piece trajectory vars");
  const reduced = block.slice(block.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(reduced.length > 100, "the reduced-motion block is real");
  assert.match(reduced, /konami-dissolve 0\.9s ease-out both;/, "reduced motion falls, calmly");
});
