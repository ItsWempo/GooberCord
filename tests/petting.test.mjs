// The blaxel egg (owner's direct ask): clicking blaxel pets him — a
// squish-wiggle loop with floating hearts, several seconds, and another
// click dismisses it early. Pins with teeth: the egg is display-only on top
// of whatever render he sits in (the event is never blocked, so a click that
// also means a real action still does that thing), the teardown is real,
// and reduced motion falls back to the calm glow.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const PET = js("public/js/petting.js");
const APP = js("public/js/routes/app.js");
const CSS = js("public/styles.css");

test("one delegated listener for the whole page: the once-guard and the unblocked click", () => {
  assert.match(PET, /let installed = false;/);
  assert.match(PET, /if \(installed\) return;[\s\S]*?installed = true;/,
    "renderAppPage re-renders; a listener stack would pet several times over");
  assert.doesNotMatch(PET, /preventDefault|stopPropagation/, "a petting click never blocks a real action");
  assert.match(PET, /doc\.addEventListener\("click"/, "one delegated handler reads .mascot out of any render");
  assert.match(PET, /target\.closest\("\.mascot"\)/);
});

test("the petting unwinds: the class, the hearts span, and the timer all die together", () => {
  const end = PET.slice(PET.indexOf("function endPetting()"), PET.indexOf("function pet(mascot)"));
  assert.ok(end.length > 150, "the endPetting slice is real (got " + end.length + ")");
  assert.match(end, /clearTimeout\(petTimer\);/, "the timer dies");
  assert.match(end, /classList\.remove\("blaxel-petted"\);/, "the squish class goes");
  assert.match(end, /liveHeart\.remove\(\);/, "the hearts span goes");
  assert.match(PET, /petTimer = win\.setTimeout\(endPetting, PET_MS\);/, "the several-seconds end is a real teardown");
  assert.match(PET, /PET_MS = 2600;/, "several seconds of petting");
  assert.match(PET, /if \(mascot\.classList\.contains\("blaxel-petted"\)\) \{[\s\S]*?endPetting\(\);/,
    "a click on a petted blaxel dismisses early");
});

test("the hearts are CSP-safe: CSSOM vars of round numbers only, never a style string", () => {
  assert.doesNotMatch(PET, /\.innerHTML|\.cssText|setAttribute\("style"/);
  const vars = PET.slice(PET.indexOf('hearts.style.setProperty'), PET.indexOf("mascot.parentElement.append(hearts);"));
  assert.ok(vars.length > 100, "the vars slice is real (got " + vars.length + ")");
  assert.match(vars, /"--pet-x", String\(Math\.round\(rect\.left \+ rect\.width \/ 2\)\) \+ "px"/,
    "the heart origin rides his head, mid-width");
  assert.match(vars, /"--pet-y", String\(Math\.round\(rect\.top - 6\)\) \+ "px"/);
  assert.match(PET, /hearts\.setAttribute\("aria-hidden", "true"\);/, "the motif is decoration to the ear too");
});

test("the wiring: install beside the konami install, once per page render", () => {
  const anchor = APP.indexOf("installKonami(doc, win);");
  const spot = APP.slice(anchor, APP.indexOf("installPetting(doc, win);", anchor) + 30);
  assert.ok(spot.length < 60, "the installs are adjacent (slice " + spot.length + ")");
  assert.match(spot, /installPetting\(doc, win\);/, "the install sits in renderAppPage beside the other eggs");
  assert.match(APP, /import \{ installPetting \} from "\.\.\/petting\.js";/);
});

test("the stylesheet: the squish loop, the staggered hearts, and the calm reduced-motion glow", () => {
  const block = CSS.slice(CSS.indexOf(".mascot.blaxel-petted {"), CSS.indexOf("/* ---- Warmth pass"));
  assert.ok(block.length > 900 && block.length < 4000, "the petting block is real (got " + block.length + ")");
  assert.match(block, /animation: blaxel-pet 0\.65s ease-in-out 4;/, "four squishes ≈ several seconds");
  assert.match(block, /@keyframes blaxel-pet \{[\s\S]*?scaleY\(0\.92\)[\s\S]*?rotate\(3deg\)/,
    "the squish-wiggle is the loop");
  assert.match(block, /\.pet-hearts \{[\s\S]*?position: fixed;/, "the hearts take no layout space");
  assert.match(block, /left: var\(--pet-x, 0px\);[\s\S]*?top: var\(--pet-y, 0px\);/, "the origin is the module's vars");
  assert.match(block, /content: "♥";[\s\S]{0,200}pet-hearts-rise 2\.2s ease-out 0\.15s both/,
    "the staggered heart pair rides the pseudo-elements");
  assert.doesNotMatch(
    CSS.slice(CSS.indexOf(".mascot.blaxel-petted {"), CSS.indexOf("@media (prefers-reduced-motion: reduce) {", CSS.indexOf(".mascot.blaxel-petted {"))),
    /#[0-9a-fA-F]{3,8}\b/, "no raw hex — tokens only (--yellow, --coral)");
  const reduced = block.slice(block.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(reduced.length > 80, "the reduced block is real");
  assert.match(reduced, /\.mascot\.blaxel-petted \{[\s\S]*?animation: none;/, "no squish loop when still is asked");
  assert.match(reduced, /pet-hearts-glow/, "the hearts calm to a glow-fade instead of rising");
});
