// Check whether the steps that produced an "attempt" row also have a message row.
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(process.argv[2] ?? 'E:/dsh/token-usage/usage.db', { readOnly: true })
const sessionId = process.argv[3] ?? 'session-d0f24c27-e2e7-4fb8-83a5-0606311c9e8b'

const attempts = db.prepare(`
  SELECT id, ts, turn, step FROM requests
  WHERE session_id = ? AND source = 'attempt' ORDER BY ts
`).all(sessionId)

console.log('attempt rows:', attempts.length)
for (const attempt of attempts) {
  const siblings = db.prepare(`
    SELECT id, source, provider_id, model_id, usage_known, total_tokens
    FROM requests WHERE session_id = ? AND turn IS ? AND step IS ?
  `).all(sessionId, attempt.turn, attempt.step)
  console.log(JSON.stringify({
    attempt: attempt.id,
    time: new Date(Number(attempt.ts)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    turn: attempt.turn,
    step: attempt.step,
    rowsForThatStep: siblings,
  }, null, 1))
}

// How many message rows exist at all for this session, and the seq range.
const stats = db.prepare(`
  SELECT source, COUNT(*) AS n, MIN(seq) AS min_seq, MAX(seq) AS max_seq
  FROM requests WHERE session_id = ? GROUP BY source
`).all(sessionId)
console.log('by source:', JSON.stringify(stats))
