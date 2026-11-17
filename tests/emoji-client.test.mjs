// Emoji pass 2 (the 0020 expression bundle's client half): tokens render
// locally against the history payloads' inventories, unknown ids are TEXT
// (the server's own rule), the composer's picker offers the current server's
// own emoji + stickers (only on server channels — a picker never offers a
// 403 as a choice), and the super reactions sparkle keyed on the SET.
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
const CONSTANTS = js("constants.mjs");

const mod = await import(path.join(ROOT, "public/js/ui-helpers.js"));

function fnSlice(name, end) {
  const s = APP.indexOf("function " + name);
  if (s < 0) return "";
  const e = APP.indexOf("function " + end, s);
  return e < 0 ? APP.slice(s) : APP.slice(s, e);
}

test("the resolver: known ids render, unknown/malformed ids are TEXT", async () => {
  const mod = await import(path.join(ROOT, "public/js/ui-helpers.js"));
  const index = mod.expressionIndex({
    emojis: [{ id: 7, serverId: 2, name: "goober", url: "/api/attachments/11", createdAt: null }],
    stickers: [{ id: 7, serverId: 2, name: "star", url: "/api/attachments/12", createdAt: null }],
  });
  assert.equal(index.get("e:7").url, "/api/attachments/11");
  assert.equal(index.get("s:7").name, "star",
    "the two tables own separate id spaces — the index is keyed kind:id");

  let segs = mod.splitExpressionTokens("hey <e:goober:7>!", index);
  assert.deepEqual(segs.map((s) => s.kind), ["text", "emoji", "text"]);
  assert.equal(segs[1].url, "/api/attachments/11");
  assert.equal(segs[1].name, "goober");

  segs = mod.splitExpressionTokens("<s:star:7>", index);
  assert.deepEqual(segs.map((s) => s.kind), ["sticker"], "sticker tokens ride their own kind");

  segs = mod.splitExpressionTokens("<e:goober:99> unknown", index);
  assert.deepEqual(segs.map((s) => s.kind), ["text"], "unknown id: the literal survives");
  assert.equal(segs[0].text, "<e:goober:99> unknown");

  segs = mod.splitExpressionTokens("<e:goober:0123>", index);
  assert.equal(segs[0].kind, "text", "a malformed id is never an expression");
  segs = mod.splitExpressionTokens("<e:goober:09> x", index);
  assert.equal(segs[0].text, "<e:goober:09> x", "[1-9][0-9]* — a leading zero is text");

  // Merging: a later payload for the same server re-indexes under the same id.
  mod.expressionIndex({ emojis: [{ id: 7, name: "renamed", url: "/api/attachments/44" }] }, index);
  assert.equal(mod.splitExpressionTokens("<e:renamed:7>", index)[0].name, "renamed",
    "tokens are id-stable across renames — the row re-indexes");
});

test("the body render walks the split; empty render falls back to the raw text", () => {
  const block = APP.slice(
    APP.indexOf("const body = el(\"div\", { class: \"body\" });"),
    APP.indexOf("if (message.editedAt) {"),
  );
  assert.match(block, /for \(const segment of splitExpressionTokens\(message\.body, caches\.expressionIndex\)\)/);
  assert.match(block, /expression-sticker|expression-emoji/);
  assert.match(block, /alt: ":" \+ segment\.name \+ ":"/, "the accessible name is the :shortname:");
  assert.match(block, /if \(!body\.firstChild\) body\.textContent = String\(message\.body \?\? ""\);/,
    "an empty split never renders an empty body (the raw text survives)");
  assert.match(block, /unknown ids are TEXT/, "the server's rule is said at the render");
});

test("the inventory rides the history loads through ONE write point", () => {
  const load = APP.slice(
    APP.indexOf('const page = await api("/api/channels/" + channelId + "/messages?limit=" + HISTORY_PAGE)'),
    APP.indexOf("const context = findChannelContext(channelId);", APP.indexOf("async function loadChannel")),
  );
  assert.match(load, /if \(page\.expressions\) \{\s*rememberExpressions\(findChannelContext\(channelId\)\?\.server\?\.id, page\.expressions\);/,
    "the server-channel history GET carries the inventory; a DM page carries none");
  const older = APP.slice(
    APP.indexOf('"/messages?limit=" + HISTORY_PAGE + "&after=" + activeView.nextAfter'),
    APP.indexOf("renderMessages(doc, win, false, beforeId);"),
  );
  assert.match(older, /rememberExpressions\(findChannelContext\(activeView\.channelId\)\?\.server\?\.id, page\.expressions\)/);
  const caches = APP.slice(APP.indexOf("expressions: new Map()"), APP.indexOf("function rememberExpressions") + 300);
  assert.match(caches, /expressionIndex\(payload, caches\.expressionIndex\)/,
    "the merged index is the single resolver the render reads");
});

test("the picker: server-channel-only button, own rows, token insert at the caret", () => {
  const composer = APP.slice(
    APP.indexOf("function buildComposer(doc, win, main, composerError, slowmodeSeconds = 0, pickerServerId = null,"),
    APP.indexOf("const counter = el(\"span\""),
  );
  assert.match(composer, /pickerServerId = null/, "the optional flag rides the signature");
  const call = APP.slice(APP.indexOf("main.append(buildComposer"), APP.indexOf("main.append(buildComposer") + 220);
  assert.match(call, /composerContext\?\.server\?\.id \?\? null/,
    "a DM/group composer passes none — the button stays hidden (no 403 as a choice)");
  const picker = APP.slice(
    APP.indexOf("// --- expressions (0020): the composer's picker"),
    APP.indexOf("function openReactionPicker(doc, win, message)"),
  );
  assert.match(picker, /caches\.expressions\.get\(Number\(serverId\)\)/,
    "the current server's OWN inventory");
  assert.match(picker, /"<" \+ \(kind === "emoji" \? "e:" : "s:"\) \+ String\(row\.name\) \+ ":" \+ Number\(row\.id\) \+ ">"/,
    "the wire token is built from the row (id-stable across renames)");
  assert.match(picker, /setRangeText/, "insert-at-caret via setRangeText (CSP-safe)");
  assert.match(picker, /This server has no emoji or stickers yet\./, "the empty state is said");
  const button = APP.slice(
    APP.indexOf("if (expressionButton) box.append(expressionButton);") - 620,
    APP.indexOf("if (expressionButton) box.append(expressionButton);"),
  );
  assert.match(button, /iconButton\(doc, "smile"/);
  assert.match(ICONS, /smile: \["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/, "the smile rides the single-stroke kit");
  assert.match(ICONS.slice(ICONS.indexOf("const ICON_ARIA")), /smile: "Emoji picker"/);
});

test("super reactions sparkle keyed on the set, matched to the worker's list", () => {
  const clientSet = HELPERS.slice(HELPERS.indexOf("export const GC_PLUS_REACTIONS"), HELPERS.indexOf("// isSuperReaction"));
  for (const emoji of ["✨", "💫", "🌟", "🎆", "🎇", "🌈", "🪄", "🩷"]) {
    assert.ok(clientSet.includes('"' + emoji + '"'), "the client mirror carries " + emoji);
  }
  // The slice ends at the set's own "]);" — searched from the start index,
  // so later constants (the 0023 boost matrix carries another "]);") can't
  // displace the terminator.
  const workerIndex = CONSTANTS.indexOf("export const GC_PLUS_REACTIONS");
  const workerSet = CONSTANTS.slice(workerIndex, CONSTANTS.indexOf("]);", workerIndex));
  const workerList = [...workerSet.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(workerList, ["✨", "💫", "🌟", "🎆", "🎇", "🌈", "🪄", "🩷"],
    "the client mirror is byte-equal to constants.mjs's set (the parity pin)");
  const chips = APP.slice(
    APP.indexOf("class: \"reaction-chip\" + (chip.mine ? \" reaction-chip-mine\" : \"\") +"),
    APP.indexOf("class: \"reaction-chip\" + (chip.mine ? \" reaction-chip-mine\" : \"\") +") + 260,
  );
  assert.match(chips, /isSuperReaction\(chip\.emoji\) \? " reaction-chip-super" : ""/,
    "the chips' gold tier keys on the set");
  const block = CSS.indexOf(".reaction-chip-super {");
  const css = CSS.slice(block, CSS.indexOf("}", block));
  assert.match(css, /var\(--yellow\)/, "gold — tokens only, no raw hex");
  const refused = APP.slice(APP.indexOf("async function toggleMessageReaction"), APP.indexOf("function bindReactionsDetail"));
  assert.match(refused, /showTransientError\(doc, caught\?\.message \|\| "That reaction could not be saved\."\)/,
    "a refused ADD surfaces the server's exact copy (the 403 rides caught.message)");
});

test("the expression chrome rides the token idiom, no raw hex", () => {
  const block = CSS.slice(CSS.indexOf("/* Expressions (0020)"), CSS.indexOf(".composer .composer-actions {"));
  assert.match(block, /\.expression-emoji \{/, "inline emoji");
  assert.match(block, /\.expression-sticker \{/, "block stickers");
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "tokens only");
  assert.match(block, /object-fit: contain;/, "no stretch of the owner's pixels");
});
