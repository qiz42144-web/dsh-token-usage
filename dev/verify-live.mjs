/**
 * Live acceptance run against the installed plugin.
 *
 * Usage: node dev/verify-live.mjs [baseUrl]
 *
 * Exercises every API method on the running Host, checks the numbers against
 * an independent SQLite read of the same database, and restores anything it
 * changed.
 */
import { DatabaseSync } from 'node:sqlite'

const BASE = process.argv[2] ?? 'http://127.0.0.1:6687'
const RPC = `${BASE}/dsh-token-usage/api/v1/rpc`
const DB_PATH = 'E:/dsh/token-usage/usage.db'

const results = []
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail })
  if (!condition) console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`)
}

async function call(method, args) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args: args ?? {} }),
  })
  const payload = await response.json()
  if (!response.ok || payload.ok !== true) throw new Error(`${method}: ${JSON.stringify(payload)}`)
  return payload.data
}

const db = new DatabaseSync(DB_PATH, { readOnly: true })
const sql = {
  rows: () => Number(db.prepare('SELECT COUNT(*) AS n FROM requests').get().n),
  // The request log lists real model requests only; step-only rows are hidden.
  listed: () => Number(db.prepare("SELECT COUNT(*) AS n FROM requests WHERE source <> 'attempt'").get().n),
  known: () => Number(db.prepare('SELECT COUNT(*) AS n FROM requests WHERE usage_known = 1').get().n),
  total: () => Number(db.prepare('SELECT COALESCE(SUM(total_tokens),0) AS n FROM requests').get().n),
  input: () => Number(db.prepare('SELECT COALESCE(SUM(input_tokens),0) AS n FROM requests').get().n),
  output: () => Number(db.prepare('SELECT COALESCE(SUM(output_tokens),0) AS n FROM requests').get().n),
  cache: () => Number(db.prepare('SELECT COALESCE(SUM(cache_read_tokens),0)+COALESCE(SUM(cache_write_tokens),0) AS n FROM requests').get().n),
  reasoning: () => Number(db.prepare('SELECT COALESCE(SUM(reasoning_tokens),0) AS n FROM requests').get().n),
  duplicates: () => Number(db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT session_id, turn, step FROM requests
      WHERE turn IS NOT NULL AND step IS NOT NULL
      GROUP BY session_id, turn, step HAVING COUNT(*) > 1
    )`).get().n),
  nullAsZero: () => Number(db.prepare('SELECT COUNT(*) AS n FROM requests WHERE usage_known = 0 AND total_tokens IS NOT NULL').get().n),
}

// ---------------------------------------------------------------- diagnostics
const diagnostics = await call('diagnostics')
check('diagnostics reports the database path', diagnostics.dbPath.endsWith('usage.db'), diagnostics.dbPath)
check('diagnostics reports schema version 1', diagnostics.schemaVersion === 1)
check('diagnostics counts match the database', diagnostics.rows === sql.rows(), `${diagnostics.rows} vs ${sql.rows()}`)
check('no duplicate (session, turn, step) rows', sql.duplicates() === 0)
check('unknown rows never store a zero total', sql.nullAsZero() === 0)

// ------------------------------------------------------------------- bootstrap
const all = await call('bootstrap', { range: 'all' })
check('all-time total equals the database sum', all.summary.total === sql.total(), `${all.summary.total} vs ${sql.total()}`)
check('all-time input equals the database sum', all.summary.input === sql.input())
check('all-time output equals the database sum', all.summary.output === sql.output())
check('all-time cache equals the database sum', all.summary.cacheRead + all.summary.cacheWrite === sql.cache())
check('all-time reasoning equals the database sum', all.summary.reasoning === sql.reasoning())
check('known + unknown equals the row count', all.summary.knownCount + all.summary.unknownCount === sql.rows())
check('the trend partitions the total', all.trend.reduce((n, p) => n + p.total, 0) === all.summary.total)
check('the model ranking partitions the total', all.rankings.model.reduce((n, r) => n + r.total, 0) === all.summary.total)
check('the provider ranking partitions the total', all.rankings.provider.reduce((n, r) => n + r.total, 0) === all.summary.total)
check('the plan ranking partitions the total', all.rankings.plan.reduce((n, r) => n + r.total, 0) === all.summary.total)
check('the catalog partitions the total', all.catalog.providers.reduce((n, p) => n + p.total, 0) === all.summary.total)
check('the recording start is the earliest row', all.firstRecordAt === Number(db.prepare('SELECT MIN(ts) AS n FROM requests').get().n))

// ---------------------------------------------------------------- time ranges
for (const kind of ['today', 'week', 'month', 'year']) {
  const data = await call('bootstrap', { range: kind })
  const from = data.range.from
  const to = data.range.to
  const expected = Number(db.prepare('SELECT COALESCE(SUM(total_tokens),0) AS n FROM requests WHERE ts >= ? AND ts < ?').get(from, to).n)
  check(`${kind} total matches a direct range query`, data.summary.total === expected, `${data.summary.total} vs ${expected}`)
  check(`${kind} range is half-open and ordered`, from < to)
}

const custom = await call('bootstrap', { range: 'custom', from: '2026-11-01', to: '2026-11-04' })
const customFrom = new Date(2026, 10, 1).getTime()
const customTo = new Date(2026, 10, 5).getTime()
const customExpected = Number(db.prepare('SELECT COALESCE(SUM(total_tokens),0) AS n FROM requests WHERE ts >= ? AND ts < ?').get(customFrom, customTo).n)
check('custom range covers whole local days', custom.range.from === customFrom && custom.range.to === customTo)
check('custom range total matches', custom.summary.total === customExpected, `${custom.summary.total} vs ${customExpected}`)

// -------------------------------------------------------------------- filters
const providerId = all.catalog.providers[0]?.providerId
if (providerId) {
  const filtered = await call('bootstrap', { range: 'all', provider: providerId })
  const expected = Number(db.prepare('SELECT COALESCE(SUM(total_tokens),0) AS n FROM requests WHERE provider_id = ?').get(providerId).n)
  check('provider filter matches a direct query', filtered.summary.total === expected, `${filtered.summary.total} vs ${expected}`)
  // The catalog is the filter tree itself: it must keep every provider so the
  // user can switch, even while the numbers are filtered.
  check('the filter tree stays complete under a filter', filtered.catalog.providers.length === all.catalog.providers.length)
  check('the filtered ranking only lists the chosen provider', filtered.rankings.provider.every((row) => row.key === providerId))
}

const modelId = all.rankings.model[0]?.key
if (modelId) {
  const searched = await call('bootstrap', { range: 'all', q: modelId.slice(0, 6) })
  check('search finds the model', searched.summary.total > 0)
  const missing = await call('bootstrap', { range: 'all', q: 'zzz-no-such-model' })
  check('search for a missing model returns zero', missing.summary.total === 0)
}

// -------------------------------------------------------------------- records
const page = await call('records', { range: 'all', offset: 0, limit: 5 })
check('records page size is honoured', page.items.length === Math.min(5, sql.listed()))
check('records report the full total', page.total === sql.listed(), `${page.total} vs ${sql.listed()}`)
check('records never list a step-only row', page.items.every((item) => item.source !== 'attempt'))
check('records are newest first', page.items.every((item, index) => index === 0 || page.items[index - 1].ts >= item.ts))
check('records carry resolved provider names', page.items.every((item) => typeof item.providerName === 'string' && item.providerName.length > 0))
check('records expose the raw model id', page.items.every((item) => typeof item.modelId === 'string'))

// ------------------------------------------------------- labels and plans
const target = all.catalog.providers[0]?.accounts[0]?.models[0]
if (target && providerId) {
  const accountId = all.catalog.providers[0].accounts[0].accountId
  const before = await call('bootstrap', { range: 'all' })
  const beforeTotal = before.summary.total

  await call('label', { kind: 'provider', providerId, name: '验收测试 Provider' })
  await call('label', { kind: 'model', providerId, modelId: target.modelId, name: '验收测试模型' })
  await call('plan', { providerId, accountId, modelId: target.modelId, plan: '验收测试套餐' })

  const after = await call('bootstrap', { range: 'all' })
  check('renaming does not change any total', after.summary.total === beforeTotal)
  const renamed = after.catalog.providers.find((entry) => entry.providerId === providerId)
  check('provider rename is visible', renamed?.name === '验收测试 Provider', renamed?.name)
  const renamedModel = renamed?.accounts[0]?.models.find((entry) => entry.modelId === target.modelId)
  check('model rename is visible', renamedModel?.name === '验收测试模型', renamedModel?.name)
  check('plan label is visible', renamedModel?.plan === '验收测试套餐', renamedModel?.plan)

  const byPlan = await call('bootstrap', { range: 'all', plan: '验收测试套餐' })
  const planExpected = Number(db.prepare('SELECT COALESCE(SUM(total_tokens),0) AS n FROM requests WHERE provider_id = ? AND model_id = ?').get(providerId, target.modelId).n)
  check('plan filter selects exactly the assigned model', byPlan.summary.total === planExpected, `${byPlan.summary.total} vs ${planExpected}`)

  // Restore.
  await call('label', { kind: 'provider', providerId, name: '' })
  await call('label', { kind: 'model', providerId, modelId: target.modelId, name: '' })
  await call('plan', { providerId, accountId, modelId: target.modelId, plan: '' })
  const restored = await call('bootstrap', { range: 'all' })
  const restoredModel = restored.catalog.providers.find((entry) => entry.providerId === providerId)?.accounts[0]?.models.find((entry) => entry.modelId === target.modelId)
  check('clearing a rename restores the raw id', restoredModel?.name === target.modelId, restoredModel?.name)
  check('clearing a plan restores the unassigned bucket', restoredModel?.plan === null)
  check('restoring does not change any total', restored.summary.total === beforeTotal)
}

// ------------------------------------------------------------------- settings
const settingsBefore = await call('settings', {})
await call('settings', { numberFormat: 'full', lastRange: 'month' })
const settingsAfter = await call('settings', {})
check('number format persists', settingsAfter.numberFormat === 'full')
check('last range persists', settingsAfter.lastRange === 'month')
const implicit = await call('bootstrap', {})
check('an absent range uses the persisted range', implicit.range.kind === 'month', implicit.range.kind)
await call('settings', { numberFormat: settingsBefore.numberFormat, lastRange: settingsBefore.lastRange })
const settingsRestored = await call('settings', {})
check('settings restored', settingsRestored.numberFormat === settingsBefore.numberFormat && settingsRestored.lastRange === settingsBefore.lastRange)

// -------------------------------------------------------------- error paths
const badMethod = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'nope' }) })
check('unknown method is rejected', badMethod.status === 404)
const getMethod = await fetch(RPC, { method: 'GET' })
check('GET is rejected', getMethod.status === 405)
const badJson = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' })
check('invalid JSON is rejected', badJson.status === 400)

// ------------------------------------------------------------------- summary
const failed = results.filter((entry) => !entry.ok)
console.log(JSON.stringify({
  base: BASE,
  checks: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed,
}, null, 2))
process.exitCode = failed.length === 0 ? 0 : 1
