-- Users -----------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  name          text        NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- Boards ----------------------------------------------------------------------
CREATE TABLE boards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       text        NOT NULL DEFAULT 'Untitled board',
  share_token text UNIQUE,
  share_role  text CHECK (share_role IN ('viewer', 'editor')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX boards_owner_idx ON boards (owner_id, updated_at DESC);

-- Membership (people who joined through a share link) -------------------------
CREATE TABLE board_members (
  board_id  uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES users (id)  ON DELETE CASCADE,
  role      text        NOT NULL CHECK (role IN ('viewer', 'editor')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);
CREATE INDEX board_members_user_idx ON board_members (user_id);

-- CRDT persistence ------------------------------------------------------------
-- Append-only log of Yjs updates + a compacted snapshot per board.
-- Loading a board = snapshot + replay of the log. A background compaction step
-- folds the log into the snapshot so that loads stay fast.
CREATE TABLE board_snapshots (
  board_id   uuid PRIMARY KEY REFERENCES boards (id) ON DELETE CASCADE,
  state      bytea       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE board_updates (
  id         bigserial PRIMARY KEY,
  board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  payload    bytea       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX board_updates_board_idx ON board_updates (board_id, id);
