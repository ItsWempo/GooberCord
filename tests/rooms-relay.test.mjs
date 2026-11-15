// ChatRoom Durable Object relay (Phase 1, Task 8): driven with fake ctx/env —
// the fake ctx accepts the DO's server-side socket (so tests can inspect every
// emitted frame) and a fake `__sendMessageToChannel` env hook stands in for the
// Task 5 send primitive (which the DO must persist through, never re-encode).
// Every dispatched WS event shape gets a pin: msg fan-out, typing, roster
// join/leave, bad frames, binary reservation, pong echo, send failures.
import test from "node:test";
import assert from "node:assert/strict";

import { ChatRoom } from "../api/rooms.mjs";
import { handleWsRoutes } from "../api/ws.mjs";
import { randomToken, sha256Hex, nowSeconds } from "../api/core/crypto.mjs";
import { HttpError } from "../api/core/http.mjs";

const ORIGIN = "http://localhost";
const CHANNEL_ID = 3;
const MEMBER_ID = 7;

// --- fake DO context -------------------------------------------------------------
// Matches the hibernation surface ChatRoom drives: acceptWebSocket (per
// connection), getWebSockets() (the fan-out enumeration).
function fakeCtx() {
  const accepted = [];
  return {
    accepted,
    acceptWebSocket(ws) {
      accepted.push(ws);
    },
    getWebSockets() {
      return accepted.slice();
    },
    // workerd removes the socket from getWebSockets() BEFORE the close
    // handler runs, so the fake models the same ordering for the leave pin.
    webSocketClosed(ws) {
      const index = accepted.indexOf(ws);
      if (index >= 0) accepted.splice(index, 1);
    },
  };
}

// --- fake send primitive ---------------------------------------------------------
function envWithSender(records, response = null) {
  return {
    __sendMessageToChannel: async (env, user, channelId, body, clientMessageId) => {
      records.push({ userId: user.id, channelId, body, clientMessageId });
      if (!response) {
        return {
          message: {
            id: 42,
            authorId: Number(user.id),
            authorName: user.username,
            body,
            editedAt: null,
            source: null,
            attachmentIds: [],
          },
          created: true,
        };
      }
      return response;
    },
  };
}

function makeRoom(env) {
  const ctx = fakeCtx();
  return { room: new ChatRoom(ctx, env), ctx };
}

async function connect(room, ctx, { userId, username, channelKind }) {
  const request = new Request(
    `https://chat.internal/api/ws?channel=${CHANNEL_ID}&userId=${userId}` +
      `&username=${encodeURIComponent(username)}&channelKind=${channelKind}`,
    { headers: { Upgrade: "websocket" } },
  );
  const response = await room.fetch(request);
  assert.equal(response.status, 101);
  return ctx.accepted[ctx.accepted.length - 1];
}

function sentFrames(socket) {
  return socket.sent.map((frame) => JSON.parse(frame));
}
function clearFrames(socket) {
  socket.sent.length = 0;
}

test("msg persists through the send primitive and spreads to the other sockets, never the sender", async () => {
  const records = [];
  const env = envWithSender(records);
  const { room, ctx } = makeRoom(env);
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob", channelKind: "dm" });
  clearFrames(alice);
  clearFrames(bob);

  await room.webSocketMessage(alice, JSON.stringify({
    type: "msg",
    clientMessageId: "abcdefgh1234",
    body: "hi from alice",
  }));

  // Persisted exactly once, through the primitive's own signature, with the
  // socket's tagged identity as the user — no duplicate persistence in the DO.
  assert.deepEqual(records, [{
    userId: 1,
    channelId: CHANNEL_ID,
    body: "hi from alice",
    clientMessageId: "abcdefgh1234",
  }]);

  // The sender hears nothing; the other socket gets the Task 5 message shape.
  assert.deepEqual(sentFrames(alice), []);
  assert.deepEqual(sentFrames(bob), [{
    type: "msg",
    message: {
      id: 42,
      authorId: 1,
      authorName: "alice",
      body: "hi from alice",
      editedAt: null,
      source: null,
      attachmentIds: [],
    },
  }]);
});

test("typing broadcasts to the others without persisting anything", async () => {
  const records = [];
  const env = envWithSender(records);
  const { room, ctx } = makeRoom(env);
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob", channelKind: "dm" });
  clearFrames(alice);
  clearFrames(bob);

  await room.webSocketMessage(alice, JSON.stringify({ type: "typing" }));

  assert.deepEqual(records, []);
  assert.deepEqual(sentFrames(alice), []);
  assert.deepEqual(sentFrames(bob), [{ type: "broadcast", kind: "typing", userId: 1 }]);
});

test("join and leave broadcast a roster of the members present to everyone", async () => {
  const env = envWithSender([]);
  const { room, ctx } = makeRoom(env);
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  assert.deepEqual(sentFrames(alice), [{ type: "roster", members: [{ userId: 1, username: "alice" }] }]);

  const bob = await connect(room, ctx, { userId: 2, username: "bob", channelKind: "dm" });
  const both = [{ userId: 1, username: "alice" }, { userId: 2, username: "bob" }];
  assert.deepEqual(sentFrames(bob), [{ type: "roster", members: both }]);
  // Alice (already connected) receives the same roster frame for Bob's join.
  assert.deepEqual(sentFrames(alice), [{ type: "roster", members: [{ userId: 1, username: "alice" }] },
    { type: "roster", members: both }]);

  ctx.webSocketClosed(bob);
  await room.webSocketClose(bob);
  assert.deepEqual(sentFrames(alice).at(-1), { type: "roster", members: [{ userId: 1, username: "alice" }] });
});

test("malformed JSON frame gets an error frame and stays connected", async () => {
  const records = [];
  const env = envWithSender(records);
  const { room, ctx } = makeRoom(env);
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob", channelKind: "dm" });
  clearFrames(alice);
  clearFrames(bob);

  await room.webSocketMessage(alice, "{not json at all");

  assert.deepEqual(sentFrames(alice), [{ type: "error", code: "bad_frame" }]);
  assert.deepEqual(ctx.getWebSockets(), [alice, bob]);
  assert.deepEqual(records, []);
  assert.deepEqual(sentFrames(bob), []);
});

test("binary frames are reserved (phase 2 voice): error frame, no relay, stays connected", async () => {
  const records = [];
  const env = envWithSender(records);
  const { room, ctx } = makeRoom(env);
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob", channelKind: "dm" });
  clearFrames(alice);
  clearFrames(bob);

  await room.webSocketMessage(alice, new ArrayBuffer(16));

  assert.deepEqual(sentFrames(alice), [{ type: "error", code: "binary_unsupported" }]);
  assert.deepEqual(ctx.getWebSockets(), [alice, bob]);
  assert.deepEqual(records, []);
  assert.deepEqual(sentFrames(bob), []);
});

test("ping answers pong with the client's echoed t, and nothing is broadcast", async () => {
  const records = [];
  const env = envWithSender(records);
  const { room, ctx } = makeRoom(env);
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob", channelKind: "dm" });
  clearFrames(alice);
  clearFrames(bob);

  await room.webSocketMessage(alice, JSON.stringify({ type: "ping", t: 4242 }));

  assert.deepEqual(sentFrames(alice), [{ type: "pong", t: 4242 }]);
  assert.deepEqual(sentFrames(bob), []);
  assert.deepEqual(records, []);
});

test("a failed send (validation/filter/db) answers the sender with an error frame and relays nothing", async () => {
  const thrower = {
    __sendMessageToChannel: async () => {
      throw new HttpError(400, "That message isn't allowed.");
    },
  };
  const { room, ctx } = makeRoom(thrower);
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob", channelKind: "dm" });
  clearFrames(alice);
  clearFrames(bob);

  await room.webSocketMessage(alice, JSON.stringify({
    type: "msg",
    clientMessageId: "abcdefgh1234",
    body: "filtered word",
  }));

  assert.deepEqual(sentFrames(alice), [
    { type: "error", code: "send_failed", message: "That message isn't allowed." },
  ]);
  assert.deepEqual(sentFrames(bob), []);
});

test("a non-object or unknown-type frame gets the bad_frame error", async () => {
  const records = [];
  const env = envWithSender(records);
  const { room, ctx } = makeRoom(env);
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  clearFrames(alice);

  await room.webSocketMessage(alice, JSON.stringify({ type: "mystery" }));
  await room.webSocketMessage(alice, "[1,2,3]");
  assert.deepEqual(sentFrames(alice), [
    { type: "error", code: "bad_frame" },
    { type: "error", code: "bad_frame" },
  ]);
  assert.deepEqual(records, []);
});

test("fetch without the upgrade header is refused", async () => {
  const env = envWithSender([]);
  const { room } = makeRoom(env);
  const request = new Request(`https://chat.internal/api/ws?channel=${CHANNEL_ID}`);
  const response = await room.fetch(request);
  assert.equal(response.status, 426);
});

// --- ws route (api/ws.mjs): the upgrade gate, identical to Task 5's read gate ----

// Same fake DB conventions as the other route-module tests: statements route by
// SQL text, sessions fixture carries the real cookie/token pair.
function fakeDb(routes) {
  const find = (sql) => routes.find((route) => route.test(sql));
  return {
    prepare(sql) {
      const statement = { sql, bound: [] };
      statement.bind = (...values) => {
        statement.bound = values;
        return statement;
      };
      statement.first = async () => {
        const route = find(sql);
        return route && route.first ? await route.first(statement.bound) : null;
      };
      statement.all = async () => ({ results: [] });
      statement.run = async () => ({ meta: { changes: 1, last_row_id: 1 } });
      return statement;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}

async function sessionFixtures(username, userId = MEMBER_ID) {
  const token = randomToken();
  const row = {
    token_hash: await sha256Hex(token),
    user_id: userId,
    csrf_token: randomToken(24),
    expires_at: nowSeconds() + 3600,
    username,
    role: "member",
    bio: "",
    avatar_status: null,
    avatar_mime: null,
    avatar_updated_at: null,
    avatar_version: null,
    totp_enabled: 0,
  };
  return { token, row, headers: { Cookie: "goober_session=" + token } };
}

const SESSION_READ_TEST = (sql) => sql.includes("FROM sessions s LEFT JOIN users u");
const CHANNEL_ACCESS_TEST = (sql) =>
  sql.includes("FROM gc_channels c WHERE c.id = ?") &&
  sql.includes("gc_server_members m") &&
  sql.includes("gc_conversation_members cm");

async function dispatch(request, env) {
  const url = new URL(request.url);
  try {
    return (await handleWsRoutes(request, env, url, url.pathname, request.method.toUpperCase(), undefined)) ??
      new Response(JSON.stringify({ error: "That API endpoint does not exist." }), { status: 404 });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return new Response(JSON.stringify(error.payload || { error: error.message }), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// env.ROOMS records the idFromName calls (the pinned DO id) and answers the
// get().fetch() with a fresh 101, so the forwarding contract is observable.
function wsRouteEnv(sessionRow, channelRow, userId) {
  return {
    GOOBER_DB: fakeDb([
      { test: SESSION_READ_TEST, first: async () => sessionRow },
      { test: CHANNEL_ACCESS_TEST, first: async (bound) =>
        bound[2] === userId ? channelRow : null },
    ]),
    ROOMS: {
      names: [],
      idFromName(name) {
        this.names.push(name);
        return { name };
      },
      get(stubId) {
        return {
          fetch: async (request) => {
            this.upgraded = request.url;
            // The 101 rides whatever the runtime can represent; the route
            // forwards it unchanged, so the pin stays runtime-agnostic.
            return { status: 101 };
          },
        };
      },
    },
  };
}

test("ws route forwards a member's upgrade to the channel's DO id, tagged with the session identity", async () => {
  const { row, headers } = await sessionFixtures("wempos");
  const env = wsRouteEnv(row, { id: CHANNEL_ID, server_id: 1, kind: "text" }, MEMBER_ID);
  const expectedRoomId = "channel:" + CHANNEL_ID;

  const response = await dispatch(new Request(`${ORIGIN}/api/ws?channel=${CHANNEL_ID}`, { headers }), env);

  assert.equal(response.status, 101);
  assert.deepEqual(env.ROOMS.names, [expectedRoomId]);
  // The DO request carries the session-derived identity and the channel kind
  // as query params the DO tags its socket with.
  const upgradedUrl = new URL(env.ROOMS.upgraded);
  assert.equal(upgradedUrl.searchParams.get("userId"), String(MEMBER_ID));
  assert.equal(upgradedUrl.searchParams.get("username"), "wempos");
  assert.equal(upgradedUrl.searchParams.get("channelKind"), "text");
});

test("ws route runs the same read gate: a non-member's upgrade gets the standard 404, no DO call", async () => {
  const outsider = await sessionFixtures("stranger", 8);
  const env = wsRouteEnv(outsider.row, { id: CHANNEL_ID, server_id: 1, kind: "text" }, MEMBER_ID);

  const response = await dispatch(new Request(`${ORIGIN}/api/ws?channel=${CHANNEL_ID}`, { headers: outsider.headers }), env);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "This channel does not exist or you cannot view it.",
  });
  assert.deepEqual(env.ROOMS.names, []);
  assert.equal(env.ROOMS.upgraded, undefined);
});

test("ws route rejects a missing or malformed channel id with 400 before any session work", async () => {
  const { row, headers } = await sessionFixtures("wempos");
  const env = wsRouteEnv(row, null, MEMBER_ID);
  const response = await dispatch(new Request(`${ORIGIN}/api/ws`, { headers }), env);
  assert.equal(response.status, 400);
  assert.deepEqual(env.ROOMS.names, []);
});
