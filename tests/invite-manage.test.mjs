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

// Wave item 3 — the invite desk (list/revoke) + the mint's lifecycle knobs.
// The pure half (the knob pairs, the row-state predicate) pins behaviorally;
// the wiring (GET list, per-row DELETE, the MANAGE_INVITES door) rides
// source pins with teeth, since node --test has no DOM to drive the dialogs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { INVITE_EXPIRY_OPTIONS, INVITE_USES_OPTIONS, inviteRowCopy } from "../public/js/ui-helpers.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

// --- the pure half ---------------------------------------------------------------

test("the knob pairs ride the server's exact mint window", () => {
  // Expiry: 60s..2592000s (the 30-day shelf), null first (never expires).
  const expiry = INVITE_EXPIRY_OPTIONS.map(([value]) => value);
  assert.equal(expiry[0], null);
  assert.equal(expiry.at(-1), 2592000, "the 30-day shelf is the server's MAX");
  for (const [seconds, label] of INVITE_EXPIRY_OPTIONS) {
    if (seconds === null) { assert.equal(label, "Never expires"); continue; }
    assert.ok(Number.isInteger(seconds) && seconds >= 60, `${label} minutes the window`);
    assert.ok(label.length > 0);
  }
  // Uses: 1..100, unlimited first.
  const uses = INVITE_USES_OPTIONS.map(([value]) => value);
  assert.equal(uses[0], null);
  assert.equal(uses.at(-1), 100, "100 is the server's use-cap MAX");
  for (const [value, label] of INVITE_USES_OPTIONS) {
    if (value === null) assert.equal(label, "Unlimited");
    else assert.ok(value >= 1 && value <= 100);
  }
});

test("inviteRowCopy answers the server's ONE active predicate, in order", () => {
  assert.deepEqual(inviteRowCopy({ revokedAt: 5 }), { text: "Revoked", dead: true },
    "revoked is the first arm");
  assert.deepEqual(inviteRowCopy({ revokedAt: null, maxUses: 5, uses: 5, expiresAt: null }),
    { text: "Used up", dead: true }, "a reached cap is dead");
  assert.deepEqual(inviteRowCopy({ revokedAt: null, maxUses: null, uses: 0,
    expiresAt: Math.floor(Date.now() / 1000) - 1 }), { text: "Expired", dead: true },
    "a lapsed expiry is dead");
  assert.deepEqual(inviteRowCopy({ revokedAt: null, maxUses: null, uses: 3, expiresAt: null }),
    { text: "Live", dead: false });
  assert.deepEqual(inviteRowCopy(null), { text: "Live", dead: false });
  assert.deepEqual(inviteRowCopy({ revokedAt: null, maxUses: 100, uses: 99, expiresAt: null }),
    { text: "Live", dead: false }, "one under the cap is still live");
});

// --- the wiring half --------------------------------------------------------------

test("the mint dialog grew the knobs and posts them; the desk rides the MANAGE_INVITES door", () => {
  const start = APP.indexOf("function inviteDialog");
  const end = APP.indexOf("function openInviteManageDialog", start);
  const dialog = APP.slice(start, end);
  assert.match(dialog, /INVITE_EXPIRY_OPTIONS/, "the expiry select renders the filed pairs");
  assert.match(dialog, /INVITE_USES_OPTIONS/, "the use-cap select renders the filed pairs");
  assert.match(dialog, /maxAgeSeconds: expirySelect\.value === "" \? null : Number\(expirySelect\.value\)/,
    "never rides the null shape the server normalizes");
  assert.match(dialog, /maxUses: usesSelect\.value === "" \? null : Number\(usesSelect\.value\)/);
  // The door is the roster viewer class's, never universal-armed client-side
  // (the server still re-checks the bit).
  assert.match(dialog, /MANAGE_INVITES/);
  assert.match(dialog, /openInviteManageDialog\(doc, win, serverId\)/);
});

test("the desk lists GET and revokes DELETE; only a live row carries the door", () => {
  const desk = APP.slice(APP.indexOf("function openInviteManageDialog"),
    APP.indexOf("function inviteRow", APP.indexOf("function openInviteManageDialog")));
  assert.match(desk, /\/api\/servers\/" \+ serverId \+ "\/invites", \{ method: "GET" \}/);
  assert.match(desk, /"aria-live": "polite"/);
  assert.match(desk, /No invites yet/, "the empty case renders, the section never flickers");
  // The revoke: encodeURIComponent on the wire code, a re-list on success —
  // and the disabled button only comes back on a FAILURE.
  assert.match(APP, /\/invites\/" \+ encodeURIComponent\(String\(invite\.code\)\)/,
    "the code rides the URL encoded");
  const row = APP.slice(APP.indexOf("function inviteRow"), APP.indexOf("function errorMomentNode"));
  const revokeAt = row.indexOf('text: "Revoke"');
  const okAt = row.indexOf("await relist()");
  const failAt = row.indexOf('"The invite could not be revoked."');
  assert.ok(revokeAt > 0 && okAt > revokeAt && failAt > okAt,
    "success re-lists; failure surfaces the server's copy");
  assert.match(row, /if \(!copy\.dead\)/,
    "a dead row answers no revoke door (the server's tombstone stays)");
  assert.match(row, /class: "button button-danger"/, "the tombstone keeps the danger chrome");
});

test("the desk's CSS rides the mod-desk list idiom — tokens only", () => {
  assert.match(CSS, /\.invite-manage-rows \{/);
  assert.match(CSS, /\.invite-manage-row:hover \{ background: var\(--field\); \}/,
    "the same quiet strip-on-hover the mod desk rides");
  const status = CSS.slice(CSS.indexOf(".invite-manage-status {"), CSS.indexOf("}", CSS.indexOf(".invite-manage-status {")));
  assert.match(status, /border-radius:\s*999px/, "the state chip is the forum's small-pill idiom");
  const live = CSS.slice(CSS.indexOf(".invite-manage-status-live {"), CSS.indexOf("}", CSS.indexOf(".invite-manage-status-live {")));
  assert.match(live, /var\(--soft-green\)/, "live answers in the green family");
  const desk = CSS.slice(CSS.indexOf("/* The invite desk"), CSS.length);
  assert.doesNotMatch(desk, /#[0-9a-fA-F]{3,8}\b/, "no raw hex — tokens only");
});
