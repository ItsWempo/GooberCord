// Goober+ perk vocabulary — ONE module so the perks key on one predicate
// everywhere (migration 0011 ships the term state; the 2026-11-17 Nitro
// perks lane rides it).
//
// THE TWO PREDICATES, deliberately distinct:
//   - PERKS (economy tiers, cosmetics writes, the upload tier): an ACTIVE
//     TERM strictly renews_until > now. A grace-window member has visibly
//     lapsed — perks are OFF in grace (owner ruling 2026-11-17), the badge
//     stays visible.
//   - DISPLAY (the coins endpoint's plus payload, publicPlus in coins.mjs):
//     the shipped shape counts a grace window as active: true — that stays
//     as it shipped (its pins hold); it is the member's own coins view, not
//     a perk decision.
import { ACCENT_HEX_PATTERN } from "./accent.mjs";
import {
  GC_PLUS_ATTACHMENT_BYTES,
  GC_PLUS_ATTACHMENT_REQUEST_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_REQUEST_BYTES,
} from "../constants.mjs";

const PLUS_TERM_READ_SQL =
  "SELECT renews_until FROM gc_plus_state WHERE user_id = ? LIMIT 1";

// The perk gate, read once per decision point (an indexed PK walk). Guests
// and members who never bought read as not-active with zero extra shape.
export async function plusPerkActive(env, userId, now) {
  const row = await env.GOOBER_DB.prepare(PLUS_TERM_READ_SQL)
    .bind(Number(userId)).first();
  return Number(row?.renews_until) > Number(now);
}

// The payload-flag fragment (the "badge without extra fetches" contract):
// append `plusActiveExpr("u.id")` to a user-shaped SELECT and bind `now`
// among that statement's params IN TEXTUAL ORDER. Yields a 0/1 is_plus the
// shaping code maps to boolean isPlus — COALESCEd because a member with no
// gc_plus_state row reads NULL through the subquery, and the column must
// stay a clean 0/1 (a null is_plus downstream would read as its own state).
export function plusActiveExpr(userColumn) {
  return "COALESCE(((SELECT gs.renews_until FROM gc_plus_state gs WHERE gs.user_id = " +
    userColumn + ") > ?), 0) AS is_plus";
}

// The upload tier (the 0013 rebuild): one indexed read decides which
// constants.mjs pair the caller passes into the intake helpers. A grace
// member rides the FREE pair — the perk predicate is strict.
export async function attachmentCapBytes(env, userId, now) {
  const plus = await plusPerkActive(env, userId, now);
  return plus
    ? { fileBytes: GC_PLUS_ATTACHMENT_BYTES, requestBytes: GC_PLUS_ATTACHMENT_REQUEST_BYTES }
    : { fileBytes: MAX_ATTACHMENT_BYTES, requestBytes: MAX_ATTACHMENT_REQUEST_BYTES };
}

export function publicIsPlus(row) {
  return Boolean(row && row.is_plus);
}

// --- the cosmetics validators (same discipline as api/accent.mjs) -----------

export const FLAIR_MAX = 16;
export const FLAIR_PATTERN = /^[^\r\n]{2,16}$/;

export function isValidFlair(value) {
  return typeof value === "string" && FLAIR_PATTERN.test(value);
}

export function isValidBanner(value) {
  if (value === null) return true;
  return typeof value === "string" && ACCENT_HEX_PATTERN.test(value);
}

// The public shape's cosmetics: strict hex or the strict text pass through
// verbatim (an inline style can never carry anything else), everything else
// is absent.
export function publicCosmetics(row) {
  const banner = row && typeof row.banner_color === "string" && row.banner_color.length > 0
    && ACCENT_HEX_PATTERN.test(row.banner_color)
    ? row.banner_color
    : null;
  const flair = row && typeof row.flair_text === "string" && row.flair_text.length > 0
    && FLAIR_PATTERN.test(row.flair_text)
    ? row.flair_text
    : null;
  return { banner, flair };
}
