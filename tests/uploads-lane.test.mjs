// The LARGE-FILE upload lane (dormant until the binding rules): pins for the
// chunked intake, the commit verification, the serving fallback, the reactive
// purges, and the send route's attach-by-id. The bucket here is an in-memory
// fake with the R2 surface the routes touch (put/head/get/list/delete) — the
// lane is deployment-dormant (no binding in production answers the 503 before
// ANY work), so the fakery can never describe live behavior until the
// owner's bucket + binding land.
import test from "node:test";
import assert from "node:assert/strict";

import { handleUploadRoutes, UPLOAD_LANE_AVAIL_ERROR, UPLOAD_TIER_ERROR, UPLOAD_UNKNOWN_ERROR, UPLOAD_INCOMPLETE_ERROR, UPLOAD_ONLY_IMAGES_ERROR } from "../api/uploads.mjs";
import { handleMediaRoutes } from "../api/media.mjs";
import { handleMessageRoutes, sendMessageToChannel } from "../api/messages.mjs";
import { _resetFilterWordsCacheForTests } from "../api/filterstore.mjs";
import { randomToken, sha256Hex, nowSeconds } from "../api/core/crypto.mjs";
import { HttpError, json } from "../api/core/http.mjs";
import { GC_UPLOAD_PART_BYTES, GC_UPLOAD_PART_REQUEST_BYTES, GC_UPLOAD_PARTS_MAX, MAX_ATTACHMENT_BYTES, RATE_LIMIT_BINDINGS } from "../constants.mjs";

const ORIGIN = "http://localhost";
const USER_ID = 7;

function envWithLimiters(extra = {}) {
  const env = { ...extra };
  for (const binding of Object.values(RATE_LIMIT_BINDINGS)) {
    env[binding] = { limit: async ({ key }) => ({ success: true, key }) };
  }
  return env;
}

// The in-memory bucket: the R2 surface the routes touch, keys kept whole
// (the routes pass ArrayBuffers/Uint8Arrays, so no stream plumbing at PUT).
class FakeBucket {
  constructor() { this.objects = new Map(); }
  put(key, value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (bytes.length === 0) throw new Error("R2 refuses empty bodies");
    this.objects.set(key, bytes.slice());
    return Promise.resolve({ key });
  }
  head(key) { return Promise.resolve(this.objects.has(key) ? { key } : null); }
  get(key) {
    const bytes = this.objects.get(key);
    if (!bytes) return Promise.resolve(null);
    const source = bytes.slice();
    return Promise.resolve({
      arrayBuffer: async () => source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(source.slice());
          controller.close();
        },
      }),
    });
  }
  delete(key) { this.objects.delete(key); return Promise.resolve(undefined); }
  async list({ prefix, cursor } = {}) {
    const keys = [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => ({
        key,
        size: this.objects.get(key).length,
      }));
    return { objects: keys, truncated: false, cursor };
  }
}

// The ordered fake D1: first matching route answers; batch entries record.
function fakeDb(routes = []) {
  const calls = [];
  let nextRowId = 1000;
  const db = {
    calls,
    plusRows: new Map(),
    prepare(sql) {
      const statement = { sql, bound: [] };
      statement.bind = (...values) => { statement.bound = values; return statement; };
      statement.first = async () => {
        calls.push({ call: "first", sql, bound: statement.bound });
        const route = routes.find((entry) => entry.test(sql));
        return route && route.first ? await route.first(statement.bound) : null;
      };
      statement.all = async () => {
        calls.push({ call: "all", sql, bound: statement.bound });
        const route = routes.find((entry) => entry.test(sql));
        return route && route.all ? await route.all(statement.bound) : { results: [] };
      };
      statement.run = async (record = true) => {
        if (record) calls.push({ call: "run", sql, bound: statement.bound });
        const route = routes.find((entry) => entry.test(sql));
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
        statements: statements.map((statement) => ({ sql: statement.sql, bound: statement.bound })),
      });
      return results;
    },
  };
  return db;
}

const SESSION_READ_TEST = (sql) => sql.includes("FROM sessions s LEFT JOIN users u");
const PLUS_TIER_TEST = (sql) => sql.includes("FROM gc_plus_state WHERE user_id = ?");
const ATTACHMENT_ROW_TEST = (sql) =>
  sql.includes("SELECT id, uploader_id, status, mime FROM gc_attachments");

async function sessionFixtures(role = "member") {
  const token = randomToken();
  const csrf = randomToken(24);
  const row = {
    token_hash: await sha256Hex(token),
    user_id: USER_ID,
    csrf_token: csrf,
    expires_at: nowSeconds() + 3600,
    username: "wempos",
    role,
    bio: "",
    avatar_status: null,
    avatar_mime: null,
    avatar_updated_at: null,
    avatar_version: null,
    totp_enabled: 0,
  };
  return { token, row, headers: { Cookie: "goober_session=" + token, "X-CSRF-Token": csrf } };
}
const sessionRoute = (row) => ({ test: SESSION_READ_TEST, first: async () => row });
// attachmentCapBytes' read: a full-plus term by default here (the lane's rider).
const plusTierRoute = (tier = "plus", renews = nowSeconds() + 3600) => ({
  test: PLUS_TIER_TEST,
  first: async () => ({ renews_until: renews, tier }),
});

async function dispatchUploads(request, env) {
  const url = new URL(request.url);
  let response;
  try {
    response = await handleUploadRoutes(request, env, url, url.pathname, request.method.toUpperCase(), {});
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    response = json(error.payload || { error: error.message }, error.status, error.headers);
  }
  return (
    response ??
    new Response(JSON.stringify({ error: "That API endpoint does not exist." }), { status: 404 })
  );
}

function chunkForm(seq, bytes, extra = {}) {
  const form = new FormData();
  form.append("seq", String(seq));
  if (extra.uploadId) form.append("uploadId", extra.uploadId);
  if (extra.size) form.append("size", String(extra.size));
  form.append("chunk", new Blob([bytes]));
  return form;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function pngPart() {
  const part = new Uint8Array(GC_UPLOAD_PART_BYTES);
  part.set(PNG_MAGIC, 0);
  return part;
}

// --- pins -------------------------------------------------------------------------

test("the lane's constants: 4 MiB parts, 256 of them, the small lanes untouched", () => {
  assert.equal(GC_UPLOAD_PART_BYTES, 4_194_304);
  assert.equal(GC_UPLOAD_PART_REQUEST_BYTES, GC_UPLOAD_PART_BYTES + 512 * 1024);
  assert.equal(GC_UPLOAD_PARTS_MAX, 256);
  assert.equal(MAX_ATTACHMENT_BYTES, 5_242_880, "the single-buffer lanes never move");
});

test("DORMANCY: no binding answers the 503 before any session work or storage", async () => {
  let dbTouched = false;
  const env = envWithLimiters({
    UPLOAD_BUCKET: null,
    GOOBER_DB: { prepare: () => { dbTouched = true; throw new Error("should never query"); } },
  });
  const { headers } = await sessionFixtures();
  // delete: FormData bodies for both routes
  const chunk = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/chunks", {
      method: "POST",
      headers: { Origin: ORIGIN, ...headers },
      body: chunkForm(0, PNG_MAGIC.slice(0, 16), { size: String(MAX_ATTACHMENT_BYTES + 1) }),
    }),
    env,
  );
  assert.equal(chunk.status, 503);
  assert.equal((await chunk.text()).includes(UPLOAD_LANE_AVAIL_ERROR), true);
  const commit = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/AAAAAAAAAAAA/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ size: 8_388_608 }),
    }),
    env,
  );
  assert.equal(commit.status, 503);
  assert.equal(dbTouched, false);
  assert.ok(true);
});

test("the tier gate: free and Mini members are refused before the object store", async () => {
  for (const refusal of [
    // Lapsed or never-bought: no gc_plus_state row is the free cap.
    { tag: "free", route: { test: PLUS_TIER_TEST, first: async () => null } },
    // Mini rides its own, lighter cap — 1 GiB is full-plus-only.
    { tag: "Mini", route: plusTierRoute("mini") },
  ]) {
    const bucket = new FakeBucket();
    const fixture = await sessionFixtures();
    const db = fakeDb([sessionRoute(fixture.row), refusal.route]);
    const response = await dispatchUploads(
      new Request(ORIGIN + "/api/uploads/chunks", {
        method: "POST",
        headers: { Origin: ORIGIN, ...fixture.headers },
        body: chunkForm(0, pngPart(), { size: String(8_388_608) }),
      }),
      envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: db }),
    );
    assert.equal(response.status, 403, "tier " + refusal.tag);
    assert.equal((await response.text()).includes(UPLOAD_TIER_ERROR), true);
    assert.equal(bucket.objects.size, 0, "a refused member writes nothing");
  }
});

test("the chunk intake: the first part opens the upload (an opaquely-named prefix) and NO row is born yet", async () => {
  const bucket = new FakeBucket();
  const fixture = await sessionFixtures();
  const db = fakeDb([sessionRoute(fixture.row), plusTierRoute("plus")]);
  const response = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/chunks", {
      method: "POST",
      headers: { Origin: ORIGIN, ...fixture.headers },
      body: chunkForm(0, pngPart(), { size: String(8_388_608) }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: db }),
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.uploadId, /^[A-Za-z0-9_-]{12}$/);
  const keys = [...bucket.objects.keys()];
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^uploads\/7\/[A-Za-z0-9_-]{12}\/0$/);
  // The row is BORN AT COMMIT: no gc_attachments write rode part one (its
  // mime could never be a truthful CHECK value yet).
  const writes = db.calls.filter((call) =>
    call.call === "batch" || call.call === "run" ||
    (call.call === "first" && /INSERT INTO gc_attachments/.test(call.sql)));
  assert.equal(writes.length, 0);
});

test("continuations require the SAME member's open upload; a foreign id is the shared 404", async () => {
  const bucket = new FakeBucket();
  const { row, headers } = await sessionFixtures();
  const open = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/chunks", {
      method: "POST",
      headers: { Origin: ORIGIN, ...headers },
      body: chunkForm(0, pngPart(), { size: String(8_388_608) }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: fakeDb([sessionRoute(row), plusTierRoute("plus")]) }),
  );
  const { uploadId } = await open.json();
  const second = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/chunks", {
      method: "POST",
      headers: { Origin: ORIGIN, ...headers },
      body: chunkForm(1, pngPart(), { uploadId }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: fakeDb([sessionRoute(row), plusTierRoute("plus")]) }),
  );
  assert.equal(second.status, 200);
  assert.equal([...bucket.objects.keys()].length, 2);

  // A foreign uploadId (never opened by anyone) 404s and writes nothing.
  const ghost = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/chunks", {
      method: "POST",
      headers: { Origin: ORIGIN, ...headers },
      body: chunkForm(3, pngPart(), { uploadId: "BBBBBBBBBBBB" }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: fakeDb([sessionRoute(row), plusTierRoute("plus")]) }),
  );
  assert.equal(ghost.status, 404);
  assert.equal((await ghost.text()).includes(UPLOAD_UNKNOWN_ERROR), true);
  assert.equal([...bucket.objects.keys()].length, 2);
});

test("the COMMIT verifies, sniffs from the stored bytes, births the pending row, and moves the parts", async () => {
  const bucket = new FakeBucket();
  const { row, headers } = await sessionFixtures();
  const open = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/chunks", {
      method: "POST",
      headers: { Origin: ORIGIN, ...headers },
      body: chunkForm(0, pngPart(), { size: String(8_388_608) }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: fakeDb([sessionRoute(row), plusTierRoute("plus")]) }),
  );
  const { uploadId } = await open.json();
  await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/chunks", {
      method: "POST",
      headers: { Origin: ORIGIN, ...headers },
      body: chunkForm(1, pngPart(), { uploadId }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: fakeDb([sessionRoute(row), plusTierRoute("plus")]) }),
  );

  const commitDb = fakeDb([
    sessionRoute(row),
    // The identity tuple resolves the born row's id.
    { test: (sql) => sql.includes("SELECT id FROM gc_attachments WHERE message_id IS NULL"), first: async () => ({ id: 4242 }) },
  ]);
  const commit = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/" + uploadId + "/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ size: 8_388_608 }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: commitDb }),
  );
  assert.equal(commit.status, 201);
  const body = await commit.json();
  assert.equal(body.attachment.status, "pending");
  assert.equal(body.attachment.id, 4242);

  // The batch carries the pending row; the id resolves by the identity tuple.
  const batch = commitDb.calls.find((call) => call.call === "batch");
  assert.ok(batch);
  assert.match(batch.statements[0].sql, /INSERT INTO gc_attachments/);
  assert.match(batch.statements[0].sql, /VALUES \(NULL, \?, \?, \?, 'pending'/, "status is the SQL literal, not a bind");
  assert.equal(batch.statements[0].bound[0], USER_ID);
  assert.equal(batch.statements[0].bound[1], "image/png", "the SNIFFED mime is what rides the row");
  assert.equal(batch.statements[0].bound[2], 8_388_608);
  // Both prefixes: the serving family holds both parts, the in-flight one emptied.
  assert.deepEqual(
    [...bucket.objects.keys()].filter((key) => /^uploads\//.test(key)),
    [],
  );
  const serving = [...bucket.objects.keys()].filter((key) => /^attachments\//.test(key));
  assert.equal(serving.length, 2);
  assert.equal(bucket.objects.get(serving[0]).length, GC_UPLOAD_PART_BYTES);
});

test("the COMMIT's verification: an unfinished set, a wrong sum, or a non-image never writes a row", async () => {
  const { row, headers } = await sessionFixtures();
  const setup = async (bucket, parts, declared) => {
    const db = fakeDb([sessionRoute(row), plusTierRoute("plus")]);
    let uploadId = null;
    for (let index = 0; index < parts.length; index += 1) {
      const opened = await dispatchUploads(
        new Request(ORIGIN + "/api/uploads/chunks", {
          method: "POST",
          headers: { Origin: ORIGIN, ...headers },
          body: chunkForm(index, parts[index], index === 0 ? { size: String(8_388_608) } : { uploadId }),
        }),
        envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: db }),
      );
      if (index === 0) uploadId = (await opened.json()).uploadId;
    }
    return uploadId;
  };

  // A short middle part: every part but the last must be exactly part-sized.
  const shortSet = new FakeBucket();
  let id = await setup(shortSet, [pngPart(), new Uint8Array(1024)], 8_388_608);
  let refusal = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/" + id + "/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ size: 8_388_608 + 1024 }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: shortSet, GOOBER_DB: fakeDb([sessionRoute(row)]) }),
  );
  assert.equal(refusal.status, 400);
  assert.equal((await refusal.text()).includes(UPLOAD_INCOMPLETE_ERROR), true);
  assert.equal(shortSet.objects.size, 2, "a failed verification leaves the parts for a retry");

  // A wrong sum: the parts set a total the commit's declaration disputes.
  const wrongSum = new FakeBucket();
  id = await setup(wrongSum, [pngPart(), pngPart()], 8_388_608);
  refusal = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/" + id + "/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ size: 8_388_607 }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: wrongSum, GOOBER_DB: fakeDb([sessionRoute(row)]) }),
  );
  assert.equal(refusal.status, 400);
  assert.equal(wrongSum.objects.size, 2);

  // Not an image: the sniff runs on the STORED first part, not a client claim.
  const notImage = new FakeBucket();
  id = await setup(notImage, [new Uint8Array(GC_UPLOAD_PART_BYTES).fill(7), pngPart()], 8_388_608);
  refusal = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/" + id + "/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ size: 8_388_608 }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: notImage, GOOBER_DB: fakeDb([sessionRoute(row)]) }),
  );
  assert.equal(refusal.status, 400);
  assert.equal((await refusal.text()).includes(UPLOAD_ONLY_IMAGES_ERROR), true);
  assert.equal(notImage.objects.size, 2, "nothing was written, nothing was deleted");

  // Nobody's id: the shared 404 (never an existence oracle).
  const nobody = await dispatchUploads(
    new Request(ORIGIN + "/api/uploads/BBBBBBBBBBBB/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ size: 8_388_608 }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: new FakeBucket(), GOOBER_DB: fakeDb([sessionRoute(row)]) }),
  );
  assert.equal(nobody.status, 404);
  assert.equal((await nobody.text()).includes(UPLOAD_UNKNOWN_ERROR), true);
});

test("the serving fallback: an empty chunk set rides the object store under the SAME status gate", async () => {
  const bucket = new FakeBucket();
  const id = 4242;
  const first = new Uint8Array(64);
  first.set(PNG_MAGIC, 0);
  const second = new Uint8Array(12).fill(9);
  bucket.objects.set("attachments/" + id + "/0", first);
  bucket.objects.set("attachments/" + id + "/1", second);
  const pendingRow = { id, uploader_id: USER_ID, status: "pending", mime: "image/png" };
  const approvedRow = { ...pendingRow, status: "approved" };
  const { row, headers } = await sessionFixtures();
  const servingDb = (attachmentRow) => fakeDb([
    sessionRoute(row),
    { test: ATTACHMENT_ROW_TEST, first: async () => attachmentRow },
    { test: (sql) => sql.includes("SELECT data FROM gc_attachment_chunks WHERE attachment_id"), all: async () => ({ results: [] }) },
    { test: (sql) => sql.includes("FROM site_settings"), first: async () => ({ value: "", updated_at: 1 }) },
  ]);

  // The uploader may serve their own pending row (the standing gate).
  _resetFilterWordsCacheForTests();
  const pending = await dispatchMedia(
    new Request(ORIGIN + "/api/attachments/" + id, { headers }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: servingDb(pendingRow) }),
  );
  assert.equal(pending.status, 200);
  assert.equal(pending.headers.get("Content-Type"), "image/png");
  assert.equal(pending.headers.get("Cache-Control"), "private, max-age=300");
  const received = new Uint8Array(await pending.arrayBuffer());
  assert.equal(received.length, 76, "the parts concatenate IN ORDER (4 MiB streams need no buffer to prove)");

  // The status gate precedes every byte: an outsider on a pending row is the
  // shared 404 (never a 403 that would confirm existence).
  const outsiderFixtures = await sessionFixtures();
  const outsiderToken = randomToken();
  const outsiderRow = {
    ...((await sessionFixtures()).row),
    token_hash: await sha256Hex(outsiderToken),
    user_id: 999,
  };
  void outsiderFixtures;
  const outsiderHeaders = { Cookie: "goober_session=" + outsiderToken };
  const foreign = await dispatchMedia(
    new Request(ORIGIN + "/api/attachments/" + id, { headers: outsiderHeaders }),
    envWithLimiters({
      UPLOAD_BUCKET: bucket,
      GOOBER_DB: fakeDb([
        { test: SESSION_READ_TEST, first: async () => outsiderRow },
        { test: ATTACHMENT_ROW_TEST, first: async () => pendingRow },
      ]),
    }),
  );
  assert.equal(foreign.status, 404);

  // The approved row rides the immutable cache copy.
  const approved = await dispatchMedia(
    new Request(ORIGIN + "/api/attachments/" + id, { headers }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: servingDb(approvedRow) }),
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
});

async function dispatchMedia(request, env) {
  const url = new URL(request.url);
  let response;
  try {
    response = await handleMediaRoutes(request, env, url, url.pathname, request.method.toUpperCase(), {});
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    response = json(error.payload || { error: error.message }, error.status, error.headers);
  }
  return (
    response ??
    new Response(JSON.stringify({ error: "That API endpoint does not exist." }), { status: 404 })
  );
}

test("the reactive purge: a rejected moderation strips the row's bytes from BOTH stores", async () => {
  const bucket = new FakeBucket();
  bucket.objects.set("attachments/88/0", new Uint8Array(16));
  const { row, headers } = await sessionFixtures("admin");
  const db = fakeDb([sessionRoute(row)]);
  const response = await handleMediaRoutes(
    new Request(ORIGIN + "/api/admin/attachments/88/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    }),
    envWithLimiters({ UPLOAD_BUCKET: bucket, GOOBER_DB: db }),
    new URL(ORIGIN + "/api/admin/attachments/88/reject"),
    "/api/admin/attachments/88/reject",
    "POST",
    {},
  );
  assert.equal(response.status, 200);
  assert.deepEqual([...bucket.objects.keys()], [], "the reject lane's purge ran");
});

test("the send route's attach-by-id: the batch re-guards the owned standalone row, and the ref lands with the message", async () => {
  _resetFilterWordsCacheForTests();
  const { row, headers } = await sessionFixtures();
  const attachmentRowId = 55;
  const db = fakeDb([
    sessionRoute(row),
    // The channel access + the plus cap read.
    { test: (sql) => sql.includes("FROM gc_channels c WHERE c.id = ?") && sql.includes("gc_server_members m") && sql.includes("gc_conversation_members cm"),
      first: async () => ({ id: 3, server_id: 1, kind: "text" }) },
    { test: PLUS_TIER_TEST, first: async () => ({ renews_until: nowSeconds() + 3600, tier: "plus" }) },
    // The pre-check's owned read (a 900 MiB standalone row, unattached).
    { test: (sql) => sql.includes("SELECT size_bytes FROM gc_attachments WHERE id = ? AND message_id IS NULL AND uploader_id = ?"),
      first: async () => ({ size_bytes: 943_718_400 }) },
    // The send's reselect after the batch.
    { test: (sql) => sql.includes("FROM gc_messages m JOIN users u") && sql.includes("client_message_id") && sql.includes("ORDER BY m.id DESC LIMIT 1"),
      run: async () => ({ meta: { changes: 1 }, results: [{ id: 12, author_id: USER_ID, author_name: "wempos", body: "the big one", client_message_id: null, source: null, created_at: 100, edited_at: null }] }) },
  ]);
  const response = await handleMessageRoutes(
    new Request(ORIGIN + "/api/channels/3/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ body: "the big one", attachmentId: attachmentRowId }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: new FakeBucket(), GOOBER_DB: db }),
    new URL(ORIGIN + "/api/channels/3/messages"),
    "/api/channels/3/messages",
    "POST",
    {},
  );
  assert.ok(response);
  assert.equal(response.status, 201);
  const batch = db.calls.find((call) => call.call === "batch");
  const reference = batch.statements.find((statement) => statement.sql.startsWith("UPDATE gc_attachments SET message_id"));
  assert.ok(reference, "the batch carries the attach-by-id UPDATE");
  assert.match(reference.sql, /message_id IS NULL AND uploader_id = \? AND size_bytes <= \?/);
  assert.match(reference.sql, /NOT EXISTS \(SELECT 1 FROM gc_emoji/);
  assert.equal(reference.bound[3], attachmentRowId);
  assert.equal(reference.bound[5], 1_073_741_824, "the cap is the caller's own tier read");
});

async function dispatchMessages(request, env, path) {
  let response;
  try {
    response = await handleMessageRoutes(request, env, new URL(request.url), path, request.method.toUpperCase(), {});
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    response = json(error.payload || { error: error.message }, error.status, error.headers);
  }
  return response;
}

test("the attach-by-id refusals: free is the 403, unowned and over-cap rows are the 400 — the cap stays the caller's tier", async () => {
  _resetFilterWordsCacheForTests();
  const { row, headers } = await sessionFixtures();
  const channelRoute = {
    test: (sql) => sql.includes("FROM gc_channels c WHERE c.id = ?") && sql.includes("gc_server_members m") && sql.includes("gc_conversation_members cm"),
    first: async () => ({ id: 3, server_id: 1, kind: "text" }),
  };
  const base = [sessionRoute(row), channelRoute];
  const sendRequest = () =>
    new Request(ORIGIN + "/api/channels/3/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ body: "hi", attachmentId: 55 }),
    });
  const OWNED_TEST = (sql) => sql.includes("SELECT size_bytes FROM gc_attachments WHERE id = ? AND message_id IS NULL AND uploader_id = ?");

  // A lapsed or never-bought caller: the ref never applies under the free cap.
  const free = fakeDb([...base, { test: PLUS_TIER_TEST, first: async () => null }]);
  const freeResponse = await dispatchMessages(sendRequest(), envWithLimiters({ UPLOAD_BUCKET: null, GOOBER_DB: free }), "/api/channels/3/messages");
  assert.equal(freeResponse.status, 403);
  assert.deepEqual(free.calls.filter((call) => call.call === "batch"), []);

  // Not owned (the pre-check's read misses): no batch ever ran.
  const unowned = fakeDb([...base, plusTierRoute("plus"), { test: OWNED_TEST, first: async () => null }]);
  const refused = await dispatchMessages(sendRequest(), envWithLimiters({ UPLOAD_BUCKET: null, GOOBER_DB: unowned }), "/api/channels/3/messages");
  assert.equal(refused.status, 400);
  assert.deepEqual(unowned.calls.filter((call) => call.call === "batch"), []);

  // A Mini member attaching a row over THEIR OWN cap never passes — the
  // pre-check binds size_bytes against the CALLER's cap, so the 900 MiB row
  // is simply not visible (still the 400, still no batch). The fake honors
  // the bound cap exactly as the real WHERE clause would.
  const mini = fakeDb([...base, plusTierRoute("mini"), {
    test: OWNED_TEST,
    first: async (bound) => (943_718_400 <= Number(bound[2]) ? { size_bytes: 943_718_400 } : null),
  }]);
  const miniResponse = await dispatchMessages(sendRequest(), envWithLimiters({ UPLOAD_BUCKET: null, GOOBER_DB: mini }), "/api/channels/3/messages");
  assert.equal(miniResponse.status, 400);
  assert.deepEqual(mini.calls.filter((call) => call.call === "batch"), []);

  // A malformed reference field is the request-shape 400 before anything.
  const malformed = fakeDb([...base, plusTierRoute("plus")]);
  const junk = await dispatchMessages(
    new Request(ORIGIN + "/api/channels/3/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ body: "hi", attachmentId: "gold" }),
    }),
    envWithLimiters({ UPLOAD_BUCKET: null, GOOBER_DB: malformed }),
    "/api/channels/3/messages",
  );
  assert.equal(junk.status, 400);
  assert.deepEqual(malformed.calls.filter((call) => call.call === "batch"), []);
});

test("the DO path's primitive: a reference rides sendMessageToChannel directly and links inside its one batch", async () => {
  _resetFilterWordsCacheForTests();
  const user = { id: USER_ID, username: "wempos", role: "member" };
  const db = fakeDb([
    { test: (sql) => sql.includes("FROM site_settings"), first: async () => ({ value: "", updated_at: 1 }) },
    plusTierRoute("plus"),
    { test: (sql) => sql.includes("SELECT size_bytes FROM gc_attachments WHERE id = ? AND message_id IS NULL AND uploader_id = ?"),
      first: async () => ({ size_bytes: 943_718_400 }) },
    { test: (sql) => sql.includes("FROM gc_messages m JOIN users u") && sql.includes("client_message_id") && sql.includes("ORDER BY m.id DESC LIMIT 1"),
      run: async () => ({ meta: { changes: 1 }, results: [{ id: 9, author_id: USER_ID, author_name: "wempos", body: "ref send", client_message_id: null, source: null, created_at: 100, edited_at: null }] }) },
  ]);
  const { message } = await sendMessageToChannel(
    envWithLimiters({ UPLOAD_BUCKET: null, GOOBER_DB: db }),
    user,
    3,
    "ref send",
    null,
    null,
    77,
  );
  assert.equal(message.id, 9);
  const batch = db.calls.find((call) => call.call === "batch");
  const reference = batch.statements.find((statement) => statement.sql.startsWith("UPDATE gc_attachments SET message_id"));
  assert.equal(reference.bound[3], 77);
});
