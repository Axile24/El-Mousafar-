import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });

export const dbPath = process.env.SQLITE_PATH || join(dataDir, "mousafar.sqlite");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  verify_expires INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS registered_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_email TEXT NOT NULL COLLATE NOCASE,
  vehicle_code TEXT NOT NULL,
  line TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT 'bus',
  destination_label TEXT,
  departure_local TEXT,
  arrival_local TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_email, vehicle_code)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON registered_vehicles(owner_email);
`);

/** Tables créées sans les colonnes e-mail — migration légère. */
function migrateUsersEmailVerification() {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("email_verified")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0"
    );
    db.exec("UPDATE users SET email_verified = 1");
  }
  if (!names.has("verify_token")) {
    db.exec("ALTER TABLE users ADD COLUMN verify_token TEXT");
  }
  if (!names.has("verify_expires")) {
    db.exec("ALTER TABLE users ADD COLUMN verify_expires INTEGER");
  }
}

migrateUsersEmailVerification();
