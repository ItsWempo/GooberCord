// Frontend routing pins for discovery + invites: parseHash/hashFor gains the
// "#/discover" and "#/join/CODE" routes (with the app-shell fallback for
// malformed codes), plus the signed-out invite stash — sessionStorage with a
// 10-minute TTL, consumed exactly once.
import test from "node:test";
import assert from "node:assert/strict";

import {
  hashFor,
  parseHash,
  PENDING_INVITE_TTL_MS,
  stashPendingInvite,
  takePendingInvite,
} from "../public/js/chat-store.js";

function fakeWin() {
  const store = new Map();
  return {
    sessionStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
}

// --- parseHash ------------------------------------------------------------------

test("#/discover parses to the discover route", () => {
  assert.deepEqual(parseHash("#/discover"), { name: "discover" });
  assert.deepEqual(parseHash("discover"), { name: "discover" });
});

test("#/join/CODE parses to the join route with its code", () => {
  assert.deepEqual(parseHash("#/join/AbC_dE-f"), { name: "join", code: "AbC_dE-f" });
});

test("malformed join codes fall back to the app shell", () => {
  assert.deepEqual(parseHash("#/join/x"), { name: "app", serverId: null, channelId: null });
  assert.deepEqual(parseHash("#/join/also-bad/code"), { name: "app", serverId: null, channelId: null });
  assert.deepEqual(parseHash("#/join/a b c"), { name: "app", serverId: null, channelId: null });
  assert.deepEqual(parseHash("#/join/" + "z".repeat(65)), { name: "app", serverId: null, channelId: null });
});

test("existing routes still parse the same way", () => {
  assert.deepEqual(parseHash("#/"), { name: "app", serverId: null, channelId: null });
  assert.deepEqual(parseHash("#/s/4"), { name: "app", serverId: 4, channelId: null });
  assert.deepEqual(parseHash("#/login"), { name: "login" });
  assert.deepEqual(parseHash("#/review"), { name: "review" });
});

// --- hashFor --------------------------------------------------------------------

test("hashFor knows the discover and join targets", () => {
  assert.equal(hashFor({ name: "discover" }), "#/discover");
  assert.equal(hashFor({ name: "join", code: "AbC_dE-f" }), "#/join/AbC_dE-f");
  // A malformed code never produces a broken link.
  assert.equal(hashFor({ name: "join", code: "bad code" }), "#/");
});

test("hashFor still routes app targets", () => {
  assert.equal(hashFor({ name: "app", serverId: 3 }), "#/s/3");
  assert.equal(hashFor({ name: "app" }), "#/");
});

// --- signed-out invite stash ------------------------------------------------------

test("a stashed invite code survives the login bounce and is consumed once", () => {
  const win = fakeWin();
  stashPendingInvite(win, "Goober12", 1000);
  assert.equal(takePendingInvite(win, 1000 + 60000), "Goober12");
  assert.equal(takePendingInvite(win, 1000 + 61000), null);
  // Consumed even on a miss: nothing lingers in the session.
  assert.equal(takePendingInvite(win, 1000 + 62000), null);
});

test("a stashed invite expires after ten minutes", () => {
  const win = fakeWin();
  stashPendingInvite(win, "Goober12", 1000);
  assert.equal(PENDING_INVITE_TTL_MS, 10 * 60 * 1000);
  assert.equal(takePendingInvite(win, 1000 + PENDING_INVITE_TTL_MS), "Goober12");

  const win2 = fakeWin();
  stashPendingInvite(win2, "Goober12", 1000);
  assert.equal(takePendingInvite(win2, 1000 + PENDING_INVITE_TTL_MS + 1), null);
});

test("a malformed or absent stash reads as null and never throws", () => {
  const win = fakeWin();
  assert.equal(takePendingInvite(win), null);

  win.sessionStorage.setItem("goober-pending-invite", "{not json");
  assert.equal(takePendingInvite(win, 5), null);

  // A well-formed entry with a bad code shape is also a miss (consumed).
  win.sessionStorage.setItem(
    "goober-pending-invite",
    JSON.stringify({ code: "bad code", at: 4 }),
  );
  assert.equal(takePendingInvite(win, 5), null);

  // stashPendingInvite refuses malformed codes too.
  const win2 = fakeWin();
  stashPendingInvite(win2, "bad code", 1);
  assert.equal(takePendingInvite(win2, 2), null);
});
