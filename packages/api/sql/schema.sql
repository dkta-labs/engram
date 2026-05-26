CREATE TABLE memories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content       TEXT NOT NULL,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  project       TEXT,
  agent_id      TEXT,
  visibility    TEXT NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('public', 'private')),
  owner_address TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  tsv           TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);
CREATE INDEX memories_tsv_idx        ON memories USING GIN(tsv);
CREATE INDEX memories_visibility_idx ON memories(visibility);
CREATE INDEX memories_owner_idx      ON memories(owner_address);
CREATE INDEX memories_project_idx    ON memories(project);
CREATE INDEX memories_created_idx    ON memories(created_at DESC);
