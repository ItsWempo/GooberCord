// Onboarding (wave item 4): the template-channel chooser on server create.
// The pure half (the template constant's shape and ordering) pins
// behaviorally; the wiring (the dialog's fieldset, the per-template POST,
// and the note-not-failure seed path) rides source pins with teeth, since
// node --test has no DOM to drive the dialog.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SERVER_CHANNEL_TEMPLATES } from "../public/js/ui-helpers.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

// --- the pure half ---------------------------------------------------------------

test("the template constant: text first, voice last, unique seeded-ready names", () => {
  assert.ok(Array.isArray(SERVER_CHANNEL_TEMPLATES) && SERVER_CHANNEL_TEMPLATES.length > 0);
  const seen = new Set();
  let voiceStarted = false;
  for (const template of SERVER_CHANNEL_TEMPLATES) {
    assert.ok(
      template.kind === "text" || template.kind === "voice",
      `kind is text or voice (${template.name})`,
    );
    if (template.kind === "voice") voiceStarted = true;
    else assert.equal(voiceStarted, false, "text templates come before voice ones");
    assert.equal(typeof template.name, "string");
    assert.ok(template.name.length > 0 && template.name.length <= 32, template.name);
    assert.ok(!seen.has(template.name), "no duplicate template names");
    seen.add(template.name);
    assert.ok(template.blurb.length > 0, "each template carries its blurb");
  }
  // #general is NOT offerable — the create seeds it unconditionally.
  assert.ok(!seen.has("general"), "general is the create's own seed, never a template");
});

// --- the wiring half --------------------------------------------------------------

test("the create dialog renders the chooser; the submit rides the create-channel route", () => {
  const dialogStart = APP.indexOf("function createServerDialog");
  const dialogEnd = APP.indexOf("function openServerSettingsDialog", dialogStart);
  const dialog = APP.slice(dialogStart, dialogEnd);
  assert.match(dialog, /SERVER_CHANNEL_TEMPLATES\.map/,
    "the fieldset renders from the filed constant, not a hand-copied list");
  assert.match(dialog, /class: "perks-fieldset create-templates"/);
  assert.match(dialog, /#general is always seeded/,
    "the legend tells the creator general is unconditional");
  // The submit: one POST per checked template, try/catch PER template — a
  // refusal becomes a note, never a failed onboarding.
  const submitStart = dialog.lastIndexOf("addEventListener(\"submit\"");
  const submit = dialog.slice(submitStart);
  assert.match(submit, /seedFailed = \[\]/);
  assert.match(submit, /for \(const \{ checkbox, template \} of templateBoxes\)/);
  assert.match(submit, /body: \{ name: template\.name, kind: template\.kind \}/);
  const seedLoop = submit.slice(submit.indexOf("const seedFailed"), submit.indexOf("const iconFile"));
  const tryBlocks = (seedLoop.match(/try \{/g) || []).length;
  assert.equal(tryBlocks, 1, "the catch wraps ONE template, not the whole seeding");
  assert.match(seedLoop, /seedFailed\.push\(template\.name\)/);
});

test("a seed refusal surfaces AFTER the server lands, on both create paths", () => {
  const dialogStart = APP.indexOf("function createServerDialog");
  const dialogEnd = APP.indexOf("function openServerSettingsDialog", dialogStart);
  const submit = APP.slice(dialogStart, dialogEnd).slice(
    APP.slice(dialogStart, dialogEnd).lastIndexOf("addEventListener(\"submit\""));
  // Both branches (icon and no-icon) refresh FIRST, then note.
  const notes = submit.match(/seedFailed\.length > 0/g) || [];
  assert.equal(notes.length, 2, "both create paths note a partial seed");
  assert.match(submit, /The server is ready, but these starter channels were refused/);
  // The create itself stays authoritative: a thrown create still lands in the
  // dialog's own error strip, untouched by seeding.
  assert.match(submit, /error\.textContent = caught\?\.message \|\| "The server could not be created\."/);
});

test("the chooser rides the checkbox fieldset idiom — no new CSS family", () => {
  assert.match(CSS, /\.create-templates \{/,
    "the chooser carries the scoped class");
  // One shared idiom, not a clone: the roles dialog's fieldset rules list the
  // chooser selector beside their original selector.
  assert.match(CSS, /\.new-role-form \.perks-fieldset,\n\.create-templates \{/);
  assert.match(CSS, /\.create-templates label \{ max-width: 100%; \}/,
    "a template's blurb wraps instead of pushing the row out on a narrow dialog");
  assert.doesNotMatch(CSS, /create-templates[^\n]*position:|create-templates[^\n]*float/);
});
