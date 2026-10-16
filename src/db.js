import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
`);

// Append-only list of migrations. Never edit one that has shipped; add a new entry instead.
const migrations = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    email_verified_at INTEGER,
    business_name TEXT NOT NULL,
    reply_to TEXT NOT NULL DEFAULT '',
    signature TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    current_period_end INTEGER,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    stripe_event_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE auth_tokens (
    hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX auth_tokens_user ON auth_tokens(user_id, kind);

  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_token TEXT NOT NULL UNIQUE,
    number TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL,
    issue_date TEXT,
    due_date TEXT NOT NULL,
    payment_url TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    cadence TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'paid')),
    next_step INTEGER NOT NULL DEFAULT 0,
    next_send_at INTEGER,
    send_failures INTEGER NOT NULL DEFAULT 0,
    reminders_sent INTEGER NOT NULL DEFAULT 0,
    last_sent_at INTEGER,
    view_count INTEGER NOT NULL DEFAULT 0,
    first_viewed_at INTEGER,
    last_viewed_at INTEGER,
    client_claimed_at INTEGER,
    paid_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX invoices_user_status ON invoices(user_id, status);
  CREATE INDEX invoices_queue ON invoices(status, next_send_at);

  CREATE TABLE invoice_events (
    id INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX invoice_events_invoice ON invoice_events(invoice_id, created_at);

  CREATE TABLE email_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    dedupe_key TEXT UNIQUE,
    cycle TEXT,
    step INTEGER,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_id TEXT,
    error TEXT,
    body_text TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX email_log_user_time ON email_log(user_id, created_at);
  CREATE INDEX email_log_invoice ON email_log(invoice_id, cycle);

  CREATE TABLE stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  // v2: legal acceptance, weekly digest, abuse handling, per-invoice personal message.
  `
  ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
  ALTER TABLE users ADD COLUMN terms_version TEXT;
  ALTER TABLE users ADD COLUMN weekly_digest INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE users ADD COLUMN last_digest_at INTEGER;
  ALTER TABLE users ADD COLUMN suspended_at INTEGER;
  ALTER TABLE users ADD COLUMN suspended_reason TEXT;
  ALTER TABLE invoices ADD COLUMN message TEXT NOT NULL DEFAULT '';
  ALTER TABLE invoices ADD COLUMN disputed_at INTEGER;

  -- Recipients who asked one sender to stop emailing them. Reminders to them are never sent again.
  CREATE TABLE suppressions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL COLLATE NOCASE,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, email)
  );

  CREATE TABLE abuse_reports (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    recipient TEXT NOT NULL COLLATE NOCASE,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX abuse_reports_user ON abuse_reports(user_id, created_at);
  `,
  // v3: "I've already paid" can't be used to silence reminders forever.
  `
  ALTER TABLE invoices ADD COLUMN claim_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE invoices ADD COLUMN claim_note TEXT NOT NULL DEFAULT '';
  ALTER TABLE invoices ADD COLUMN claim_resume_at INTEGER;
  CREATE INDEX invoices_claim_resume ON invoices(status, claim_resume_at);
  `,
];

const currentVersion = db.prepare('PRAGMA user_version').get().user_version;
for (let version = currentVersion; version < migrations.length; version++) {
  db.exec('BEGIN');
  try {
    db.exec(migrations[version]);
    db.exec(`PRAGMA user_version = ${version + 1}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const statements = new Map();
function stmt(sql) {
  let s = statements.get(sql);
  if (!s) {
    s = db.prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

// All queries go through prepared statements with bound parameters. No string-built SQL.
export const get = (sql, ...params) => stmt(sql).get(...params);
export const all = (sql, ...params) => stmt(sql).all(...params);
export const run = (sql, ...params) => stmt(sql).run(...params);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
