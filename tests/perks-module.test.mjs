// Goober+ perks pack (free-for-every-one cosmetics, $0, no payments): the
// 0005 migration pins, PATCH /api/profile (validated hex accent + tagline),
// the additive GET /api/me merge, the member-only server boosts, and the
// author_accent projection on the message list. Same fake conventions as the
// servers/messages test modules: fakeDb records every statement's bound
// values, with batch() carrying each statement's SQL so tests can pin the
// guarded-SQL shape itself (the authorization contract lives in the query
// text, so that is what the tests assert).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { handleAccountRoutes } from "../api/accounts.mjs";
import { handleServerRoutes } from "../api/servers.mjs";
import { handleMessageRoutes } from "../api/messages.mjs";
import { randomToken, sha256Hex, nowSeconds } from "../api/core/crypto.mjs";
import { HttpError, json } from "../api/core/http.mjs";
import { validAccent } from "../public/js/dom.js";

const ORIGIN = "http://localhost";
const USER_ID = 7;
const SERVER_ID = 3;

// --- migration 0005 pins --------------------------------------------------------

const MIGRATION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
  "0005_goober_plus.sql",
);

// The scoping-style splitter (verbatim from tests/migration-scoping.test.mjs).
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "").trim();
}
function statementsOf(sql) {
  const withoutComments = sql.replace(/--[^\n]*/g, "");
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

test("migration 0005 touches only the shared users row and the gc_ tables", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const statements = statementsOf(sql);
  assert.ok(statements.length >= 5, "one ALTER per column, the boosts ALTER, table + index");

  for (const statement of statements) {
    const target =
      /^ALTER\s+TABLE\s+([\w"'.]+)/i.exec(statement)?.[1] ??
      /^CREATE\s+TABLE\s+([\w"'.]+)/i.exec(statement)?.[1] ??
      /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+[\w"'.]+\s+ON\s+([\w"'.]+)/i.exec(statement)?.[1];
    assert.ok(target, "every statement classifies: " + statement.slice(0, 60));
    assert.match(
      target,
      /^(users|gc_servers|gc_server_boosts)$/,
      "only users' additive columns and gc_ tables are touched: " + target,
    );
  }
});

test("migration 0005 adds the GC-owned accent/tagline next to profile_accent, never inside it", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  // The decision the migration explains: profile_accent is the forum's
  // whitelisted palette KEY, so its name must never appear in a statement —
  // only in the comment block.
  assert.ok(sql.includes("profile_accent"), "the profile_accent decision is documented");
  for (const statement of statementsOf(sql)) {
    assert.doesNotMatch(statement, /profile_accent/, "profile_accent is comment-only material");
  }
  assert.match(sql, /ALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+accent_color\s+TEXT/i);
  assert.match(sql, /ALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+tagline\s+TEXT/i);
});

test("migration 0005 adds the boost counter and the per-member boost table with cascading FKs", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  // NOT NULL DEFAULT 0 so existing gc_servers rows read as unboosted.
  assert.match(sql, /ALTER\s+TABLE\s+gc_servers\s+ADD\s+COLUMN\s+boosts\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/i);

  const table = /CREATE\s+TABLE\s+gc_server_boosts[\s\S]*?(?:;)/i.exec(sql)?.[0] ?? "";
  assert.ok(table, "gc_server_boosts is created");
  assert.match(table, /user_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+CASCADE/i);
  assert.match(table, /server_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+gc_servers\(id\)\s+ON\s+DELETE\s+CASCADE/i);
  assert.match(table, /PRIMARY\s+KEY\s*\(user_id,\s*server_id\)/i, "one boost per member per server");
  assert.match(sql, /CREATE\s+INDEX\s+idx_gc_server_boosts_server\s+ON\s+gc_server_boosts\(server_id\)/i);
});

// --- fakeDb + dispatcher conventions --------------------------------------------

function fakeDb(routes) {
  const calls = [];
  let nextRowId = 0;
  const find = (sql) => routes.find((route) => route.test(sql));
  const db = {
    calls,
    prepare(sql) {
      const statement = { sql, bound: [] };
      statement.bind = (...values) => {
        statement.bound = values;
        return statement;
      };
      statement.first = async () => {
        calls.push({ call: "first", sql, bound: statement.bound });
        const route = find(sql);
        return route && route.first ? await route.first(statement.bound) : null;
      };
      statement.all = async () => {
        calls.push({ call: "all", sql, bound: statement.bound });
        const route = find(sql);
        return route && route.all ? await route.all(statement.bound) : { results: [] };
      };
      statement.run = async (record = true) => {
        if (record) calls.push({ call: "run", sql, bound: statement.bound });
        const route = find(sql);
        if (route && route.run) return route.run(statement.bound);
        return { meta: { changes: 1, last_row_id: ++nextRowId } };
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run(false));
      calls.push({
        call: "batch",
        sql: "batch",
        statements: statements.map((statement) => ({ sql: statement.sql, bound: statement.bound })),
      });
      return results;
    },
  };
  return db;
}

async function dispatch(dispatchable, request, env) {
  const url = new URL(request.url);
  let response;
  try {
    response = await dispatchable(request, env, url, url.pathname, request.method.toUpperCase(), undefined);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    response = json(error.payload || { error: error.message }, error.status, error.headers);
  }
  return (
    response ??
    new Response(JSON.stringify({ error: "That API endpoint does not exist." }), { status: 404 })
  );
}

async function bodyOf(response) {
  return JSON.parse(await response.text());
}

function envWithLimiters(extra = {}) {
  const env = { ...extra };
  for (const binding of [
    "GC_READ_RATE_LIMITER",
    "GC_WRITE_RATE_LIMITER",
  ]) {
    env[binding] = { limit: async ({ key }) => ({ success: true, key }) };
  }
  return env;
}

const SESSION_READ_TEST = (sql) => sql.includes("FROM sessions s LEFT JOIN users u");

async function sessionFixtures() {
  const token = randomToken();
  const csrf = randomToken(24);
  const row = {
    token_hash: await sha256Hex(token),
    user_id: USER_ID,
    csrf_token: csrf,
    expires_at: nowSeconds() + 3600,
    username: "wempos",
    role: "member",
    bio: "",
    avatar_status: null,
    avatar_mime: null,
    avatar_updated_at: null,
    avatar_version: null,
    totp_enabled: 0,
  };
  return {
    token,
    row,
    get: (path) => new Request(ORIGIN + path, { method: "GET", headers: { Cookie: "goober_session=" + token } }),
    post: (path, body) =>
      new Request(ORIGIN + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: "goober_session=" + token, "X-CSRF-Token": csrf },
        body: JSON.stringify(body ?? {}),
      }),
    patch: (path, body) =>
      new Request(ORIGIN + path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: "goober_session=" + token, "X-CSRF-Token": csrf },
        body: JSON.stringify(body),
      }),
    request: (method, path, body) =>
      new Request(ORIGIN + path, {
        method,
        headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: "goober_session=" + token, "X-CSRF-Token": csrf },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
  };
}

// --- PATCH /api/profile -----------------------------------------------------------

const PROFILE_UPDATE_TEST = (sql) => sql.startsWith("UPDATE users SET ") && sql.includes("WHERE id = ?");

const PROFILE_RESELECT_TEST = (sql) =>
  sql.includes("SELECT accent_color, tagline FROM users WHERE id = ? LIMIT 1");

test("PATCH /api/profile writes the validated accent and tagline in one guarded UPDATE", async () => {
  const { row, patch } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: PROFILE_RESELECT_TEST, first: async () => ({ accent_color: null, tagline: null }) },
  ]);
  const response = await dispatch(handleAccountRoutes, patch("/api/profile", { accentColor: "#1a2b3c", tagline: "certified goober" }), {
    GOOBER_DB: db,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { profile: { accentColor: null, tagline: null } });

  const update = db.calls.find((call) => call.call === "run" && PROFILE_UPDATE_TEST(call.sql));
  assert.ok(update);
  assert.equal(update.sql, "UPDATE users SET accent_color = ?, tagline = ? WHERE id = ?");
  // The accent is stored verbatim as the validated lowercase hex; the tagline
  // is the trimmed bounded string.
  assert.deepEqual(update.bound, ["#1a2b3c", "certified goober", USER_ID]);
})

test("PATCH /api/profile: an absent key keeps its stored value (it never rides the SET)", async () => {
  const { row, patch } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: PROFILE_RESELECT_TEST, first: async () => ({ accent_color: "#abc" }) },
  ]);
  const response = await dispatch(handleAccountRoutes, patch("/api/profile", { accentColor: "#abc" }), {
    GOOBER_DB: db,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { profile: { accentColor: "#abc", tagline: null } });

  const update = db.calls.find((call) => PROFILE_UPDATE_TEST(call.sql));
  assert.equal(update.sql, "UPDATE users SET accent_color = ? WHERE id = ?");
  assert.deepEqual(update.bound, ["#abc", USER_ID]);
});

test("PATCH /api/profile: null clears, and a whitespace tagline clears too", async () => {
  for (const body of [{ accentColor: null, tagline: null }, { accentColor: null, tagline: "   " }]) {
    const { row, patch } = await sessionFixtures();
    const db = fakeDb([
      { test: SESSION_READ_TEST, first: async () => row },
      { test: PROFILE_RESELECT_TEST, first: async () => ({ accent_color: null, tagline: null }) },
    ]);
    const response = await dispatch(handleAccountRoutes, patch("/api/profile", body), { GOOBER_DB: db });
    assert.equal(response.status, 200);
    const update = db.calls.find((call) => PROFILE_UPDATE_TEST(call.sql));
    assert.equal(update.sql, "UPDATE users SET accent_color = NULL, tagline = NULL WHERE id = ?");
    assert.deepEqual(update.bound, [USER_ID]);
  }
});

test("PATCH /api/profile refuses anything but strict lowercase #rgb/#rrggbb hex", async () => {
  const { row, patch } = await sessionFixtures();
  const cases = [
    ["#ABC123", "uppercase"],
    ["#12345", "5 digits"],
    ["#1234567", "7 digits"],
    ["red", "a keyword"],
    ["#12 34", "a space"],
    ["url(#x)", "a url()"],
  ];
  for (const [value, label] of cases) {
    const db = fakeDb([{ test: SESSION_READ_TEST, first: async () => row }]);
    const response = await dispatch(handleAccountRoutes, patch("/api/profile", { accentColor: value }), {
      GOOBER_DB: db,
    });
    assert.equal(response.status, 400, label);
    assert.equal(
      (await bodyOf(response)).error,
      "Accent color must be a lowercase #rgb or #rrggbb hex color.",
    );
    assert.deepEqual(
      db.calls.filter((call) => call.call === "run" || call.call === "batch"),
      [],
      label + ": zero D1 writes",
    );
  }
});

test("PATCH /api/profile refuses taglines over 80 characters and non-string accents", async () => {
  const { row, patch } = await sessionFixtures();
  for (const body of [{ tagline: "x".repeat(81) }, { accentColor: 7 }, { accentColor: {} }]) {
    const db = fakeDb([{ test: SESSION_READ_TEST, first: async () => row }]);
    const response = await dispatch(handleAccountRoutes, patch("/api/profile", body), { GOOBER_DB: db });
    assert.equal(response.status, 400);
    assert.deepEqual(
      db.calls.filter((call) => call.call === "run" || call.call === "batch"),
      [],
    );
  }
});

test("PATCH /api/profile demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(
    handleAccountRoutes,
    new Request(ORIGIN + "/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ tagline: "no" }),
    }),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run" || call.call === "batch"),
    [],
  );
});

// --- GET /api/me additive merge ---------------------------------------------------

test("GET /api/me merges accentColor/tagline additively onto the vendored readSession shape", async () => {
  const { row, get } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: PROFILE_RESELECT_TEST, first: async () => ({ accent_color: "#1a2b3c", tagline: "certified" }) },
  ]);
  const response = await dispatch(handleAccountRoutes, get("/api/me"), { GOOBER_DB: db });
  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), {
    user: {
      id: 7,
      username: "wempos",
      role: "member",
      bio: "",
      avatarStatus: null,
      avatarUrl: null,
      totpEnabled: false,
      accentColor: "#1a2b3c",
      tagline: "certified",
    },
    csrfToken: row.csrf_token,
  });
})

test("GET /api/me keeps an accentless member's payload untouched apart from the two null keys", async () => {
  const { row, get } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    // No perks row read (or a row with nothing stored) → the two null keys.
    { test: PROFILE_RESELECT_TEST, first: async () => null },
  ]);
  const response = await dispatch(handleAccountRoutes, get("/api/me"), { GOOBER_DB: db });
  const body = await bodyOf(response);
  assert.equal(body.user.accentColor, null);
  assert.equal(body.user.tagline, null);
  assert.equal(body.user.id, 7);
});

// --- POST /api/servers/:id/boost ---------------------------------------------------

const BOOST_INSERT_TEST = (sql) => sql.startsWith("INSERT INTO gc_server_boosts");
const BOOST_RECOUNT_TEST = (sql) => sql.startsWith("UPDATE gc_servers SET boosts =");
const BOOST_RESELECT_TEST = (sql) => sql.startsWith("SELECT boosts FROM gc_servers WHERE id = ?");
const BOOST_DIAG_TEST = (sql) => sql.includes("FROM gc_server_boosts WHERE user_id = ? AND server_id = ?");

const MEMBER_EXISTS = { id: SERVER_ID, server_id: 3, kind: "text" };

test("a member's first boost rides one guarded batch and re-derives the counter", async () => {
  const { request, row } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: BOOST_INSERT_TEST, run: async () => ({ meta: { changes: 1 } }) },
    { test: BOOST_RECOUNT_TEST, run: async () => ({ meta: { changes: 1 } }) },
    { test: BOOST_RESELECT_TEST, run: async () => ({ meta: { changes: 0 }, results: [{ boosts: 1 }] }) },
  ]);
  void MEMBER_EXISTS;
  const response = await dispatch(handleServerRoutes, request("POST", "/api/servers/3/boost"), {
    GOOBER_DB: db,
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await bodyOf(response), { server: { id: 3, boosts: 1, boostedByMe: true } });

  const batch = db.calls.find((call) => call.call === "batch");
  assert.ok(batch, "the whole boost is one atomic batch");
  assert.deepEqual(db.calls.filter((call) => call.call === "run"), []);
  assert.equal(batch.statements.length, 3);

  const [insert, recount, reselect] = batch.statements;
  // The membership authorization rides INSIDE the INSERT ... SELECT, and the
  // PK replay is answered by DO NOTHING (an idempotent repost 409s via the
  // diagnostic, never silently).
  assert.equal(
    insert.sql,
    "INSERT INTO gc_server_boosts (user_id, server_id, created_at) " +
      "SELECT ?, ?, ? " +
      "WHERE EXISTS (SELECT 1 FROM gc_server_members WHERE server_id = ? AND user_id = ?) " +
      "ON CONFLICT DO NOTHING",
  );
  assert.equal(insert.bound[0], USER_ID);
  assert.equal(insert.bound[1], SERVER_ID);
  assert.equal(typeof insert.bound[2], "number");
  assert.deepEqual(insert.bound.filter((value, index) => index !== 2), [USER_ID, SERVER_ID, SERVER_ID, USER_ID]);
  // Scoping pin: the writes touch only gc_ rows.
  assert.match(insert.sql, /^INSERT INTO gc_server_boosts/);
  assert.match(
    recount.sql,
    /^UPDATE gc_servers SET boosts = \(SELECT COUNT\(\*\) FROM gc_server_boosts WHERE server_id = \?\) WHERE id = \?$/,
  );
  assert.deepEqual(recount.bound, [SERVER_ID, SERVER_ID]);
  void reselect;
});

test("a repeated boost is a 409 with the pinned copy", async () => {
  const { request, row } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: (sql) => [BOOST_INSERT_TEST, BOOST_RECOUNT_TEST, BOOST_RESELECT_TEST].some((t) => t(sql)), run: async () =>
      ({ meta: { changes: 0 } }) },
    // The diagnostic read classifies the failure: the boost row exists.
    { test: BOOST_DIAG_TEST, first: async () => ({ boosted: 1 }) },
  ]);
  const response = await dispatch(handleServerRoutes, request("POST", "/api/servers/3/boost"), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await bodyOf(response), { error: "You already boosted this server." });
});

test("a non-member's boost is a 403 with no server existence oracle", async () => {
  const { request, row } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: (sql) => [BOOST_INSERT_TEST, BOOST_RECOUNT_TEST, BOOST_RESELECT_TEST].some((t) => t(sql)), run: async () => ({ meta: { changes: 0 } }) },
    // No membership and no boost row: the 403 never leaks whether server #3 exists.
    { test: BOOST_DIAG_TEST, first: async () => null },
  ]);
  const response = await dispatch(handleServerRoutes, request("POST", "/api/servers/3/boost"), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await bodyOf(response), { error: "You do not have permission to do that." });
  // The classification read touched ONLY the caller's own boost row.
  assert.equal(db.calls.filter((call) => call.call === "first" && !SESSION_READ_TEST(call.sql)).length, 1);
});

test("a boost demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(
    handleServerRoutes,
    new Request(ORIGIN + "/api/servers/3/boost", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({}),
    }),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(db.calls.filter((call) => call.call === "batch" || call.call === "run"), []);
});

// --- DELETE /api/servers/:id/boost ---------------------------------------------------

test("a member retracts their boost in one guarded batch and the count follows", async () => {
  const { request, row } = await sessionFixtures();
  void BOOST_INSERT_TEST;
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: (sql) => sql.startsWith("DELETE FROM gc_server_boosts"), run: async () => ({ meta: { changes: 1 } }) },
    { test: BOOST_RECOUNT_TEST, run: async () => ({ meta: { changes: 1 } }) },
    { test: BOOST_RESELECT_TEST, run: async () => ({ meta: { changes: 0 }, results: [{ boosts: 0 }] }) },
  ]);
  const response = await dispatch(handleServerRoutes, request("DELETE", "/api/servers/3/boost"), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { server: { id: 3, boosts: 0, boostedByMe: false } });

  const batch = db.calls.find((call) => call.call === "batch");
  assert.ok(batch);
  assert.deepEqual(batch.statements.map((s) => s.sql.split(" ")[0]), ["DELETE", "UPDATE", "SELECT"]);
  assert.deepEqual(batch.statements[0].bound, [USER_ID, SERVER_ID]);
  // The recount rides the same batch: no counter drift, ever.
  assert.deepEqual(batch.statements[1].bound, [SERVER_ID, SERVER_ID]);
});

test("an empty retract 404s with the pinned copy", async () => {
  const { request, row } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: (sql) => sql.startsWith("DELETE FROM gc_server_boosts") || [BOOST_RECOUNT_TEST, BOOST_RESELECT_TEST].some((t) => t(sql)), run: async () => ({ meta: { changes: 0 } }) },
  ]);
  const response = await dispatch(handleServerRoutes, request("DELETE", "/api/servers/3/boost"), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await bodyOf(response), { error: "You have not boosted this server." });
});

// --- GET /api/servers gains boosts + boostedByMe --------------------------------------

const SERVERS_LIST_SELECT_TEST = (sql) =>
  sql.includes("FROM gc_server_members m") &&
  sql.includes("JOIN gc_servers s ON s.id = m.server_id") &&
  sql.includes("EXISTS (SELECT 1 FROM gc_server_boosts gb WHERE gb.server_id = s.id AND gb.user_id = ?)") &&
  sql.includes("ORDER BY s.id, c.position, c.id");

test("GET /api/servers lists boosts and the caller's own boost flag", async () => {
  const { row, get } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    {
      test: SERVERS_LIST_SELECT_TEST,
      all: async () => ({
        results: [
          { server_id: 1, server_name: "Alpha", role: "member", server_boosts: 12, boosted_by_me: 1, channel_id: 10, channel_name: "general", channel_kind: "text", channel_position: 0 },
          { server_id: 2, server_name: "Beta", role: "member", server_boosts: 0, boosted_by_me: 0, channel_id: null, channel_name: null, channel_kind: null, channel_position: null },
        ],
      }),
    },
  ]);
  const response = await dispatch(handleServerRoutes, get("/api/servers"), { GOOBER_DB: db });
  assert.equal(response.status, 200);
  const body = await bodyOf(response);
  assert.deepEqual(body.servers[0], {
    id: 1,
    name: "Alpha",
    role: "member",
    boosts: 12,
    boostedByMe: true,
    channels: [{ id: 10, name: "general", kind: "text", position: 0 }],
  });
  assert.deepEqual(body.servers[1], {
    id: 2,
    name: "Beta",
    role: "member",
    boosts: 0,
    boostedByMe: false,
    channels: [],
  });

  // The own-boost EXISTS binds the session user (after the counter column).
  const list = db.calls.find((call) => call.call === "all");
  assert.deepEqual(list.bound, [USER_ID, USER_ID]);
});

// --- message accent projection ---------------------------------------------------------

const HISTORY_TEST = (sql) =>
  sql.includes("FROM gc_messages m JOIN users u") &&
  sql.includes("ORDER BY m.id DESC LIMIT");
const CHANNEL_ACCESS_TEST = (sql) =>
  sql.includes("FROM gc_channels c WHERE c.id = ?") &&
  sql.includes("gc_server_members m") &&
  sql.includes("gc_conversation_members cm");

test("history exposes a strict-hex author accent, and only through strict hex", async () => {
  const { row, get } = await sessionFixtures();
  for (const [stored, expected] of [
    ["#397357", "#397357"],
    ["#abc", "#abc"],
    [null, undefined],
    ["#ABC", undefined], // uppercase fails the strict gate
    ["red", undefined],
    ["#12345", undefined],
    ["javascript:alert(1)", undefined],
  ]) {
    const db = fakeDb([
      { test: SESSION_READ_TEST, first: async () => row },
      { test: CHANNEL_ACCESS_TEST, first: async () => ({ id: 1, server_id: 1, kind: "text" }) },
      {
        test: HISTORY_TEST,
        all: async () => ({
          results: [{
            id: 5, author_id: 9, author_name: "goose", body: "hi",
            client_message_id: null, source: null, created_at: 100, edited_at: null,
            author_accent: stored,
          }],
        }),
      },
    ]);
    const response = await dispatch(handleMessageRoutes, get("/api/channels/1/messages"), envWithLimiters({ GOOBER_DB: db }));
    const body = await bodyOf(response);
    assert.equal(body.messages[0].accent, expected, "accent for " + JSON.stringify(stored));
    // The rest of the shape never moved.
    assert.equal(body.messages[0].authorName, "goose");
    assert.deepEqual(body.messages[0].attachmentIds, []);
  }
});

test("MESSAGE_SELECT projects u.accent_color AS author_accent on the shared JOIN (both REST and WS/DO read it)", async () => {
  const { row, get } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    { test: CHANNEL_ACCESS_TEST, first: async () => ({ id: 1, server_id: 1, kind: "text" }) },
    { test: HISTORY_TEST, all: async () => ({ results: [] }) },
  ]);
  await dispatch(handleMessageRoutes, get("/api/channels/1/messages"), envWithLimiters({ GOOBER_DB: db }));
  const select = db.calls.find((call) => call.call === "all");
  assert.match(select.sql, /u\.accent_color AS author_accent/);
  assert.match(select.sql, /FROM gc_messages m JOIN users u ON u\.id = m\.author_id/);
});

// The client-side gate must agree with the server's: same strict validator,
// so an inline style can never be built from a value the API refused.
test("validAccent (dom.js) mirrors the server's strict hex rules", () => {
  assert.equal(validAccent("#397357"), "#397357");
  assert.equal(validAccent("#abc"), "#abc");
  assert.equal(validAccent("#ABC"), null);
  assert.equal(validAccent("red"), null);
  assert.equal(validAccent("#12345"), null);
  assert.equal(validAccent("#1234567"), null);
  assert.equal(validAccent(undefined), null);
  assert.equal(validAccent(null), null);
});

// --- real-SQLite boost regression ------------------------------------------------
// The replay/no-drift property is SQL the fake DB cannot decide: the guarded
// INSERT's ON CONFLICT DO NOTHING and the recount's re-derivation run in real
// SQLite here (same D1-shaped adapter conventions as media-module.test.mjs).
test("real-SQLite: a boost replay never drifts the server's boost counter", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', accent_color TEXT, tagline TEXT,
      avatar_status TEXT, avatar_mime TEXT, avatar_updated_at INTEGER, avatar_version TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0);
    INSERT INTO users (id, username, username_key, role) VALUES (${USER_ID}, 'wempos', 'wempos', 'member');

    CREATE TABLE gc_servers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      boosts INTEGER NOT NULL DEFAULT 0);
    INSERT INTO gc_servers (id, name, owner_user_id, created_at) VALUES (${SERVER_ID}, 'Goober HQ', ${USER_ID}, 1);

    CREATE TABLE gc_server_members (
      server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL, PRIMARY KEY(server_id, user_id));
    INSERT INTO gc_server_members (server_id, user_id, role, joined_at) VALUES (${SERVER_ID}, ${USER_ID}, 'owner', 1);

    CREATE TABLE gc_server_boosts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, PRIMARY KEY (user_id, server_id));

    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER, csrf_token TEXT, created_at INTEGER, expires_at INTEGER);
  `);
  const env = {
    GOOBER_DB: {
      prepare(sql) {
        let bound = [];
        return {
          bind(...values) {
            bound = values;
            return this;
          },
          async first() {
            const row = db.prepare(sql).get(...bound);
            return row === undefined || row === null ? null : row;
          },
          async all() {
            return { results: db.prepare(sql).all(...bound) };
          },
          async run() {
            if (/^SELECT/i.test(sql)) {
              return { meta: { changes: 0 }, results: db.prepare(sql).all(...bound) };
            }
            const result = db.prepare(sql).run(...bound);
            return {
              meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) },
              results: [],
            };
          },
        };
      },
      async batch(statements) {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      },
    },
  };

  // The POST route against the real schema: the same batch the API routes run.
  const token = randomToken();
  const csrf = randomToken(24);
  await db.prepare(
    "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(await sha256Hex(token), USER_ID, csrf, 0, nowSeconds() + 3600);
  const request = new Request(ORIGIN + "/api/servers/" + SERVER_ID + "/boost", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      Cookie: "goober_session=" + token,
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify({}),
  });

  const first = await dispatch(handleServerRoutes, request.clone(), env);
  assert.equal(first.status, 201);
  assert.deepEqual(await bodyOf(first), { server: { id: SERVER_ID, boosts: 1, boostedByMe: true } });

  // The idempotent replay: the DO NOTHING insert changes nothing, the recount
  // re-derives the SAME count, and the diagnostic classifies the 409.
  const second = await dispatch(handleServerRoutes, request, env);
  assert.equal(second.status, 409);
  assert.equal((await bodyOf(second)).error, "You already boosted this server.");

  const boosts = db.prepare("SELECT boosts FROM gc_servers WHERE id = ?").get(SERVER_ID).boosts;
  assert.equal(boosts, 1, "the counter never drifted on replay (still exactly one boost row)");
  const boostRows = db.prepare("SELECT COUNT(*) AS n FROM gc_server_boosts").get().n;
  assert.equal(boostRows, 1);
});
