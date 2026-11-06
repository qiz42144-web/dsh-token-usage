import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStatements, openDatabase } from '../lib/db.js'
import { createRecorder } from '../lib/recorder.js'

const here = dirname(fileURLToPath(import.meta.url))

export function loadFixture() {
  return JSON.parse(readFileSync(join(here, 'fixtures', 'usage-events.json'), 'utf8'))
}

/** Rebuild a durable session event from the metadata-only fixture row. */
export function toSessionEvent(entry) {
  if (entry.type === 'step/end') {
    return { type: 'step/end', seq: entry.seq, time: entry.time, data: { turn: entry.turn, step: entry.step } }
  }
  const data = {
    turn: entry.turn,
    step: entry.step,
    message: {
      role: 'assistant',
      content: [],
      source: { kind: 'model', provider: entry.provider, model: entry.model },
    },
  }
  if (entry.usage !== null && entry.usage !== undefined) data.usage = entry.usage
  return { type: 'assistant/message', seq: entry.seq, time: entry.time, data }
}

/** Open a throwaway database plus a recorder already wired to it. */
export function createHarness(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-token-usage-test-'))
  const path = join(dir, 'usage.db')
  const store = openDatabase(path)
  const statements = createStatements(store.db)
  const errors = []
  const recorder = createRecorder({
    db: store.db,
    statements,
    recordAttempts: options.recordAttempts !== false,
    onError: (error) => errors.push(error),
  })
  return {
    dir,
    path,
    db: store.db,
    statements,
    recorder,
    errors,
    dispose() {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** Replay every fixture event through the recorder. */
export function replay(harness, fixture) {
  const sessions = new Map()
  for (const entry of fixture.events) {
    if (!sessions.has(entry.sessionId)) sessions.set(entry.sessionId, { id: entry.sessionId })
    harness.recorder.handle(sessions.get(entry.sessionId), toSessionEvent(entry))
  }
}

export function countRows(db, sql = 'SELECT COUNT(*) AS n FROM requests') {
  return Number(db.prepare(sql).get()?.n ?? 0)
}
