// Verify the "all" range offers exactly week/month/year and that each of them
// aggregates the whole history.
const base = process.argv[2] ?? 'http://127.0.0.1:10229/dsh-token-usage/api/v1/rpc'

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

const all = await call('bootstrap', { range: 'all' })
check(JSON.stringify(all.granularityOptions) === JSON.stringify(['week', 'month', 'year']),
  `all offers week/month/year: ${JSON.stringify(all.granularityOptions)}`)
check(all.granularity === 'week', `all opens on weeks (got ${all.granularity})`)
check(all.range.kind === 'all', 'the range itself is unchanged')

for (const granularity of ['week', 'month', 'year']) {
  const data = await call('bootstrap', { range: 'all', granularity })
  const sum = data.trend.reduce((n, point) => n + point.total, 0)
  const nonZero = data.trend.filter((point) => point.total > 0).length
  check(data.granularity === granularity, `all/${granularity} is honoured`)
  check(sum === data.summary.total, `all/${granularity} trend sums to the summary (${sum} vs ${data.summary.total})`)
  check(data.trend.length >= 1 && nonZero >= 1, `all/${granularity} has data (${data.trend.length} buckets, ${nonZero} non-zero)`)
  const first = data.trend[0]
  const last = data.trend[data.trend.length - 1]
  console.log(`     ${granularity}: ${first.bucket} … ${last.bucket}`)
}

for (const rejected of ['hour', 'day']) {
  const data = await call('bootstrap', { range: 'all', granularity: rejected })
  check(data.granularity === 'week', `all/${rejected} falls back to week (got ${data.granularity})`)
}

// The other ranges must not have changed.
const expected = {
  today: ['hour'],
  week: ['day'],
  month: ['day', 'week'],
  year: ['week', 'month'],
}
for (const [range, options] of Object.entries(expected)) {
  const data = await call('bootstrap', { range })
  check(JSON.stringify(data.granularityOptions) === JSON.stringify(options),
    `${range} still offers ${JSON.stringify(options)}`)
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
