// Copyright 2026 YourLocalGoober
//
// This file is part of GooberCord.
//
// GooberCord is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the
// GNU Affero General Public License along with this program.  If not,
// see <https://www.gnu.org/licenses/>

// The Konami egg (owner's direct ask, rebuilt to the glass spec): the code
// (↑↑↓↓←→←→BA) breaks the WHOLE SCREEN like glass — a white flash, a crack
// web spiderwebbing from the center, then ~16 wedge shards cut from the
// real screen's surface colors that gravity-fall out of view while the app
// fades to 15%, then the reassembly (the app fades back). Reduced motion:
// flash + crack + a cross-fade dissolve, no flight. Carry-over pins: the
// sequence tracker (case-insensitive on BOTH sides), the once-guard, and
// the never-blocked keyboard.
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

test("the code is the code: ↑↑↓↓←→←→BA, one key per press, case-insensitive", () => {
  const code = KONAMI.slice(KONAMI.indexOf("const CODE = ["), KONAMI.indexOf("];", KONAMI.indexOf("const CODE = [")));
  const keys = [...code.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
    "b", "a",
  ]);
  // The match is case-insensitive on BOTH sides — a keydown gives a
  // lowercased key and the arrows carry capitals (the live-tested bug).
  assert.match(KONAMI, /key === CODE\[progress\]\.toLowerCase\(\)/);
  assert.match(KONAMI, /progress = key === CODE\[0\]\.toLowerCase\(\) \? 1 : 0;/,
    "a restart lands on the first arrow");
  assert.match(KONAMI, /let installed = false;/);
  assert.match(KONAMI, /if \(installed\) return;[\s\S]*?installed = true;/,
    "one listener for the whole page");
  assert.match(KONAMI, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey \|\| event\.repeat\) \{/);
  assert.doesNotMatch(KONAMI, /preventDefault/, "the code only ever rides a clean keyboard");
});

function KONADI_PX(source) {
  return source.includes('"px ') && source.includes('"px, "');
}

test("the glass fracture: real-surface shards, clip-path wedges, an SVG crack web", () => {
  assert.match(KONAMI, /const SHARD_COUNT = 16;/, "14-20 wedges; 16 is the board");
  // The shards wear the REAL screen: the topmost element under each
  // centroid owns the paint, walked up past transparent layers.
  assert.match(KONAMI, /doc\.elementFromPoint\(x, y\)/, "the centroid probe");
  assert.match(KONAMI, /style\.backgroundColor && !style\.backgroundColor\.startsWith\("rgba\(0, 0, 0, 0\)"\)/,
    "transparent layers fall through to the first opaque one");
  assert.match(KONAMI, /backgroundImage !== "none" \? style\.backgroundImage : null/, "gradients ride too");
  // The cut: clip-path polygons through CSSOM property writes, never strings.
  assert.match(KONAMI, /style\.setProperty\("clip-path",/);
  assert.ok(KONADI_PX(KONAMI), "wedge polygons carry px coords");
  assert.match(KONAMI, /doc\.createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/, "the crack web is SVG");
  assert.match(KONAMI, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "polyline"\)/);
  assert.match(KONAMI, /getTotalLength\(\)/);
  assert.match(KONAMI, /strokeDashoffset: len \}, \{ strokeDashoffset: 0 \}/,
    "the spiderweb draws itself through the dashoffset");
  assert.match(KONAMI, /"konami-flash"/, "the 60ms impact flash");
  assert.match(KONAMI, /"konami-shard"/, "the wedge class carries the glint edge (pinned in the stylesheet test)");
});

test("the show: a fracture beat, the gravity fall, the app fade, and the reassembly", () => {
  assert.match(KONAMI, /const FRACTURE_AT = 100;/);
  assert.match(KONAMI, /const FLIGHT_AT = 700;/, "the fracture holds a beat before the lift");
  assert.match(KONAMI, /const FLIGHT_MS = 1500;/, "the fall runs 700-2400ms");
  assert.match(KONAMI, /opacity: 0\.85,/, "gravity eases them out");
  assert.match(KONAMI, /easing: "ease-in"/, "the fall accelerates");
  assert.match(KONAMI, /\{ opacity: "1" \}, \{ opacity: "0\.15" \}/, "the real app fades to ~15%");
  assert.match(KONAMI, /\{ opacity: "0\.15" \}, \{ opacity: "1" \}/, "the reassembly fades it back");
  const teardown = KONAMI.slice(KONAMI.indexOf("flight = win.setTimeout(() => {"), KONAMI.indexOf('win.addEventListener("keydown"'));
  assert.match(teardown, /for \(const node of nodes\) node\.remove\(\);/, "the shards, web, and flash all die");
  assert.match(teardown, /app\.animate\(\[\{ opacity: "0\.15" \}/, "the reassembly rides the teardown");
  assert.match(KONAMI, /if \(flight\) return;/, "a second completed code mid-flight is a no-op");
});

test("reduced motion: flash + crack + a cross-fade dissolve, never the flight", () => {
  const calm = KONAMI.slice(KONAMI.indexOf("const reduced ="), KONAMI.indexOf("flight = win.setTimeout(() => {"));
  assert.match(calm, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(calm, /if \(reduced\) \{[\s\S]*?opacity: 0\.15, offset: 0\.5[\s\S]*?opacity: 1 \}/,
    "the calm lane cross-fades the app");
  assert.doesNotMatch(KONAMI.slice(KONAMI.indexOf("if (reduced) {"), KONAMI.indexOf("// --- FLIGHT")), /FLIGHT_MS/,
    "no shatter animation on the calm lane");
});

test("the wiring and the stylesheet hold", () => {
  const anchor = APP.indexOf("bindQuickSwitcher(doc, win);");
  const spot = APP.slice(anchor, APP.indexOf("installKonami(doc, win);", anchor) + 30);
  assert.match(spot, /installKonami\(doc, win\);/, "the install sits in renderAppPage");
  assert.match(APP, /import \{ installKonami \} from "\.\.\/konami\.js";/);
  const block = CSS.slice(CSS.indexOf(".konami-shard {"), CSS.indexOf(".composer .composer-actions {"));
  assert.ok(block.length > 400, "the glass block is real (got " + block.length + ")");
  assert.match(block, /position: fixed;/);
  assert.match(block, /box-shadow: inset 0 0 0 1px/, "the glint is an inset edge");
  assert.match(block, /pointer-events: none;/, "the glass never intercepts a click");
  assert.match(block, /stroke-width: 1\.5;/);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "no raw hex — rgb() glints, tokens for the rest");
});
