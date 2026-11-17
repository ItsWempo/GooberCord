// Server soundboard (0023's feature wave): CRUD mirroring api/emoji.mjs
// exactly — the sound IS a gc_attachments row (same standalone intake
// machinery, same pending moderation, same serving gate with its own audio
// egress verifier), the write authorization rides INSIDE the statements
// (owner tier OR the gc_roles MANAGE_EMOJI bit, the emoji lane's exact
// fragments mirrored locally — the parity discipline there), and the
// inventory cap rides the create statement itself.
//
// THE GATE IS THE BOOST LEVEL, not Plus: GC_SOUNDBOARD_MAX_PER_SERVER's base
// is 0, so a level-0 server admits NOTHING — the level-0 refusal answers
// BEFORE any intake (a refused create stores nothing, not even a pending
// attachment), and the slots resolve through the shared resolver
// (api/boost-level.mjs): 24 at level 1, 36 at level 2, 48 at level 3.
//
// THE WIRE TOKENS (the play wave's contract): gc_sounds' name column carries
// the SAME strict CHECK verbatim as the 0020 twin — the token's name slot is
// spelled once by that CHECK. Message-side tokens ride a LATER wave (sounds
// play into voice, they are not message renderables); the emoji/sticker
// token letters own <s:...>, so the play wave resolves sounds under their
// own distinctive letter off this same name grammar.
import { requireSignedInRead, requireUser } from "./core/auth.mjs";
import { nowSeconds } from "./core/crypto.mjs";
import { HttpError, json, rateLimit, readJson } from "./core/http.mjs";
import { sniffAudioMime } from "./core/audio.mjs";
import {
  GC_EMOJI_NAME_MAX,
  GC_EMOJI_NAME_MIN,
  GC_EMOJI_NAME_PATTERN,
  MAX_ATTACHMENT_BYTES,
} from "../constants.mjs";
import { SERVER_PERMISSIONS } from "./permissions.mjs";
import { serverBoostTier } from "./boost-level.mjs";
import {
  readMultipartWithImage,
  standaloneAttachmentStatements,
} from "./media.mjs";
import { expressionPayloadRow } from "./emoji.mjs";
import { purgeAttachmentObjects } from "./uploads.mjs";

// The manage-guard fragments mirror the emoji lane's exact copies (that
// module keeps them local by the same design note; a guard change must be
// re-mirrored and the parity tests pin BOTH copies' behavior).
const MERGED_PERMS_SELECT =
  "(SELECT COALESCE(SUM(ar.permissions), 0) FROM gc_member_roles gmr " +
    "JOIN gc_roles ar ON ar.id = gmr.role_id " +
    "WHERE gmr.server_id = ? AND gmr.user_id = ?)";

const OWNER_EXISTS_SQL =
  "EXISTS (SELECT 1 FROM gc_server_members om " +
    "WHERE om.server_id = ? AND om.user_id = ? AND om.role = 'owner')";

function manageGuard(serverId, actorId) {
  const bit = SERVER_PERMISSIONS.MANAGE_EMOJI;
  return {
    sql: "(" + OWNER_EXISTS_SQL + " OR ((" + MERGED_PERMS_SELECT + ") & ?) = ?)",
    params: [serverId, actorId, serverId, actorId, bit, bit],
  };
}

const SOUND_NAME_ERROR =
  "Use a " + GC_EMOJI_NAME_MIN + "-" + GC_EMOJI_NAME_MAX +
  " character name of letters, numbers and underscores.";

function validSoundName(value) {
  if (typeof value !== "string" || !GC_EMOJI_NAME_PATTERN.test(value)) {
    throw new HttpError(400, SOUND_NAME_ERROR);
  }
  return value;
}

function validSoundId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1 || id >= 1_000_000_000_000) {
    throw new HttpError(400, "That id is invalid.");
  }
  return id;
}

// The read-tier membership gate (no membership → the shared 404, never an
// existence oracle).
async function memberGate(env, serverId, userId) {
  const exists = await env.GOOBER_DB.prepare(
    "SELECT 1 AS member FROM gc_server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
  ).bind(serverId, userId).first();
  if (!exists) throw new HttpError(404, "That server does not exist or you are not in it.");
}

// The write-tier authority read — the expression lane's exact two-step.
async function soundAuthority(env, serverId, actorId) {
  const membership = await env.GOOBER_DB.prepare(
    "SELECT role FROM gc_server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
  ).bind(serverId, actorId).first();
  if (!membership) return { isMember: false, authoritative: false };
  let authoritative =
    membership.role === "owner" || membership.role === "moderator";
  if (!authoritative) {
    const perms = await env.GOOBER_DB.prepare(
      "SELECT (" + MERGED_PERMS_SELECT + ") AS permissions " +
        "FROM gc_server_members m WHERE m.server_id = ? AND m.user_id = ? LIMIT 1",
    ).bind(serverId, actorId, serverId, actorId).first();
    authoritative = ((Number(perms?.permissions) || 0) &
      SERVER_PERMISSIONS.MANAGE_EMOJI) === SERVER_PERMISSIONS.MANAGE_EMOJI;
  }
  return { isMember: true, authoritative };
}

// The board: all sounds + names for the server, capped at the boost level's
// EFFECTIVE count (a level never lowers an inventory; level 0's own cap is
// 0, so an unboosted server's board is EMPTY — the resolver answers 0 and
// the LIMIT 0 read simply returns nothing).
export async function loadServerSounds(env, serverId) {
  const tier = await serverBoostTier(env, Number(serverId));
  const sounds = [];
  const { results } = await env.GOOBER_DB.prepare(
    "SELECT id, server_id, name, attachment_id, created_at FROM gc_sounds" +
      " WHERE server_id = ? ORDER BY name, id LIMIT " + tier.caps.soundboard,
  ).bind(Number(serverId)).all();
  for (const row of results || []) sounds.push(expressionPayloadRow(row));
  return sounds;
}

// --- intake ----------------------------------------------------------------------

const SOUND_FILE_FIELD = "sound";
const ONLY_SOUNDS_ERROR = "Only MP3, OGG, WAV, and FLAC sounds are accepted.";
const SOUND_UNREADABLE_ERROR =
  "That sound could not be read. Try re-saving it and uploading again.";
const SOUND_TOO_LARGE_ERROR =
  "Sounds must be " + Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024)) + " MiB or smaller.";
const BOOSTS_ERROR = "This server needs boosts for the soundboard.";

// The bytes contract: the image intake's discipline (size first, then the
// magic sniff) with the audio verifier in place of the image sanitizer. A
// failed sniff means NO row — nothing is stored for an unadmitted format.
export function prepareSoundAttachment(fileBytes) {
  if (!(fileBytes instanceof Uint8Array) || fileBytes.length < 1) {
    throw new HttpError(400, SOUND_UNREADABLE_ERROR);
  }
  if (fileBytes.length > MAX_ATTACHMENT_BYTES) {
    throw new HttpError(413, SOUND_TOO_LARGE_ERROR);
  }
  const mime = sniffAudioMime(fileBytes);
  if (!mime) throw new HttpError(400, ONLY_SOUNDS_ERROR);
  return { mime, bytes: fileBytes };
}

async function createSoundAttachment(env, uploaderId, fileBytes) {
  const prepared = prepareSoundAttachment(fileBytes);
  const now = nowSeconds();
  const results = await env.GOOBER_DB.batch(
    standaloneAttachmentStatements(env, uploaderId, prepared, now),
  );
  const id = Number(results[0]?.meta?.last_row_id);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(500, "That sound could not be stored. Please try again.");
  }
  return { id, status: "pending", mime: prepared.mime, sizeBytes: prepared.bytes.length };
}

// The JSON branch's own-attachment read: the sound's asset must BE audio —
// a member's own uploaded IMAGE can never ride the board as a sound.
const OWN_SOUND_MIME_SQL =
  "SELECT mime FROM gc_attachments WHERE id = ? AND uploader_id = ? LIMIT 1";

// --- routes ----------------------------------------------------------------------

async function handleListSoundsRoute(request, env, serverId) {
  const session = await requireSignedInRead(request, env);
  await memberGate(env, Number(serverId), Number(session.user.id));
  return json({ sounds: await loadServerSounds(env, Number(serverId)) });
}

async function handleCreateSoundRoute(request, env, serverId) {
  const session = await requireUser(request, env);
  await rateLimit(request, env, "write", "soundboard:" + session.user.id);
  const actorId = Number(session.user.id);
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();

  let attachmentId = null;
  let name = null;
  let files = [];
  if (contentType.startsWith("multipart/form-data")) {
    await rateLimit(request, env, "upload", "user:" + actorId);
    const parsed = await readMultipartWithImage(
      request,
      { imageField: SOUND_FILE_FIELD, label: "sound", labelPlural: "Sounds" },
    );
    files = parsed.files;
    name = validSoundName(parsed.fields.name);
    if (files.length > 1) throw new HttpError(400, "Attach exactly one sound.");
    if (files.length === 0) {
      throw new HttpError(400, "Attach the sound file for this sound.");
    }
  } else {
    const body = await readJson(request);
    name = validSoundName(body.name);
    attachmentId = Number(body.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      throw new HttpError(400, "Reference one of your own uploaded sounds.");
    }
  }

  // THE LEVEL GATE FIRST: the shared resolver answers once per create; a
  // level-0 refusal comes BEFORE ANY intake or attachment read, so a refused
  // create stores nothing — not even a pending attachment riding the
  // moderation desk for nothing.
  const cap = (await serverBoostTier(env, Number(serverId))).caps.soundboard;
  if (cap <= 0) throw new HttpError(400, BOOSTS_ERROR);

  if (attachmentId === null) {
    attachmentId = Number((await createSoundAttachment(env, actorId, files[0])).id);
  } else {
    // The JSON branch's own-asset read: the sound's asset must BE audio — a
    // member's own uploaded IMAGE can never ride the board as a sound.
    const owned = await env.GOOBER_DB.prepare(OWN_SOUND_MIME_SQL)
      .bind(attachmentId, actorId).first();
    if (!owned || !String(owned.mime || "").startsWith("audio/")) {
      throw new HttpError(400, "Reference one of your own uploaded sounds.");
    }
  }

  const result = await env.GOOBER_DB.prepare(
    "INSERT INTO gc_sounds (server_id, name, attachment_id, created_by, created_at) " +
      "SELECT ?, ?, ?, ?, ? " +
      "WHERE (" + OWNER_EXISTS_SQL + " OR ((" + MERGED_PERMS_SELECT + ") & ?) = ?) " +
      "AND EXISTS (SELECT 1 FROM gc_attachments a WHERE a.id = ? AND a.uploader_id = ?) " +
      "AND (SELECT COUNT(*) FROM gc_sounds WHERE server_id = ?) < " + cap,
  ).bind(
    Number(serverId), name, attachmentId, actorId, nowSeconds(),
    Number(serverId), actorId, SERVER_PERMISSIONS.MANAGE_EMOJI,
    SERVER_PERMISSIONS.MANAGE_EMOJI,
    attachmentId, actorId,
    Number(serverId),
  ).run().catch((error) => {
    if (/UNIQUE|SQLITE_CONSTRAINT/i.test(String(error))) {
      throw new HttpError(409, "That sound name is already taken in this server.");
    }
    throw error;
  });

  if (Number(result?.meta?.changes) !== 1) {
    // Zero changes — classify by the failing arm, in arm order (the
    // expression lane's exact discipline: one read for the caller-own-asset
    // question + the count, the authority read the channel-delete two-step).
    const state = await env.GOOBER_DB.prepare(
      "SELECT EXISTS (SELECT 1 FROM gc_attachments a WHERE a.id = ? AND a.uploader_id = ?) AS ownAttachment, " +
        "(SELECT COUNT(*) FROM gc_sounds WHERE server_id = ?) AS count",
    ).bind(attachmentId, actorId, Number(serverId)).first();
    const { isMember, authoritative } = await soundAuthority(env, Number(serverId), actorId);
    if (!isMember) throw new HttpError(404, "That server does not exist or you are not in it.");
    if (!authoritative) throw new HttpError(403, "You do not have permission to do that.");
    if (Number(state?.count) >= cap) {
      throw new HttpError(400, "This server already has " + cap + " sounds.");
    }
    throw new HttpError(400, "Reference one of your own uploaded sounds.");
  }

  const row = await env.GOOBER_DB.prepare(
    "SELECT id, server_id, name, attachment_id, created_at FROM gc_sounds " +
      "WHERE server_id = ? AND name = ? ORDER BY id DESC LIMIT 1",
  ).bind(Number(serverId), name).first();
  if (!row) {
    throw new HttpError(500, "The sound could not be saved. Please try again.");
  }
  return json({ sound: expressionPayloadRow(row) }, 201);
}

async function handleRenameSoundRoute(request, env, serverId, soundId) {
  const session = await requireUser(request, env);
  await rateLimit(request, env, "write", "soundboard:" + session.user.id);
  const body = await readJson(request);
  const name = validSoundName(body.name);
  const soundIdNum = validSoundId(soundId);
  const actorId = Number(session.user.id);
  const guard = manageGuard(Number(serverId), actorId);

  let result;
  try {
    result = await env.GOOBER_DB.prepare(
      "UPDATE gc_sounds SET name = ? WHERE id = ? AND server_id = ? AND " + guard.sql,
    ).bind(name, soundIdNum, Number(serverId), ...guard.params).run();
  } catch (error) {
    if (/UNIQUE|SQLITE_CONSTRAINT/i.test(String(error))) {
      throw new HttpError(409, "That sound name is already taken in this server.");
    }
    throw error;
  }
  if (Number(result?.meta?.changes) !== 1) {
    const { isMember, authoritative } = await soundAuthority(env, Number(serverId), actorId);
    if (!isMember) throw new HttpError(404, "That server does not exist or you are not in it.");
    if (authoritative) throw new HttpError(404, "That sound does not exist.");
    throw new HttpError(403, "You do not have permission to do that.");
  }

  const row = await env.GOOBER_DB.prepare(
    "SELECT id, server_id, name, attachment_id, created_at FROM gc_sounds WHERE id = ? LIMIT 1",
  ).bind(soundIdNum).first();
  return json({ sound: expressionPayloadRow(row) });
}

// The delete batch mirrors the expression lane's three-statement ordering
// (chunks → row → attachment LAST, the RESTRICT FK). The trailing attachment
// delete carries the protection for every OTHER referencer: another sound,
// an emoji row, a sticker row — the gc_sounds guard is the twin the emoji
// lane's trailing delete gained in the same wave, so one shared asset can
// never be stripped out from under the remaining rows either direction.
async function handleDeleteSoundRoute(request, env, serverId, soundId) {
  const session = await requireUser(request, env);
  await rateLimit(request, env, "write", "soundboard:" + session.user.id);
  const actorId = Number(session.user.id);
  const soundIdNum = validSoundId(soundId);
  const guard = manageGuard(Number(serverId), actorId);

  const target = await env.GOOBER_DB.prepare(
    "SELECT attachment_id FROM gc_sounds WHERE id = ? AND server_id = ? LIMIT 1",
  ).bind(soundIdNum, Number(serverId)).first();
  if (!target) {
    const { isMember, authoritative } = await soundAuthority(env, Number(serverId), actorId);
    if (!isMember) throw new HttpError(404, "That server does not exist or you are not in it.");
    if (authoritative) throw new HttpError(404, "That sound does not exist.");
    throw new HttpError(403, "You do not have permission to do that.");
  }

  const results = await env.GOOBER_DB.batch([
    env.GOOBER_DB.prepare(
      "DELETE FROM gc_attachment_chunks WHERE attachment_id = ? AND " + guard.sql,
    ).bind(Number(target.attachment_id), ...guard.params),
    env.GOOBER_DB.prepare(
      "DELETE FROM gc_sounds WHERE id = ? AND server_id = ? AND " + guard.sql,
    ).bind(soundIdNum, Number(serverId), ...guard.params),
    env.GOOBER_DB.prepare(
      "DELETE FROM gc_attachments WHERE id = ? AND " +
        "NOT EXISTS (SELECT 1 FROM gc_sounds WHERE attachment_id = ?) AND " +
        "NOT EXISTS (SELECT 1 FROM gc_emoji WHERE attachment_id = ?) AND " +
        "NOT EXISTS (SELECT 1 FROM gc_stickers WHERE attachment_id = ?) AND " +
        "message_id IS NULL AND " + guard.sql,
    ).bind(
      Number(target.attachment_id),
      Number(target.attachment_id),
      Number(target.attachment_id),
      Number(target.attachment_id),
      ...guard.params,
    ),
  ]);
  if (Number(results[1]?.meta?.changes) !== 1) {
    throw new HttpError(403, "You do not have permission to do that.");
  }
  await purgeAttachmentObjects(env, [Number(target.attachment_id)]);
  return json({ ok: true });
}

// --- dispatch -----------------------------------------------------------------

export async function handleSoundboardRoutes(request, env, url, path, method, ctx) {
  void url;
  void ctx;

  const listMatch = (method === "GET" || method === "POST")
    ? path.match(/^\/api\/servers\/([1-9][0-9]*)\/sounds$/)
    : null;
  if (listMatch) {
    return method === "GET"
      ? handleListSoundsRoute(request, env, Number(listMatch[1]))
      : handleCreateSoundRoute(request, env, Number(listMatch[1]));
  }

  const itemMatch = (method === "PATCH" || method === "DELETE")
    ? path.match(/^\/api\/servers\/([1-9][0-9]*)\/sounds\/([1-9][0-9]*)$/)
    : null;
  if (itemMatch) {
    return method === "PATCH"
      ? handleRenameSoundRoute(request, env, Number(itemMatch[1]), itemMatch[2])
      : handleDeleteSoundRoute(request, env, Number(itemMatch[1]), itemMatch[2]);
  }
  return undefined;
}
