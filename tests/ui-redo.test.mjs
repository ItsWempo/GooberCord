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

// UI redo (owner structure): pure-helper pins for the workstream's client-side
// pieces — the skin storage read (theme.js), the boost progress label math,
// the invite-code extraction for the create-or-join dialog, and the quick
// switcher's entry building + filtering (all ui-helpers.js). DOM-built pieces
// are deliberately NOT pinned here (node --test has no shell DOM); the pins
// cover exactly what this code computes.

import test from "node:test";
import assert from "node:assert/strict";

import {
  SKINS,
  SKIN_STORAGE_KEY,
  THEME_STORAGE_KEY,
  browserChromeColor,
  resolveSkin,
  resolveTheme,
  readSkinPreference,
  readThemePreference,
} from "../public/js/theme.js";
import {
  BOOST_GOAL,
  boostProgress,
  inviteCodeFromInput,
  switcherEntries,
  filterEntries,
  stripSwitcherPrefix,
} from "../public/js/ui-helpers.js";

// --- skin (theme.js) ----------------------------------------------------------

test("resolveSkin: only 'brand' keeps the warm papers; everything else rides the default discord skin", () => {
  // The owner's mock ruling (2026-11-17): the approved mocks are the
  // discord skin, so the DEFAULT is "discord" — absent, unknown, or junk
  // included. A stored "brand" is the only path to the warm papers.
  assert.equal(resolveSkin("brand"), "brand");
  assert.equal(resolveSkin("discord"), "discord");
  assert.equal(resolveSkin("Brand"), "discord"); // case-sensitive on purpose
  assert.equal(resolveSkin("nord"), "discord");
  assert.equal(resolveSkin(null), "discord");
  assert.equal(resolveSkin(undefined), "discord");
  assert.equal(resolveSkin(""), "discord");
});

test("resolveTheme keeps its contract: a stored choice beats the OS preference", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme(null, false), "light");
  assert.equal(resolveTheme("sepia", true), "dark");
});

test("theme/skin storage keys stay in the GooberCord family", () => {
  assert.equal(THEME_STORAGE_KEY, "goober-theme");
  assert.equal(SKIN_STORAGE_KEY, "goober-skin");
  assert.deepEqual(SKINS, ["brand", "discord"]);
});

// Any storage-shaped object works (theme.js only calls getItem in these
// helpers); the Map-with-getItem fake mirrors real localStorage's contract.
function fakeStorage(entries = []) {
  const map = new Map(entries);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("readThemePreference falls back to the forum's legacy key, never writes it", () => {
  const storage = fakeStorage();
  assert.equal(readThemePreference(storage), null);
  storage.setItem("goober-theme", "dark");
  assert.equal(readThemePreference(storage), "dark");
  storage.setItem("goober-theme", "garbage");
  storage.setItem("forum-theme", "light");
  assert.equal(readThemePreference(storage), "light"); // legacy read
  storage.setItem("goober-theme", "dark");
  assert.equal(readThemePreference(storage), "dark"); // GooberCord's key wins
});

test("readThemePreference treats a blocked store as unmade (the OS preference applies)", () => {
  const storage = {
    getItem() {
      throw new Error("storage blocked");
    },
  };
  assert.equal(readThemePreference(storage), null);
  assert.equal(readSkinPreference(storage), "discord"); // the default skin
});

test("readSkinPreference maps the stored value through resolveSkin", () => {
  const storage = fakeStorage();
  storage.setItem(SKIN_STORAGE_KEY, "discord");
  assert.equal(readSkinPreference(storage), "discord");
  storage.setItem(SKIN_STORAGE_KEY, "bogus");
  assert.equal(readSkinPreference(storage), "discord"); // junk rides the default
  storage.setItem(SKIN_STORAGE_KEY, "brand");
  assert.equal(readSkinPreference(storage), "brand"); // the deliberate warm-keep
});

test("browserChromeColor pairs each skin with its own light/dark chrome", () => {
  assert.equal(browserChromeColor("brand", "light"), "#f7efdc");
  assert.equal(browserChromeColor("brand", "dark"), "#131b27");
  assert.notEqual(browserChromeColor("discord", "dark"), browserChromeColor("brand", "dark"));
  assert.ok(browserChromeColor("discord", "dark")); // a real color, never null
  // An unknown skin resolves to the default discord skin (chrome follows the
  // applied attribute).
  assert.equal(browserChromeColor("unknown-skin", "dark"), browserChromeColor("discord", "dark"));
  assert.equal(browserChromeColor("discord", "midnight"), null);
});

// --- boost progress (ui-helpers.js) -------------------------------------------

test("boostProgress labels n/goal and clamps both non-numbers and overflow", () => {
  assert.deepEqual(
    { value: 3, label: "3/7" },
    { value: boostProgress(3).value, label: boostProgress(3).label },
  );
  assert.equal(boostProgress(0).label, "0/7");
  assert.equal(boostProgress(-2).label, "0/7"); // API noise clamps to zero
  assert.equal(boostProgress(12).value, BOOST_GOAL); // the bar can stay full
  assert.equal(boostProgress(12).label, "7/7");
  assert.equal(boostProgress(2, 5).label, "2/5"); // goal is a caller knob
  assert.equal(boostProgress("4").label, "4/7"); // wire shape is tolerant
  assert.equal(boostProgress(undefined).label, "0/7");
});

test("boostProgress pairs a human title with the bar", () => {
  assert.equal(boostProgress(3).title, "3 of 7 server boosts");
});

// --- create-or-join invite extraction (ui-helpers.js) --------------------------

test("inviteCodeFromInput accepts a bare code and full links both", () => {
  assert.equal(inviteCodeFromInput("AbC_dE-f"), "AbC_dE-f");
  assert.equal(inviteCodeFromInput("https://x.test/#/join/link-code-9"), "link-code-9");
  assert.equal(inviteCodeFromInput(" /join/shorty "), "shorty");
  assert.equal(inviteCodeFromInput("  "), null);
  assert.equal(inviteCodeFromInput("no"), null); // under the 4-char floor
  assert.equal(inviteCodeFromInput("has space"), null);
  assert.equal(inviteCodeFromInput("a".repeat(65)), null); // over the cap
});

// --- quick switcher (ui-helpers.js) --------------------------------------------

const SERVERS = [
  {
    id: 1,
    name: "Wempo HQ",
    channels: [
      { id: 11, name: "general", kind: "text", position: 0 },
      { id: 12, name: "General Information", kind: "text", position: 1 },
      { id: 13, name: "lounge", kind: "voice", position: 2 },
    ],
  },
  {
    id: 2,
    name: "Minecraft",
    channels: [{ id: 21, name: "building", kind: "text", position: 0 }],
  },
];

const CONVERSATIONS = [
  { id: 31, name: "pepper_fan", kind: "dm", unread: 2 },
  { id: 32, name: "the boys", kind: "group", unread: 0 },
];

test("switcherEntries builds rows for DMs/groups first, then channels with their server", () => {
  const entries = switcherEntries(SERVERS, CONVERSATIONS);
  assert.equal(entries.length, 6);
  const building = entries.find((entry) => entry.label === "building");
  assert.deepEqual([building.label, building.kind], ["building", "text"]);
  assert.deepEqual(
    entries.map((entry) => [entry.label, entry.kind]),
    [
      ["pepper_fan", "dm"],
      ["the boys", "group"],
      ["general", "text"],
      ["General Information", "text"],
      ["lounge", "voice"],
      ["building", "text"],
    ],
  );
});

test("switcherEntries writes the canonical hashes (channels keep their server's id)", () => {
  const entries = switcherEntries(SERVERS, CONVERSATIONS);
  const byLabel = new Map(entries.map((entry) => [entry.label, entry]));
  assert.equal(byLabel.get("pepper_fan").hash, "#/c/31");
  assert.equal(byLabel.get("general").hash, "#/s/1/c/11");
  assert.equal(byLabel.get("building").hash, "#/s/2/c/21");
  // Voice channels ride the SERVER hash (open the channel card, not text).
  assert.equal(byLabel.get("lounge").hash, "#/s/1");
});

test("switcherEntries tolerates a cold cache (null lists, junk rows)", () => {
  assert.deepEqual(switcherEntries(null, null), []);
  const junk = switcherEntries([null, { id: "x", channels: [{ id: "y", name: "n", kind: "text" }] }], []);
  assert.equal(junk.length, 0);
});

test("filterEntries: empty query passes rows through; word-wise over label AND sub", () => {
  const entries = switcherEntries(SERVERS, CONVERSATIONS);
  assert.equal(filterEntries("", entries).length, 6);
  assert.equal(filterEntries("   ", entries).length, 6);
  const general = filterEntries("general", entries).map((entry) => entry.label);
  assert.deepEqual(general, ["general", "General Information"]); // case-insensitive
  // A single word can ride the sub (server name) alone.
  assert.deepEqual(
    filterEntries("minecraft", entries).map((entry) => entry.label),
    ["building"],
  );
  // Word-wise pairing: "hq lounge" — one word from the server, one the channel.
  assert.deepEqual(
    filterEntries("hq lounge", entries).map((entry) => entry.label),
    ["lounge"],
  );
  // Words must ALL match somewhere; "general minecraft" matches nothing.
  assert.deepEqual(filterEntries("general minecraft", entries), []);
  assert.deepEqual(
    filterEntries("wempo hq general", entries).map((entry) => entry.label),
    ["general", "General Information"],
  );
  assert.deepEqual(filterEntries("none-of-those", entries), []);
});

test("filterEntries caps results (the dialog never scrolls forever)", () => {
  const many = Array.from({ length: 40 }, (_, index) => ({
    kind: "text",
    label: "channel-" + index,
    sub: "Server",
    hash: "#/s/1/c/" + index,
  }));
  assert.equal(filterEntries("channel-", many).length, 12);
});

test("filterEntries: an empty entry list is safe", () => {
  assert.deepEqual(filterEntries("general", []), []);
  assert.deepEqual(filterEntries("general", undefined), []);
});

// --- quick-switcher prefixes (the addendum's static category filters) ----------

test("stripSwitcherPrefix reads the leading prefix and strips it", () => {
  assert.deepEqual(stripSwitcherPrefix("#general"), { prefix: "#", rest: "general" });
  assert.deepEqual(stripSwitcherPrefix("@pepper"), { prefix: "@", rest: "pepper" });
  assert.deepEqual(stripSwitcherPrefix("!lou"), { prefix: "!", rest: "lou" });
  assert.deepEqual(stripSwitcherPrefix("*hq"), { prefix: "*", rest: "hq" });
  assert.deepEqual(stripSwitcherPrefix("general"), { prefix: null, rest: "general" });
  assert.deepEqual(stripSwitcherPrefix(""), { prefix: null, rest: "" });
  assert.deepEqual(stripSwitcherPrefix(null), { prefix: null, rest: "" });
  assert.deepEqual(stripSwitcherPrefix("#"), { prefix: "#", rest: "" });
});

test("prefixes scope the candidate set (static filters, no token parsing)", () => {
  const entries = switcherEntries(SERVERS, CONVERSATIONS);
  assert.deepEqual(
    filterEntries("@", entries).map((entry) => entry.label),
    ["pepper_fan", "the boys"],
  );
  assert.deepEqual(
    filterEntries("#general", entries).map((entry) => entry.label),
    ["general", "General Information"],
  );
  assert.deepEqual(
    filterEntries("!lou", entries).map((entry) => entry.label),
    ["lounge"],
  );
  assert.deepEqual(filterEntries("!general", entries), []); // a text channel
  assert.deepEqual(filterEntries("@lounge", entries), []); // not a conversation
});

test("the '*' scope searches SERVER names only", () => {
  const entries = switcherEntries(SERVERS, CONVERSATIONS);
  assert.deepEqual(
    filterEntries("*hq", entries).map((entry) => entry.label),
    ["general", "General Information", "lounge"], // Wempo HQ's channels
  );
  assert.deepEqual(
    filterEntries("*minecraft", entries).map((entry) => entry.label),
    ["building"], // Minecraft's channels (the channel name is NOT the hay)
  );
  assert.deepEqual(filterEntries("*building", entries), []); // channel word ignored
  assert.deepEqual(filterEntries("*pepper_fan", entries), []); // no DMs under "*"
});
