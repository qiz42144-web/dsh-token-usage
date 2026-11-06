/**
 * Resource benchmark for the recorder and the aggregation queries.
 *
 * Run: node dev/bench.mjs [rows]
 *
 * It drives the shipping code paths (recorder → SQLite → query layer) with
 * synthetic events, so the numbers describe the plugin rather than a mock.
 */
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createStatements, openDatabase } from '../lib/db.js'
import { createRecorder } from '../lib/recorder.js'
import { getCatalog, getRankings, getRecords, getSummary, getTrend, parseFilters } from '../lib/query.js'
import { resolveRange } from '../lib/time.js'

const ROWS = Number(process.argv[2] ?? 100_000)
const PROVIDERS = ['provider-e', 'provider-a', 'provider-c', 'provider-d', 'provider-g']
const MODELS = ['model-epsilon', 'model-beta', 'model-alpha', 'model-gamma', 'model-delta']
const DAY = 86_400_000

const dir = mkdtempSync(join(tmpdir(), 'dsh-token-usage-bench-'))
const path = join(dir, 'usage.db')
const store = openDatabase(path)
const statements = createStatements(store.db)
const recorder = createRecorder({ db: store.db, statements, recordAttempts: true })

const start = Date.now() - ROWS * 60_000
const sessions = Array.from({ length: 200 }, (_, index) => ({ id: `bench-session-${index}` }))

function eventFor(index) {
  const session = sessions[index % sessions.length]
  const provider = PROVIDERS[index % PROVIDERS.length]
  const model = MODELS[index % MODELS.length]
  const time = start + index * 60_000
  const input = 200 + (index % 900)
  const output = 40 + (index % 300)
  const cacheRead = index % 3 === 0 ? 1000 + (index % 5000) : 0
  return {
    session,
    event: {
      type: 'assistant/message',
      seq: index + 1,
      time,
      data: {
        turn: Math.floor(index / 10) + 1,
        step: (index % 10) + 1,
        message: { role: 'assistant', content: [], source: { kind: 'model', provider, model } },
        usage: {
          inputTokens: input,
          outputTokens: output,
          totalTokens: input + output + cacheRead,
          cacheReadTokens: cacheRead,
          reasoningTokens: index % 7 === 0 ? Math.floor(output / 2) : undefined,
        },
      },
    },
  }
}

// ---------------------------------------------------------------- write path
const cpuBefore = process.cpuUsage()
const wallBefore = process.hrtime.bigint()
for (let index = 0; index < ROWS; index++) {
  const { session, event } = eventFor(index)
  recorder.handle(session, event)
}
const wallAfter = process.hrtime.bigint()
const cpuAfter = process.cpuUsage(cpuBefore)
const writeMs = Number(wallAfter - wallBefore) / 1e6
const cpuMs = (cpuAfter.user + cpuAfter.system) / 1000

// A duplicate delivery must cost one indexed lookup and no write.
const duplicateStart = process.hrtime.bigint()
for (let index = 0; index < 1000; index++) {
  const { session, event } = eventFor(index)
  recorder.handle(session, event)
}
const duplicateMs = Number(process.hrtime.bigint() - duplicateStart) / 1e6

store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
const dbBytes = statSync(path).size
const walBytes = (() => { try { return statSync(path + '-wal').size } catch { return 0 } })()

// --------------------------------------------------------------- read paths
const now = Date.now()
const ranges = {
  today: resolveRange('today', { now }),
  month: resolveRange('month', { now }),
  year: resolveRange('year', { now }),
  all: resolveRange('all', { now, firstRecordAt: start }),
}

function timeIt(label, fn, iterations = 20) {
  fn() // warm up
  const begin = process.hrtime.bigint()
  let result
  for (let index = 0; index < iterations; index++) result = fn()
  const total = Number(process.hrtime.bigint() - begin) / 1e6
  return { label, ms: total / iterations, result }
}

const filter = parseFilters({})
const queries = [
  timeIt('summary · all time', () => getSummary(store.db, ranges.all, filter)),
  timeIt('summary · this month', () => getSummary(store.db, ranges.month, filter)),
  timeIt('summary · today', () => getSummary(store.db, ranges.today, filter)),
  timeIt('trend · day · all time', () => getTrend(store.db, ranges.all, filter, 'day')),
  timeIt('trend · month · all time', () => getTrend(store.db, ranges.all, filter, 'month')),
  timeIt('ranking · model · all time', () => getRankings(store.db, ranges.all, filter, 'model', 10)),
  timeIt('ranking · plan · all time', () => getRankings(store.db, ranges.all, filter, 'plan', 10)),
  timeIt('records · page 50 · all time', () => getRecords(store.db, ranges.all, filter, 0, 50)),
  timeIt('records · page 50 · deep page', () => getRecords(store.db, ranges.all, filter, 5000, 50)),
  timeIt('catalog · all time', () => getCatalog(store.db, {})),
  timeIt('summary · provider filter', () => getSummary(store.db, ranges.all, parseFilters({ provider: 'provider-a' }))),
  timeIt('summary · search', () => getSummary(store.db, ranges.all, parseFilters({ q: 'glm' }))),
]

const summary = getSummary(store.db, ranges.all, filter)
const totalRows = Number(store.db.prepare('SELECT COUNT(*) AS n FROM requests').get().n)

const report = {
  rows: totalRows,
  write: {
    totalMs: Number(writeMs.toFixed(1)),
    perEventMs: Number((writeMs / ROWS).toFixed(4)),
    perEventMicroseconds: Number(((writeMs / ROWS) * 1000).toFixed(1)),
    cpuMs: Number(cpuMs.toFixed(1)),
    cpuPerEventMicroseconds: Number(((cpuMs / ROWS) * 1000).toFixed(1)),
    eventsPerSecond: Math.round(ROWS / (writeMs / 1000)),
  },
  duplicateDelivery: {
    perEventMicroseconds: Number(((duplicateMs / 1000) * 1000).toFixed(1)),
    rowsUnchanged: Number(store.db.prepare('SELECT COUNT(*) AS n FROM requests').get().n) === totalRows,
  },
  disk: {
    dbBytes,
    walBytes,
    bytesPerRow: Number((dbBytes / totalRows).toFixed(1)),
  },
  queries: queries.map((entry) => ({ label: entry.label, ms: Number(entry.ms.toFixed(2)) })),
  sanity: {
    totalTokens: summary.total,
    requests: summary.requests,
    unknown: summary.unknownCount,
  },
}

console.log(JSON.stringify(report, null, 2))

store.close()
rmSync(dir, { recursive: true, force: true })
