-- One encrypted document per synced user. `auth` is the SHA-256 of the device's auth token.
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  auth TEXT NOT NULL,
  version INTEGER NOT NULL,
  blob TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Encrypted sync keys waiting for a phone to be linked. Each lives for 10 minutes and is read once.
CREATE TABLE IF NOT EXISTS pairs (
  id TEXT PRIMARY KEY,
  blob TEXT NOT NULL,
  expires INTEGER NOT NULL
);
