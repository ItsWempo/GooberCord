// Discovery + invites routes (migration 0004): invite minting/joining, the
// discovery grid + its guard, and the owner-only is_public PATCH, driven
// against the same fakeDb conventions as the servers/accounts test modules —
// every statement's bound values are recorded, and the guarded-SQL shape
// itself is what the tests pin (the authorization contract lives in the
// query text). Kept in its own file so parallel server-settings workers
// can stack regions in api/servers.mjs without colliding on this test.
import test from "node:test";
import assert from "node:assert/strict";

import { handleServerRoutes } from "../api/servers.mjs";
import { randomToken, sha256Hex, nowSeconds } from "../api/core/crypto.mjs";
import { HttpError, json } from "../api/core/http.mjs";

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

// Ordered fake DB — same conventions as tests/servers-module.test.mjs.
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

// --- session fixtures -----------------------------------------------------------

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

async function authed(routes) {
  const { token, csrf, row } = await sessionFixtures();
  const db = fakeDb([{ test: SESSION_READ_TEST, first: async () => row }, ...routes]);
  const request = (path, body, method = "POST") =>
    method === "GET"
      ? get(path, { Cookie: "goober_session=" + token })
      : new Request(ORIGIN + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Origin: ORIGIN,
            Cookie: "goober_session=" + token,
            "X-CSRF-Token": csrf,
          },
          body: method === "GET" ? undefined : JSON.stringify(body),
        });
  return { db, request };
}

const MEMBERSHIP_ROLE_TEST = (sql) =>
  sql.includes("SELECT role FROM gc_server_members WHERE server_id = ? AND user_id = ?");

// --- POST /api/servers/:id/invites --------------------------------------------------

const INVITE_INSERT_TEST = (sql) =>
  sql.includes("INSERT INTO gc_invites (code, server_id, created_by, created_at)") &&
  sql.includes("owner_user_id = ?");

test("an owner mints an 8-char base64url invite through the owner-guarded INSERT", async () => {
  const { db, request } = await authed([]);
  const response = await dispatch(request("/api/servers/3/invites", {}), { GOOBER_DB: db });

  assert.equal(response.status, 201);
  const { code } = await bodyOf(response);
  // randomToken(6) is exactly 8 base64url characters (48 bits -> 8 x 6 bits).
  assert.match(code, /^[A-Za-z0-9_-]{8}$/);

  const insert = db.calls.find((call) => call.call === "run" && INVITE_INSERT_TEST(call.sql));
  assert.ok(insert);
  assert.match(insert.sql, /SELECT \?, \?, \?, \? WHERE EXISTS \(SELECT 1 FROM gc_servers WHERE id = \? AND owner_user_id = \?\)/);
  // Bindings: code, server, creator, timestamp, then the WHERE's own pair —
  // the owner rider rides INSIDE the INSERT's SELECT, never as a read gate.
  assert.deepEqual(insert.bound, [code, 3, USER_ID, insert.bound[3], 3, USER_ID]);
  assert.equal(typeof insert.bound[3], "number");
});

test("a non-member's invite mint 403s after the changes=0 classification read", async () => {
  const { db, request } = await authed([
    { test: INVITE_INSERT_TEST, run: async () => ({ meta: { changes: 0 } }) },
    { test: MEMBERSHIP_ROLE_TEST, first: async () => null },
  ]);
  const response = await dispatch(request("/api/servers/3/invites", {}), { GOOBER_DB: db });
  assert.equal(response.status, 403);
  assert.deepEqual(await bodyOf(response), { error: "You do not have permission to do that." });
  assert.ok(db.calls.find((call) => MEMBERSHIP_ROLE_TEST(call.sql)));
});

test("an owner's invite mint on a vanished server 404s", async () => {
  const { db, request } = await authed([
    { test: INVITE_INSERT_TEST, run: async () => ({ meta: { changes: 0 } }) },
    { test: MEMBERSHIP_ROLE_TEST, first: async () => ({ role: "owner" }) },
  ]);
  const response = await dispatch(request("/api/servers/3/invites", {}), { GOOBER_DB: db });
  assert.equal(response.status, 404);
  assert.deepEqual(await bodyOf(response), { error: "That server does not exist." });
});

test("invite minting demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(postJson("/api/servers/3/invites", {}), { GOOBER_DB: db });
  assert.equal(response.status, 401);
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run" || call.call === "batch"),
    [],
  );
});

test("non-numeric/unknown invite-mint paths fall through to the worker's 404", async () => {
  const response = await handleServerRoutes(
    postJson("/api/servers/abc/invites", {}),
    { GOOBER_DB: fakeDb([]) },
    new URL(ORIGIN + "/api/servers/abc/invites"),
    "/api/servers/abc/invites",
    "POST",
    undefined,
  );
  assert.equal(response, undefined);
});

// --- POST /api/invites/:code/join ----------------------------------------------------

const INVITE_LOOKUP_TEST = (sql) =>
  sql.includes("FROM gc_invites WHERE code = ? LIMIT 1");
const INVITE_MEMBER_INSERT_TEST = (sql) =>
  sql.startsWith("INSERT OR IGNORE INTO gc_server_members");
const INVITE_USES_BUMP_TEST = (sql) =>
  sql.includes("UPDATE gc_invites SET uses = uses + 1 WHERE code = ?");

test("a fresh invite join inserts the member and bumps uses once", async () => {
  const { db, request } = await authed([
    { test: INVITE_LOOKUP_TEST, first: async () => ({ server_id: 3 }) },
    { test: INVITE_MEMBER_INSERT_TEST, run: async () => ({ meta: { changes: 1 } }) },
  ]);
  const response = await dispatch(request("/api/invites/Goober12/join", {}), { GOOBER_DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { joined: true, serverId: 3 });

  const bump = db.calls.find((call) => INVITE_USES_BUMP_TEST(call.sql));
  assert.ok(bump);
  assert.deepEqual(bump.bound, ["Goober12"]);

  // Membership rides INSERT OR IGNORE — a member role, never a stale shape.
  const insert = db.calls.find((call) => call.call === "run" && INVITE_MEMBER_INSERT_TEST(call.sql));
  assert.ok(insert);
  assert.deepEqual(insert.bound, [3, USER_ID, insert.bound[2]]);
  assert.equal(typeof insert.bound[2], "number");
});

test("an idempotent re-join answers joined:false without moving uses", async () => {
  const { db, request } = await authed([
    { test: INVITE_LOOKUP_TEST, first: async () => ({ server_id: 3 }) },
    { test: INVITE_MEMBER_INSERT_TEST, run: async () => ({ meta: { changes: 0 } }) },
  ]);
  const response = await dispatch(request("/api/invites/Goober12/join", {}), { GOOBER_DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { joined: false, serverId: 3 });
  // Only a fresh join counts: no uses UPDATE ever ran.
  assert.equal(
    db.calls.find((call) => INVITE_USES_BUMP_TEST(call.sql)),
    undefined,
  );
});

test("an unknown invite code 404s with zero writes", async () => {
  const { db, request } = await authed([
    { test: INVITE_LOOKUP_TEST, first: async () => null },
  ]);
  const response = await dispatch(request("/api/invites/GoneAway/join", {}), { GOOBER_DB: db });

  assert.equal(response.status, 404);
  assert.deepEqual(await bodyOf(response), { error: "That invite is no longer valid." });
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run" || call.call === "batch"),
    [],
  );
});

test("an invite code outside the base64url shape falls through to the worker's 404", async () => {
  const path = "/api/invites/not a code/join";
  const response = await handleServerRoutes(
    postJson(path, {}),
    { GOOBER_DB: fakeDb([]) },
    new URL(ORIGIN + path),
    path,
    "POST",
    undefined,
  );
  assert.equal(response, undefined);
});

test("invite joining demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(postJson("/api/invites/Goober12/join", {}), { GOOBER_DB: db });
  assert.equal(response.status, 401);
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run" || call.call === "batch"),
    [],
  );
});

// --- GET /api/discover ----------------------------------------------------------------

const DISCOVER_SELECT_TEST = (sql) =>
  sql.includes("FROM gc_servers s") &&
  sql.includes("WHERE s.is_public = 1 AND NOT EXISTS (") &&
  sql.includes("me.server_id = s.id AND me.user_id = ?") &&
  sql.includes("ORDER BY s.id LIMIT 50");

test("GET /api/discover lists public servers server-side-excluding the caller", async () => {
  const { db, request } = await authed([
    {
      test: DISCOVER_SELECT_TEST,
      all: async () => ({
        results: [
          { server_id: 2, server_name: "Beta", member_count: 4 },
          { server_id: 5, server_name: "Gamma", member_count: 1 },
        ],
      }),
    },
  ]);
  const response = await dispatch(request("/api/discover", undefined, "GET"), {
    GOOBER_DB: db,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), {
    servers: [
      { id: 2, name: "Beta", memberCount: 4 },
      { id: 5, name: "Gamma", memberCount: 1 },
    ],
  });

  // The member count is a server-side subquery and the caller's membership
  // exclusion rides NOT EXISTS — the roster never round-trips through the
  // client — with the LIMIT 50 cap.
  const discover = db.calls.find((call) => call.call === "all");
  assert.ok(discover);
  assert.match(discover.sql, /COUNT\(\*\) FROM gc_server_members m WHERE m\.server_id = s\.id/);
  assert.deepEqual(discover.bound, [USER_ID]);
});

test("GET /api/discover demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(get("/api/discover"), { GOOBER_DB: db });
  assert.equal(response.status, 401);
  assert.deepEqual(db.calls.filter((call) => call.call === "all"), []);
});

// --- POST /api/discover/:id/join ------------------------------------------------------

const DISCOVER_JOIN_INSERT_TEST = (sql) =>
  sql.startsWith("INSERT INTO gc_server_members (server_id, user_id, role, joined_at)") &&
  sql.includes("is_public = 1");
const DISCOVER_MEMBER_PROBE_TEST = (sql) =>
  sql.includes("SELECT 1 AS member FROM gc_server_members WHERE server_id = ? AND user_id = ?");

test("a discover join rides the is_public = 1 precondition inside the INSERT", async () => {
  const { db, request } = await authed([
    { test: DISCOVER_JOIN_INSERT_TEST, run: async () => ({ meta: { changes: 1 } }) },
  ]);
  const response = await dispatch(request("/api/discover/3/join", {}), { GOOBER_DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { joined: true, serverId: 3 });

  const insert = db.calls.find((call) => call.call === "run" && DISCOVER_JOIN_INSERT_TEST(call.sql));
  assert.ok(insert);
  assert.match(insert.sql, /WHERE EXISTS \(SELECT 1 FROM gc_servers WHERE id = \? AND is_public = 1\)/);
  assert.deepEqual(insert.bound, [3, USER_ID, insert.bound[2], 3]);
  assert.equal(typeof insert.bound[2], "number");
});

test("a discover join by an existing member returns joined:false", async () => {
  const { db, request } = await authed([
    { test: DISCOVER_JOIN_INSERT_TEST, run: async () => ({ meta: { changes: 0 } }) },
    { test: DISCOVER_MEMBER_PROBE_TEST, first: async () => ({ member: 1 }) },
  ]);
  const response = await dispatch(request("/api/discover/3/join", {}), { GOOBER_DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { joined: false });
});

test("a discover join closed by the guard 404s with the discovery copy", async () => {
  const { db, request } = await authed([
    { test: DISCOVER_JOIN_INSERT_TEST, run: async () => ({ meta: { changes: 0 } }) },
    { test: DISCOVER_MEMBER_PROBE_TEST, first: async () => null },
  ]);
  const response = await dispatch(request("/api/discover/3/join", {}), { GOOBER_DB: db });

  assert.equal(response.status, 404);
  assert.deepEqual(await bodyOf(response), {
    error: "That server is not open for discovery.",
  });
  // Authority rode the INSERT; exactly one guarded write ran (and failed).
  assert.equal(db.calls.filter((call) => call.call === "run").length, 1);
});

test("discover joining demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(postJson("/api/discover/3/join", {}), { GOOBER_DB: db });
  assert.equal(response.status, 401);
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run" || call.call === "batch"),
    [],
  );
});

// --- PATCH /api/servers/:id -----------------------------------------------------------

const SERVER_PATCH_TEST = (sql) =>
  sql.startsWith("UPDATE gc_servers SET is_public = ?") &&
  sql.includes("WHERE id = ? AND owner_user_id = ?");

test("an owner flips is_public through the owner-ridden UPDATE", async () => {
  const { db, request } = await authed([
    { test: SERVER_PATCH_TEST, run: async () => ({ meta: { changes: 1 } }) },
  ]);
  const response = await dispatch(
    request("/api/servers/3", { is_public: true }, "PATCH"),
    { GOOBER_DB: db },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { server: { id: 3, isPublic: true } });

  const update = db.calls.find((call) => call.call === "run" && SERVER_PATCH_TEST(call.sql));
  assert.ok(update);
  assert.deepEqual(update.bound, [1, 3, USER_ID]);
});

test("an owner flipping back to private binds the 0 form", async () => {
  const { db, request } = await authed([
    { test: SERVER_PATCH_TEST, run: async () => ({ meta: { changes: 1 } }) },
  ]);
  const response = await dispatch(
    request("/api/servers/3", { is_public: false }, "PATCH"),
    { GOOBER_DB: db },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { server: { id: 3, isPublic: false } });

  const update = db.calls.find((call) => call.call === "run" && SERVER_PATCH_TEST(call.sql));
  assert.ok(update);
  assert.deepEqual(update.bound, [0, 3, USER_ID]);
});

test("PATCH is_public is strictly boolean — string/number shapes 400 before any write", async () => {
  for (const bad of ["true", 1, null]) {
    const { db, request } = await authed([]);
    const response = await dispatch(
      request("/api/servers/3", { is_public: bad }, "PATCH"),
      { GOOBER_DB: db },
    );
    assert.equal(response.status, 400, "bad value " + JSON.stringify(bad));
    assert.deepEqual(await bodyOf(response), { error: "is_public must be true or false." });
    assert.deepEqual(
      db.calls.filter((call) => call.call === "run" || call.call === "batch"),
      [],
    );
  }
});

test("PATCH with no editable fields reports 'Nothing to update' before any write", async () => {
  const { db, request } = await authed([]);
  const response = await dispatch(request("/api/servers/3", {}, "PATCH"), { GOOBER_DB: db });
  assert.equal(response.status, 400);
  assert.deepEqual(await bodyOf(response), { error: "Nothing to update." });
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run" || call.call === "batch"),
    [],
  );
});

test("a non-owner's PATCH 403s after the changes=0 classification read", async () => {
  const { db, request } = await authed([
    { test: SERVER_PATCH_TEST, run: async () => ({ meta: { changes: 0 } }) },
    { test: MEMBERSHIP_ROLE_TEST, first: async () => ({ role: "member" }) },
  ]);
  const response = await dispatch(
    request("/api/servers/3", { is_public: false }, "PATCH"),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await bodyOf(response), { error: "You do not have permission to do that." });
});

test("an owner's PATCH on a vanished server 404s", async () => {
  const { db, request } = await authed([
    { test: SERVER_PATCH_TEST, run: async () => ({ meta: { changes: 0 } }) },
    { test: MEMBERSHIP_ROLE_TEST, first: async () => ({ role: "owner" }) },
  ]);
  const response = await dispatch(
    request("/api/servers/3", { is_public: false }, "PATCH"),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await bodyOf(response), { error: "That server does not exist." });
});

test("PATCH /api/servers/:id demands a signed-in session", async () => {
  const db = fakeDb([]);
  const response = await dispatch(
    new Request(ORIGIN + "/api/servers/3", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ is_public: true }),
    }),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(
    db.calls.filter((call) => call.call === "run" || call.call === "batch"),
    [],
  );
});
