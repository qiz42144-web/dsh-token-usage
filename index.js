/**
 * dsh-token-usage — Host half.
 *
 * Responsibilities:
 *   1. open the local SQLite history;
 *   2. record one row per model step from the post-commit session feed;
 *   3. serve the aggregate JSON API the plugin page reads.
 *
 * It registers no tool, calls no model, opens no socket of its own and reads no
 * prompt or reply text. `session/event` is a fire-and-forget emit feed, so the
 * recorder cannot delay or veto the request path.
 */

import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { API_PREFIX, createApi } from './lib/api.js'
import { createStatements, defaultDatabasePath, openDatabase, readMeta, readNumberMeta, writeMeta } from './lib/db.js'
import { createRecorder } from './lib/recorder.js'
import { readSettings, writeSettings } from './lib/settings.js'

export const name = 'dsh-token-usage'

/** The page needs the HTTP carrier; without it the plugin stays inactive. */
export const inject = ['webServer']

const VERSION = '1.0.0'

function logError(...args) {
  try { console.error('[dsh-token-usage]', ...args) } catch {}
}

/** Resolve the history path from config, otherwise from the Harness home. */
export function resolveDatabasePath(config = {}) {
  if (typeof config.dbPath === 'string' && config.dbPath.trim() !== '') {
    return resolve(config.dbPath.trim())
  }
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME.trim()
    : join(homedir(), '.dsh')
  return defaultDatabasePath(home)
}

export async function apply(ctx, config = {}) {
  const dbPath = resolveDatabasePath(config)
  const settingsPath = join(dirname(dbPath), 'settings.json')
  const recordAttempts = config.recordAttempts !== false

  let store
  try {
    store = openDatabase(dbPath)
  } catch (error) {
    logError(`cannot open the history database at ${dbPath}:`, error)
    return
  }
  const { db } = store
  ctx.effect(() => () => store.close())

  // Heal the recorded start from the data itself: an earlier generation could
  // write rows of one kind before the marker was set.
  try {
    const earliest = db.prepare('SELECT MIN(ts) AS ts FROM requests').get()?.ts
    if (typeof earliest === 'number' && Number.isFinite(earliest)) {
      if (readNumberMeta(db, 'first_record_at') !== earliest) writeMeta(db, 'first_record_at', earliest)
    }
  } catch (error) {
    logError('cannot reconcile the first record marker:', error)
  }

  const statements = createStatements(db)
  const recorder = createRecorder({
    db,
    statements,
    recordAttempts,
    onError: (error) => logError('failed to record a session event:', error),
  })

  ctx.effect(() => {
    const off = ctx.on('session/event', (session, event) => recorder.handle(session, event))
    return () => { try { off?.() } catch {} }
  })

  // Provider display names are local metadata (`llm.listProviders()` never
  // performs I/O); the optional service degrades to raw provider ids.
  let providerNameCache = { at: 0, value: {} }
  function providerNames() {
    const now = Date.now()
    if (now - providerNameCache.at < 30000) return providerNameCache.value
    const value = {}
    try {
      const llm = ctx.get('llm')
      if (llm && typeof llm.listProviders === 'function') {
        for (const entry of llm.listProviders() ?? []) {
          if (entry && typeof entry.id === 'string') value[entry.id] = String(entry.name || entry.id)
        }
      }
    } catch (error) {
      logError('cannot read provider names:', error)
    }
    providerNameCache = { at: now, value }
    return value
  }

  const diagnostics = () => {
    let rows = 0
    let known = 0
    try {
      rows = Number(db.prepare('SELECT COUNT(*) AS n FROM requests').get()?.n ?? 0)
      known = Number(db.prepare('SELECT COUNT(*) AS n FROM requests WHERE usage_known = 1').get()?.n ?? 0)
    } catch (error) {
      logError('diagnostics query failed:', error)
    }
    return {
      version: VERSION,
      dbPath,
      settingsPath,
      recordAttempts,
      rows,
      knownRows: known,
      unknownRows: rows - known,
      startedAt: readNumberMeta(db, 'started_at'),
      firstRecordAt: readNumberMeta(db, 'first_record_at'),
      schemaVersion: Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0),
      sessionLogSource: 'session/event → assistant/message',
      recorder: recorder.stats(),
    }
  }

  const api = createApi({
    db,
    providerNames,
    readSettings: () => readSettings(settingsPath),
    writeSettings: (patch) => writeSettings(settingsPath, patch),
    diagnostics,
    metaNumber: (key) => readNumberMeta(db, key),
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: (request, response) => api(request, response),
  }))

  // Make the first activation visible in `meta` even before any request exists.
  try {
    if (readMeta(db, 'started_at') === null) {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('started_at', String(Date.now()))
    }
  } catch (error) {
    logError('cannot write start marker:', error)
  }
}
