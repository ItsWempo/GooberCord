// Import pin: migrations/import-from-forum.sql copies forum chat/DM history
// into GooberCord's gc_* tables on the SHARED wempo-forum-data D1. The file
// runs with `npm run db:import:forum:local`, so it is checked statically here
// the same way migration-scoping.test.mjs checks migration 0001:
//
//   (a) every statement targets a gc_* object (forum tables are READ-only
//       sources in subqueries, never write targets),
//   (b) every gc_messages import is idempotent through the
//       (channel_id, author_id, client_message_id) UNIQUE key using the
//       'import-chat-<id>' / 'import-dm-<id>' sentinels,
//   (c) the archive channel literal is 'forum-archive',
//   (d) the server owner resolves as the first admin by created_at.
//
// The body-cap test parses the FORUM schema constants (no live DB) to prove
// imported bodies can never violate gc_messages CHECK(length <= 2000).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { statementsOf, classify } from "./migration-scoping.test.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT_SQL = path.join(ROOT, "migrations", "import-from-forum.sql");
const FORUM_CHAT_SQL = "/Users/itswempo/wempos-forum/migrations/0032_presence_chat.sql";

const sql = () => readFileSync(IMPORT_SQL, "utf8");
// Leading-comment blocks stay attached under the wrangler-style splitter, so
// reuse the same strip the scoping test does before classifying.
const stripped = (s) => s.replace(/--[^\n]*/g, "").trim();

test("import file exists", () => {
  assert.ok(sql().length > 0, "migrations/import-from-forum.sql is present");
});

test("every statement in the import targets a gc_* object", () => {
  const offenders = [];
  const unclassified = [];
  for (const statement of statementsOf(sql())) {
    const text = stripped(statement);
    if (!text) continue;
    const { form, targets } = classify(statement);
    if (form === "unrecognized") {
      unclassified.push(text.slice(0, 60));
      continue;
    }
    for (const target of targets) {
      if (!/^gc_/.test(target)) offenders.push(`${form} -> ${target}`);
    }
  }
  assert.equal(unclassified.length, 0, `unclassified: ${unclassified.join(" | ")}`);
  assert.equal(offenders.length, 0, `non-gc_ targets: ${offenders.join(", ")}`);
});

test("forum tables appear only as read sources, never as write targets", () => {
  const writes = statementsOf(sql())
    .map((s) => ({ text: stripped(s), ...classify(s) }))
    .filter((s) => ["INSERT INTO", "UPDATE", "DELETE FROM", "CREATE TABLE", "CREATE TRIGGER", "CREATE INDEX"].includes(s.form));
  assert.ok(writes.length > 0, "import performs at least one write");
  for (const w of writes) {
    assert.match(w.text, /\bgc_\w+/, `write into a gc_ table: ${w.text.slice(0, 60)}`);
  }
  for (const forum of ["chat_messages", "dm_messages", "dm_threads", "users", "sessions"]) {
    for (const w of writes) {
      if (w.text.includes(forum)) {
        // The forum table may only appear after the INTO-target, i.e. in a
        // SELECT source or WHERE guard, never as the statement's target.
        const intoTarget = /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([\w"'.]+)/i.exec(w.text)?.[1] ?? "";
        assert.notEqual(intoTarget, forum, `forum table ${forum} is not a write target`);
      }
    }
  }
});

test("message imports ride the import-chat-/import-dm- sentinel UNIQUE key", () => {
  const messageInserts = statementsOf(sql())
    .map((s) => stripped(s))
    .filter((s) => /^\s*INSERT\b/i.test(s) && /\bINTO\s+gc_messages\b/i.test(s));
  assert.equal(messageInserts.length, 2, "exactly two gc_messages inserts: chat archive + DMs");
  assert.ok(
    messageInserts.some((s) => /'import-chat-'\s*\|\|\s*m\.id\b/i.test(s)),
    "chat import sentinel 'import-chat-' || chat_messages.id"
  );
  assert.ok(
    messageInserts.some((s) => /'import-dm-'\s*\|\|\s*m\.id\b/i.test(s)),
    "dm import sentinel 'import-dm-' || dm_messages.id"
  );
  // Rerun no-op goes through the UNIQUE constraint alone, so no NOT EXISTS
  // guard is required on the message inserts — but the resolution must IGNORE.
  for (const s of messageInserts) {
    assert.match(s, /^INSERT\s+OR\s+IGNORE\s+INTO/i, `message insert uses OR IGNORE: ${s.slice(0, 60)}`);
  }
});

test("archive channel literal is 'forum-archive'", () => {
  assert.match(sql(), /'forum-archive'/);
});

test("#general and #forum-archive are created as text channels", () => {
  const has = (name) =>
    statementsOf(sql()).some(
      (s) => stripped(s).includes(`'${name}'`) && /INTO\s+gc_channels/i.test(stripped(s))
    );
  assert.ok(has("general"), "#general insert exists");
  assert.ok(has("forum-archive"), "#forum-archive insert exists");
});

test("owner resolves as first admin: role IN ('owner','admin') ORDER BY created_at LIMIT 1", () => {
  assert.match(
    sql(),
    /SELECT\s+id\s+FROM\s+users\s+WHERE\s+role\s+IN\s+\(\s*'owner'\s*,\s*'admin'\s*\)\s+ORDER\s+BY\s+created_at\s+LIMIT\s+1/i,
    "pinned owner subquery"
  );
});

test("forum schema caps cannot violate gc_messages length checks", () => {
  const forum = readFileSync(FORUM_CHAT_SQL, "utf8");
  assert.match(forum, /CREATE TABLE chat_messages/);
  assert.match(forum, /CREATE TABLE dm_messages/);
  const capOf = (table) => {
    const block = new RegExp(`CREATE TABLE ${table}[\\s\\S]*?\\);`).exec(forum)[0];
    const m = /BETWEEN\s+(\d+)\s+AND\s+(\d+)/.exec(block);
    return Number(m[2]);
  };
  const chatCap = capOf("chat_messages");
  const dmCap = capOf("dm_messages");
  // The forum constants: chat bodies 1..500, dm bodies 1..1000 — both inside
  // gc_messages CHECK(length(body) BETWEEN 1 AND 2000).
  assert.ok(chatCap <= 1000, `forum chat body cap ${chatCap} <= 1000`);
  assert.ok(dmCap <= 2000, `forum dm body cap ${dmCap} <= 2000`);
});

test("import is guard-idempotent for structure rows (server/channels/members use guards)", () => {
  const structural = statementsOf(sql())
    .map((s) => stripped(s))
    .filter((s) => /INTO\s+gc_(servers|channels|server_members|conversation_members)\b/i.test(s));
  assert.ok(structural.length >= 5, "server, two channels, dm channels, and members all inserted");
  for (const s of structural) {
    const guarded = /NOT\s+EXISTS/i.test(s) || /^INSERT\s+OR\s+IGNORE\s+INTO/i.test(s);
    assert.ok(guarded, `structural insert is rerun-safe: ${s.slice(0, 60)}`);
  }
});
