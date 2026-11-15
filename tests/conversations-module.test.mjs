// Conversations routes (Phase 1, Task 7): DMs and group chats as server-less
// gc_channels rows (kind 'dm'/'group') with their membership in
// gc_conversation_members — find-or-create for DMs (the canonical pair read
// from the member intersection), always-create for groups, the blocked-pair
// refusal, the read-time computed names, and the leave route. Same fake
// conventions as the messages test module: fakeDb records every statement's
// bound values, with batch() carrying each statement's SQL so tests can pin
// the guarded-SQL shape itself (the authorization lives in the query text,
// so that is what the tests assert).
import test from "node:test";
import assert from "node:assert/strict";

import { handleConversationRoutes } from "../api/conversations.mjs";
import { randomToken, sha256Hex, nowSeconds } from "../api/core/crypto.mjs";
import { HttpError, json } from "../api/core/http.mjs";

const ORIGIN = "http://localhost";
const SELF_ID = 7;
const OTHER_ID = 9;
const SECOND_ID = 10;

function get(path, headers = {}) {
  return new Request(ORIGIN + path, { method: "GET", headers });
}

function postJson(path, body, headers = {}) {
  return new Request(ORIGIN + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

function jsonRequest(method, path, headers = {}) {
  return new Request(ORIGIN + path, { method, headers: { Origin: ORIGIN, ...headers } });
}

// Test dispatcher: mirrors worker.mjs's apiError mapping so HttpErrors surface
// as the same JSON responses the worker would return.
async function dispatch(request, env) {
  const url = new URL(request.url);
  let response;
  try {
    response = await handleConversationRoutes(
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

// --- session fixtures -----------------------------------------------------------
// A session row exactly as the vendored readSession SELECT joins it, with a
// real cookie/CSRF token pair for the requireUser-routed requests.

const SESSION_READ_TEST = (sql) => sql.includes("FROM sessions s LEFT JOIN users u");

async function sessionFixtures() {
  const token = randomToken();
  const csrf = randomToken(24);
  const row = {
    token_hash: await sha256Hex(token),
    user_id: SELF_ID,
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
    headers: { Cookie: "goober_session=" + token, "X-CSRF-Token": csrf },
  };
}

const sessionRoute = (row) => ({ test: SESSION_READ_TEST, first: async () => row });

// --- fake-route shapes -----------------------------------------------------------

// Every target member must resolve from the forum users table (read-only).
const USER_LOOKUP_TEST = (sql) =>
  sql.includes("FROM users WHERE id IN") && sql.includes("username");

// The blocked-pair read: either direction of the forum blocks pair refuses.
const BLOCKS_TEST = (sql) =>
  sql.includes("FROM blocks") &&
  sql.includes("blocker_id = ? AND blocked_id IN") &&
  sql.includes("blocked_id = ? AND blocker_id IN");

// The DM find-or-create read: kind = 'dm' channels whose member pairs
// intersect the requested two exactly (the member count of the pair channel
// is 2), read before any insert.
const DM_FIND_TEST = (sql) =>
  sql.includes("FROM gc_channels c") &&
  sql.includes("kind = 'dm'") &&
  sql.includes("= 2") &&
  sql.includes("LIMIT 1");

const CHANNEL_INSERT_TEST = (sql) => sql.startsWith("INSERT INTO gc_channels");

const MEMBER_INSERT_TEST = (sql) =>
  sql.includes("INSERT INTO gc_conversation_members") &&
  sql.includes("last_insert_rowid()");

// GET /api/conversations reads: the caller's dm/group channels with the
// unread count derived from their last_read_message_id, the member roster,
// and the last-message preview — each bound to the session user / channel set.
const CONVERSATIONS_LIST_SQL_TEST = (sql) =>
  sql.includes("FROM gc_channels c JOIN gc_conversation_members m") &&
  sql.includes("c.kind IN ('dm','group')") &&
  sql.includes("gm.id > m.last_read_message_id");

const CONVERSATION_MEMBERS_TEST = (sql) =>
  sql.includes("FROM gc_conversation_members m JOIN users u");

const LAST_MESSAGE_TEST = (sql) => sql.includes("c.last_message_id = m.id");

const LEAVE_MEMBERS_DELETE_TEST = (sql) => sql.startsWith("DELETE FROM gc_conversation_members");
const LEAVE_CHANNEL_DELETE_TEST = (sql) => sql.startsWith("DELETE FROM gc_channels");

// --- fake DB ---------------------------------------------------------------------

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

// Overrides come FIRST: fakeDb's find takes the first route whose test matches,
// so a test's specific routes shadow the base fixtures by being prepended.
const USERS = new Map([
  [9, "wempos"],
  [10, "ada"],
  [11, "bean"],
  [12, "dot"],
]);

const userLookupRoute = () => ({
  test: USER_LOOKUP_TEST,
  all: async (bound) => ({
    results: bound
      .filter((id) => USERS.has(Number(id)))
      .map((id) => ({ id: Number(id), username: USERS.get(Number(id)) })),
  }),
});

// Either block direction with any requested member refuses (the fake models
// the pair's presence, whichever arm the SQL matched).
function baseRoutes({ session, blockedIds = [] } = {}) {
  return [
    sessionRoute(session.row),
    userLookupRoute(),
    {
      test: BLOCKS_TEST,
      first: async (bound) => {
        const half = Math.floor((bound.length - 1) / 2);
        const targets = bound.slice(1, 1 + half).map(Number);
        return targets.some((id) => blockedIds.includes(id)) ? { 1: 1 } : null;
      },
    },
  ];
}

// --- tests -----------------------------------------------------------------------

test("POST creates a DM then re-POSTing the same pair returns the SAME channel id without inserting again", async () => {
  const session = await sessionFixtures();
  // The first POST finds nothing and inserts channel id 1; the fake records
  // it so the pair read can return it on the follow-up POST (find-or-create).
  const state = { channelId: null };

  const db = fakeDb([
    {
      test: DM_FIND_TEST,
      first: async () => (state.channelId !== null ? { id: state.channelId } : null),
    },
    {
      test: CHANNEL_INSERT_TEST,
      run: async () => {
        state.channelId = 1;
        return { meta: { changes: 1, last_row_id: 1 } };
      },
    },
    ...baseRoutes({ session }),
  ]);
  const env = { GOOBER_DB: db };

  const first = await dispatch(
    postJson("/api/conversations", { userIds: [OTHER_ID] }, session.headers),
    env,
  );
  assert.equal(first.status, 201);
  const created = await bodyOf(first);
  assert.equal(created.conversation.id, 1);
  assert.equal(created.conversation.kind, "dm");
  assert.equal(created.conversation.name, "wempos"); // the OTHER member's username
  assert.deepEqual(
    created.conversation.members.map((m) => [m.userId, m.username]),
    [[7, "wempos"], [9, "wempos"]],
  );

  // The channel and BOTH member rows rode one batch; the member rows are
  // keyed to the channel by last_insert_rowid(), not round-tripped.
  const insertBatch = callsOf(db).find((call) => call.call === "batch");
  assert.equal(insertBatch.statements.filter((s) => CHANNEL_INSERT_TEST(s.sql)).length, 1);
  const memberInserts = insertBatch.statements.filter((s) => MEMBER_INSERT_TEST(s.sql));
  assert.equal(memberInserts.length, 2);
  assert.deepEqual(
    memberInserts.map((s) => s.bound[0]),
    [SELF_ID, OTHER_ID],
  );
  // The DM pair read ran BEFORE the batch (find-or-create order).
  const findRead = callsOf(db).find((call) => call.call === "first" && DM_FIND_TEST(call.sql));
  assert.ok(findRead, "the DM pair read ran");
  assert.deepEqual(findRead.bound, [SELF_ID, OTHER_ID]);
  assert.ok(callsOf(db).indexOf(findRead) < callsOf(db).indexOf(insertBatch));

  // A second POST against a pair channel the pair read now RESOLVES: it
  // returns that channel id without any insert.
  const secondRoutes = baseRoutes({ session });
  secondRoutes.splice(1, 0, { test: DM_FIND_TEST, first: async () => ({ id: 1 }) });
  const secondDb = fakeDb(secondRoutes);
  const second = await dispatch(
    postJson("/api/conversations", { userIds: [OTHER_ID] }, session.headers),
    { GOOBER_DB: secondDb },
  );
  assert.equal(second.status, 200);
  const found = await bodyOf(second);
  assert.equal(found.conversation.id, 1);
  assert.deepEqual(
    found.conversation.members.map((m) => [m.userId, m.username]),
    [[7, "wempos"], [9, "wempos"]],
  );
  // No channel was inserted on the found path: no batch ran at all.
  assert.equal(callsOf(secondDb).some((call) => call.call === "batch"), false);
});

function callsOf(db) {
  return db.calls;
}

test("POST with 2–8 ids always creates a NEW group channel, even when the group already exists", async () => {
  const session = await sessionFixtures();
  const db = fakeDb(baseRoutes({ session }));
  const env = { GOOBER_DB: db };

  const first = await dispatch(
    postJson("/api/conversations", { userIds: [OTHER_ID, SECOND_ID] }, session.headers),
    env,
  );
  assert.equal(first.status, 201);
  const created = await bodyOf(first);
  assert.equal(created.conversation.kind, "group");

  // Groups always create: there is no pair read at all for them (the DM
  // find-or-create SQL never runs).
  assert.equal(
    callsOf(db).some((call) => call.call === "first" && DM_FIND_TEST(call.sql)),
    false,
  );
  const firstBatch = callsOf(db).find((call) => call.call === "batch");
  assert.equal(firstBatch.statements.filter((s) => CHANNEL_INSERT_TEST(s.sql)).length, 1);
  // Three members: self + the two invites.
  assert.equal(firstBatch.statements.filter((s) => MEMBER_INSERT_TEST(s.sql)).length, 3);

  const second = await dispatch(
    postJson("/api/conversations", { userIds: [OTHER_ID, SECOND_ID] }, session.headers),
    env,
  );
  assert.equal(second.status, 201);
  const again = await bodyOf(second);
  assert.notEqual(again.conversation.id, created.conversation.id);
  assert.equal(
    callsOf(db).filter((call) => call.call === "batch" &&
      call.statements.some((s) => CHANNEL_INSERT_TEST(s.sql))).length,
    2,
  );
});

test("POST for a blocked pair refuses with the 403 copy and creates nothing", async () => {
  const session = await sessionFixtures();
  const db = fakeDb(baseRoutes({ session, blockedIds: [OTHER_ID] }));

  const response = await dispatch(
    postJson("/api/conversations", { userIds: [OTHER_ID] }, session.headers),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 403);
  assert.equal((await bodyOf(response)).error, "You can't start a conversation with that member.");
  assert.equal(callsOf(db).some((call) => call.call === "batch"), false);

  // The SQL itself checks both arms: the caller as blocker and the caller as
  // the blocked one, over the same requested member set.
  const blocksRead = callsOf(db).find((call) => BLOCKS_TEST(call.sql));
  assert.ok(blocksRead, "the blocks read ran");
  assert.ok(blocksRead.sql.includes("OR"));

  // A group whose invite carries a block refusal is refused the same way.
  const groupDb = fakeDb(baseRoutes({ session, blockedIds: [SECOND_ID] }));
  const groupResponse = await dispatch(
    postJson("/api/conversations", { userIds: [OTHER_ID, SECOND_ID] }, session.headers),
    { GOOBER_DB: groupDb },
  );
  assert.equal(groupResponse.status, 403);
  assert.equal((await bodyOf(groupResponse)).error, "You can't start a conversation with that member.");
});

test("POST with a non-existent userId refuses with 400 before any blocks read", async () => {
  const session = await sessionFixtures();
  const db = fakeDb(baseRoutes({ session }));
  const response = await dispatch(
    postJson("/api/conversations", { userIds: [999] }, session.headers),
    { GOOBER_DB: db },
  );
  assert.equal(response.status, 400);
  assert.equal((await bodyOf(response)).error, "One of those members does not exist.");
  // Existence is validated BEFORE the blocks read: no blocks query ran.
  assert.equal(callsOf(db).some((call) => BLOCKS_TEST(call.sql)), false);
  assert.equal(callsOf(db).some((call) => call.call === "batch"), false);
  // The lookup's IN-list bound exactly the requested ids.
  const lookup = callsOf(db).find((call) => USER_LOOKUP_TEST(call.sql));
  assert.deepEqual(lookup.bound, [999]);
});

test("POST rejects a malformed, empty, oversized, or self-referencing member list with 400", async () => {
  const session = await sessionFixtures();
  for (const body of [
    {}, // not an array
    { userIds: "9" }, // not an array
    { userIds: [] }, // nothing to open
    { userIds: [0] }, // not a plausible id
    { userIds: [SELF_ID] }, // you are already a member
    { userIds: Array.from({ length: 9 }, (_, index) => 20 + index) }, // over the group cap
  ]) {
    const db = fakeDb(baseRoutes({ session }));
    const response = await dispatch(postJson("/api/conversations", body, session.headers), {
      GOOBER_DB: db,
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    // Refused before any member lookup, blocks read, or write ran.
    assert.equal(callsOf(db).some((call) => USER_LOOKUP_TEST(call.sql) || call.call === "batch"), false);
  }
});

test("GET lists only the caller's dm/group channels with read-time names, lastMessage, and unread", async () => {
  const session = await sessionFixtures();
  const db = fakeDb([
    {
      test: CONVERSATIONS_LIST_SQL_TEST,
      all: async () => ({
        results: [
          {
            id: 40,
            kind: "dm",
            last_message_id: 12,
            last_message_at: 300,
            last_read_message_id: 9,
            unread: 3,
          },
          {
            id: 41,
            kind: "group",
            last_message_id: null,
            last_message_at: null,
            last_read_message_id: 0,
            unread: 0,
          },
        ],
      }),
    },
    {
      test: CONVERSATION_MEMBERS_TEST,
      all: async () => ({
        results: [
          { channel_id: 40, member_id: 7, username: "wempos" },
          { channel_id: 40, member_id: 9, username: "wempos" },
          { channel_id: 41, member_id: 7, username: "wempos" },
          { channel_id: 41, member_id: 10, username: "ada" },
          { channel_id: 41, member_id: 11, username: "bean" },
        ],
      }),
    },
    {
      test: LAST_MESSAGE_TEST,
      all: async () => ({
        results: [{ channel_id: 40, body: "hi there", created_at: 300, author_name: "wempos" }],
      }),
    },
    ...baseRoutes({ session }),
  ]);

  const response = await dispatch(get("/api/conversations", session.headers), { GOOBER_DB: db });
  assert.equal(response.status, 200);
  const payload = await bodyOf(response);
  assert.deepEqual(payload.conversations, [
    {
      id: 40,
      name: "wempos", // a dm's name is the OTHER member's username, computed at read
      kind: "dm",
      members: [
        { userId: 7, username: "wempos" },
        { userId: 9, username: "wempos" },
      ],
      lastMessage: { body: "hi there", createdAt: "1970-01-01T00:05:00.000Z", authorName: "wempos" },
      unread: 3,
    },
    {
      id: 41,
      name: "ada, bean", // a group's name is the other members, joined
      kind: "group",
      members: [
        { userId: 7, username: "wempos" },
        { userId: 10, username: "ada" },
        { userId: 11, username: "bean" },
      ],
      lastMessage: null,
      unread: 0,
    },
  ]);

  // The member and last-message reads scoped themselves to the LISTED
  // channels only (an IN list over the caller's channels, never the table).
  const rosterRead = callsOf(db).find((call) => CONVERSATION_MEMBERS_TEST(call.sql));
  assert.ok(rosterRead.sql.includes("IN ("));
  assert.deepEqual(rosterRead.bound, [40, 41]);
  const lastRead = callsOf(db).find((call) => LAST_MESSAGE_TEST(call.sql));
  assert.deepEqual(lastRead.bound, [40, 41]);
});

test("GET unread rides the SQL off last_read_message_id; an outsider's list binds the session user", async () => {
  const session = await sessionFixtures();
  const db = fakeDb(baseRoutes({ session }));
  const response = await dispatch(get("/api/conversations", session.headers), { GOOBER_DB: db });
  assert.equal(response.status, 200);
  assert.deepEqual((await bodyOf(response)).conversations, []);

  const listRead = callsOf(db).find((call) => CONVERSATIONS_LIST_SQL_TEST(call.sql));
  assert.ok(listRead, "the conversation list query ran");
  // Outsider safety: the WHERE binds the SESSION user, never request data.
  assert.deepEqual(listRead.bound, [SELF_ID]);
  // The unread count is a parameterless subselect over the member row's cursor.
  assert.ok(listRead.sql.includes("(SELECT COUNT(*) FROM gc_messages gm"));
  assert.ok(listRead.sql.includes("gm.id > m.last_read_message_id"));
  void response;
});

test("DELETE leaves a group channel and deletes it when the caller is the LAST member", async () => {
  const session = await sessionFixtures();
  const db = fakeDb(baseRoutes({ session }));

  const response = await dispatch(jsonRequest("DELETE", "/api/conversations/40", session.headers), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 200);
  assert.equal((await bodyOf(response)).ok, true);

  const batch = callsOf(db).find((call) => call.call === "batch");
  assert.equal(batch.statements.length, 2);
  const memberDelete = batch.statements[0];
  const channelDelete = batch.statements[1];
  // The leave is group-only and member-scoped: one row, the session user's,
  // and the channel delete fires only when no member row is left.
  assert.ok(LEAVE_MEMBERS_DELETE_TEST(memberDelete.sql));
  assert.ok(memberDelete.sql.includes("kind = 'group'"));
  assert.deepEqual(memberDelete.bound, [40, SELF_ID, 40]);
  assert.ok(LEAVE_CHANNEL_DELETE_TEST(channelDelete.sql));
  assert.ok(channelDelete.sql.includes("kind = 'group'"));
  assert.ok(channelDelete.sql.includes("NOT EXISTS"));
  assert.deepEqual(channelDelete.bound, [40, 40]);
});

test("DELETE when the caller is NOT in the group (or the channel is not a group) answers 404, never 403", async () => {
  const session = await sessionFixtures();
  const db = fakeDb([
    { test: LEAVE_MEMBERS_DELETE_TEST, run: async () => ({ meta: { changes: 0 } }) },
    ...baseRoutes({ session }),
  ]);
  const response = await dispatch(jsonRequest("DELETE", "/api/conversations/40", session.headers), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 404);
  // The 404 never leaks anything: the paired channel delete in the same batch
  // stays NOT-EXISTS-guarded, so an unrouted member row still deletes nothing.
  const batch = callsOf(db).find((call) => call.call === "batch");
  assert.ok(batch.statements.some((s) => LEAVE_CHANNEL_DELETE_TEST(s.sql) && s.sql.includes("NOT EXISTS")));
});

test("unknown conversation routes fall through to the dispatcher's 404", async () => {
  const session = await sessionFixtures();
  const db = fakeDb(baseRoutes({ session }));
  const response = await dispatch(jsonRequest("DELETE", "/api/conversations/", session.headers), {
    GOOBER_DB: db,
  });
  assert.equal(response.status, 404);
});
