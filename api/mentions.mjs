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

// The mentions wave (owner direct ask): a message body STORES plain text —
// the @everyone / @here / @username forms resolve at gate time and at the
// client's render time, the same class as the 0020 expression tokens. No
// storage change, no new payload key, no bell table: unread counts stay
// as-is (the conversations route owns them), and mention highlighting is
// render-side off the roster payload the client already carries.
//
// The client parses these the same way the gates do (the contract the lead
// relays): the flag tokens are case-insensitive and word-bounded, and a
// @username resolves against the channel's roster case-insensitively, the
// server nickname (the display name) before the username, with a candidate
// that matches MORE THAN ONE member resolving to nobody at all.

// The @everyone / @here flags. A match needs a non-name seam on both sides,
// so "@everyonehere" and "mail@everyone.com" are plain text — the flag is a
// send gate, not a spellchecker.
const EVERYONE_FLAG_RE = /(^|[^A-Za-z0-9_])@everyone(?![A-Za-z0-9_])/i;
const HERE_FLAG_RE = /(^|[^A-Za-z0-9_])@here(?![A-Za-z0-9_])/i;

// True when the body carries an @everyone or an @here (case-insensitive).
export function mentionsEveryoneFlag(text) {
  return EVERYONE_FLAG_RE.test(text) || HERE_FLAG_RE.test(text);
}

// matchRosterMentions(text, members): the @username resolution the gates
// pin and the client re-renders. members is the roster shape the payloads
// already carry: [{ id, username, nickname }].
//
//   One candidate: '@' then 2..32 name characters (letters, digits, and the
//   space/dot/dash seams a display name carries), greedily collected, then
//   matched LONGEST-FIRST — so a trailing-word display name
//   ("wempo two" from "@wempo two") wins over the shorter username ("wempo")
//   a strict prefix would have caught.
//
//   Resolution per candidate, in order: a UNIQUE case-insensitive hit against
//   nickname-or-username resolves; several hits (a nickname on one member
//   colliding with another member's username) are AMBIGUOUS and resolve to
//   nobody (the ambiguity must not be broken by shortening); no hit walks the
//   candidate down one seam and retries.
//
//   Returns the resolved user ids, one entry per MENTION TOKEN (an id
//   repeated by repeated tokens stays repeated — the count is the sender's
//   own punctuation, render-side), first-occurrence order.
const CANDIDATE_RE = /@[A-Za-z0-9_][A-Za-z0-9_ .-]{1,31}/g;

function memberMatches(member, lower) {
  const nickname = typeof member?.nickname === "string" ? member.nickname.trim().toLowerCase() : "";
  if (nickname.length > 0 && nickname === lower) return true;
  return String(member?.username || "").toLowerCase() === lower;
}

export function matchRosterMentions(text, members) {
  const roster = Array.isArray(members) ? members : [];
  const resolved = [];
  for (const raw of String(text).matchAll(CANDIDATE_RE)) {
    const collected = raw[0].slice(1).trim();
    let hit = null;
    for (let end = collected.length; end >= 2; end--) {
      const lower = collected.slice(0, end).toLowerCase();
      const hits = roster.filter((member) => memberMatches(member, lower));
      if (hits.length === 1) {
        hit = hits[0];
        break;
      }
      if (hits.length > 1) break; // ambiguous at this width: no shortening rescue
    }
    if (hit !== null) resolved.push(Number(hit.id));
  }
  return resolved;
}
