/**
 * Build a synthetic history database for documentation screenshots.
 *
 * Every value is generated here: fictional providers and models, invented
 * timestamps and invented token counts. Nothing is read from a real session log
 * and nothing from the user's own database is copied.
 *
 * Usage: node dev/make-demo-db.mjs [outputPath]
 */
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStatements, openDatabase } from '../lib/db.js'
import { createRecorder } from '../lib/recorder.js'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = process.argv[2] ?? join(here, 'synthetic', 'usage.db')

let seed = 987654321
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const between = (low, high) => low + Math.floor(random() * (high - low + 1))
const pick = (items) => items[Math.floor(random() * items.length)]

const PROVIDERS = [
  { id: 'provider-a', models: ['model-alpha', 'model-beta'] },
  { id: 'provider-b', models: ['model-gamma'] },
  { id: 'provider-c', models: ['model-alpha', 'model-delta'] },
  { id: 'provider-d', models: ['model-epsilon'] },
]

// Sixty days ending yesterday, so nothing recorded live can appear in a
// screenshot taken with a range that stops at yesterday.
const DAYS = 60
const endOfYesterday = new Date()
endOfYesterday.setHours(0, 0, 0, 0)
const END = endOfYesterday.getTime() - 1
const START = END - DAYS * 24 * 60 * 60 * 1000

rmSync(outFile, { force: true })
mkdirSync(dirname(outFile), { recursive: true })
const store = openDatabase(outFile)
const statements = createStatements(store.db)
const recorder = createRecorder({ db: store.db, statements, recordAttempts: true })

let seq = 0
let written = 0
for (let day = 0; day < DAYS; day++) {
  const dayStart = START + day * 24 * 60 * 60 * 1000
  const weekday = new Date(dayStart).getDay()
  // Quiet weekends, busy weekdays, with a little noise.
  const base = weekday === 0 || weekday === 6 ? between(2, 8) : between(12, 34)
  const count = Math.max(1, base + between(-3, 3))
  for (let index = 0; index < count; index++) {
    const provider = pick(PROVIDERS)
    const model = pick(provider.models)
    const time = dayStart + between(8 * 3600, 23 * 3600) * 1000
    seq += 1
    const input = between(400, 9000)
    const output = between(120, 2600)
    const cacheRead = random() < 0.85 ? between(20000, 900000) : 0
    const cacheWrite = random() < 0.2 ? between(1000, 12000) : 0
    const reasoning = random() < 0.35 ? Math.floor(output * 0.45) : null
    const usage = random() < 0.02
      ? null
      : {
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output + cacheRead + cacheWrite,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        ...(reasoning === null ? null : { reasoningTokens: reasoning }),
      }
    recorder.handle({ id: `demo-${(day % 9) + 1}` }, {
      type: 'assistant/message',
      seq,
      time,
      data: {
        turn: Math.floor(index / 6) + 1,
        step: (index % 6) + 1,
        message: { role: 'assistant', content: [], source: { kind: 'model', provider: provider.id, model } },
        ...(usage === null ? null : { usage }),
      },
    })
    written++
  }
}

// Friendly display names, so the screenshots read like a product rather than a
// fixture dump. These are labels only; the ids stay synthetic.
const label = store.db.prepare('INSERT OR REPLACE INTO provider_labels (provider_id, name) VALUES (?, ?)')
label.run('provider-a', 'Provider A')
label.run('provider-b', 'Provider B')
label.run('provider-c', 'Provider C')
label.run('provider-d', 'Provider D')

const modelLabel = store.db.prepare('INSERT OR REPLACE INTO model_labels (provider_id, model_id, name) VALUES (?, ?, ?)')
modelLabel.run('provider-a', 'model-alpha', 'Alpha 1.0')
modelLabel.run('provider-a', 'model-beta', 'Alpha 1.0 Mini')
modelLabel.run('provider-b', 'model-gamma', 'Gamma Pro')
modelLabel.run('provider-c', 'model-alpha', 'Alpha 1.0')
modelLabel.run('provider-c', 'model-delta', 'Delta Turbo')
modelLabel.run('provider-d', 'model-epsilon', 'Epsilon Lite')

store.close()
console.log(JSON.stringify({
  file: outFile,
  events: written,
  days: DAYS,
  from: new Date(START).toISOString(),
  to: new Date(END).toISOString(),
}, null, 2))
