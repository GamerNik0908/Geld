const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync(process.env.DB_PATH || "data.db");
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    trial_ends_at INTEGER,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    vat_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'Stk.',
    price_cents INTEGER NOT NULL DEFAULT 0,
    tax_rate REAL NOT NULL DEFAULT 19,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Rechnungen und Angebote. Kundendaten werden als Kopie gespeichert, damit
  -- alte Belege unverändert bleiben, wenn sich ein Kunde ändert.
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('invoice', 'quote')),
    number TEXT NOT NULL,
    status TEXT NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_address TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    service_date TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL,
    discount_pct REAL NOT NULL DEFAULT 0,
    intro TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    small_business INTEGER NOT NULL DEFAULT 0,
    net_cents INTEGER NOT NULL,
    tax_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    paid_at TEXT,
    source_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, type, number)
  );

  CREATE INDEX IF NOT EXISTS documents_user ON documents (user_id, type, date);
  CREATE INDEX IF NOT EXISTS customers_user ON customers (user_id);
  CREATE INDEX IF NOT EXISTS products_user ON products (user_id);
`);

function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = db;
module.exports.transaction = transaction;
