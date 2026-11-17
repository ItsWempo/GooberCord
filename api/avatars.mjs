// Avatar serving, ported from the forum's api/avatars.mjs (the owner-facing
// 404: every GC session payload and roster already ships
// "/api/avatars/<user id>?v=<avatar_version>" — the shared users table's
// approved avatar — but GC's worker never served the URL). Read-only here:
// the lifecycle stays forum-side (upload + limits + the moderation queue, in
// wempos-forum), while GC serves the same shared rows it already names.
// Approved avatars serve to anyone with public cache headers; a pending
// upload's bytes stay visible only to the account owner and staff —
// uncacheable — while everyone else gets the approved avatar or 404. The
// session is only consulted when a pending set exists, so guest 404s never
// read sessions.
import { readSession } from "./core/auth.mjs";
import { HttpError } from "./core/http.mjs";
import { blobToUint8Array, imageResponse } from "./core/images.mjs";

export async function handleAvatarRoutes(request, env, url, path, method) {
  const avatarMatch = path.match(/^\/api\/avatars\/([0-9]+)$/);
  if (!avatarMatch) return null;
  const db = env.GOOBER_DB;
  if (method !== "GET") throw new HttpError(405, "That method is not supported.");
  const userId = Number(avatarMatch[1]);
  if (!Number.isSafeInteger(userId) || userId < 1) throw new HttpError(404, "Picture not found.");
  const row = await db.prepare(
    "SELECT avatar_status, avatar_mime, avatar_data, pending_avatar_mime, pending_avatar_data FROM users WHERE id = ? LIMIT 1",
  ).bind(userId).first();
  if (!row) throw new HttpError(404, "Picture not found.");

  if (row.pending_avatar_mime && row.pending_avatar_data) {
    const session = await readSession(request, env);
    const viewer = session && session.user;
    const isStaff = viewer && (viewer.role === "owner" || viewer.role === "admin");
    if (viewer && (viewer.id === userId || isStaff)) {
      const response = imageResponse(blobToUint8Array(row.pending_avatar_data), row.pending_avatar_mime, "no-store");
      if (response) return response;
    }
  }

  if (row.avatar_mime && row.avatar_data) {
    const response = imageResponse(blobToUint8Array(row.avatar_data), row.avatar_mime, "public, max-age=3600");
    if (response) return response;
  }

  throw new HttpError(404, "Picture not found.");
}
