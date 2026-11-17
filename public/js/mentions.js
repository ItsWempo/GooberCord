// Copyright 2026 YourLocalGoober
//
// This file is part of GooberCord.
//
// GooberCord is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the
// GNU Affero General Public License along with this program.  If not,
// see <https://www.gnu.org/licenses/>

// mentions.js — the client's render-side mirror of api/mentions.mjs: a
// message body STORES plain text, so @everyone / @here / @username resolve at
// render time here, exactly the way the server's gates parse them (the lead's
// contract: mirror the reference, never re-invent it). No storage change, no
// new reads — the roster payload the client already carries is the only input.
//
//   Flags: "@everyone" / "@here" are case-insensitive and WORD-BOUNDED —
//   "mail@everyone.com", "@everyonehere", and "not@heretoday" are plain text
//   (the flag is a send gate, not a spellchecker).
//   @user: a candidate is "@" then 2..32 name characters (letters, digits,
//   and the space/dot/dash seams a display name carries), collected greedily,
//   then matched LONGEST-FIRST — case-insensitive, the server nickname (the
//   display name) before the username — and a candidate width matching MORE
//   THAN ONE member resolves to nobody (the ambiguity is never rescued by
//   shortening). Repeated tokens count as repeated mentions.

// The flag regexes, character-for-character the reference's.
const EVERYONE_FLAG_RE = /(^|[^A-Za-z0-9_])@everyone(?![A-Za-z0-9_])/i;
const HERE_FLAG_RE = /(^|[^A-Za-z0-9_])@here(?![A-Za-z0-9_])/i;

// True when the body carries an @everyone or an @here (case-insensitive).
export function mentionsEveryoneFlag(text) {
  return EVERYONE_FLAG_RE.test(text) || HERE_FLAG_RE.test(text);
}

// The candidate regex, character-for-character the reference's.
const CANDIDATE_RE = /@[A-Za-z0-9_][A-Za-z0-9_ .-]{1,31}/g;
// The sticky rebuild of the same shape for the per-position scan: "@" then
// one strict name char, then 1..31 loose seam chars.
const CANDIDATE_HEAD = new RegExp("^[A-Za-z0-9_]", "u");
const CANDIDATE_BODY = new RegExp("^[A-Za-z0-9_ .-]", "u");

function memberMatches(member, lower) {
  const nickname = typeof member?.nickname === "string" ? member.nickname.trim().toLowerCase() : "";
  if (nickname.length > 0 && nickname === lower) return true;
  return String(member?.username || "").toLowerCase() === lower;
}

function resolveCandidate(collected, roster) {
  for (let end = collected.length; end >= 2; end--) {
    const lower = collected.slice(0, end).toLowerCase();
    const hits = roster.filter((member) => memberMatches(member, lower));
    if (hits.length === 1) {
      return { hit: hits[0], width: end };
    }
    if (hits.length > 1) return { hit: null }; // ambiguous at this width: no shortening rescue
  }
  return { hit: null };
}

// matchRosterMentions(text, members): the roster matcher the server's gates
// pin (contract parity — same regex, same longest-first walk). Returns the
// resolved user ids, one entry per MENTION TOKEN (repeats stay repeated),
// first-occurrence order.
export function matchRosterMentions(text, members) {
  const roster = Array.isArray(members) ? members : [];
  const resolved = [];
  for (const raw of String(text).matchAll(CANDIDATE_RE)) {
    const collected = raw[0].slice(1).trim();
    const { hit } = resolveCandidate(collected, roster);
    if (hit !== null) resolved.push(Number(hit.id));
  }
  return resolved;
}

// The flag token at an exact "@" position, or null: the same word-bound rule
// as the reference regexes, checked from the left seam to the right tail.
const NAME_TAIL = new RegExp("^[A-Za-z0-9_]", "u");

function flagAt(source, at) {
  if (at > 0 && NAME_TAIL.test(source[at - 1])) return null;
  for (const flag of ["everyone", "here"]) {
    const token = "@" + flag;
    if (source.slice(at, at + token.length).toLowerCase() !== token) continue;
    const after = source[at + token.length];
    if (after && NAME_TAIL.test(after)) continue;
    return flag;
  }
  return null;
}

// The raw candidate at an "@" position, or null: the reference candidate
// regex collected greedily from that exact position.
function candidateAt(source, at) {
  if (source[at] !== "@") return null;
  if (!CANDIDATE_HEAD.test(source[at + 1] || "")) return null;
  let end = at + 2;
  while (end < source.length && CANDIDATE_BODY.test(source[end]) && end - at < 33) end++;
  return source.slice(at, end);
}

// splitMentionTokens(text, members): the renderer's split of ONE plain-text
// segment into mention tokens and plain text. Returns, in order:
//   { text: "…" }              plain text (unresolved candidates included)
//   { kind: "everyone", token: "@everyone" | "@here", flag: "everyone" }
//   { kind: "user", token: "@wempo two", id: 3 }
// Tokens carry the ORIGINAL slice (case preserved) for the highlight; an
// unresolved candidate is plain text, never an empty hole.
export function splitMentionTokens(text, members) {
  const source = String(text ?? "");
  const roster = Array.isArray(members) ? members : [];
  const parts = [];
  const plain = (slice) => {
    if (slice) parts.push({ text: slice });
  };
  let cursor = 0;
  while (cursor < source.length) {
    const at = source.indexOf("@", cursor);
    if (at === -1) {
      plain(source.slice(cursor));
      break;
    }
    plain(source.slice(cursor, at));
    const flag = flagAt(source, at);
    if (flag !== null) {
      // The gate wins over an unlucky member literally named "everyone".
      parts.push({ kind: "everyone", token: source.slice(at, at + 1 + flag.length), flag });
      cursor = at + 1 + flag.length;
      continue;
    }
    const raw = candidateAt(source, at);
    if (raw !== null) {
      const collected = raw.slice(1).trim();
      const { hit, width } = resolveCandidate(collected, roster);
      if (hit !== null && collected.length >= 2) {
        // The highlight covers the RESOLVED width only: the greedy candidate
        // may run past the name ("@WEM and" resolves at "WEM"), and the run-off
        // returns to the scan as plain text so it is never swallowed.
        parts.push({ kind: "user", token: source.slice(at, at + 1 + width), id: Number(hit.id) });
        plain(source.slice(at + 1 + width, at + raw.length));
        cursor = at + raw.length;
        continue;
      }
      // Unresolved: the whole greedy candidate stays plain text.
      plain(raw);
      cursor = at + raw.length;
      continue;
    }
    plain("@");
    cursor = at + 1;
  }
  return parts;
}
