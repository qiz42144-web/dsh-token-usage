// Verify the range -> granularity contract against the live plugin, and that
// every offered granularity reproduces the summary total.
const base = process.argv[2] ?? 'http://127.0.0.1:13415/dsh-token-usage/api/v1/rpc'

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

const ranges = ['today', 'week', 'month', 'year', 'all']
let failures = 0

for (const range of ranges) {
  const boot = await call('bootstrap', { range })
  const options = boot.granularityOptions
  const parts = []
  for (const granularity of options) {
    const data = await call('bootstrap', { range, granularity })
    const sum = data.trend.reduce((n, point) => n + point.total, 0)
    const nonZero = data.trend.filter((point) => point.total > 0).length
    const ok = sum === data.summary.total
    if (!ok) failures++
    parts.push(`${granularity}:${data.trend.length}b/${nonZero}nz${ok ? '' : ' MISMATCH'}`)
  }
  console.log(
    range.padEnd(6),
    'options=[' + options.join(',') + ']',
    'default=' + boot.granularity,
    '|', parts.join('  '),
    '| total=' + boot.summary.total,
  )
}

// Rejected granularities must fall back, never apply.
const fallbacks = [
  ['year', 'day', 'week'],
  ['year', 'year', 'week'],
  ['today', 'month', 'hour'],
  ['week', 'hour', 'day'],
  ['month', 'year', 'day'],
]
for (const [range, requested, expected] of fallbacks) {
  const data = await call('bootstrap', { range, granularity: requested })
  const ok = data.granularity === expected
  if (!ok) failures++
  console.log(`fallback ${range}/${requested} -> ${data.granularity} (expected ${expected}) ${ok ? 'ok' : 'FAIL'}`)
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
