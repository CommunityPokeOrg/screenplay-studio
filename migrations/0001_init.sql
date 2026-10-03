-- Screenplay Studio schema.
-- Sync objects: every entity (project/series/episode/scene/character/beat/idea)
-- is stored as one row. `rev` implements optimistic concurrency for
-- concurrent-edit conflict detection; `deleted` stores tombstones.

CREATE TABLE IF NOT EXISTS objects (
  user_id    TEXT    NOT NULL,
  project_id TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  kind       TEXT    NOT NULL,
  parent_id  TEXT,
  rev        INTEGER NOT NULL,
  data       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_objects_pull
  ON objects (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_objects_project
  ON objects (user_id, project_id, kind);

CREATE TABLE IF NOT EXISTS attachments (
  user_id      TEXT    NOT NULL,
  project_id   TEXT    NOT NULL,
  id           TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  size         INTEGER NOT NULL,
  content_type TEXT    NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_project
  ON attachments (user_id, project_id);
