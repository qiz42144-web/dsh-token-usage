import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { API_PREFIX, createApi } from '../lib/api.js'
import { readNumberMeta, writeMeta } from '../lib/db.js'
import { DEFAULT_SETTINGS } from '../lib/settings.js'
import { countRows, createHarness, loadFixture, replay } from './helpers.mjs'

const fixture = loadFixture()
/** Steps that produced a message; the request log lists these and only these. */
const messageEventCount = fixture.events.filter((event) => event.type === 'assistant/message').length

/** Serve the real handler over a real socket so the test exercises HTTP too. */
async function startServer(harness, overrides = {}) {
  let settings = { ...DEFAULT_SETTINGS }
  const diagnosticsCalls = []
  const api = createApi({
    db: harness.db,
    providerNames: () => ({ 'provider-a': 'Provider A' }),
    readSettings: () => ({ ...settings }),
    writeSettings: (patch) => { settings = patch; return settings },
    diagnostics: () => {
      diagnosticsCalls.push(1)
      return { rows: countRows(harness.db) }
    },
    metaNumber: (key) => readNumberMeta(harness.db, key),
    ...overrides,
  })
  const server = createServer((request, response) => {
    if (!request.url || !request.url.startsWith(API_PREFIX)) {
      response.writeHead(404)
      response.end()
      return
    }
    api(request, response)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}${API_PREFIX}/rpc`
  return {
    base,
    settings: () => settings,
    diagnosticsCalls: () => diagnosticsCalls.length,
    async call(method, args) {
      const response = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, args }),
      })
      const payload = await response.json()
      return { status: response.status, payload }
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function seededHarness() {
  const harness = createHarness()
  replay(harness, fixture)
  writeMeta(harness.db, 'started_at', String(fixture.events[0].time))
  writeMeta(harness.db, 'first_record_at', String(fixture.events[0].time))
  return harness
}

test('bootstrap returns the dashboard payload in one round trip', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const { status, payload } = await server.call('bootstrap', { range: 'all' })
    assert.equal(status, 200)
    assert.equal(payload.ok, true)
    const data = payload.data
    assert.equal(data.range.kind, 'all')
    assert.equal(data.summary.total, fixture.expected.total)
    assert.equal(data.summary.requests, fixture.expected.events)
    assert.equal(data.summary.unknownCount, fixture.expected.unknown)
    assert.ok(data.trend.length > 0)
    assert.ok(data.rankings.model.length > 0)
    assert.ok(data.catalog.providers.length > 0)
    assert.equal(data.startedAt, fixture.events[0].time)
    assert.ok(Array.isArray(data.catalog.plans))
    assert.equal(data.noPlanKey, '__none__')
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('an absent range falls back to the persisted preference', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const first = await server.call('bootstrap', {})
    assert.equal(first.payload.data.range.kind, 'today', 'the default preference is today')
    await server.call('settings', { numberFormat: 'full', lastRange: 'month' })
    assert.equal(server.settings().numberFormat, 'full')
    const second = await server.call('bootstrap', {})
    assert.equal(second.payload.data.range.kind, 'month')
    assert.equal(second.payload.data.settings.numberFormat, 'full')
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('a custom range is honoured end to end', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const { payload } = await server.call('bootstrap', { range: 'custom', from: '2026-10-01', to: '2026-10-31' })
    assert.equal(payload.data.range.kind, 'custom')
    let expected = 0
    for (const entry of fixture.events) {
      if (entry.time >= new Date(2026, 9, 1).getTime() && entry.time < new Date(2026, 10, 1).getTime()) {
        if (entry.type !== 'assistant/message' || !entry.usage) continue
        const u = entry.usage
        expected += typeof u.totalTokens === 'number'
          ? u.totalTokens
          : u.inputTokens + u.outputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
      }
    }
    assert.equal(payload.data.summary.total, expected)
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('filters, search and granularity travel through the API', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const all = await server.call('bootstrap', { range: 'all' })
    const filtered = await server.call('bootstrap', { range: 'all', provider: 'provider-a' })
    assert.ok(filtered.payload.data.summary.total > 0)
    assert.ok(filtered.payload.data.summary.total < all.payload.data.summary.total)
    // Search for a model the fixture actually contains, so the test does not
    // depend on which sessions happened to be sampled when it was generated.
    const sampleModel = fixture.expected.byProviderModel[0].model
    const searched = await server.call('bootstrap', { range: 'all', q: sampleModel.slice(0, 6) })
    assert.ok(searched.payload.data.summary.total > 0)
    // `all` offers whatever its real span supports, so pick the coarsest option
    // it advertises rather than assuming one.
    const allRange = await server.call('bootstrap', { range: 'all' })
    const options = allRange.payload.data.granularityOptions
    assert.ok(options.includes(allRange.payload.data.granularity), 'the default is one of the offered options')
    const chosen = options[options.length - 1]
    const coarse = await server.call('bootstrap', { range: 'all', granularity: chosen })
    assert.equal(coarse.payload.data.granularity, chosen)
    const sum = coarse.payload.data.trend.reduce((n, p) => n + p.total, 0)
    assert.equal(sum, fixture.expected.total)
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('records page and stay newest first', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const page = await server.call('records', { range: 'all', offset: 0, limit: 10 })
    assert.equal(page.payload.data.items.length, 10)
    // Steps that ended without a message are not listed: they have no identity
    // and no tokens, so they would only be noise in the request log.
    assert.equal(page.payload.data.total, messageEventCount)
    for (const item of page.payload.data.items) assert.notEqual(item.source, 'attempt')
    for (let i = 1; i < page.payload.data.items.length; i++) {
      assert.ok(page.payload.data.items[i - 1].ts >= page.payload.data.items[i].ts)
    }
    const next = await server.call('records', { range: 'all', offset: 10, limit: 10 })
    assert.notEqual(page.payload.data.items[0].id, next.payload.data.items[0].id)
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('labels and plans are written and immediately readable', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const label = await server.call('label', {
      kind: 'model', providerId: 'provider-a', modelId: 'model-beta', name: 'V4.1 Flash',
    })
    assert.equal(label.payload.ok, true)
    const plan = await server.call('plan', {
      providerId: 'provider-a', accountId: 'provider-a', modelId: 'model-beta', plan: 'plan-x',
    })
    assert.equal(plan.payload.ok, true)
    const boot = await server.call('bootstrap', { range: 'all' })
    const provider = boot.payload.data.catalog.providers.find((entry) => entry.providerId === 'provider-a')
    const model = provider.accounts[0].models.find((entry) => entry.modelId === 'model-beta')
    assert.equal(model.name, 'V4.1 Flash')
    assert.equal(model.plan, 'plan-x')

    const filtered = await server.call('bootstrap', { range: 'all', plan: 'plan-x' })
    assert.ok(filtered.payload.data.summary.total > 0)
    // Clearing the label restores the raw id.
    await server.call('label', { kind: 'model', providerId: 'provider-a', modelId: 'model-beta', name: '' })
    const cleared = await server.call('bootstrap', { range: 'all' })
    const clearedModel = cleared.payload.data.catalog.providers
      .find((entry) => entry.providerId === 'provider-a').accounts[0].models
      .find((entry) => entry.modelId === 'model-beta')
    assert.equal(clearedModel.name, 'model-beta')
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('each range offers only its own granularities and the trend matches the summary', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const cases = [
      ['today', ['hour']],
      ['week', ['day']],
      ['month', ['day', 'week']],
      ['year', ['day', 'week', 'month']],
    ]
    for (const [range, expected] of cases) {
      const boot = await server.call('bootstrap', { range })
      assert.deepEqual(boot.payload.data.granularityOptions, expected, `${range} options`)
      assert.equal(boot.payload.data.granularity, expected[0], `${range} default`)
      for (const granularity of expected) {
        const payload = (await server.call('bootstrap', { range, granularity })).payload.data
        assert.equal(payload.granularity, granularity, `${range}/${granularity} is honoured`)
        const sum = payload.trend.reduce((n, point) => n + point.total, 0)
        assert.equal(sum, payload.summary.total, `${range}/${granularity} trend must match the summary`)
      }
    }

    // A granularity the range does not offer is rejected, never silently applied.
    assert.equal((await server.call('bootstrap', { range: 'year', granularity: 'hour' })).payload.data.granularity, 'day')
    assert.equal((await server.call('bootstrap', { range: 'year', granularity: 'year' })).payload.data.granularity, 'day')
    assert.equal((await server.call('bootstrap', { range: 'today', granularity: 'month' })).payload.data.granularity, 'hour')
    assert.equal((await server.call('bootstrap', { range: 'week', granularity: 'hour' })).payload.data.granularity, 'day')

    // `all` always works in weeks, months or years, whatever its span is.
    const allRange = (await server.call('bootstrap', { range: 'all' })).payload.data
    assert.deepEqual(allRange.granularityOptions, ['week', 'month', 'year'])
    assert.equal(allRange.granularity, 'week', 'all opens on weeks')
    for (const granularity of allRange.granularityOptions) {
      const payload = (await server.call('bootstrap', { range: 'all', granularity })).payload.data
      const sum = payload.trend.reduce((n, point) => n + point.total, 0)
      assert.equal(sum, payload.summary.total, `all/${granularity} trend must match the summary`)
      assert.ok(payload.trend.length >= 1, `all/${granularity} still draws buckets`)
    }
    // Hour and day are no longer accepted for `all`.
    assert.equal((await server.call('bootstrap', { range: 'all', granularity: 'hour' })).payload.data.granularity, 'week')
    assert.equal((await server.call('bootstrap', { range: 'all', granularity: 'day' })).payload.data.granularity, 'week')
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('the year range shows the real tokens in both weekly and monthly buckets', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const weekly = (await server.call('bootstrap', { range: 'year', granularity: 'week' })).payload.data
    const monthly = (await server.call('bootstrap', { range: 'year', granularity: 'month' })).payload.data

    // The fixture's records all fall in March 2026.
    const weekWithData = weekly.trend.filter((point) => point.total > 0)
    const monthWithData = monthly.trend.filter((point) => point.total > 0)
    assert.ok(weekWithData.length > 0, 'at least one week carries tokens')
    assert.ok(monthWithData.length > 0, 'at least one month carries tokens')
    assert.ok(monthWithData.some((point) => point.bucket === '2026-03'), 'March is present')
    assert.equal(monthWithData.reduce((n, point) => n + point.total, 0), weekly.summary.total)

    // Empty periods are kept as zeroes rather than dropped, so the axis stays
    // aligned with the buckets.
    assert.ok(weekly.trend.length > weekWithData.length, 'empty weeks are kept')
    assert.ok(monthly.trend.length === 12, 'a full year of months')
    assert.ok(monthly.trend.some((point) => point.total === 0), 'zero months are kept')
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('the number-format preference round-trips and rejects unknown values', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    await server.call('settings', { numberFormat: 'full' })
    assert.equal(server.settings().numberFormat, 'full')
    await server.call('settings', { numberFormat: 'nonsense' })
    assert.equal(server.settings().numberFormat, 'full', 'an invalid value is ignored')
    const boot = await server.call('bootstrap', { range: 'today' })
    assert.equal(boot.payload.data.settings.numberFormat, 'full')
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('the two display preferences round-trip through the API', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const defaults = await server.call('bootstrap', { range: 'today' })
    assert.equal(defaults.payload.data.settings.showUnknownRanking, false, 'hidden by default')
    assert.equal(defaults.payload.data.settings.showUnknownUsageNote, true, 'shown by default')

    await server.call('settings', { showUnknownRanking: true, showUnknownUsageNote: false })
    assert.equal(server.settings().showUnknownRanking, true)
    assert.equal(server.settings().showUnknownUsageNote, false)

    const after = await server.call('bootstrap', { range: 'today' })
    assert.equal(after.payload.data.settings.showUnknownRanking, true)
    assert.equal(after.payload.data.settings.showUnknownUsageNote, false)

    // A non-boolean is ignored rather than coerced.
    await server.call('settings', { showUnknownRanking: 'yes' })
    assert.equal(server.settings().showUnknownRanking, true, 'a string does not change the flag')

    // Changing one preference does not disturb the others.
    await server.call('settings', { numberFormat: 'full' })
    assert.equal(server.settings().showUnknownRanking, true)
    assert.equal(server.settings().showUnknownUsageNote, false)
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('diagnostics reports placement and row counts', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const { payload } = await server.call('diagnostics', {})
    assert.equal(payload.data.rows, fixture.events.length)
    assert.equal(server.diagnosticsCalls(), 1)
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('bad requests are rejected without touching the database', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const before = countRows(harness.db)
    const get = await fetch(server.base, { method: 'GET' })
    assert.equal(get.status, 405)
    const unknown = await server.call('nope', {})
    assert.equal(unknown.status, 404)
    assert.equal(unknown.payload.error.code, 'unknown-method')
    const badJson = await fetch(server.base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    assert.equal(badJson.status, 400)
    const arrayBody = await fetch(server.base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[]',
    })
    assert.equal(arrayBody.status, 400)
    assert.equal(countRows(harness.db), before)
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('a label request missing its identifier fails cleanly', async () => {
  const harness = seededHarness()
  const server = await startServer(harness)
  try {
    const { status, payload } = await server.call('label', { kind: 'model', name: 'x' })
    assert.equal(status, 500)
    assert.equal(payload.ok, false)
    assert.ok(payload.error.message.length > 0)
  } finally {
    await server.close()
    harness.dispose()
  }
})

test('the health of an empty store is still a valid response', async () => {
  const harness = createHarness()
  const server = await startServer(harness)
  try {
    const { status, payload } = await server.call('bootstrap', { range: 'all' })
    assert.equal(status, 200)
    assert.equal(payload.data.summary.total, 0)
    assert.deepEqual(payload.data.catalog.providers, [])
    assert.equal(payload.data.firstRecordAt, null)
  } finally {
    await server.close()
    harness.dispose()
  }
})
