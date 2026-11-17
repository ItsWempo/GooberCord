-- 0014: REPAIR — the 0013 rebuild's child FK now points at a dropped table.
--
-- 0013's gc_attachments CHECK rebuild renamed the parent and then dropped
-- the shell. SQLite's RENAME updates every child's stored FK, so
-- gc_attachment_chunks' REFERENCES was rewritten to
-- "gc_attachments_pre_nitro" and the DROP removed that table — the child
-- schema has referenced a table that does not exist ever since. On an
-- FK-enforcing engine (D1 among them, verified against remote 2026-11-17
-- with a read-write net-zero probe) EVERY chunk INSERT fails with
-- "no such table: main.gc_attachments_pre_nitro": attachment uploads 500
-- in production. Reads and the copied parent rows are unaffected, and the
-- cascade at apply time ate nothing (verified 0 attachment rows / 0 chunk
-- rows in prod at apply).
--
-- Same contract as 0013: the shared wempo-forum-data D1, every object
-- gc_-prefixed and independent of the later migrations — this file applies
-- cleanly right after 0013 (its only precondition) as well as at the end of
-- the sequence.
--
-- THE SAFE SHAPE this file should have been 0013's (pinned by
-- tests/migration-scoping-0013.test.mjs, documented for the future): rename
-- the CHILD out of the way FIRST, then the parent — never DROP a populated
-- parent while a child still references it. Here the parent is already
-- intact under its correct name, so only the child needs the rename-copy
-- dance; gc_attachment_chunks has NO children of its own (verified: no
-- table, view, or trigger references it — only its own autoindex), so ITS
-- drop is safe, which is exactly what made the 0013 ordering wrong for the
-- parent but right here.

CREATE TABLE gc_attachment_chunks_repair (
  attachment_id INTEGER NOT NULL REFERENCES gc_attachments(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  data BLOB NOT NULL CHECK(length(data) BETWEEN 1 AND 64000),
  PRIMARY KEY(attachment_id, seq)
);

-- Copy under the LIVE parent: with FKs enforced, every copied row's
-- attachment_id must resolve against the current gc_attachments — which is
-- what the 0013 copy guaranteed.
INSERT INTO gc_attachment_chunks_repair SELECT * FROM gc_attachment_chunks;

ALTER TABLE gc_attachment_chunks RENAME TO gc_attachment_chunks_pre_repair;
ALTER TABLE gc_attachment_chunks_repair RENAME TO gc_attachment_chunks;

-- Nothing references the old shell (chunk rows already copied), and no
-- table references gc_attachment_chunks itself, so the implicit DELETE that
-- accompanies this DROP has no child to cascade into.
DROP TABLE gc_attachment_chunks_pre_repair;
