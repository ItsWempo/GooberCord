// The intake cap's mirror (the attachments drift fix): public/js/
// attachments.js is the cap's SINGLE client mirror — the free tier's
// 20 MiB (Discord's Aug-2026 raise, the shipped raise the old 5 MiB
// pre-check predated). This file pins the equality with the backend's
// own constant, the re-derived refusal copy, the single-source wiring
// (the composer pickers and the expression intake all ride this one
// constant), and the absence of the stale copy anywhere client-side.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_ATTACHMENT_BYTES as BACKEND_CAP } from "../constants.mjs";

import {
  MAX_ATTACHMENT_BYTES,
  ATTACHMENT_TOO_LARGE_ERROR,
  attachmentTooLarge,
  isImageFile,
} from "../public/js/attachments.js";

import {
  EXPRESSION_IMAGE_MAX_BYTES,
  EXPRESSION_IMAGE_TOO_LARGE_ERROR,
} from "../public/js/expression-manage.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const ATT = readFileSync(path.join(ROOT, "public/js/attachments.js"), "utf8");

test("the cap is the backend's own constant, mirrored once client-side", () => {
  assert.equal(MAX_ATTACHMENT_BYTES, BACKEND_CAP,
    "the intake cap, never a re-spoken number");
  assert.equal(MAX_ATTACHMENT_BYTES, 20_971_520,
    "the shipped free tier's Aug-2026 raise — the old 5_242_880 pre-check is gone");
});

test("the refusal copy is re-derived from the cap, not hand-spoken", () => {
  assert.equal(ATTACHMENT_TOO_LARGE_ERROR, "Images must be 20 MiB or smaller.",
    "the MiB figure in the copy IS the constant");
  assert.match(ATT,
    /Math\.round\(MAX_ATTACHMENT_BYTES \/ \(1024 \* 1024\)\)/,
    "the copy's number rides the constant — a backend raise rewrites the copy with no edit");
  // The stale copy survives nowhere as a literal string.
  assert.ok(!/"Images must be 5"/.test(ATT));
  assert.ok(!/5_242_880/.test(ATT));
});

test("the boundary rides the mirror: the cap's own byte is admitted, one over refuses", () => {
  assert.ok(!attachmentTooLarge(MAX_ATTACHMENT_BYTES), "the cap's own byte is admitted");
  assert.ok(attachmentTooLarge(MAX_ATTACHMENT_BYTES + 1), "one over refuses");
  assert.ok(!attachmentTooLarge(0), "an empty pick is not the cap's verdict");
});

test("the expression intake rides the one mirror — no second restatement", () => {
  assert.equal(EXPRESSION_IMAGE_MAX_BYTES, BACKEND_CAP);
  assert.equal(EXPRESSION_IMAGE_TOO_LARGE_ERROR, ATTACHMENT_TOO_LARGE_ERROR,
    "one copy, shared — the manage dialog's strip says what the composer says");
  const manage = readFileSync(path.join(ROOT, "public/js/expression-manage.js"), "utf8");
  assert.match(manage,
    /import \{ MAX_ATTACHMENT_BYTES, ATTACHMENT_TOO_LARGE_ERROR \} from "\.\/attachments\.js";/,
    "the import is the wiring, not another number");
  assert.ok(!/20_971_520|5_242_880/.test(manage),
    "the manage surface never re-speaks a cap byte count");
});

test("the composer + icon pickers surface the shared copy at every call site", () => {
  const uses = [...APP.matchAll(/(error|composerError)\.textContent = ATTACHMENT_TOO_LARGE_ERROR;/g)]
    .length;
  assert.ok(uses >= 2, "the composer arm and the second picker arm both ride it");
  assert.match(APP, /import \{[\s\S]*?ATTACHMENT_TOO_LARGE_ERROR,[\s\S]*?\} from "\.\.\/attachments\.js";/);
  assert.ok(!/5 MiB/.test(APP), "the server-icon picker's doc comment rides the fix too");
});

test("the stale 5 MiB copy is extinct across the whole client tree", () => {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".js")) {
        const text = readFileSync(full, "utf8");
        assert.ok(!text.includes("Images must be 5 MiB"),
          "the stale copy survives in " + path.relative(ROOT, full));
        assert.ok(!/5_242_880/.test(text),
          "the stale byte count survives in " + path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, "public/js"));
});
