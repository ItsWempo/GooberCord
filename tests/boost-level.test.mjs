// The boost LEVEL resolver (0023, the 2026-11-17 matrix): floor thresholds
// ascending over gc_servers' recount-derived boosts counter, one shared read,
// and the effective caps shaped as max(base, level) so a level can never
// LOWER an inventory — the matrix's L1/L2 sticker blessings read below 0020's
// shipped base of 50. Static pins ride the constants; real behavior rides a
// fake GOOBER_DB whose first() answers the server's boosts count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GC_BOOST_LEVELS, GC_EMOJI_MAX_PER_SERVER, GC_SOUNDBOARD_MAX_PER_SERVER, GC_STICKER_MAX_PER_SERVER } from "../constants.mjs";
import { LEVEL_BASE_CAPS, boostLevelFor, serverBoostTier } from "../api/boost-level.mjs";

const envWithBoosts = (boosts) => ({
  GOOBER_DB: {
    prepare() {
      return { bind: () => ({ first: async () => ({ boosts }) }) };
    },
  },
});

test("the constants matrix carries the matrix verbatim, frozen and ascending", () => {
  assert.deepEqual(
    GC_BOOST_LEVELS.map((entry) => [entry.level, entry.boosts]),
    [[1, 2], [2, 7], [3, 14]],
    "L1 at 2 boosts, L2 at 7, L3 at 14 — the ascending floors",
  );
  const want = [
    { emoji: 100, stickers: 15, soundboard: 24, streamHeight: 720, streamFps: 60, audioBitrate: 128, uploadBytes: 10_485_760, stageSeats: 50, animatedIcon: true, inviteBackground: true, staticBanner: false, roleIcons: false, animatedBanner: false, customInviteLink: false },
    { emoji: 150, stickers: 30, soundboard: 36, streamHeight: 1440, streamFps: 60, audioBitrate: 256, uploadBytes: 52_428_800, stageSeats: 150, animatedIcon: true, inviteBackground: true, staticBanner: true, roleIcons: true, animatedBanner: false, customInviteLink: false },
    { emoji: 250, stickers: 60, soundboard: 48, streamHeight: 1440, streamFps: 60, audioBitrate: 384, uploadBytes: 104_857_600, stageSeats: 300, animatedIcon: true, inviteBackground: true, staticBanner: true, roleIcons: true, animatedBanner: true, customInviteLink: true },
  ];
  for (const [entry, wanted] of GC_BOOST_LEVELS.map((e, i) => [e, want[i]])) {
    for (const [key, value] of Object.entries(wanted)) {
      assert.equal(entry[key], value, `L${entry.level}.${key} rides the matrix verbatim`);
    }
  }
  for (const entry of GC_BOOST_LEVELS) assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(GC_BOOST_LEVELS), true);
});

test("boostLevelFor floors: below 2 is level 0, and every threshold is the floor", () => {
  const cases = [[0, 0], [1, 0], [2, 1], [6, 1], [7, 2], [13, 2], [14, 3], [15, 3], [9999, 3]];
  for (const [boosts, level] of cases) {
    assert.equal(boostLevelFor(boosts), level, `${boosts} boosts -> level ${level}`);
  }
});

test("level 0 answers the shipped base caps and a null levelPerks entry", async () => {
  const tier = await serverBoostTier(envWithBoosts(0), 1);
  assert.deepEqual(tier.caps, {
    emoji: GC_EMOJI_MAX_PER_SERVER,
    stickers: GC_STICKER_MAX_PER_SERVER,
    soundboard: GC_SOUNDBOARD_MAX_PER_SERVER,
  });
  assert.equal(tier.levelPerks, null);
  assert.equal(tier.level, 0);
});

test("effective caps are max(base, level) — a level never lowers an inventory", async () => {
  // The soundboard opens at level 1 (0 -> 24): the only cap the matrix LIFTS
  // from the base.
  const l1 = await serverBoostTier(envWithBoosts(2), 1);
  assert.deepEqual(l1.caps, { emoji: 100, stickers: GC_STICKER_MAX_PER_SERVER, soundboard: 24 });
  assert.equal(l1.level, 1);
  assert.equal(l1.caps.stickers, 50, "the matrix's 15-seat L1 sticker blessing reads below 0020's shipped base of 50 — max() holds the base");

  const l2 = await serverBoostTier(envWithBoosts(7), 1);
  assert.deepEqual(l2.caps, { emoji: 150, stickers: GC_STICKER_MAX_PER_SERVER, soundboard: 36 });

  const l3 = await serverBoostTier(envWithBoosts(14), 1);
  assert.deepEqual(l3.caps, { emoji: 250, stickers: 60, soundboard: 48 });
  assert.equal(l3.levelPerks.customInviteLink, true);
});

test("the resolver's one read is the recount-trueful boosts column by PK", async () => {
  const seen = [];
  const env = {
    GOOBER_DB: {
      prepare(sql) {
        seen.push(sql);
        return {
          bind: (...bound) => {
            seen.push(bound[0]);
            return { first: async () => ({ boosts: 14 }) };
          },
        };
      },
    },
  };
  const tier = await serverBoostTier(env, 42);
  assert.equal(tier.level, 3);
  assert.equal(tier.boosts, 14);
  assert.match(seen[0], /SELECT boosts FROM gc_servers WHERE id = \? LIMIT 1/);
  assert.equal(seen[1], 42, "one numeric bind, no aggregation at the call site");
  assert.equal(seen.length, 2, "the resolver makes exactly one query");
});

test("LEVEL_BASE_CAPS exports the base triple the max() shape floors on", () => {
  assert.deepEqual(LEVEL_BASE_CAPS, {
    emoji: GC_EMOJI_MAX_PER_SERVER,
    stickers: GC_STICKER_MAX_PER_SERVER,
    soundboard: GC_SOUNDBOARD_MAX_PER_SERVER,
  });
});
