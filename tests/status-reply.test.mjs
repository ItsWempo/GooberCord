// The reply-to-status shaver (the owner's ask): a member-list status line
// grows a hover reply chip; clicking opens the DM and pre-fills its composer
// with the status quoted as text (GC has no reply schema — the quote travels
// in the body). One-shot seed, empty-box-only, never on the own row.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const HELPERS = js("public/js/ui-helpers.js");
const APP = js("public/js/routes/app.js");
const CSS = js("public/styles.css");
const ICONS = js("public/js/icons.js");

const seedBlock = () => HELPERS.slice(
  HELPERS.indexOf("// statusReplySeed(username, statusText)"),
  HELPERS.indexOf("// ###END###"),
);
const seedFn = () => HELPERS.slice(
  HELPERS.indexOf("export function statusReplySeed"),
  HELPERS.indexOf("// --- phase-3: spoiler-channel"),
);

test("the seed is a quoted line with the cursor parked below it", async () => {
  const mod = await import(path.join(ROOT, "public/js/ui-helpers.js"));
  assert.equal(
    mod.statusReplySeed("wempo", "Goober time"),
    "Replying to @wempo's status: \"Goober time\"\n",
    "one quoted line, trailing newline for the next keystroke",
  );
  assert.equal(mod.statusReplySeed("wempo", "   "), null,
    "a whitespace-only status seeds nothing");
  assert.equal(mod.statusReplySeed("", "any"), null, "no username, no chip");
  assert.equal(mod.statusReplySeed("wempo", null), null);
  assert.match(seedFn(), /if \(!name \|\| !text\) return null;/,
    "the failure is one explicit gate, fail-CLOSED");
});

test("the chip rides the status line, seeds the DM's composer, and skips the own row", () => {
  const START = "function presenceRow(doc, win, username, userId, statusText, statusUntil, presenceState) {";
  const s = APP.indexOf(START);
  const row = APP.slice(s, APP.indexOf("  return row;\n}", s));
  assert.ok(row.length > 200, "the slice covers the full block (truncation fails honestly)");
  assert.match(row, /if \(statusText\) \{/, "the chip only exists when the row carries a status");
  assert.match(row, /ariaLabel: "Reply to " \+ username \+ "'s status"/);
  assert.match(row, /startDirectTo\(doc, win, userId, statusReplySeed\(username, statusText\)\)/,
    "the seed rides startDirectTo — set only after the conversation POST settles");
  const own = APP.slice(s, APP.indexOf("return row;\n}\n", s));
  assert.ok(own.indexOf("Number(userId) !== Number(state.currentUser?.id)") < own.indexOf("if (statusText) {"),
    "the chip lives INSIDE the not-self branch — the own row never replies to itself");
});

test("the seed is one-shot, empty-box-only, and consumed by the next composer build", () => {
  const cs = APP.indexOf("function buildComposer(");
  const block = APP.slice(cs, APP.indexOf("const attachButton = iconButton", cs));
  assert.match(block, /if \(composerSeed && !textarea\.value\) textarea\.value = composerSeed;/,
    "only an EMPTY box takes the quote — a user's open draft is never clobbered");
  assert.match(block, /composerSeed = null;/, "consumed once — the seed never leaks forward");
  const declared = APP.slice(
    APP.indexOf("const avatarMisses = createAvatarMisses();"),
    APP.indexOf("function rerenderVoicePane"),
  );
  assert.match(declared, /let composerSeed = null;/, "declared beside the seed's consumer loop");
  const start = APP.slice(
    APP.indexOf("async function startDirectTo(doc, win, userId, seed = null) {"),
    APP.indexOf("function startConversationDialog("),
  );
  assert.match(start, /if \(seed\) composerSeed = seed;/, "the seed rides the navigation");
  assert.ok(
    start.indexOf("if (seed) composerSeed = seed;") < start.indexOf("win.location.hash"),
    "the seed is set AFTER the POST settled, BEFORE the hash moves",
  );
});

test("the reply icon rides the single-stroke icon kit and the hover reveal is CSS-only", () => {
  assert.match(ICONS, /reply: \["M9 14l-5-5 5-5", "M4 9h10a6 6 0 0 1 6 6v4"\]/, "the return-arrow path");
  assert.match(ICONS.slice(ICONS.indexOf("const ICON_ARIA")), /reply: "Reply to status"/);
  const row = CSS.slice(CSS.indexOf(".presence-row button.start-dm {"), CSS.indexOf(".presence-dot {"));
  assert.match(row, /\.presence-row \.status-reply \{[\s\S]*?opacity: 0;/,
    "hidden at rest (the row hover reveals it — nothing jumps)");
  assert.match(row, /\.presence-row:hover \.status-reply,/,
    "the reaction-style hover idiom");
  assert.match(row, /\.presence-row \.status-reply:focus-visible \{?\s*\n?\s*opacity: 1;/,
    "keyboard focus reveals the chip too");
  assert.match(CSS.slice(CSS.indexOf(".presence-row .status-reply")), /var\(--quiet-hover\)|transition: opacity 0\.12s ease;?/);
});
