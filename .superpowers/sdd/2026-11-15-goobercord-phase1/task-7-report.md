# Task 7 — Conversations (DMs + groups): implementation and fix round

Module: `api/conversations.mjs` · Tests: `tests/conversations-module.test.mjs`
Branch: `worktree-agent-ab51447d129b9ce6b` (base: the phase1 Task 7 + Task 8 merged state)

## Part 1 — the original implementation (built by the predecessor)

Task 7 realizes the spec's gc_conversations as server-less `gc_channels` rows:
`kind` `'dm'`/`'group'` with `server_id NULL` (the schema CHECK pins that
pairing), membership in `gc_conversation_members`. A "conversation" IS a
channel, so messaging rides Task 5's channel message routes verbatim; this
module owns only find-or-create, the list, and the leave.

### POST /api/conversations (create)
- `requireUser` (cookie session + CSRF + same-origin), body `userIds`.
- Validation order, all before any write: ids are positive integers under
  1e15, self is rejected, deduped, 1..8 others (1 → `dm`, 2..8 → `group`,
  roster at most 9; the cap counts INVITES not roster).
- Every id must resolve from `users` (one IN-list read; missing → 400)
  BEFORE the blocks read or any write.
- Blocked-pair refusal: either direction of the forum's `blocks` table
  (caller as blocker or as blocked) with any requested member → 403. The
  forum table is used read-only.
- DM find-or-create: `DM_FIND_SQL` selects the `kind='dm'` channel where BOTH
  requested ids sit on member rows and the roster is exactly 2 (symmetric in
  both ids, so no canonical ordering; roster=2 pins the canonical pair so a
  stale wider row can never be reused). Found → 200 with the existing id and
  NO insert. Groups ALWAYS create new (no lookup).
- Create writes everything keyed to the new channel id (see fix round below).

### GET /api/conversations (list)
- `requireSignedInRead` (no CSRF for reads). `CONVERSATIONS_LIST_SQL` joins
  the caller's `gc_conversation_members` rows to their dm/group channels
  ordered by last-message recency; the unread count is a subselect IN THE SQL
  (`gc_messages` with `gm.id > m.last_read_message_id` — the caller's own
  cursor), so it is always self-scoped: the only bind is the session user.
- Names are never stored: computed at read time via `conversationName()` —
  a DM's name is the other member's username, a group's is the other members
  joined. Two follow-up IN-list reads (roster, last-message preview) scope
  themselves to exactly the LISTED channels; an empty list short-circuits to
  zero queries.

### DELETE /api/conversations/:id (leave)
- `requireUser`. Group-only via a guard carried inside the member DELETE's
  WHERE (`EXISTS gc_channels kind='group'`), so a dm channel or unknown id
  answers 404, never 403.
- The channel delete (`DELETE FROM gc_channels WHERE id=? AND kind='group'
  AND NOT EXISTS members`) removes the channel only when the last member
  leaves. All authorization lives in the SQL — the test module pins these
  shapes rather than simulating D1 rows.

## Part 2 — fix round (this implementation)

### Fix 1 (CRITICAL): member rows bound to wrong channel ids on create

The create batch derived every member's `channel_id` from
`last_insert_rowid()`. In real SQLite/D1 each member INSERT completes and
becomes the connection's last insert, so members 2..N bound to the PREVIOUS
member row's rowid (reviewer's repro: channel id 6 produced member rows
(6,7),(3,9),(4,10)). On local SQLite the member FKs make the create FAIL;
on D1 it fails or corrupts.

Fix: the channel INSERT runs FIRST as its own statement; the handler reads
`meta.last_row_id`, then batches ALL `gc_conversation_members` inserts with
the literal channel id bound (`VALUES (?, ?, 0)`), verifying each statement's
`meta.changes === 1`.

Pin: two changes to `tests/conversations-module.test.mjs`
- Fake-shape tests now assert the channel insert is a standalone `run` call
  executed BEFORE the member batch, and that EVERY member insert binds
  `[channelId, userId]` with the created id as the literal first bind.
- New real-SQLite test (node:sqlite, `PRAGMA foreign_keys = ON`, schema mirroring
  `migrations/0001`), "real-SQLite: a 3-member group create binds EVERY
  member row to the created channel id": creates a 3-invite group and
  asserts all 4 member rows carry the created channel id.

Verified it FAILS against the old SQL (temporarily reverted): the test fails
with `Error: FOREIGN KEY constraint failed` — exactly the D1 failure mode.
Restored the fix; suite green.

### Fix 2: leave batch could destroy an empty group on the 404 path

The old leave ran ONE batch: member DELETE + unconditional channel DELETE.
For an outsider targeting a MEMBERLESS group channel, the member delete
matched 0 rows (→ 404) but the channel delete's NOT-EXISTS arm PASSED and
destroyed the channel — deletion on a 404 answer.

Fix: the member DELETE runs first and its `changes` result GATES the channel
delete in the handler (0 changes → throw 404 before anything else runs). The
channel delete remains NOT-EXISTS-guarded so it removes the channel only
when the departing caller truly was the last member. (A single batch cannot
express "second statement only if first changed exactly 1 row" — D1 batches
have no cross-statement result access — and a caller-membership EXISTS arm
cannot work because the caller's just-deleted row is already gone.)

Pin: the 404 tests now assert NO channel delete statement was even prepared;
new explicit test "an OUTSIDER targeting a memberless group channel gets
only 404 and zero deletions". New real-SQLite end-to-end test covers the
whole lifecycle: outsider delete touches nothing, a real member's leave
removes only their row, the last depart removes the channel.

### Out of scope (documented, per instructions)
- Blocked-pair semantics and any DM-race redesign left untouched.

### Verification

- `npm test` (full suite): **126 tests, 126 pass, 0 fail**
  (`npm test 2>&1 | tail` → `pass 126 / fail 0`).
- Old-SQL failure check: `node --test --test-name-pattern "binds EVERY
  member row" tests/conversations-module.test.mjs` against the reverted
  module → `fail 1 ... Error: FOREIGN KEY constraint failed`.
- Working tree clean apart from: `api/conversations.mjs`,
  `tests/conversations-module.test.mjs`, this report.

### Process note (reconstruction)
Mid-fix-round the shared `.git` was lost and reconstructed by the
controller; this worktree was re-registered onto the reconstructed repo and
the fixes were re-applied verbatim (they were re-derived from the exact
edits already verified green pre-reconstruction).
