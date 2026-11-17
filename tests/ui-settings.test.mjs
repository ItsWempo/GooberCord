// The server-settings lane's pins. Caps come from the backend's own exports
// or the mirrored UI constants with equality pins (G-4) — zero hand-typed
// caps in copy. Route truth: /api/servers(+/:id PATCH rules_text), categories,
// roles, overwrites (OVERWRITE_BITS), invites (absent/null/0 = NEVER).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const constants = await import("../constants.mjs");
const permissions = await import("../api/permissions.mjs");
const settings = await import("../public/js/ui/settings.js");
const SETTINGS = readFileSync(join(HERE, "../public/js/ui/settings.js"), "utf8");
const MAIN = readFileSync(join(HERE, "../public/js/main.js"), "utf8");
const SHELL = readFileSync(join(HERE, "../public/js/ui/shell.js"), "utf8");

test("the mirrored lane mirrors the backend exactly (G-4)", () => {
  assert.deepEqual([...settings.UI_SLOWMODE_CHOICES], [...permissions.SLOWMODE_CHOICES]);
  const bitNames = Object.keys(permissions.SERVER_PERMISSIONS);
  assert.deepEqual([...settings.UI_SERVER_PERMISSIONS].sort(), bitNames.sort());
  // OVERWRITE_BITS freezes bit VALUES; the names must match, in order.
  const bitValueToName = new Map(
    Object.entries(permissions.SERVER_PERMISSIONS).map(([name, value]) => [value, name]),
  );
  const overwriteNames = permissions.OVERWRITE_BITS.map((value) => bitValueToName.get(value));
  assert.deepEqual([...settings.UI_OVERWRITE_BITS], overwriteNames);
  assert.deepEqual([...settings.UI_VERIFICATION_LEVELS], [0, 1, 2, 3, 4]);
  assert.equal(settings.UI_MAX_CHANNELS_PER_SERVER, constants.MAX_CHANNELS_PER_SERVER);
  assert.equal(settings.UI_CATEGORIES_MAX_PER_SERVER, constants.GC_CATEGORIES_MAX_PER_SERVER);
  assert.equal(settings.UI_RULES_MAX, constants.GC_RULES_MAX);
});

test("the lane carries NO register and NO account settings (the settings scope law)", () => {
  // Comments tell the law; the pin sees only the code.
  const codeOnly = SETTINGS.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(codeOnly, /register|totp|backup/i,
    "Accounts owns registration and account settings; GC serves server settings only");
});

test("the manage routes: one task page per area, one gear at the channel-rail top", () => {
  for (const [pattern, name] of [
    ["\\/s/:serverId/settings", "server-settings"],
    ["\\/s/:serverId/channels", "server-channels"],
    ["\\/s/:serverId/roles", "server-roles"],
    ["\\/s/:serverId/invites", "server-invites"],
    ["\\/s/:serverId/channels/:channelId/overwrites", "channel-overwrites"],
    ["\\/join", "join"],
  ]) {
    assert.match(MAIN, new RegExp(`addRoute\\("${pattern}", "${name}"`));
  }
  assert.match(SHELL, /serverAdminRights\(server\)/);
  assert.match(SHELL, /\/s\/\$\{server\.id\}\/settings/, "the gear points at the settings page");
});

test("the gear shows only where the bits say so", () => {
  // role owner/admin, or a channel's effectivePermissions carrying a manage bit
  assert.equal(settings.serverAdminRights({ role: "owner", channels: [] }), true);
  assert.equal(settings.serverAdminRights({
    role: "member",
    channels: [{ effectivePermissions: ["MANAGE_INVITES"] }],
  }), true);
  assert.equal(settings.serverAdminRights({ role: "member", channels: [] }), false);
  assert.equal(settings.serverAdminRights({ role: "member", channels: [
    { effectivePermissions: ["VIEW", "SEND"] },
  ] }), false);
});

test("the rules gate rides the settings writes: accept flow, doc read-back, pre-trim", () => {
  assert.match(SETTINGS, /guardRulesGate\(document, error, /, "the REST arm re-offers the write");
  assert.match(SETTINGS, /api\/servers\/\$\{serverId\}\/rules/, "the rules doc reads back via its GET (PATCH never echoes)");
  assert.match(SETTINGS, /maxlength: String\(UI_RULES_MAX\)/);
  assert.match(SETTINGS, /slice\(0, UI_RULES_MAX\)/, "the editor pre-trims at the bound");
  // The gate clears by clearing: empty text saves null (gate OFF).
  assert.match(SETTINGS, /rules_text: text\.trim\(\) === "" \? null : text/);
});

test("the one-channel-pool parity line and the cap-disabled create form", () => {
  assert.match(SETTINGS, /UI_MAX_CHANNELS_PER_SERVER = 500/);
  assert.match(SETTINGS, /text, voice, and categories/, "one pool, one line");
  assert.match(SETTINGS, /control\.disabled = true/, "at cap the create form disables with the reason");
});

test("the roles parity line: 250 incl. @everyone, never raised by boosts", () => {
  assert.match(SETTINGS, /UI_ROLES_MAX = 250/);
  // The role DELETE never lands on the viewer's own row.
  assert.match(SETTINGS, /isSelf = me\?\.id === member\.id/);
  assert.match(SETTINGS, /ownerRow = member\.membershipRole === "owner"/);
});

test("the overwrite editor: read-only truth for rows the viewer cannot write", () => {
  // Position-gated read-only rendering (never hidden — hiding is a lie).
  assert.match(SETTINGS, /readOnly = role\.id !== "everyone" && !canWriteRoles && role\.position > viewerTop/);
  assert.match(SETTINGS, /read-only — above your position/);
  assert.match(SETTINGS, /allow_mask: allow, deny_mask: deny/);
});

test("invites: 'empty select = never' is real, not invented refusal (the sharp edge)", () => {
  assert.match(SETTINGS, /Never expires/);
  // Absent keys are simply not SENT — the lenient body carries only chosen knobs.
  assert.match(SETTINGS, /if \(maxAge !== ""\) body\.maxAgeSeconds = Number\(maxAge\)/);
  assert.match(SETTINGS, /if \(maxUses !== ""\) body\.maxUses = Number\(maxUses\)/);
  const apiSource = readFileSync(join(HERE, "../api/servers.mjs"), "utf8");
  const minAge = Number(/INVITE_MAX_AGE_MIN = (\d+)/.exec(apiSource)[1]);
  const maxAge = Number(/INVITE_MAX_AGE_MAX = (\d+)/.exec(apiSource)[1]);
  assert.equal(minAge, 60);
  assert.equal(maxAge, 2592000);
  for (const choice of settingsChoiceValues()) {
    assert.ok(choice >= minAge && choice <= maxAge, `expiry choice ${choice} inside the route's window`);
  }
  const usesMax = Number(/INVITE_MAX_USES_MAX = (\d+)/.exec(apiSource)[1]);
  assert.equal(usesMax, 100);
});

function settingsChoiceValues() {
  return [...SETTINGS.matchAll(/value: "(\d+)", label: "\d+ (?:hour|day|days)s?"/g)]
    .map((match) => Number(match[1]));
}

test("deletions are single confirmations; the echoed counts render as consequence", () => {
  assert.match(SETTINGS, /confirmDialog/);
  assert.match(SETTINGS, /deleted: \{?\}|\?\.\?\.\.\.|"Server deleted"/);
  assert.match(SETTINGS, /Object\.entries\(counts\)/);
});

test("every manage write rides api.js — no raw fetch, no client-side oracles", () => {
  assert.doesNotMatch(SETTINGS, /\bfetch\(/);
  assert.match(SETTINGS, /You do not have permission to do that\./,
    "the shared 403 string inline for outsiders (G-3), never a fake empty form");
});
