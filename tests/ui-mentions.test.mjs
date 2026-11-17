// The mentions inbox: a rail item with the count pill (never a bell — the
// button law), the /mentions route, dismiss by MESSAGE id, and the 0028
// contingency (unlanded backend → quiet rail state + inline route error,
// never a fabricated list).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const calls = [];
let responses = [];
globalThis.fetch = async (path, init = {}) => {
  calls.push({ path, method: init.method || "GET" });
  const response = responses.shift();
  return new Response(typeof response === "string" ? response : JSON.stringify(response),
    { status: response?.status ?? 200 });
};

const mentions = await import("../public/js/ui/mentions.js");
const store = (await import("../public/js/core/store.js")).default;
const MENTIONS = readFileSync(join(HERE, "../public/js/ui/mentions.js"), "utf8");
const SHELL = readFileSync(join(HERE, "../public/js/ui/shell.js"), "utf8");
const MAIN = readFileSync(join(HERE, "../public/js/main.js"), "utf8");

test.beforeEach(() => {
  calls.length = 0;
  responses = [];
  store.reset();
});

test("the inbox loads into the store; the pill's count IS the list length", async () => {
  responses = [{ mentions: [
    { messageId: 1, channelId: 4, channelName: "general", channelKind: "text",
      authorId: 2, authorUsername: "wempo", body: "hi @me", createdAt: "x", mentionedAt: "y" },
  ] }];
  const list = await mentions.loadMentions();
  assert.equal(list.length, 1);
  assert.equal(store.get("mentions").length, 1);
});

test("dismiss rides the message-id shape (the deprecated endpoint's), then refetches", async () => {
  responses = [{ deleted: true }, { mentions: [] }];
  await mentions.dismissMention(12);
  assert.equal(calls[0].path, "/api/mentions/12");
  assert.equal(calls[0].method, "DELETE");
  assert.deepEqual(store.get("mentions"), [], "the refetch replaces the list; empty renders the empty state");
});

test("the 0028 contingency: no fabricated list when the backend hasn't landed", async () => {
  responses = [{ error: "Route not found.", status: 404 }, null];
  await mentions.loadMentions().catch(() => {});
  assert.equal(store.get("mentions"), undefined,
    "the store stays empty; the route page renders the error string inline");
  assert.match(MENTIONS, /error\.message/, "the catch surfaces the payload text");
});

test("the rail item is TEXT + a count pill — no bell icon anywhere", () => {
  // Comments tell the law; the pin sees only the code.
  const codeOnly = SHELL.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(codeOnly, /mentions-item/);
  assert.match(codeOnly, /count-pill/);
  assert.doesNotMatch(codeOnly, /bell|🔔/i);
  assert.match(MAIN, /addRoute\("\/mentions", "mentions", renderMentions\)/);
});

test("rows guard for the shape: dm/group rows link, server rows are text (no serverId to link)", () => {
  assert.match(MENTIONS, /channelKind === "dm" \|\| mention\.channelKind === "group"/);
  assert.match(MENTIONS, /0028 shape/, "the backend gap (serverId) is documented, not hidden");
  assert.doesNotMatch(MENTIONS, /\bfetch\(/);
});
