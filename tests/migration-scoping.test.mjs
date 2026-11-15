// Scoping pin: GooberCord's D1 database is SHARED with the live forum
// (wempos-forum). Every table our migrations CREATE/INDEX/trigger against
// must be gc_-prefixed so a rogue migration can never touch forum data.
// FK REFERENCES targets (users(id), etc.) are deliberately exempt: the
// product reads/writes forum `users` rows by contract (see
// tests/contract-parity.test.mjs).
//
// The parser below is STRICT by design: any statement it cannot positively
// classify as targeting a gc_* object is a FAILURE, not a pass. Unrecognized
// statement forms are exactly how a scoping pin gets bypassed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MIGRATION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
  "0001_initial_goobercord.sql"
);

function stripQuotes(name) {
  return name.replace(/^"(.*)"$/, "$1");
}

// Strip -- line comments inside a single statement (the wrangler-style
// splitter leaves leading comment blocks attached to statements).
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "").trim();
}

export function statementsOf(sql) {
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  // Semicolon splitting must not cut trigger bodies mid-BEGIN...END, so a
  // statement is only closed once BEGIN/END tokens are balanced.
  const parts = withoutComments.split(";");
  const statements = [];
  let buf = [];
  const count = (s, word) => (s.match(new RegExp(`\\b${word}\\b`, "gi")) || []).length;

  for (const part of parts) {
    buf.push(part);
    const candidate = buf.join(";");
    if (count(candidate, "begin") === count(candidate, "end")) {
      const trimmed = candidate.trim();
      if (trimmed) statements.push(trimmed);
      buf = [];
    }
  }
  const tail = buf.join(";").trim();
  if (tail) statements.push(tail);
  return statements;
}

// Returns { form, targets } for a statement, or { form: "unrecognized" }.
export function classify(statement) {
  const sql = stripComments(statement);
  if (!sql) return { form: "comment-only", targets: [] };

  // CREATE TABLE [IF NOT EXISTS] <t>
  let m = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"'.]+)/i.exec(sql);
  if (m) return { form: "CREATE TABLE", targets: [stripQuotes(m[1])] };

  // CREATE [UNIQUE] INDEX <name> ON <t>
  m = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+[\w"'.]+\s+ON\s+([\w"'.]+)/is.exec(sql);
  if (m) return { form: "CREATE INDEX", targets: [stripQuotes(m[1])] };

  // CREATE TRIGGER <name> ... ON <t> — dots-all so `ON` may sit on a later
  // line than the trigger header.
  m = /^CREATE\s+TRIGGER\s+[\w"'.]+[\s\S]*?\bON\s+([\w"'.]+)/is.exec(sql);
  if (m) return { form: "CREATE TRIGGER", targets: [stripQuotes(m[1])] };

  // [INSERT|INSERT OR <resolution>|REPLACE] INTO <t>
  m = /^(?:INSERT(?:\s+OR\s+\w+)?|REPLACE)\s+INTO\s+([\w"'.]+)/i.exec(sql);
  if (m) return { form: "INSERT INTO", targets: [stripQuotes(m[1])] };

  // DELETE FROM <t>
  m = /^DELETE\s+FROM\s+([\w"'.]+)/i.exec(sql);
  if (m) return { form: "DELETE FROM", targets: [stripQuotes(m[1])] };

  // UPDATE [OR <resolution>] <t>
  m = /^UPDATE\s+(?:OR\s+\w+\s+)?([\w"'.]+)/i.exec(sql);
  if (m) return { form: "UPDATE", targets: [stripQuotes(m[1])] };

  // Statement forms with no table target that are recognized as inert.
  if (/^(?:SELECT|WITH|BEGIN|COMMIT|VACUUM|EXPLAIN)\b/i.test(sql)) {
    return { form: "no-target", targets: [] };
  }

  return { form: "unrecognized", targets: [] };
}

// Strict check: every statement must be classified and every target must be
// gc_-prefixed. Anything unrecognized or off-prefix is reported and thrown.
export function assertTargetsAreGc(sql) {
  const unclassified = [];
  const offenders = [];
  const statements = statementsOf(sql);

  for (const statement of statements) {
    const { form, targets } = classify(statement);
    if (form === "unrecognized") {
      unclassified.push(statement.slice(0, 60));
      continue;
    }
    for (const target of targets) {
      if (!/^gc_/.test(target)) offenders.push(`${form} -> ${target}`);
    }
  }

  let message = "";
  if (unclassified.length > 0) {
    message += `unclassified statements (each is a scoping exemption risk): ${unclassified
      .map((s) => JSON.stringify(s))
      .join(", ")}`;
  }
  if (offenders.length > 0) {
    message += `${message ? "; " : ""}non-gc_ statement targets: ${offenders.join(", ")}`;
  }
  assert.ok(message === "", message || "all statement targets are gc_-prefixed");
  assert.ok(statements.length > 0, "parsed at least one statement");
}

test("migration 0001 only targets gc_-prefixed tables", () => {
  assertTargetsAreGc(readFileSync(MIGRATION, "utf8"));
});

test("migration 0001 contains no ALTER TABLE, DROP variants, or pragma statements", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const stripped = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(stripped, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(stripped, /\bDROP\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b/i);
  assert.doesNotMatch(stripped, /\bDROP\b/i);
  assert.doesNotMatch(stripped, /\bPRAGMA\b/i);
});

// Every evasion form the strict parser must reject: unrecognized statement
// shape means the scoping pin stops answering, it must fail loudly.
const EVASION_CASES = [
  [
    "INSERT OR REPLACE INTO a forum table",
    "INSERT OR REPLACE INTO forum_meta VALUES (1);",
  ],
  ["REPLACE INTO a forum table", "REPLACE INTO forum_meta VALUES (1);"],
  ["CREATE VIEW over forum data", "CREATE VIEW forum_view AS SELECT 1;"],
  [
    "CREATE VIRTUAL TABLE on the shared db",
    "CREATE VIRTUAL TABLE forum_fts USING fts5(body);",
  ],
  ["DROP INDEX on a forum index", "DROP INDEX idx_users_email;"],
  ["DROP TRIGGER on a forum trigger", "DROP TRIGGER users_role_guard;"],
  ["DROP TABLE on a forum table", "DROP TABLE users;"],
  [
    "CREATE TRIGGER with ON on a later line targeting a forum table",
    "CREATE TRIGGER gc_sneaky BEFORE INSERT\n  ON users\nBEGIN\n  SELECT RAISE(ABORT, 'no');\nEND;",
  ],
];

for (const [name, sql] of EVASION_CASES) {
  test(`parser rejects evasion: ${name}`, () => {
    assert.throws(() => assertTargetsAreGc(sql), assert.AssertionError);
  });
}

// Positive controls: the same statement shapes aimed at gc_* objects must
// still classify and pass.
const CONTROL_CASES = [
  "INSERT OR REPLACE INTO gc_messages (id, channel_id, author_id, body, created_at) VALUES (1, 1, 1, 'x', 1);",
  "REPLACE INTO gc_read_state (user_id, channel_id, last_read_message_id) VALUES (1, 1, 1);",
  "CREATE TRIGGER gc_o GU BEFORE UPDATE\n  ON gc_servers\nBEGIN\n  SELECT RAISE(ABORT, 'no');\nEND;",
];

for (const sql of CONTROL_CASES) {
  test(`parser accepts gc_ equivalents: ${sql.slice(0, 44)}...`, () => {
    assert.doesNotThrow(() => assertTargetsAreGc(sql));
  });
}
