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

-- The reply language each chat picked with /language. No row: follow Telegram's language.
CREATE TABLE IF NOT EXISTS prefs (
  chat INTEGER PRIMARY KEY,
  lang TEXT NOT NULL
);

-- The AI's last question to a chat and the message it answered (10 minutes, encrypted),
-- so the next message can answer it.
CREATE TABLE IF NOT EXISTS recent (
  chat INTEGER PRIMARY KEY,
  blob TEXT NOT NULL,
  expires INTEGER NOT NULL
);
