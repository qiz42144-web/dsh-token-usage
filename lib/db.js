/**
 * SQLite persistence (`node:sqlite`, the same built-in module DSH's own
 * session-search index uses — no native dependency, no build step).
 *
 * Two stores stay separate on purpose:
 *   - history and its annotations live in the database file;
 *   - user preferences live in `settings.json` beside it.
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { dayKey, weekKey } from './time.js'

/** Current schema revision, tracked in `PRAGMA user_version`. */
export const SCHEMA_VERSION = 1

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS requests (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  seq               INTEGER NOT NULL,
  ts                INTEGER NOT NULL,
  day               TEXT NOT NULL,
  week              TEXT NOT NULL,
  turn              INTEGER,
  step              INTEGER,
  provider_id       TEXT NOT NULL,
  model_id          TEXT NOT NULL,
  account_id        TEXT NOT NULL,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  total_tokens      INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  reasoning_tokens  INTEGER,
  usage_known       INTEGER NOT NULL,
  source            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_ts       ON requests (ts);
CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests (provider_id, ts);
CREATE INDEX IF NOT EXISTS idx_requests_model    ON requests (provider_id, model_id, ts);
CREATE INDEX IF NOT EXISTS idx_requests_account  ON requests (account_id, ts);
CREATE INDEX IF NOT EXISTS idx_requests_step     ON requests (session_id, turn, step);

CREATE TABLE IF NOT EXISTS provider_labels (
  provider_id TEXT PRIMARY KEY,
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_labels (
  account_id  TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_labels (
  provider_id TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  PRIMARY KEY (provider_id, model_id)
);

-- A plan is a user-declared label. DSH publishes no plan metadata for a model
-- request, so this table is the only source of a plan name and it is never
-- guessed from a model id.
CREATE TABLE IF NOT EXISTS plan_assignments (
  provider_id TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  plan        TEXT NOT NULL,
  PRIMARY KEY (provider_id, account_id, model_id)
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/**
 * Open (creating when needed) the history database and migrate it.
 *
 * @param {string} path absolute path of the SQLite file.
 * @returns {{
 *   db: import('node:sqlite').DatabaseSync,
 *   path: string,
 *   close: () => void,
 * }}
 */
export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  try {
    // WAL keeps the per-event write cheap and lets the UI read while a request
    // is being recorded. `synchronous=NORMAL` is the usual trade for WAL.
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec('PRAGMA temp_store = MEMORY')
    migrate(db)
  } catch (error) {
    try { db.close() } catch {}
    throw error
  }
  let closed = false
  return {
    db,
    path,
    close() {
      if (closed) return
      closed = true
      try { db.close() } catch {}
    },
  }
}

function migrate(db) {
  const row = db.prepare('PRAGMA user_version').get()
  const current = Number(row?.user_version ?? 0)
  if (current === SCHEMA_VERSION) return
  if (current > SCHEMA_VERSION) {
    throw new Error(`token-usage database was written by a newer plugin (schema ${current} > ${SCHEMA_VERSION})`)
  }
  db.exec('BEGIN')
  try {
    if (current < 1) db.exec(SCHEMA_V1)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }
}

export function readMeta(db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  return row ? row.value : null
}

export function writeMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value))
}

export function readNumberMeta(db, key) {
  const raw = readMeta(db, key)
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Bucket columns for one instant, computed from the local calendar. */
export function timeColumns(ts) {
  return { day: dayKey(ts), week: weekKey(ts) }
}

const INSERT_REQUEST = `
INSERT INTO requests (
  id, session_id, seq, ts, day, week, turn, step,
  provider_id, model_id, account_id,
  input_tokens, output_tokens, total_tokens,
  cache_read_tokens, cache_write_tokens, reasoning_tokens,
  usage_known, source
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO NOTHING
`

/** Prepared-statement cache bound to one open database. */
export function createStatements(db) {
  const insert = db.prepare(INSERT_REQUEST)
  // Records a model step that produced no assistant message at all. The guard
  // keeps a step that did produce one from being counted twice.
  const insertAttempt = db.prepare(`
    INSERT INTO requests (
      id, session_id, seq, ts, day, week, turn, step,
      provider_id, model_id, account_id,
      input_tokens, output_tokens, total_tokens,
      cache_read_tokens, cache_write_tokens, reasoning_tokens,
      usage_known, source
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 'unknown', 'unknown',
           NULL, NULL, NULL, NULL, NULL, NULL, 0, 'attempt'
    WHERE NOT EXISTS (
      SELECT 1 FROM requests WHERE session_id = ? AND turn IS ? AND step IS ?
    )
    ON CONFLICT(id) DO NOTHING
  `)
  return { insert, insertAttempt }
}

/**
 * One recorder-friendly insert of a fully normalized record.
 * @returns {number} the number of rows written (0 when it was a duplicate).
 */
export function insertRecord(statements, record) {
  const result = statements.insert.run(
    record.id,
    record.sessionId,
    record.seq,
    record.ts,
    record.day,
    record.week,
    record.turn,
    record.step,
    record.providerId,
    record.modelId,
    record.accountId,
    record.input,
    record.output,
    record.total,
    record.cacheRead,
    record.cacheWrite,
    record.reasoning,
    record.known ? 1 : 0,
    record.source,
  )
  return Number(result?.changes ?? 0)
}

export function insertAttempt(statements, record) {
  const result = statements.insertAttempt.run(
    record.id,
    record.sessionId,
    record.seq,
    record.ts,
    record.day,
    record.week,
    record.turn,
    record.step,
    record.sessionId,
    record.turn,
    record.step,
  )
  return Number(result?.changes ?? 0)
}

/** Default history database location under the Harness home. */
export function defaultDatabasePath(dshHome) {
  return join(dshHome, 'token-usage', 'usage.db')
}
