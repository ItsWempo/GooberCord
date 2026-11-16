// api/permissions.mjs — the pure overwrite resolution walk (the filed
// evaluation algorithm) and the graceful-default gate question. The contract
// under test: one bitmask out of (the member's role rows, the channel's layer
// chain), evaluated in the pinned order
//   @everyone deny -> @everyone allow ->
//   category role denies -> category role allows ->
//   channel role denies -> channel role allows
// with role_id NULL as the @everyone sentinel and the member-specific tier
// deliberately unrepresentable in the input.
import test from "node:test";
import assert from "node:assert/strict";

import {
  effectivePermissions,
  IMPLICIT_BASE_PERMISSIONS,
  OVERWRITE_BITS,
  overwritesTouchDeny,
  permissionNames,
  SLOWMODE_CHOICES,
  SERVER_PERMISSIONS,
} from "../api/permissions.mjs";

const SP = SERVER_PERMISSIONS;
const V = SP.VIEW, SE = SP.SEND, C = SP.CONNECT, SK = SP.SPEAK;

// row builders: the fake gc_channel_overwrites rows are exactly the evaluator's
// contract (layer ids + the two masks; everything else inert).
function channelRow(roleId, allow, deny) {
  return { channel_id: 90, category_id: null, role_id: roleId, allow_mask: allow, deny_mask: deny };
}
function categoryRow(roleId, allow, deny) {
  return { channel_id: null, category_id: 12, role_id: roleId, allow_mask: allow, deny_mask: deny };
}
function foreignRow(roleId, allow, deny) {
  // A row for a DIFFERENT channel: never applies (the caller's layer chain
  // would not include it; the evaluator treats it as inert either way).
  return { channel_id: 91, category_id: null, role_id: roleId, allow_mask: allow, deny_mask: deny };
}

function role(id, permissions) {
  return { id, permissions };
}

test("the bit vocabulary: the shipped bits keep their values, the new ones slot after", () => {
  assert.equal(SP.MANAGE_CHANNELS, 1);
  assert.equal(SP.MANAGE_ROLES, 2);
  assert.equal(SP.KICK_MEMBERS, 4);
  assert.equal(SP.MANAGE_INVITES, 8);
  assert.equal(SP.DELETE_MESSAGES, 16);
  assert.equal(SP.VIEW, 32);
  assert.equal(SP.SEND, 64);
  assert.equal(SP.CONNECT, 128);
  assert.equal(SP.SPEAK, 256);
  assert.equal(SP.BYPASS_SLOWMODE, 512);
  // The overwrite layers' editable bits are exactly the four channel powers.
  assert.deepEqual(OVERWRITE_BITS, [V, SE, C, SK]);
  // Discord's slowmode menu is the column-value contract.
  assert.deepEqual(SLOWMODE_CHOICES, [0, 900, 1800, 3600, 7200, 21600]);
});

test("the implicit base: a roleless member with no overwrites reads VIEW + SEND", () => {
  assert.equal(IMPLICIT_BASE_PERMISSIONS, V | SE);
  assert.deepEqual(permissionNames(effectivePermissions([], [])), ["VIEW", "SEND"]);
  assert.equal(effectivePermissions(null, undefined), V | SE, "null/absent inputs degrade");
});

test("the server-wide layer: role bits merge on top of the implicit base", () => {
  const mask = effectivePermissions([role(4, SP.MANAGE_CHANNELS), role(5, SP.KICK_MEMBERS)], []);
  assert.deepEqual(permissionNames(mask).sort(), ["KICK_MEMBERS", "MANAGE_CHANNELS", "SEND", "VIEW"].sort());
  // A zero-permission role adds nothing.
  assert.equal(effectivePermissions([role(9, 0)], []), V | SE);
});

test("an @everyone deny flips implicit bits off; a later allow re-grants", () => {
  // deny SEND for everyone on the channel: the plain member loses only SEND.
  const denied = effectivePermissions([role(5, 0)], [channelRow(null, 0, SE)]);
  assert.deepEqual(permissionNames(denied), ["VIEW"]);
  // an allow AFTER a deny re-grants: the same row's allow (the deny-first,
  // allow-second read within one layer) — and a channel-layer allow beats a
  // category-layer deny.
  const row = channelRow(null, 0, SE);
  row.allow_mask = SE;
  assert.equal(effectivePermissions([], [row]), V | SE, "allow wins within one row");
  const regranted = effectivePermissions([role(5, 0)], [
    categoryRow(null, 0, SE),
    channelRow(5, SE, 0),
  ]);
  assert.deepEqual(permissionNames(regranted), ["VIEW", "SEND"],
    "a channel-layer allow re-grants what a category-layer deny took");
  // ...but only for holders: an unrelated role's allow does nothing here.
  const others = effectivePermissions([role(7, 0)], [
    categoryRow(null, 0, SE),
    channelRow(9, SE, 0),
  ]);
  assert.deepEqual(permissionNames(others), ["VIEW"]);
});

test("an @everyone allow lifts bits beyond the implicit base onto everyone", () => {
  const mask = effectivePermissions([role(5, 0)], [channelRow(null, SP.MANAGE_INVITES, 0)]);
  assert.ok(mask & SP.MANAGE_INVITES, "everyone-layer allows ride the same evaluator");
  assert.ok(!(mask & SP.KICK_MEMBERS), "…and nothing it does not allow");
});

test("the order is denies-then-allows WITHIN one layer, and category before channel", () => {
  // Category: role 5 denied SEND; channel: role 5 allowed SEND → send stands
  // (channel is the LAST allow).
  const up = effectivePermissions([role(5, 0)], [
    categoryRow(5, 0, SE),
    channelRow(5, SE, 0),
  ]);
  assert.ok(up & SE);
  // Reversed: channel denies, category allows → deny wins (the channel
  // layer's deny applies after the category layer's allow).
  const down = effectivePermissions([role(5, 0)], [
    categoryRow(5, SE, 0),
    channelRow(5, 0, SE),
  ]);
  assert.ok(!(down & SE), "a later channel-layer deny beats an earlier category allow");
});

test("an @everyone deny + a role allow is the private/announcement pattern", () => {
  // deny VIEW to everyone on the category; allow VIEW for role 4 on the same
  // category (the filed team-private pattern).
  const chain = [categoryRow(null, 0, V), categoryRow(SP.MANAGE_ROLES === 2 ? 4 : 4, V, 0)];
  const holder = effectivePermissions([role(4, 0)], chain);
  const stranger = effectivePermissions([role(6, 0), ], chain);
  const roleless = effectivePermissions([], chain);
  assert.deepEqual(permissionNames(holder), ["VIEW", "SEND"]);
  assert.deepEqual(permissionNames(stranger), ["SEND"], "VIEW denied, SEND implicit");
  assert.deepEqual(permissionNames(roleless), ["SEND"]);
});

test("role rows only bind their holders; the @everyone sentinel binds everyone", () => {
  const chain = [
    channelRow(null, 0, C), // everyone: connect denied
    channelRow(4, C, 0), // role 4: connect re-granted
  ];
  assert.ok(effectivePermissions([role(4, 0)], chain) & C, "holder talks");
  assert.ok(!(effectivePermissions([role(8, 99)], chain) & C), "another role's holder doesn't");
  assert.ok(!(effectivePermissions([], chain) & C), "the roleless fall to the sentinel");
});

test("layers are classified by row shape: category_id-set rows walk first, channel rows last", () => {
  // The caller passes the channel's LAYER CHAIN (its rows plus its
  // category's) — row SHAPE is what separates the layers, so a row with a
  // category_id takes the category slot no matter what its channel_id says.
  const chain = [
    { channel_id: 999, category_id: 12, role_id: 5, allow_mask: 0, deny_mask: SE },
    channelRow(5, SE, 0), // the channel layer re-grants
  ];
  assert.deepEqual(permissionNames(effectivePermissions([role(5, 0)], chain)), ["VIEW", "SEND"]);
  const categoryChain = [categoryRow(null, SP.DELETE_MESSAGES, 0)];
  assert.ok(effectivePermissions([role(4, 0)], categoryChain) & SP.DELETE_MESSAGES,
    "an @everyone category allow rides the category layer");
});

test("a channel chain carries BOTH kinds of rows; only the chain's shapes apply", () => {
  const chain = [
    categoryRow(5, 0, SE), // category: role 5 denied send
    channelRow(5, SE, 0), // channel: role 5 allowed send
  ];
  const mask = effectivePermissions([role(5, 0)], chain);
  assert.deepEqual(permissionNames(mask), ["VIEW", "SEND"]);
});

test("malformed rows never crash the walk (the graceful-default promise)", () => {
  const weird = [null, undefined, 7, "x", {}];
  assert.equal(effectivePermissions([], weird), V | SE);
  const mask = effectivePermissions(
    [role(4, SP.SPEAK)],
    [channelRow(null, 0, V), null],
  );
  assert.deepEqual(permissionNames(mask), ["SEND", "SPEAK"]);
});

test("overwritesTouchDeny: the graceful-default gate's one question", () => {
  // No rows, no denies: untouched.
  assert.equal(overwritesTouchDeny([], []), false);
  assert.equal(overwritesTouchDeny(null, undefined), false);
  // A deny binding the viewer's role touches them …
  assert.equal(overwritesTouchDeny([role(4, 0)], [channelRow(4, 0, SE)]), true);
  // … the @everyone deny touches EVERY member …
  assert.equal(overwritesTouchDeny([], [categoryRow(null, 0, V)]), true);
  // … a role-only deny does NOT touch a viewer holding other roles …
  assert.equal(overwritesTouchDeny([role(6, 0)], [channelRow(4, 0, SE)]), false);
  // … and allows-only rows never touch anyone.
  assert.equal(overwritesTouchDeny([role(4, 0)], [channelRow(4, SE, 0)]), false);
  assert.equal(overwritesTouchDeny([role(4, 0)], [channelRow(null, SE, 0)]), false);
});

test("the private-channel shape walks as filed: everyone-deny VIEW, per-role allows", () => {
  // What the channel-create private toggle writes: deny VIEW @everyone, and
  // one allow-VIEW row per role (role 5 here; role 6 got nothing).
  const chain = [
    channelRow(null, 0, V),
    channelRow(5, V, 0),
  ];
  assert.deepEqual(permissionNames(effectivePermissions([role(5, 0)], chain)), ["VIEW", "SEND"]);
  assert.deepEqual(permissionNames(effectivePermissions([role(6, 0)], chain)), ["SEND"]);
  assert.deepEqual(permissionNames(effectivePermissions([], chain)), ["SEND"]);
  // And the deny is exactly what makes the sidebar vanish rule fire for the
  // plain members (overwritesTouchDeny + the VIEW miss).
  assert.equal(overwritesTouchDeny([role(6, 0)], chain), true);
  const stranger = effectivePermissions([role(6, 0)], chain);
  assert.equal((stranger & V) === 0, true, "VIEW miss → the 404, not the 403");
});
