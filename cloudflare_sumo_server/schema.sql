-- Запустити командою: npx wrangler d1 execute roboscratch-users --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT,           -- NULL для Google-акаунтів
  google_id TEXT UNIQUE,        -- NULL для email/password
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
