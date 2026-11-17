-- The large-file upload lane goes D1-ONLY (owner ruling, Nov 17: "no park,
-- and no r2"). The R2 design kept its in-flight parts in the object store,
-- and gc_attachment_chunks — whose FK demands a gc_attachments parent row —
-- could never hold them before the commit, when the row is born with the
-- sniffed mime (never a placeholder the mime CHECK can hold). This staging
-- table is the proven chunk machinery's pre-commit half: the SAME row shape
-- (64,000-byte BLOBs, one seq per chunk — the literal mirrors
-- gc_attachment_chunks' own CHECK, both riding ATTACHMENT_CHUNK_BYTES in
-- code), keyed by the client-held upload id instead of an attachment id.
-- The commit moves the set into gc_attachment_chunks inside its one batch
-- (INSERT..SELECT over an in-batch identity tuple) and deletes the staging
-- rows; the abandon route deletes them; the uploader CASCADE carries a
-- member whose abandoned upload outlives their account delete.
CREATE TABLE gc_upload_parts (
  upload_id TEXT NOT NULL,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK(seq >= 0),
  data BLOB NOT NULL CHECK(length(data) BETWEEN 1 AND 64000),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(upload_id, seq)
);

CREATE INDEX idx_gc_upload_parts_uploader ON gc_upload_parts(uploader_id, upload_id);
