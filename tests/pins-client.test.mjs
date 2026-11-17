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

// The pins lane's client half (W-F2): the pinned read, the pin-right
// mirror, and the pinned-messages dialog. This file pins the mirror (the
// bit equality + the backend pinRights's exact decision table, decided in
// the same order), the route words, the cap discipline (the over-cap
// refusal is the server's own copy — never restated), and — as far as the
// node harness allows — the real dialog ride: rows mount from the payload,
// unpin affordances ride the same mirror, the DELETE is idempotent, and a
// mutation rerenders the list.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SERVER_PERMISSIONS } from "../api/permissions.mjs";

import {
  DELETE_MESSAGES_BIT,
  canPin,
  loadPinnedMessages,
  openPinnedMessagesDialog,
} from "../public/js/pins.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const MODULE = readFileSync(path.join(ROOT, "public/js/pins.js"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

const ME = { id: 7, role: "member" };
const MESSAGE = { id: 10, authorId: 7, body: "hello" };
const FOREIGN = { id: 11, authorId: 9, body: "theirs" };

test("the mirror rides the backend's own bit", () => {
  assert.equal(DELETE_MESSAGES_BIT, SERVER_PERMISSIONS.DELETE_MESSAGES,
    "GC carries no separate pin bit — the moderation grant moves with pins");
  assert.equal(SERVER_PERMISSIONS.DELETE_MESSAGES, 1 << 4);
});

test("the pin-right mirror is the backend's pinRights, in the same order", () => {
  const decides = (args) => canPin(args.message, args.me, args.server, args.viewer);
  // Own-message pins, both directions — even without any roster.
  assert.ok(decides({ message: MESSAGE, me: ME, server: null, viewer: null }));
  // Platform staff.
  assert.ok(decides({ message: FOREIGN, me: { id: 3, role: "owner" }, server: null, viewer: null }));
  assert.ok(decides({ message: FOREIGN, me: { id: 3, role: "admin" }, server: null, viewer: null }));
  // DM/group arm (server null): a non-own, non-staff member does NOT pin.
  assert.ok(!decides({ message: FOREIGN, me: ME, server: null, viewer: null }));
  // Server tiers.
  assert.ok(decides({ message: FOREIGN, me: ME,
    server: { role: "owner" }, viewer: null }));
  assert.ok(decides({ message: FOREIGN, me: ME,
    server: { role: "moderator" }, viewer: null }));
  // The merged bit.
  assert.ok(decides({ message: FOREIGN, me: ME,
    server: { role: "member" }, viewer: { owner: false, permissions: ["DELETE_MESSAGES"] } }));
  assert.ok(!decides({ message: FOREIGN, me: ME,
    server: { role: "member" }, viewer: { owner: false, permissions: ["KICK_MEMBERS"] } }));
  assert.ok(decides({ message: FOREIGN, me: ME,
    server: { role: "member" }, viewer: { owner: true, permissions: [] } }),
    "a roster owner passes like the delete always has");
  // The unknown-roster arm ADMITS (the mention gate's spirit: an unloaded
  // roster never warns falsely; the server's 403 stays the authority).
  assert.ok(decides({ message: FOREIGN, me: ME,
    server: { role: "member" }, viewer: null }));
  // Junk is quiet.
  assert.ok(!canPin(null, ME, { role: "member" }, null));
  assert.ok(!canPin(MESSAGE, null, { role: "owner" }, null));
});

test("the route words: the idempotent pin ride, the newest-first read", () => {
  assert.match(MODULE, /"\/api\/messages\/" \+ Number\(message\.id\) \+ "\/pin"/);
  assert.match(MODULE, /method: "DELETE"/, "the unpin rider in the dialog");
  assert.match(MODULE, /"\/api\/channels\/" \+ Number\(channelId\) \+ "\/pins"/);
  // The list payload is the payload's own, never assumed.
  assert.match(MODULE, /(Array\.isArray|payload\?\.messages)/);
  // The list route answers newest-first; the client renders it verbatim.
  assert.match(APP, /openPinnedMessagesDialog\(doc, win, channelId,/);
  const pinsList = APP.slice(APP.indexOf("const pinsList = iconButton"),
    APP.indexOf("const pinsList = iconButton") + 700);
  assert.match(pinsList, /ariaLabel: "Pinned messages"/);
  assert.match(pinsList, /me: state\.currentUser/);
  assert.match(pinsList, /viewer: \(\) => context\?\.server \? \(currentRoster\(context\.server\.id\)\?\.viewer \|\| null\) : null,/);
  // The row affordance rides the SAME mirror and the PUT.
  const pinRow = APP.slice(APP.indexOf("// The pin affordance (the W-F2 wave)"),
    APP.indexOf("// The pin affordance (the W-F2 wave)") + 900);
  assert.match(pinRow, /if \(canPin\(message, me, pinContext\?\.server \|\| null,/);
  assert.match(pinRow, /ariaLabel: "Pin message"/);
  const ride = APP.slice(APP.indexOf("async function pinRideMessage"),
    APP.indexOf("async function pinRideMessage") + 700);
  assert.match(ride, /method: "PUT"/, "the pin ride is the PUT — idempotent by the repeat precedent");
  assert.match(ride, /activeView\?\.composerError/, "a refusal surfaces in the channel's shared strip");
  assert.match(ride, /caught\?\.message \|\| "The message could not be pinned\."/);
});

test("the cap NEVER lives client-side: no slot counts, no restated refusal copy", () => {
  // The scans ride comment-stripped code: the module's header may CITE the
  // server's wire copy as documentation, but no CODE may restate it.
  const codeOnly = MODULE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/\b250\b/.test(codeOnly), "the cap is the server's");
  assert.ok(!/already has/.test(codeOnly),
    "the over-cap copy is the server's own refusal, surfaced verbatim on the wire");
  assert.match(MODULE, /caught\?\.message \|\| "The pin could not be removed\."/,
    "the dialog's catch answers the wire's own copy");
  // CSP-safe DOM.
  assert.ok(!/innerHTML/.test(MODULE));
  assert.match(MODULE, /import \{ el \} from "\.\/dom\.js";/);
});

// A permissive element stub — the el()/createIcon factories ride it;
// listeners record onto the node so the test can click them.
function stubElement(tagName = "") {
  return {
    tagName, className: "", textContent: "", value: "", hidden: false, kids: [],
    dataset: {}, handlers: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); },
    append(child) { this.kids.push(child); },
    prepend() {},
    replaceChildren() { this.kids = []; }, remove() {},
    showModal() {}, close() {},
    querySelector() { return stubElement(); },
    querySelectorAll() { return []; },
    isConnected: true, style: {},
  };
}

const click = (node, name = "click") => node.handlers[name]?.[0]();

const findClass = (node, cls, out = []) => {
  if (typeof node === "object" && node !== null) {
    // The walk rides the CLASS LIST, not a whole-attribute equality —
    // compound classes (icon-button button-quiet pin-unpin) are the norm.
    if (String(node.className).split(" ").includes(cls)) out.push(node);
    for (const kid of node.kids || []) findClass(kid, cls, out);
  }
  return out;
};

const listBody = (dialog) => findClass(dialog, "pins-list")[0];

test("the real dialog ride: rows mount, the mirror gates the unpins, the DELETE rerenders", async () => {
  const { useDocument } = await import("../public/js/vendor/dom.mjs");
  const seen = [];
  let removedId = null;
  globalThis.fetch = async (path, init = {}) => {
    seen.push([init.method || "GET", String(path)]);
    const json = (payload, status = 200) => new Response(JSON.stringify(payload),
      { status, headers: { "content-type": "application/json" } });
    if (String(path).endsWith("/pins") && (init.method || "GET") === "GET") {
      return json({ messages: rows });
    }
    if (/\/api\/messages\/[0-9]+\/pin$/.test(String(path)) && init.method === "DELETE") {
      removedId = Number(String(path).match(/\/api\/messages\/([0-9]+)\/pin/)[1]);
      const at = rows.findIndex((entry) => Number(entry.id) === removedId);
      if (at >= 0) rows.splice(at, 1);
      return json({ pinned: false, id: removedId });
    }
    return json({ error: "That API endpoint does not exist." }, 404);
  };
  // Two pins: the viewer's OWN message and a foreign one. A plain member's
  // context: only the own row carries the unpin affordance.
  let rows = [
    { id: 10, authorId: 7, authorName: "Wem", body: "mine", attachmentIds: [5] },
    { id: 11, authorId: 9, authorName: "Other", body: "theirs", attachmentIds: [] },
  ];
  let dialog = null;
  const docStub = {
    body: { append: (kid) => { dialog = kid; } },
    createElement: (tag) => stubElement(tag),
    createElementNS: () => stubElement(),
  };
  useDocument(docStub);
  try {
    const me = ME;
    let mutated = 0;
    // The context: viewer() resolves the merged mask the way the view's
    // caller does.
    openPinnedMessagesDialog(docStub, {}, 3, {
      me,
      server: { role: "member" },
      viewer: () => ({ owner: false, permissions: [] }),
    }, async () => { mutated += 1; });
    assert.ok(dialog, "the dialog mounted");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(seen[0], ["GET", "/api/channels/3/pins"]);
    let pinRows = findClass(dialog, "pin-row");
    assert.equal(pinRows.length, 2, "both mounts ride");
    assert.equal(findClass(dialog, "pin-unpin").length, 1,
      "a plain member unpins only the OWN row (the mirror's own arm)");
    assert.deepEqual(findClass(dialog, "pin-body").map((node) => node.textContent),
      ["mine", "theirs"], "the bodies ride textContent");
    assert.equal(findClass(dialog, "pin-note")[0]?.textContent, "1 attachment",
      "the attachment note reads the payload's own ids");
    // The unpin click: the DELETE rides, the row leaves, the caller's sync
    // is notified, and the rerender keeps one row.
    click(findClass(dialog, "pin-unpin")[0]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(removedId, 10, "the DELETE rode the own row's id");
    assert.equal(mutated, 1, "the mutation notified the caller's sync");
    pinRows = findClass(dialog, "pin-row");
    assert.equal(pinRows.length, 1, "and the list rerendered in place");
  } finally {
    delete globalThis.fetch;
    useDocument(null);
  }
});

test("the read answers the payload's own shape: rows verbatim", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    messages: [{ id: 10, authorId: 7, body: "b" }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const rows = await loadPinnedMessages(3);
    assert.deepEqual(rows.map((row) => row.id), [10], "the rows are the payload's own");
  } finally {
    delete globalThis.fetch;
  }
});

test("the dialog's CSS rides tokens: the manage dialog's idiom, nothing raw", () => {
  assert.match(CSS, /\.pins-dialog \{/);
  assert.match(CSS, /\.pins-list \{/);
  assert.match(CSS, /\.pin-row-head \{/);
  assert.match(CSS, /var\(--line\)/, "the row border rides the line token");
  const block = CSS.slice(CSS.indexOf("/* The pins dialog"),
    CSS.indexOf(".pin-body {") + 40);
  assert.ok(!/#/.test(block), "no hex colors ride the pins block");
});
