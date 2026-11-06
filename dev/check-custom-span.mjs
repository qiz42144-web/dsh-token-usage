// Verify the custom-range granularity rules against the live plugin.
const base = process.argv[2] ?? 'http://127.0.0.1:4551/dsh-token-usage/api/v1/rpc'

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

// A bare `to` date covers that whole day, so the span is inclusive of both ends.
const cases = [
  ['1 day', '2026-11-05', '2026-11-05', ['hour', 'day']],
  ['2 days', '2026-11-05', '2026-11-06', ['day']],
  ['3 days', '2026-11-04', '2026-11-06', ['day']],
  ['4 days', '2026-11-04', '2026-11-07', ['day', 'week']],
  ['10 days', '2026-11-01', '2026-11-10', ['day', 'week']],
]

let failures = 0
for (const [label, from, to, expected] of cases) {
  const data = await call('bootstrap', { range: 'custom', from, to })
  const options = data.granularityOptions
  const ok = JSON.stringify(options) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(7)} options=[${options.join(',')}] default=${data.granularity} buckets=${data.trend.length}`,
  )
}
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
