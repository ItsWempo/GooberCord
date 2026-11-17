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

// The Wempo ruling (Clyde) wiring: the DOOR (rail home) carries Wempo's
// portrait with the stock house glyph as fallback, Wempo speaks in the
// system-voice moments (the care strip), blaxel keeps the CONTENTS
// (empty/loading/error decoration). Asset pins: the committed portrait is
// transparent as owner-supplied.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const APP = js("public/js/routes/app.js");
const MASCOT = js("public/js/mascot.js");
const CSS = js("public/styles.css");

const PNG = readFileSync(path.join(ROOT, "public/assets/wempo.png"));
test("the committed wempo.png is transparent as owner-supplied (no white plate to flood-fill)", () => {
  assert.ok(PNG.length > 0, "the asset exists");
  assert.equal(PNG.slice(12, 16).toString("ascii"), "IHDR", "an IHDR chunk follows the signature");
  assert.equal(PNG.readUInt32BE(16), 460, "the IHDR width");
  assert.equal(PNG.readUInt32BE(20), 460, "the IHDR height");
  assert.equal(PNG[24], 8, "bit depth 8");
  assert.equal(PNG[25], 6, "color type 6 = RGBA, the alpha channel present");
  assert.match(
    MASCOT.slice(MASCOT.indexOf("// --- Wempo:")),
    /460×460 square, ALREADY fully transparent/,
    "the stale white-background report is corrected where the reader lands",
  );
});

test("the persona split is said where a reader lands: blaxel = Wumpus, Wempo = Clyde", () => {
  assert.match(MASCOT, /WUMPUS/, "blaxel's header states his decoration tier");
  assert.match(MASCOT, /CLYDE/, "Wempo's block states the system-persona tier");
  const wempo = MASCOT.slice(MASCOT.indexOf("// --- Wempo:"), MASCOT.indexOf("export function createWempo"));
  assert.match(wempo, /public\/assets\/wempo\.png/);
  assert.match(MASCOT.slice(MASCOT.indexOf("export function createWempo")), /img\.className = "wempo-portrait/);
});

test("the rail home carries Wempo's face, glyph underneath as fallback", () => {
  const rail = APP.slice(
    APP.indexOf("function renderRail(doc, win, rail, route) {"),
    APP.indexOf("rail.replaceChildren(home,"),
  );
  assert.match(rail, /home\.append\(createWempo\(doc, \{ size: "mid", alt: "" \}\)\);/,
    "the portrait rides the door button (decorative: the button keeps its aria-label)");
  assert.match(rail, /ariaLabel: "Direct messages"/, "the button's label is unchanged");
  assert.match(rail, /The home button is CLYDE/, "the ruling is said at the door");
  assert.match(CSS, /\.server-home \{\s*\n\s*overflow: hidden;/,
    "the button clips at its own circle");
  const face = CSS.slice(CSS.indexOf(".server-home .wempo-portrait"));
  assert.match(face, /transform: scale\(1\.5\);/, "the face steps in over the transparent margins");
  assert.match(face, /object-fit: contain;/, "contain — never a cover-stretch of the portrait");
});

test("the care strip's voice is Wempo, not the decoration mascot", () => {
  const s = APP.indexOf("function showCareNotice(doc, notice) {");
  const care = APP.slice(s, APP.indexOf("note.addEventListener(\"click\"", s));
  assert.ok(care.length > 100, "the slice covers the block");
  assert.match(care, /createWempo\(doc, \{ size: "mini", alt: "Wempo" \}\)/);
  assert.ok(!care.includes("createMascot"), "blaxel keeps OUT of the system voice");
  const block = CSS.slice(CSS.indexOf(".wempo-portrait {"));
  assert.match(block, /border-radius: 999px;/, "one round token");
  assert.match(block, /object-fit: contain;/);
});
