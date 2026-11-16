// Servers and channels routes (Phase 1, Task 4): server create/list and the
// moderator-gated channel create, driven against a fake GOOBER_DB. Same fake
// conventions as the accounts test module — fakeDb records every statement's
// bound values, with batch() carrying each statement's SQL so tests can pin
// the guarded-SQL shape itself (the authorization contract lives in the
// query text, so that is what the tests assert).
import test from "node:test";
import assert from "node:assert/strict";

import { handleServerRoutes } from "../api/servers.mjs";
import { randomToken, sha256Hex, nowSeconds } from "../api/core/crypto.mjs";
import { HttpError, json } from "../api/core/http.mjs";
import { MAX_CHANNELS_PER_SERVER } from "../constants.mjs";

const ORIGIN = "http://localhost";
const USER_ID = 7;

function get(path, headers = {}) {
  return new Request(ORIGIN + path, { method: "GET", headers });
}

function postJson(path, body, headers = {}) {
  return new Request(ORIGIN + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// Test dispatcher: mirrors worker.mjs's apiError mapping so HttpErrors surface
// as the same JSON responses the worker would return.
async function dispatch(request, env) {
  const url = new URL(request.url);
  let response;
  try {
    response = await handleServerRoutes(
      request,
      env,
      url,
      url.pathname,
      request.method.toUpperCase(),
      undefined,
    );
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

// Ordered fake DB: the first matching route answers each statement shape.
// Top-level run() calls are recorded individually; batch() is recorded as ONE
// call carrying every statement's SQL + bound values (a real D1 batch executes
// its statements under a single transaction). Unrouted runs default to a
// single-row insert with an incrementing last_row_id, like a real write.
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
      // Batch statements execute without their own call entries: the batch
      // entry alone carries each statement's SQL + bound values.
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

// --- session fixtures -----------------------------------------------------------
// The signed-in shape: a session row behind the vendored readSession SELECT,
// with a real cookie/CSRF token pair for requireUser-routed requests.

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
  return { token, csrf, row };
}

// --- handler contract -----------------------------------------------------------

test("unknown API paths fall through to the worker's handler loop", async () => {
  const response = await handleServerRoutes(
    get("/api/nope"),
    { GOOBER_DB: fakeDb([]) },
    new URL(ORIGIN + "/api/nope"),
    "/api/nope",
    "GET",
    undefined,
  );
  assert.equal(response, undefined);
});

test("non-numeric server id paths fall through to the worker's 404", async () => {
  const response = await handleServerRoutes(
    postJson("/api/servers/abc/channels", { name: "x", kind: "text" }),
    { GOOBER_DB: fakeDb([]) },
    new URL(ORIGIN + "/api/servers/abc/channels"),
    "/api/servers/abc/channels",
    "POST",
    undefined,
  );
  assert.equal(response, undefined);
});

// --- POST /api/servers ----------------------------------------------------------

test("creating a server rides one batch and returns its id with a #general channel", async () => {
  const { token, csrf, row } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    {
      test: (sql) =>
        sql.includes("SELECT id, name, kind, position FROM gc_channels WHERE server_id = ?") &&
        sql.includes("name = 'general'"),
      first: async () => ({ id: 4, name: "general", kind: "text", position: 0 }),
    },
  ]);
  const response = await dispatch(
    postJson(
      "/api/servers",
      { name: "Goober HQ" },
      { Cookie: "goober_session=" + token, "X-CSRF-Token": csrf },
    ),
    { GOOBER_DB: db },
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(await bodyOf(response), {
    server: { id: 1, name: "Goober HQ" },
    channels: [{ id: 4, name: "general", kind: "text", position: 0 }],
  });

  // One atomic batch: the server row, its owner membership, and the #general
  // channel together — no sequential write, no read-then-write id round trip.
  const batch = db.calls.find((call) => call.call === "batch");
  assert.ok(batch);
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run"),
    [],
  );

  const writeSqls = batch.statements.map((statement) => statement.sql);
  // Scoping pin: every written table is a gc_ table.
  for (const writeSql of writeSqls) {
    assert.match(writeSql, /^INSERT INTO gc_/);
  }
  assert.match(writeSqls[0], /^INSERT INTO gc_servers \(name, owner_user_id, created_at\)/);
  assert.match(writeSqls[1], /INSERT INTO gc_server_members/);
  assert.match(writeSqls[2], /INSERT INTO gc_channels/);
  assert.match(writeSqls[2], /'general', 'text', 0/);

  // Bindings: the session user owns the server it creates.
  assert.equal(batch.statements[0].bound[0], "Goober HQ");
  assert.equal(batch.statements[0].bound[1], USER_ID);
  assert.equal(batch.statements[1].bound[0], USER_ID);
  assert.equal(batch.statements[1].bound[1], "owner");
  // The member/channel inserts derive their server id from last_insert_rowid()
  // INSIDE the batch — never a client-roundtripped id.
  assert.match(writeSqls[1], /SELECT last_insert_rowid\(\), \?, \?, \?$/);
  assert.match(writeSqls[2], /SELECT last_insert_rowid\(\)/);
});

test("server create rejects a whitespace-only name with 400 and zero D1 writes", async () => {
  const { token, csrf, row } = await sessionFixtures();
  const db = fakeDb([{ test: SESSION_READ_TEST, first: async () => row }]);
  const response = await dispatch(
    postJson(
      "/api/servers",
      { name: "   " },
      { Cookie: "goober_session=" + token, "X-CSRF-Token": csrf },
    ),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await bodyOf(response), {
    error: "Server name must be between 1 and 100 characters.",
  });
  // No batch, no write: only the session read ever reached the database.
  assert.deepEqual(
    db.calls.filter((call) => call.call === "batch" || call.call === "run"),
    [],
  );
});

test("server create demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(postJson("/api/servers", { name: "Goober HQ" }), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 401);
  // The vendored requireCsrf wording for a missing session.
  assert.deepEqual(await bodyOf(response), {
    error: "Your session has expired. Reload the page and sign in again.",
  });
  assert.deepEqual(
    db.calls.filter((call) => call.call === "batch" || call.call === "run"),
    [],
  );
});

// --- GET /api/servers -----------------------------------------------------------

const SERVERS_LIST_SELECT_TEST = (sql) =>
  sql.includes("FROM gc_server_members m") &&
  sql.includes("JOIN gc_servers s ON s.id = m.server_id") &&
  sql.includes("LEFT JOIN gc_channels c ON c.server_id = s.id") &&
  sql.includes("ORDER BY s.id, c.position, c.id");

test("GET /api/servers lists a member's two servers with roles and channel lists", async () => {
  const { token, csrf, row } = await sessionFixtures();
  const db = fakeDb([
    { test: SESSION_READ_TEST, first: async () => row },
    {
      // One joined query; rows arrive ordered by (server, position, id).
      test: SERVERS_LIST_SELECT_TEST,
      all: async () => ({
        results: [
          { server_id: 1, server_name: "Alpha", role: "member", channel_id: 10, channel_name: "general", channel_kind: "text", channel_position: 0 },
          { server_id: 1, server_name: "Alpha", role: "member", channel_id: 11, channel_name: "lounge", channel_kind: "voice", channel_position: 1 },
          { server_id: 2, server_name: "Beta", role: "moderator", channel_id: 12, channel_name: "general", channel_kind: "text", channel_position: 0 },
        ],
      }),
    },
  ]);
  const response = await dispatch(
    get("/api/servers", { Cookie: "goober_session=" + token }),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), {
    servers: [
      {
        id: 1,
        name: "Alpha",
        role: "member",
        // Goober+ boosts ride the list additively; a row without the columns
        // reads as unboosted and not boosted by the caller.
        boosts: 0,
        boostedByMe: false,
        channels: [
          { id: 10, name: "general", kind: "text", position: 0 },
          { id: 11, name: "lounge", kind: "voice", position: 1 },
        ],
      },
      {
        id: 2,
        name: "Beta",
        role: "moderator",
        boosts: 0,
        boostedByMe: false,
        channels: [{ id: 12, name: "general", kind: "text", position: 0 }],
      },
    ],
  });

  // The one joined query also carries the DM/group exclusion explicitly.
  const list = db.calls.find((call) => call.call === "all");
  assert.ok(list);
  assert.match(list.sql, /c\.server_id IS NOT NULL/);
});

test("GET /api/servers demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(get("/api/servers"), { GOOBER_DB: db });
  assert.equal(response.status, 401);
  assert.deepEqual(await bodyOf(response), { error: "Please sign in to do that." });
  // Never read a roster without a session — the caller's user_id is not guessed.
  assert.deepEqual(
    db.calls.filter((call) => call.call === "all"),
    [],
  );
});

// --- POST /api/servers/:id/channels ----------------------------------------------

const CHANNEL_INSERT_TEST = (sql) =>
  sql.includes("INSERT INTO gc_channels (server_id, name, kind, position, created_at)") &&
  sql.includes("FROM gc_server_members") &&
  sql.includes("COUNT(*)");

const CHANNEL_RESELECT_TEST = (sql) =>
  sql.includes("SELECT id, name, kind, position FROM gc_channels WHERE id = ? AND server_id = ?");

const MEMBERSHIP_ROLE_TEST = (sql) =>
  sql.includes("SELECT role FROM gc_server_members WHERE server_id = ? AND user_id = ?");

// Stateful channel-cap stand-in: the guarded INSERT's COUNT(*) precondition is
// real SQL, so the fake decides changes=0/1 from a simulated existing-channel
// count, exactly as D1 would.
function channelCapRoutes(role, existingChannels) {
  const state = { channels: existingChannels, role };
  return {
    state,
    routes: [
      {
        test: CHANNEL_INSERT_TEST,
        run: () => {
          // D1 evaluates BOTH preconditions (role and cap) inside the INSERT;
          // the fake refuses anything either would refuse.
          const privileged = state.role === "owner" || state.role === "moderator";
          if (!privileged || state.channels >= MAX_CHANNELS_PER_SERVER) {
            return { meta: { changes: 0 } };
          }
          state.channels += 1;
          return { meta: { changes: 1, last_row_id: 90 } };
        },
      },
      { test: MEMBERSHIP_ROLE_TEST, first: async () => (state.role ? { role: state.role } : null) },
      {
        test: CHANNEL_RESELECT_TEST,
        first: async () => ({
          id: 90,
          name: "voice-1",
          kind: "voice",
          position: state.channels - 1,
        }),
      },
    ],
  };
}

async function sessioned(routes) {
  const { token, csrf, row } = await sessionFixtures();
  return {
    db: fakeDb([{ test: SESSION_READ_TEST, first: async () => row }, ...routes]),
    createChannelRequest: (body) =>
      postJson(
        "/api/servers/3/channels",
        body,
        { Cookie: "goober_session=" + token, "X-CSRF-Token": csrf },
      ),
  };
}

test("an owner appends a channel at the next position inside the guarded INSERT", async () => {
  // Server #3 holds 7 channels (general + 6 more): the 8th is still allowed.
  const { routes } = channelCapRoutes("owner", 7);
  const { db, createChannelRequest } = await sessioned(routes);
  const response = await dispatch(createChannelRequest({ name: "voice-1", kind: "voice" }), {
    GOOBER_DB: db,
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await bodyOf(response), {
    channel: { id: 90, name: "voice-1", kind: "voice", position: 7 },
  });

  const insert = db.calls.find((call) => call.call === "run" && CHANNEL_INSERT_TEST(call.sql));
  assert.ok(insert);
  // The role precondition rides INSIDE the INSERT — no read-then-write gate.
  assert.match(insert.sql, /role IN \('owner','moderator'\)/);
  // The cap precondition rides INSIDE the INSERT (MAX 8, minus the one joining).
  assert.match(insert.sql, /\(SELECT COUNT\(\*\) FROM gc_channels WHERE server_id = \?\) <= 7/);
  // Position appends after the current max.
  assert.match(
    insert.sql,
    /\(SELECT COALESCE\(MAX\(position\), -1\) \+ 1 FROM gc_channels WHERE server_id = \?\)/,
  );
  // Bindings: server id, name, kind, then the subquery's server id, then the
  // created timestamp — never a client-supplied position.
  assert.deepEqual(
    insert.bound.filter((value, index) => index !== 4),
    [3, "voice-1", "voice", 3, 3, USER_ID, 3],
  );
  assert.equal(typeof insert.bound[4], "number");
});

test("the channel create past the 8-channel cap 400s with the exact limit message", async () => {
  // Server #3 is already at the cap (8 channels): the guarded INSERT's
  // COUNT(*) precondition lets nothing through, and the membership read that
  // follows only classifies the failure — authority stayed inside the INSERT.
  const { state, routes } = channelCapRoutes("owner", 8);
  const { db, createChannelRequest } = await sessioned(routes);
  const response = await dispatch(createChannelRequest({ name: "voice-2", kind: "voice" }), {
    GOOBER_DB: db,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await bodyOf(response), {
    error: "That server has reached its channel limit.",
  });
  assert.equal(state.channels, 8); // nothing was created
  const insert = db.calls.find((call) => call.call === "run" && CHANNEL_INSERT_TEST(call.sql));
  assert.ok(insert);
  assert.match(insert.sql, /INSERT INTO gc_channels/);
});

test("a plain member's channel create 403s instead of the cap message", async () => {
  const { state, routes } = channelCapRoutes("member", 0);
  const { db, createChannelRequest } = await sessioned(routes);
  const response = await dispatch(createChannelRequest({ name: "secret", kind: "text" }), {
    GOOBER_DB: db,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await bodyOf(response), {
    error: "You do not have permission to do that.",
  });
  assert.equal(state.channels, 0);
  // The guarded insert ran (changes=0), then the role diagnostic classified it.
  assert.ok(db.calls.find((call) => call.call === "run" && CHANNEL_INSERT_TEST(call.sql)));
  assert.ok(db.calls.find((call) => MEMBERSHIP_ROLE_TEST(call.sql)));
});

test("a non-member's channel create 403s and reveals no server existence", async () => {
  const { state, routes } = channelCapRoutes(null, 0);
  const { db, createChannelRequest } = await sessioned(routes);
  const response = await dispatch(createChannelRequest({ name: "secret", kind: "text" }), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await bodyOf(response), {
    error: "You do not have permission to do that.",
  });
  assert.equal(state.channels, 0);
});

test("channel create rejects a non-text/voice kind with 400 before any write", async () => {
  const { routes } = channelCapRoutes("owner", 0);
  const { db, createChannelRequest } = await sessioned(routes);
  const response = await dispatch(createChannelRequest({ name: "dm-ish", kind: "dm" }), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await bodyOf(response), {
    error: "Channel kind must be either text or voice.",
  });
  assert.equal(
    db.calls.find((call) => CHANNEL_INSERT_TEST(call.sql)),
    undefined,
  );
});

test("channel create rejects a whitespace-only name with 400 before any write", async () => {
  const { routes } = channelCapRoutes("owner", 0);
  const { db, createChannelRequest } = await sessioned(routes);
  const response = await dispatch(createChannelRequest({ name: "  ", kind: "text" }), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await bodyOf(response), {
    error: "Channel name must be between 1 and 100 characters.",
  });
  assert.equal(
    db.calls.find((call) => CHANNEL_INSERT_TEST(call.sql)),
    undefined,
  );
});

test("channel create demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(
    postJson("/api/servers/3/channels", { name: "nope", kind: "text" }),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 401);
  // The vendored requireCsrf wording for a missing session.
  assert.deepEqual(await bodyOf(response), {
    error: "Your session has expired. Reload the page and sign in again.",
  });
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run" || call.call === "batch"),
    [],
  );
});
