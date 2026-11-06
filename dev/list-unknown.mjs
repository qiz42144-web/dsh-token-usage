// List the rows whose provider/model identity is unknown, with their origin.
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(process.argv[2] ?? 'E:/dsh/token-usage/usage.db', { readOnly: true })

const rows = db.prepare(`
  SELECT id, ts, turn, step, source, usage_known, total_tokens, session_id
  FROM requests WHERE provider_id = 'unknown' ORDER BY ts
`).all()

console.log('unknown-identity rows:', rows.length)
for (const row of rows) {
  console.log(JSON.stringify({
    id: row.id,
    time: new Date(Number(row.ts)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    turn: row.turn,
    step: row.step,
    source: row.source,
    usageKnown: Number(row.usage_known),
    totalTokens: row.total_tokens,
  }))
}

const totals = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM requests) AS all_rows,
    (SELECT COUNT(*) FROM requests WHERE usage_known = 0) AS unknown_rows,
    (SELECT COUNT(*) FROM requests WHERE source = 'attempt') AS attempt_rows,
    (SELECT COUNT(*) FROM requests WHERE source = 'message' AND usage_known = 0) AS message_without_usage
`).get()
console.log('counts:', JSON.stringify(totals))
