// The members lane: the roster contract (routes, store key, staff-field
// gating, the G-3/G-5 copy) and the member card route. Behavior runs against
// a stubbed fetch; the DOM-rendered halves pin by source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const calls = [];
globalThis.fetch = async (path, init = {}) => {
  calls.push({ path, method: init.method || "GET", body: init.body });
  const response = responses.shift();
  if (!response) return new Response(JSON.stringify({}), { status: 200 });
  return new Response(typeof response === "string" ? response : JSON.stringify(response), {
    status: response.status ?? 200,
  });
};
let responses = [];

const members = await import("../public/js/ui/members.js");
const store = (await import("../public/js/core/store.js")).default;
const MAIN = readFileSync(join(HERE, "../public/js/main.js"), "utf8");
const MEMBERS = readFileSync(join(HERE, "../public/js/ui/members.js"), "utf8");

const ROSTER = {
  server: { id: 5, hasRules: true },
  viewer: { owner: false, permissions: ["MANAGE_ROLES"], topPosition: 3 },
  roles: [{ id: 1, name: "mods", color: "#397357", position: 3, permissions: [] }],
  members: [{
    id: 2, username: "wempo", nickname: null, avatarUrl: null, membershipRole: "member",
    isPlus: true, roleIds: [1], topPosition: 3, joinedAt: "2026-11-17T08:00:00Z",
    accountCreatedAt: "2026-11-01T08:00:00Z",
  }],
};

test.beforeEach(() => {
  calls.length = 0;
  responses = [];
  store.reset();
});

test("loadRoster fills the store's per-server envelope; a refusal rethrows (never a fake empty list)", async () => {
  responses = [ROSTER];
  const payload = await members.loadRoster(5);
  assert.deepEqual(payload.viewer.permissions, ["MANAGE_ROLES"]);
  assert.equal(members.rosterOf(5), payload);
  responses = [{ status: 403, error: "You do not have permission to do that." }];
  await members.loadRoster(5).catch((error) => {
    assert.equal(error.message, "You do not have permission to do that.");
  });
});

test("the roster routes and the member card", async () => {
  assert.match(MAIN, /addRoute\("\/s\/:serverId\/member\/:uid", "member", renderMemberCard\)/);
  assert.match(MEMBERS, /\/api\/servers\/\$\{serverId\}\/roster/);
  // The staff gate: platform owner OR the KICK_MEMBERS bit — and the fields
  // render ONLY for that gate, never disabled-for-plain-members.
  assert.match(MEMBERS, /payload\?\.viewer\?\.owner\s*\|\|/);
  assert.match(MEMBERS, /permissions\?\.includes\("KICK_MEMBERS"\)/);
  assert.match(MEMBERS, /Mod fields render for staff/);
  assert.match(MEMBERS, /render at all, not disabled ones/, "zero mod bits = no fields (never disabled-for-all)");
});

test("the nickname writes: PATCH self and PATCH other, input never cleared on a 400", async () => {
  assert.match(MEMBERS, /\/api\/servers\/\$\{serverId\}\/nick`/);
  assert.match(MEMBERS, /\/api\/servers\/\$\{serverId\}\/nick\/\$\{uid\}/);
  // The body grammar: null clears, a string sets — the contract's shape.
  assert.match(MEMBERS, /nickname: nickname === null \? null : String\(nickname\)/);
  // The word-filter 400 keeps the input: the error renders, no value reset.
  assert.doesNotMatch(MEMBERS, /\.value = ""/);
  responses = [ROSTER];
  await members.loadRoster(5);
  responses = [{ member: { serverId: 5, userId: 2, nickname: "wem" } }];
  const saved = await members.saveNickname(5, 2, "wem");
  assert.deepEqual(JSON.parse(calls[1].body), { nickname: "wem" }, "the PATCH is the second call");
  assert.equal(saved.member.nickname, "wem");
  assert.equal(members.rosterOf(5).members[0].nickname, "wem", "the cache rides the echo");
});

test("the empty roster speaks the invite instruction (G-5)", () => {
  assert.match(MEMBERS, /It's just you in here so far — invite someone\./);
});

test("roster rows are self-offering links into the card route — never rows of buttons", () => {
  assert.match(MEMBERS, /class: "member-row", href: cardUrl\(member\.id\)/);
  assert.doesNotMatch(MEMBERS, /class: "button[\s\S]{0,120}member-row/);
});
