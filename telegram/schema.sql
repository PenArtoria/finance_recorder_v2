-- Entries waiting for ✅ / ❌, and saved entries that can still be undone.
-- `blob` is encrypted with your sync key, like everything Moneta syncs.
CREATE TABLE IF NOT EXISTS pending (
  id TEXT PRIMARY KEY,
  chat INTEGER NOT NULL,
  blob TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS undo (
  id TEXT PRIMARY KEY,
  chat INTEGER NOT NULL,
  blob TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS undo_chat ON undo (chat, created);
