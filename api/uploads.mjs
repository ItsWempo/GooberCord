// The LARGE-FILE upload lane (the 0022 Plus ceiling's streaming half): a
// DORMANT route family the owner's R2 bucket rule activates. Nothing here
// answers anything before the binding rules:
//
//   if (!env.UPLOAD_BUCKET) -> the shared 503, before ANY work (session,
//   limiter, or storage): production behavior is byte-identical without the
//   binding, so the commit deploys safely and the owner's two moves
//   (create the bucket + the one-line binding) wake the lane.
//
// The bytes live ONLY in the object store — the isolate never holds more
// than one part's 4 MiB — under two key families:
//   uploads/<uploaderId>/<uploadId>/<part>   the in-flight prefix
//   attachments/<attachmentId>/<part>        the serving prefix
// D1 keeps ONLY the metadata (the existing gc_attachments columns, zero
// schema drift): the row is born at COMMIT with the sniffed mime and the
// verified size — never a placeholder mime the column CHECK cannot hold —
// and status rides 'pending' exactly like every other intake (the serving
// gate answers before any bytes move).
import { requireUser } from "./core/auth.mjs";
import { nowSeconds, randomToken } from "./core/crypto.mjs";
import { HttpError, json, rateLimit, readLimitedBody } from "./core/http.mjs";
import { attachmentCapBytes } from "./plus.mjs";
import { sniffImageMime } from "./core/images.mjs";
import {
  GC_PLUS_ATTACHMENT_BYTES,
  GC_UPLOAD_PARTS_MAX,
  GC_UPLOAD_PART_BYTES,
  GC_UPLOAD_PART_REQUEST_BYTES,
  MAX_ATTACHMENT_BYTES,
} from "../constants.mjs";

export const UPLOAD_LANE_AVAIL_ERROR = "Large-file uploads are not available yet.";
export const UPLOAD_TIER_ERROR = "Large-file uploads are a full Goober+ perk.";
export const UPLOAD_PART_INVALID_ERROR = "That upload part is invalid.";
export const UPLOAD_UNKNOWN_ERROR = "That upload does not exist.";
export const UPLOAD_INCOMPLETE_ERROR = "The upload did not finish — send it again.";
export const UPLOAD_ONLY_IMAGES_ERROR = "Only image files are accepted.";

// Dormancy: exported for the media module's serving fallback to reuse.
export function requireUploadBinding(env) {
  if (!env.UPLOAD_BUCKET) throw new HttpError(503, UPLOAD_LANE_AVAIL_ERROR);
}

const pendingPrefix = (uploaderId, uploadId) => "uploads/" + uploaderId + "/" + uploadId + "/";
const servingPrefix = (attachmentId) => "attachments/" + attachmentId + "/";

// The multipart shape, mirrored from media.mjs's reader (the declared-length
// pattern: framing asserts the cap, otherwise the counted buffering does).
// The chunk rides the single file field; the fields carry the part position
// (and, on the FIRST part, the declared total).
const CHUNK_FIELD = "chunk";

async function readChunkMultipart(request) {
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.startsWith("multipart/form-data")) {
    throw new HttpError(415, "Send each upload part as multipart/form-data.");
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > GC_UPLOAD_PART_REQUEST_BYTES) {
    throw new HttpError(413, "That part is more than 4 MiB.");
  }
  let form;
  if (declaredLength > 0) {
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, "The upload part could not be read.");
    }
  } else {
    let buffered;
    try {
      buffered = await readLimitedBody(request, GC_UPLOAD_PART_REQUEST_BYTES);
    } catch {
      throw new HttpError(413, "That part is more than 4 MiB.");
    }
    try {
      form = await new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: buffered,
      }).formData();
    } catch {
      throw new HttpError(400, "The upload part could not be read.");
    }
  }
  const fields = {};
  let chunk = null;
  for (const [name, value] of form.entries()) {
    if (typeof value === "string") {
      fields[name] = value;
      continue;
    }
    if (name !== CHUNK_FIELD || chunk !== null) {
      throw new HttpError(400, "Send one part at a time in the '" + CHUNK_FIELD + "' field.");
    }
    chunk = new Uint8Array(await value.arrayBuffer());
  }
  return { fields, chunk };
}

// The in-flight prefix's parts, numeric order, validated shapes. A key whose
// suffix is not all digits is never part of a lawful upload — skip it.
async function pendingParts(env, uploaderId, uploadId) {
  const bucket = env.UPLOAD_BUCKET;
  const prefix = pendingPrefix(uploaderId, uploadId);
  const parts = [];
  let cursor = undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const object of page.objects || []) {
      const suffix = object.key.slice(prefix.length);
      if (/^[0-9]+$/.test(suffix)) parts.push({ seq: Number(suffix), key: object.key, size: Number(object.size) });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  parts.sort((a, b) => a.seq - b.seq);
  // A lawful set is a contiguous 0..n run.
  return parts.every((part, index) => part.seq === index) ? parts : null;
}

// --- routes -----------------------------------------------------------------------

const SEQ_MAX = GC_UPLOAD_PARTS_MAX - 1;
const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{12}$/;

export async function handleUploadChunkRoute(request, env) {
  requireUploadBinding(env);
  const session = await requireUser(request, env);
  // The READ bucket carries the per-part flow: the UPLOAD limiter's own shape
  // is per-FILE, and a gigabyte is 256 parts.
  await rateLimit(request, env, "read", "uploads-chunks:" + session.user.id);
  const { fields, chunk } = await readChunkMultipart(request);
  const uploaderId = Number(session.user.id);

  const seq = Number(fields.seq);
  if (!Number.isInteger(seq) || seq < 0 || seq > SEQ_MAX) {
    throw new HttpError(400, UPLOAD_PART_INVALID_ERROR);
  }
  if (chunk === null || chunk.length < 1 || chunk.length > GC_UPLOAD_PART_BYTES) {
    throw new HttpError(413, "That part is more than 4 MiB, or empty.");
  }

  // The tier gate: the lane rides ONLY the full-plus cap. attachmentCapBytes
  // answers 'plus' for an active full (or a legacy NULL) term and 'mini' for
  // the lighter one (with the 50 MiB pair) — the matrix's 1 GiB ceiling is a
  // full-plus perk, so Mini and free never reach the object store.
  const caps = await attachmentCapBytes(env, uploaderId, nowSeconds());
  if (caps.tier !== "plus" || caps.fileBytes <= MAX_ATTACHMENT_BYTES) {
    throw new HttpError(403, UPLOAD_TIER_ERROR);
  }

  const bucket = env.UPLOAD_BUCKET;
  if (seq > 0) {
    const uploadId = typeof fields.uploadId === "string" ? fields.uploadId : "";
    if (!UPLOAD_ID_RE.test(uploadId)) throw new HttpError(400, UPLOAD_PART_INVALID_ERROR);
    // The ownership marker: a continuation answers an upload whose FIRST part
    // the SAME member already wrote — a foreign or finished id is the shared
    // 404, never a 403 that would confirm existence.
    const marker = await bucket.head(pendingPrefix(uploaderId, uploadId) + "0");
    if (!marker) throw new HttpError(404, UPLOAD_UNKNOWN_ERROR);
    await bucket.put(pendingPrefix(uploaderId, uploadId) + String(seq), chunk);
    return json({ ok: true });
  }

  // The FIRST part opens the upload: the declared total must be a size the
  // small lanes do NOT own (they keep their single-buffer contract
  // untouched) and the full-plus cap admits.
  const size = Number(fields.size);
  if (!Number.isInteger(size) || size <= MAX_ATTACHMENT_BYTES || size > GC_PLUS_ATTACHMENT_BYTES) {
    throw new HttpError(400, "That file size is not a large upload.");
  }
  const uploadId = randomToken(12).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12);
  await bucket.put(pendingPrefix(uploaderId, uploadId) + "0", chunk);
  // NO gc_attachments row exists yet — the row is born at COMMIT with the
  // sniffed mime and the verified size (the mime CHECK admits no
  // placeholder, and a truthful row is the whole point).
  return json({ uploadId }, 201);
}

export async function handleCommitUploadRoute(request, env, uploadId) {
  requireUploadBinding(env);
  const session = await requireUser(request, env);
  await rateLimit(request, env, "upload", "uploads-commit:" + session.user.id);
  if (!UPLOAD_ID_RE.test(String(uploadId || ""))) {
    throw new HttpError(404, UPLOAD_UNKNOWN_ERROR);
  }
  const uploaderId = Number(session.user.id);

  const body = await readJsonCommit(request);
  const size = Number(body.size);
  if (!Number.isInteger(size) || size <= MAX_ATTACHMENT_BYTES || size > GC_PLUS_ATTACHMENT_BYTES) {
    throw new HttpError(400, "That file size is not a large upload.");
  }

  const bucket = env.UPLOAD_BUCKET;
  const prefix = pendingPrefix(uploaderId, uploadId);
  const parts = await pendingParts(env, uploaderId, uploadId);
  if (parts === null || parts.length === 0) throw new HttpError(404, UPLOAD_UNKNOWN_ERROR);
  // Verification: every part but the last is exactly part-sized (a hole is
  // an unfinished upload, never a short file), and the sizes SUM to the
  // declared total. A failed verification leaves the in-flight parts AS-IS —
  // the client can retry the missing parts or abandon — and never writes a
  // row.
  for (const part of parts.slice(0, -1)) {
    if (part.size !== GC_UPLOAD_PART_BYTES) {
      throw new HttpError(400, UPLOAD_INCOMPLETE_ERROR);
    }
  }
  const total = parts.reduce((sum, part) => sum + part.size, 0);
  if (total !== size) {
    throw new HttpError(400, UPLOAD_INCOMPLETE_ERROR);
  }

  // The magic re-sniff rides the STORED first part (the intake never
  // trusted a client-side claim). The full-file sanitizer stays the SMALL
  // lanes' rider — a gigabyte is re-sniffed, never re-buffered; the bytes
  // pass through this lane byte-identical, so egress re-verifies the mime
  // against the stored first bytes exactly as the small lanes do.
  const first = await bucket.get(prefix + "0");
  if (!first) throw new HttpError(404, UPLOAD_UNKNOWN_ERROR);
  const head = new Uint8Array(await first.arrayBuffer()).subarray(0, 65536);
  const mime = sniffImageMime(head);
  if (!mime) {
    // Not an image: the parts stay (nothing wrote yet), the answer is the
    // shared copy.
    throw new HttpError(400, UPLOAD_ONLY_IMAGES_ERROR);
  }

  const now = nowSeconds();
  // The row: born pending, exactly like every intake, ZERO schema drift (the
  // id resolves by the standalone identity tuple, the e0ba49c shape — no
  // last_insert_rowid dependence).
  await env.GOOBER_DB.batch([
    env.GOOBER_DB.prepare(
      "INSERT INTO gc_attachments (message_id, uploader_id, mime, size_bytes, status, width, height, created_at) " +
        "VALUES (NULL, ?, ?, ?, 'pending', NULL, NULL, ?)",
    ).bind(uploaderId, mime, size, now),
  ]);
  const row = await env.GOOBER_DB.prepare(
    "SELECT id FROM gc_attachments WHERE message_id IS NULL AND uploader_id = ? " +
      "AND mime = ? AND size_bytes = ? AND created_at = ? ORDER BY id DESC LIMIT 1",
  ).bind(uploaderId, mime, size, now).first();
  const attachmentId = Number(row.id);

  // Move the parts to the serving prefix and empty the in-flight one. Each
  // part copies at its own 4 MiB scale — the isolate never holds more.
  for (const part of parts) {
    const source = await bucket.get(part.key);
    await bucket.put(servingPrefix(attachmentId) + String(part.seq), await source.arrayBuffer());
    await bucket.delete(part.key);
  }
  return json({ attachment: { id: attachmentId, status: "pending" } }, 201);
}

async function readJsonCommit(request) {
  let value;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, "That request body is invalid.");
  }
  return value && typeof value === "object" ? value : {};
}

// The abandon route: purge the in-flight parts (a client that gives up
// leaves nothing behind). The ownership marker decides — no id, no objects,
// always a 200 (never an oracle).
export async function handleAbandonUploadRoute(request, env, uploadId) {
  requireUploadBinding(env);
  const session = await requireUser(request, env);
  await rateLimit(request, env, "upload", "uploads-abandon:" + session.user.id);
  if (!UPLOAD_ID_RE.test(String(uploadId || ""))) return json({ ok: true });
  const bucket = env.UPLOAD_BUCKET;
  const prefix = pendingPrefix(Number(session.user.id), uploadId);
  await purgePrefix(bucket, prefix);
  return json({ ok: true });
}

async function purgePrefix(bucket, prefix) {
  let cursor = undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const object of page.objects || []) {
      await bucket.delete(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

// The REACTIVE purge: every lane that removes an attachment's D1 bytes also
// removes its object-store bytes (a rejected row, a deleted message
// attachment, an expression release, a deleted server's leftovers). Guarded
// by the binding, best-effort by design — a lingering object serves no
// viewer (the D1 status gate precedes every byte), but a lane that empties
// the chunks should empty the store too.
export async function purgeAttachmentObjects(env, attachmentIds) {
  const bucket = env.UPLOAD_BUCKET;
  if (!bucket || !Array.isArray(attachmentIds)) return;
  for (const attachmentId of attachmentIds) {
    const id = Number(attachmentId);
    if (!Number.isInteger(id) || id <= 0) continue;
    try {
      await purgePrefix(bucket, servingPrefix(id));
    } catch {
      void id; // best-effort: the metadata is gone either way; the object is unreachable
    }
  }
}

// --- dispatch ------------------------------------------------------------------

export async function handleUploadRoutes(request, env, url, path, method, ctx) {
  void url;
  void ctx;

  if (method === "POST" && path === "/api/uploads/chunks") {
    return handleUploadChunkRoute(request, env);
  }

  const commitMatch = method === "POST"
    ? path.match(/^\/api\/uploads\/([A-Za-z0-9_-]{12})\/commit$/)
    : null;
  if (commitMatch) {
    return handleCommitUploadRoute(request, env, commitMatch[1]);
  }

  const abandonMatch = method === "DELETE"
    ? path.match(/^\/api\/uploads\/([A-Za-z0-9_-]{12})$/)
    : null;
  if (abandonMatch) {
    return handleAbandonUploadRoute(request, env, abandonMatch[1]);
  }

  return undefined;
}

// --- serving ----------------------------------------------------------------------

// The serving fallback for an attachment whose D1 chunk set is EMPTY: the
// stream-concatenation over the serving prefix, with the sniffed first bytes
// re-verified against the row (the same egress re-verification the small
// lanes ride) and the SAME status gate already answered by the caller.
// Returns null on anything not a lawful serving set — callers turn that into
// the shared 404.
export async function serveLargeAttachment(env, row) {
  const bucket = env.UPLOAD_BUCKET;
  if (!bucket) return null;
  const attachmentId = Number(row.id);
  const prefix = servingPrefix(attachmentId);
  let cursor = undefined;
  const objects = [];
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const object of page.objects || []) {
      const suffix = object.key.slice(prefix.length);
      if (/^[0-9]+$/.test(suffix)) objects.push({ seq: Number(suffix), key: object.key });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  objects.sort((a, b) => a.seq - b.seq);
  if (objects.length === 0 || !objects.every((object, index) => object.seq === index)) return null;

  // Egress re-verification: the first 64 KiB must carry the row's own mime.
  const first = await bucket.get(objects[0].key);
  if (!first) return null;
  const head = new Uint8Array(await first.arrayBuffer()).subarray(0, 65536);
  if (sniffImageMime(head) !== row.mime) return null;

  // The stream: part 0's own body opens it; every later part pipes into the
  // one TransformStream (all but the last keep the writer open).
  const { readable, writable } = new TransformStream();
  const pump = (async () => {
    for (let index = 0; index < objects.length; index += 1) {
      const part = (index === 0 ? first : await bucket.get(objects[index].key));
      await part.body.pipeTo(writable, { preventClose: index < objects.length - 1 });
    }
  })();
  void pump.catch(() => { /* a truncated stream answers the client's own abort */ });

  const approved = row.status === "approved";
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": approved ? "public, max-age=31536000, immutable" : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
