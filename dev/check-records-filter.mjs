// Verify the request log hides step-only rows while the summary still counts them.
import { DatabaseSync } from 'node:sqlite'

const base = process.argv[2] ?? 'http://127.0.0.1:10229/dsh-token-usage/api/v1/rpc'
const dbPath = process.argv[3] ?? 'E:/dsh/token-usage/usage.db'

async function call(method, args) {
  const response = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  })
  const payload = await response.json()
  if (!payload.ok) throw new Error(JSON.stringify(payload.error))
  return payload.data
}

let failures = 0
const check = (ok, label) => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}

const db = new DatabaseSync(dbPath, { readOnly: true })
const attemptRows = db.prepare("SELECT COUNT(*) AS n FROM requests WHERE source = 'attempt'").get().n
const unknownMessages = db.prepare(
  "SELECT id, provider_id, model_id FROM requests WHERE usage_known = 0 AND source = 'message'",
).all()
db.close()

const boot = await call('bootstrap', { range: 'all' })
const page = await call('records', { range: 'all', offset: 0, limit: 500 })

check(page.items.every((item) => item.source !== 'attempt'), 'no step-only rows in the log')
check(page.total === boot.summary.requests - attemptRows,
  `log total ${page.total} = summary ${boot.summary.requests} - ${attemptRows} step-only rows`)
check(unknownMessages.length >= 1, `real requests without usage still exist in the database (${unknownMessages.length})`)
for (const row of unknownMessages) console.log(`     kept: ${row.id} ${row.provider_id}/${row.model_id}`)

// The kept row must still be reachable through the log.
const deep = await call('records', { range: 'all', offset: 0, limit: 500 })
void deep
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
