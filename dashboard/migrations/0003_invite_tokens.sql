-- Invites keep their raw token (admins can copy the link again), so the hash and the stored URL were redundant.
-- SQLite can't drop a UNIQUE column, so the table is rebuilt.
CREATE TABLE user_invites_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL,
  updated_at TEXT
);
INSERT INTO user_invites_new (id, email, token, expires_at, consumed_at, role, created_at, updated_at)
SELECT id, email, substr(invite_url, instr(invite_url, 'token=') + 6), expires_at, consumed_at, role, created_at, updated_at FROM user_invites;
DROP TABLE user_invites;
ALTER TABLE user_invites_new RENAME TO user_invites;
CREATE INDEX ix_user_invites_email ON user_invites (email);
