// The mod desk: the 0010 grammar AS SHIPPED (the terms editor is the
// one-per-line textarea string arm), the mirrored constants with equality
// pins, the alerts feed's quiet empty state, the ban body WITHOUT coercion,
// prune's dry-run-first flow, the member card's rank-gated mod controls, and
// the staff attachment queue (reject states the byte deletion).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const calls = [];
let responses = [];
globalThis.fetch = async (path, init = {}) => {
  calls.push({ path, method: init.method || "GET", body: init.body });
  const response = responses.shift();
  return new Response(typeof response === "string" ? response : JSON.stringify(response),
    { status: Number.isInteger(response?.status) ? response.status : 200 });
};

const mod = await import("../public/js/ui/mod.js");
const store = (await import("../public/js/core/store.js")).default;
const permissions = await import("../api/permissions.mjs");
const filterrules = await import("../api/filterrules.mjs");
const MOD = readFileSync(join(HERE, "../public/js/ui/mod.js"), "utf8");
const MAIN = readFileSync(join(HERE, "../public/js/main.js"), "utf8");
const MEMBERS = readFileSync(join(HERE, "../public/js/ui/members.js"), "utf8");

test.beforeEach(() => {
  calls.length = 0;
  responses = [];
  store.reset();
});

test("the mirrored constants equal the backend's exports (G-4)", () => {
  assert.deepEqual([...mod.UI_TIMEOUT_MINUTE_CHOICES], [...permissions.TIMEOUT_MINUTE_CHOICES]);
  // Timeout menu = ONLY the seven choices (the 28-day seat is the max).
  assert.deepEqual(mod.UI_TIMEOUT_MINUTE_CHOICES, [1, 5, 10, 60, 1440, 10080, 40320]);
  assert.equal(mod.UI_FILTER_RULE_MAX, filterrules.FILTER_RULE_MAX_RULES);
  assert.equal(mod.UI_FILTER_RULE_NAME_MAX, filterrules.FILTER_RULE_NAME_MAX);
  assert.equal(mod.UI_FILTER_RULE_MAX_TERMS, filterrules.FILTER_RULE_MAX_TERMS);
  assert.equal(mod.UI_FILTER_RULE_TERM_CHARS, filterrules.FILTER_RULE_TERM_CHARACTERS);
  assert.equal(mod.UI_FILTER_RULE_BLOCK_MESSAGE_MAX, filterrules.FILTER_RULE_BLOCK_MESSAGE_MAX);
  assert.equal(mod.UI_FILTER_RULE_EXEMPT_ROLES_MAX, filterrules.FILTER_RULE_EXEMPT_ROLES_MAX);
  assert.equal(mod.UI_FILTER_RULE_EXEMPT_CHANNELS_MAX, filterrules.FILTER_RULE_EXEMPT_CHANNELS_MAX);
  assert.equal(mod.UI_FILTER_ALERTS_PAGE_MAX, filterrules.FILTER_ALERTS_PAGE_MAX);
  assert.deepEqual([...mod.UI_FILTER_RULE_ACTIONS], [...filterrules.FILTER_RULE_ACTIONS]);
  // BAN_REASON_MAX never got an export — the mirror pins the source's number.
  const servers = readFileSync(join(HERE, "../api/servers.mjs"), "utf8");
  assert.equal(mod.UI_BAN_REASON_MAX, Number(/BAN_REASON_MAX = (\d+)/.exec(servers)[1]));
  assert.equal(mod.UI_BAN_REASON_MAX, 280);
});

test("routes: the desk, the rule editor (new before :rid), the queue", () => {
  assert.match(MAIN, /addRoute\("\/s\/:serverId\/mod", "mod", renderModDesk\)/);
  assert.match(MAIN, /addRoute\("\/s\/:serverId\/filter\/rules\/new", "filter-rule-new"/);
  assert.match(MAIN, /addRoute\("\/s\/:serverId\/filter\/rules\/:rid", "filter-rule"/);
  assert.match(MAIN, /addRoute\("\/admin-queue", "staff-queue", renderStaffQueue\)/);
  assert.ok(MAIN.indexOf('"filter-rule-new"') < MAIN.indexOf('"filter-rule",'));
  assert.ok(MAIN.indexOf('"mod", renderModDesk') < MAIN.indexOf('"channel", channelPlaceholder'));
});

test("the terms editor is the ONE-PER-LINE TEXTAREA (the string arm), bounded at the line seat", () => {
  assert.match(MOD, /h\("textarea", \{\s*\n?\s*id: "rule-terms"/);
  assert.match(MOD, /terms: termsBox\.value/, "the STRING arm rides the write");
  assert.match(MOD, /maxlength: String\(UI_FILTER_RULE_TERM_CHARS \* UI_FILTER_RULE_MAX_TERMS\)/);
  assert.match(MOD, /slice\(0, UI_FILTER_RULE_MAX_TERMS\)\.join\("\\n"\)/,
    "the textarea stops accepting input at the line bound");
  assert.match(MOD, /One term or pattern per line\./);
});

test("the rule write carries the 0010 grammar: checkbox actions, the timeout select, blockMessage null-able", () => {
  assert.match(MOD, /body\.blockMessage = message === "" \? null : message/);
  assert.match(MOD, /timeoutMinutes: Number\(timeout\.querySelector\("select"\)\.value\)/);
  assert.match(MOD, /body\.exemptRoleIds = exempt\.roleIds\(\)/);
  assert.match(MOD, /body\.exemptChannelIds = exempt\.channelIds\(\)/);
  assert.match(MOD, /Exempt roles \(≤ \$\{UI_FILTER_RULE_EXEMPT_ROLES_MAX\}\)/);
  assert.match(MOD, /Care flag/);
  assert.match(MOD, /Screen nicknames too/);
});

test("the 10-rule cap disables the create affordance with the server's own shape", () => {
  assert.match(MOD, /This server already has \$\{UI_FILTER_RULE_MAX\} filter rules\./);
});

test("the alerts feed: default page 50, the G-5 empty state, rows jump to the message", () => {
  assert.match(MOD, /limit=\$\{UI_FILTER_ALERTS_DEFAULT\}/);
  assert.equal(mod.UI_FILTER_ALERTS_DEFAULT, 50);
  assert.match(MOD, /No rule hits yet\./);
  assert.match(MOD, /href: `\/s\/\$\{serverId\}\/\$\{alert\.channelId\}`/, "rows jump to the message");
  assert.match(MOD, /channel \$\{alert\.channelId \|\| "unknown"\}/,
    "a row without a live channel renders the channel id placeholder");
});

test("the ban body: numeric strings become numbers, anything else rides RAW (no coercion)", () => {
  assert.match(MOD, /\/\^\\d\+\$\/\.test\(raw\)\s*\n?\s*\? \{ user_id: Number\(raw\) \}/);
  assert.match(MOD, /: \{ user_id: raw \}/);
  assert.match(MOD, /if \(reason\) body\.reason = reason/);
  assert.match(MOD, /The ban list rides the roster's own `bans` key/,
    "never requested separately for viewers the shape excludes");
});

test("prune: dry run FIRST, the confirm carries the count and the rules, then the run", () => {
  assert.match(MOD, /dry_run: true/);
  assert.match(MOD, /Prune \$\{result\.count\} members\?/);
  assert.match(MOD, /zero server-wide message activity, never the owner/);
  assert.match(MOD, /dry_run: false/);
  assert.match(MOD, /Number\(days\.querySelector/);
});

test("the member card's mod controls: rank-gated, owner rows immune, self rows clean", () => {
  assert.match(MEMBERS, /memberModControls\(payload, member, routerRerender\)/);
  assert.match(MOD, /if \(self \|\| immune \|\| !outranks \|\| !canModerate\(payload\)\) return null;/);
  assert.match(MOD, /viewer\.owner \|\| member\.topPosition < viewer\.topPosition/);
  assert.match(MOD, /Their role assignments come off with the kick\./);
  // Rules verification rides the card for members still owing it.
  assert.match(MOD, /hasRules && !member\.rulesAccepted/);
  assert.match(MOD, /Mark rules verified/);
});

test("the staff attachment queue: staff-gated, approve/reject are commits, reject states the byte deletion", () => {
  assert.match(MOD, /\["admin", "owner"\]\.includes\(user\.role\)/);
  assert.match(MOD, /\/api\/admin\/attachments/);
  assert.match(MOD, /id\}\/approve`/);
  assert.match(MOD, /The bytes are deleted with the flip\./);
  assert.match(MOD, /The queue is empty\./);
});

test("the desk gate: owner OR KICK_MEMBERS from the roster — plain members get the shared 403", () => {
  assert.equal(mod.canModerate({ viewer: { owner: true, permissions: [] } }), true);
  assert.equal(mod.canModerate({ viewer: { owner: false, permissions: ["KICK_MEMBERS"] } }), true);
  assert.equal(mod.canModerate({ viewer: { owner: false, permissions: ["MANAGE_EMOJI"] } }), false);
  assert.match(MOD, /You do not have permission to do that\./);
});
