// Scoping pin: GooberCord's D1 database is SHARED with the live forum
// (wempos-forum). Every table our migrations CREATE/INDEX/trigger against
// must be gc_-prefixed so a rogue migration can never touch forum data.
// FK REFERENCES targets (users(id), etc.) are deliberately exempt: the
// product reads/writes forum `users` rows by contract (see
// tests/contract-parity.test.mjs).
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

function targetsOf(statement) {
  const s = statement.trim();
  if (!s) return [];

  // CREATE TRIGGER <name> [BEFORE|AFTER] <event> ON <table>
  let m = /^CREATE\s+TRIGGER\s+\S+\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+.*?\bON\s+([\w"'.]+)/i.exec(s);
  if (m) return [stripQuotes(m[1])];

  // CREATE [UNIQUE] INDEX <name> ON <table>
  m = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+\S+\s+ON\s+([\w"'.]+)/i.exec(s);
  if (m) return [stripQuotes(m[1])];

  // CREATE TABLE <table>
  m = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"'.]+)/i.exec(s);
  if (m) return [stripQuotes(m[1])];

  // INSERT INTO <table>
  m = /^INSERT\s+INTO\s+([\w"'.]+)/i.exec(s);
  if (m) return [stripQuotes(m[1])];

  // UPDATE [OR ...] <table>
  m = /^UPDATE\s+(?:OR\s+\w+\s+)?([\w"'.]+)/i.exec(s);
  if (m) return [stripQuotes(m[1])];

  // DELETE FROM <table>
  m = /^DELETE\s+FROM\s+([\w"'.]+)/i.exec(s);
  if (m) return [stripQuotes(m[1])];

  // Anything else (SELECT, BEGIN, REFERENCES clauses, ...) — no target.
  return [];
}

function stripQuotes(name) {
  return name.replace(/^"(.*)"$/, "$1");
}

function statementsOf(sql) {
  // Strip -- line comments, then split on statement-terminating semicolons.
  const noComments = sql.replace(/--[^\n]*/g, "");
  return noComments.split(";").map((s) => s.trim()).filter(Boolean);
}

test("migration 0001 only targets gc_-prefixed tables", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const targets = statementsOf(sql).flatMap(targetsOf);

  assert.ok(targets.length >= 10, `expected many statement targets, got ${targets.length}`);
  const offenders = targets.filter((t) => !/^gc_/.test(t));
  assert.deepEqual(offenders, [], `non-gc_ statement targets found: ${offenders.join(", ")}`);
});

test("migration 0001 contains no destructive or pragma statements", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const stripped = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(stripped, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(stripped, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(stripped, /\bPRAGMA\b/i);
});
