// Ad-hoc inspection of the live plugin database.
import { DatabaseSync } from 'node:sqlite'

const path = process.argv[2] ?? 'E:/dsh/token-usage/usage.db'
const db = new DatabaseSync(path, { readOnly: true })

const rows = db.prepare(`
  SELECT id, ts, source, session_id, turn, step, provider_id, model_id, usage_known,
         input_tokens, output_tokens, total_tokens, cache_read_tokens
  FROM requests ORDER BY ts, seq
`).all()

console.log('rows:', rows.length)
for (const row of rows) {
  const time = new Date(Number(row.ts)).toISOString()
  console.log(JSON.stringify({
    id: row.id, time, source: row.source, turn: row.turn, step: row.step,
    provider: row.provider_id, model: row.model_id, known: Number(row.usage_known),
    input: row.input_tokens, output: row.output_tokens, total: row.total_tokens, cache: row.cache_read_tokens,
  }))
}

const dupes = db.prepare(`
  SELECT session_id, turn, step, COUNT(*) AS n, GROUP_CONCAT(source) AS sources
  FROM requests WHERE turn IS NOT NULL AND step IS NOT NULL
  GROUP BY session_id, turn, step HAVING n > 1
`).all()
console.log('duplicate (session,turn,step) groups:', dupes.length)
for (const dupe of dupes) console.log(JSON.stringify(dupe))

const meta = db.prepare('SELECT key, value FROM meta').all()
console.log('meta:', JSON.stringify(meta))
