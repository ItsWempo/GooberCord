// The blank-channel welcome plate (the aside-clip wave's second defect): the
// ruled paper sheet — 2px green ring, offset paper shadow, tilt, the Comic
// Sans display voice — is the BRAND skin's moment. Under the discord skin's
// flat color-step chrome it read loud. This file pins both halves: the
// in-skin quieting (tokens only) and the brand sheet surviving untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");

const QUIET_AT = CSS.indexOf(':root[data-skin="discord"] .empty-chat-note {');

test("the discord skin quiets the plate to a flat centered column", () => {
  assert.ok(QUIET_AT !== -1, "the in-skin quieting exists");
  const end = CSS.indexOf("}", QUIET_AT);
  const block = CSS.slice(QUIET_AT, end);
  assert.match(block, /background: none;/, "the ruled sheet and paper fill drop");
  assert.match(block, /border: none;/, "the 2px green ring drops");
  assert.match(block, /box-shadow: none;/, "the offset paper shadow drops");
  assert.match(block, /transform: none;/, "the hand-tilt drops");
  assert.match(block, /padding: 0\.6rem 1rem;/, "the smaller footprint");
  assert.ok(
    CSS.slice(end).length > 0 &&
      QUIET_AT > CSS.indexOf(".empty-chat-note {"),
    "the override rides after the base rules");
});

test("the headline loses the display voice in-skin (tokens only)", () => {
  const headAt = CSS.indexOf(':root[data-skin="discord"] .empty-chat-note h2 {');
  assert.ok(headAt > QUIET_AT, "the headline override sits with the plate override");
  const block = CSS.slice(headAt, CSS.indexOf("}", headAt));
  assert.match(block, /font-family: inherit;/, "the system stack, not Comic Sans");
  assert.match(block, /color: var\(--ink\);/, "token ink, both themes");
  assert.match(block, /font-size: 1\.35rem;/, "the quieter scale");
});

test("the brand sheet survives: ring, ruled paper, tilt, and the display voice", () => {
  const baseAt = CSS.indexOf(".empty-chat-note {");
  const block = CSS.slice(baseAt, CSS.indexOf("}", baseAt));
  assert.match(block, /border: 2px solid #687f5f;/, "the brand ring holds");
  assert.match(block, /repeating-linear-gradient/, "the ruled paper holds");
  assert.match(block, /transform: rotate\(-0\.25deg\);/, "the hand-tilt holds");
  const headAt = CSS.indexOf(".empty-chat-note h2 {");
  const headBlock = CSS.slice(headAt, CSS.indexOf("}", headAt));
  assert.match(headBlock, /"Comic Sans MS"/, "the brand headline voice holds");
});

test("the plate still holds its centered geometry in-skin (only the surface quiets)", () => {
  // The centering and max-width rules are skin-agnostic; the quieting block
  // must not shadow them away.
  assert.match(CSS, /\.main \.empty-chat-note:first-child,\n\.empty-chat-note:only-child \{\n  margin-top: auto;\n  margin-bottom: auto;\n\}/);
});

test("the markup emits the plate the CSS quiets", () => {
  assert.match(APP, /class: "empty-chat-note"/);
  assert.match(APP, /class: "h2"|"h2", \{ text: "Welcome to GooberCord" \}/);
  assert.match(APP, /Welcome to GooberCord/);
});
