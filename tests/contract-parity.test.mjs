// Contract parity (Phase 1, Task 1): this repo and wempos-forum share ONE
// production D1 database, so the vendored auth core must only differ from the
// forum's by the allow-listed token substitutions. This test pins the shared
// contract against the forum's live source so an accidental divergence in the
// rows that touch the shared tables (sessions, bans, banned_ips, known_ips)
// or the crypto constants fails CI instead of production.
//
// Allow-listed substitutions ONLY:
//   FORUM_DB      -> GOOBER_DB
//   wempo_session -> goober_session
//   (plus the relative constants.mjs import path, which is identical anyway)
// Everything else must be character-for-character identical.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const GOOBER_CORE = path.resolve(HERE, "../api/core");
const FORUM_CORE = "/Users/itswempo/wempos-forum/api/core";

function vendorize(text) {
  return text.replaceAll("FORUM_DB", "GOOBER_DB").replaceAll(
    "wempo_session",
    "goober_session",
  );
}

function readCore(filename) {
  return readFileSync(path.join(GOOBER_CORE, filename), "utf-8");
}

function readForumCore(filename) {
  return readFileSync(path.join(FORUM_CORE, filename), "utf-8");
}

// Whole-file gate: auth.mjs may differ from the forum copy by the
// allow-listed substitutions and NOTHING else. The per-line pins below then
// localize any failure, but this gate is what keeps the vendoring honest.
// (Without it, (a) alone is vacuous: the lines naming shared tables sit on
// string-continuation lines that carry neither FORUM_DB nor wempo_session.)
test("auth.mjs is fully identical to the forum's after substitution", () => {
  assert.equal(readCore("auth.mjs"), vendorize(readForumCore("auth.mjs")));
});

// (a) Every auth.mjs line whose SQL touches a shared table must match the
// forum's character-for-character after the allow-listed substitutions.
test("auth.mjs shared-table SQL lines are identical to the forum's", () => {
  const gooberLines = readCore("auth.mjs").split("\n");
  const forumLines = vendorize(readForumCore("auth.mjs")).split("\n");

  assert.equal(gooberLines.length, forumLines.length, "line counts differ");

  const SHARED_TABLES = ["sessions", "bans", "banned_ips", "known_ips"];
  let pinned = 0;

  for (let i = 0; i < gooberLines.length; i++) {
    const line = gooberLines[i];
    if (!SHARED_TABLES.some((table) => line.includes(table))) continue;

    assert.equal(
      line,
      forumLines[i],
      `auth.mjs line ${i + 1} diverges from the forum copy:\n  goober: ${line}\n  forum:  ${forumLines[i]}`,
    );
    pinned++;
  }

  assert.ok(
    pinned > 0,
    "no shared-table SQL lines were found — the pin became vacuous",
  );
});

// (b) The HMAC data label: "wempo-forum-ip:" appears untransformed in both —
// the keyed IP hash must produce the SAME digest in both apps, since rows
// written by one must be readable as bans by the other.
test("auth.mjs HMAC data label literal is untransformed in both copies", () => {
  const LABEL = "wempo-forum-ip:";

  const gooberLine = readCore("auth.mjs").split("\n").find((l) => l.includes(LABEL));
  assert.ok(gooberLine, `vendored auth.mjs is missing the ${LABEL} literal`);
  assert.ok(
    gooberLine.includes('new TextEncoder().encode("' + LABEL + '" + ip)'),
    `the HMAC label line was altered: ${gooberLine}`,
  );
  assert.ok(
    !readCore("auth.mjs").includes("goobercord-ip"),
    "the HMAC label was wrongly rebranded",
  );

  assert.equal(
    gooberLine,
    vendorize(readForumCore("auth.mjs")).split("\n").find((l) => l.includes(LABEL)),
    "the HMAC label line differs from the forum copy",
  );
});

// (c) + (d) passwords.mjs (pepper + PBKDF2 iteration constants) and totp.mjs
// are fully identical to the forum's after substitution.
test("passwords.mjs is identical to the forum's after substitution", () => {
  assert.equal(readCore("passwords.mjs"), vendorize(readForumCore("passwords.mjs")));
});

test("totp.mjs is identical to the forum's after substitution", () => {
  assert.equal(readCore("totp.mjs"), vendorize(readForumCore("totp.mjs")));
});

// (e) images.mjs: Task 6 vendors the forum's RESTORED image-intake core
// (commit 2c4f571 — "Restore pre-refactor image sanitizers"; the refactor
// wave's CRC/strictness rewrite had been rejecting valid uploads). The file
// is pure byte work (no FORUM_DB, no wempo_session), so the substitution is
// a no-op here and the pin is character-for-character.
test("images.mjs is identical to the forum's after substitution", () => {
  assert.equal(readCore("images.mjs"), vendorize(readForumCore("images.mjs")));
});
