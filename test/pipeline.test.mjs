import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NO_PLAN,
  getCatalog,
  getRankings,
  getRecords,
  getSummary,
  getTrend,
  parseFilters,
  setLabel,
  setPlan,
} from '../lib/query.js'
import { countRows, createHarness, loadFixture, replay } from './helpers.mjs'

const fixture = loadFixture()

/** A range that certainly contains every fixture instant. */
function fixtureRange() {
  let min = Infinity
  let max = -Infinity
  for (const entry of fixture.events) {
    if (entry.time < min) min = entry.time
    if (entry.time > max) max = entry.time
  }
  return { from: min - 86400000, to: max + 86400000 }
}

function freshHarness() {
  const harness = createHarness()
  replay(harness, fixture)
  return harness
}

test('replaying real session events reproduces the independent totals', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const summary = getSummary(harness.db, range, parseFilters({}))
    const expected = fixture.expected
    assert.equal(summary.requests, expected.events)
    assert.equal(summary.knownCount, expected.known)
    assert.equal(summary.unknownCount, expected.unknown)
    assert.equal(summary.total, expected.total)
    assert.equal(summary.input, expected.input)
    assert.equal(summary.output, expected.output)
    assert.equal(summary.cacheRead + summary.cacheWrite, expected.cache)
    assert.equal(harness.errors.length, 0, 'the recorder must not swallow a real failure')
  } finally {
    harness.dispose()
  }
})

test('every recorded row is one durable event, and replay is idempotent', () => {
  const harness = freshHarness()
  try {
    const before = countRows(harness.db)
    assert.equal(before, fixture.events.length)
    // A plugin reload, an HMR re-activation or a re-delivered event must not double count.
    replay(harness, fixture)
    replay(harness, fixture)
    assert.equal(countRows(harness.db), before)
    const summary = getSummary(harness.db, fixtureRange(), parseFilters({}))
    assert.equal(summary.total, fixture.expected.total)
  } finally {
    harness.dispose()
  }
})

test('usage without a counter pair is stored as unknown instead of zero', () => {
  const harness = freshHarness()
  try {
    const rows = harness.db.prepare('SELECT * FROM requests WHERE usage_known = 0').all()
    assert.ok(rows.length > 0, 'the fixture contains steps without usage')
    for (const row of rows) {
      assert.equal(row.input_tokens, null)
      assert.equal(row.output_tokens, null)
      assert.equal(row.total_tokens, null)
    }
    // Unknown rows never contribute to a total.
    const sum = harness.db.prepare('SELECT COALESCE(SUM(total_tokens), 0) AS n FROM requests').get()
    assert.equal(Number(sum.n), fixture.expected.total)
  } finally {
    harness.dispose()
  }
})

test('the same model id under different providers stays separate', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const rows = getRankings(harness.db, range, parseFilters({}), 'model', 100)
    const shared = rows.filter((row) => row.key === 'model-alpha')
    assert.ok(shared.length >= 2, 'the fixture has model-alpha under several providers')
    const providers = new Set(shared.map((row) => row.providerId))
    assert.ok(providers.size >= 2)
    // Each provider's slice carries its own total, and they add up to the sum of
    // the fixture's per-(provider, model) expectations.
    let expected = 0
    for (const entry of fixture.expected.byProviderModel) {
      if (entry.model === 'model-alpha') expected += entry.total
    }
    const actual = shared.reduce((sum, row) => sum + row.total, 0)
    assert.equal(actual, expected)
  } finally {
    harness.dispose()
  }
})

test('per-provider-model totals match the fixture row by row', () => {
  const harness = freshHarness()
  try {
    const rows = getRankings(harness.db, fixtureRange(), parseFilters({}), 'model', 100)
    const actual = new Map(rows.map((row) => [`${row.providerId}\u0000${row.key}`, row.total]))
    for (const entry of fixture.expected.byProviderModel) {
      const key = `${entry.provider}\u0000${entry.model}`
      assert.equal(actual.get(key), entry.total, `total for ${key}`)
    }
  } finally {
    harness.dispose()
  }
})

test('trend buckets partition the same total for every granularity', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    for (const granularity of ['day', 'week', 'month', 'year']) {
      const points = getTrend(harness.db, range, parseFilters({}), granularity)
      const sum = points.reduce((total, point) => total + point.total, 0)
      assert.equal(sum, fixture.expected.total, `granularity ${granularity} must not lose or duplicate tokens`)
      assert.ok(points.length > 0)
      // Buckets are sorted and unique, so the chart axis is stable.
      const keys = points.map((point) => point.bucket)
      assert.deepEqual(keys, [...keys].sort())
      assert.equal(new Set(keys).size, keys.length)
    }
  } finally {
    harness.dispose()
  }
})

test('a narrower range only returns that range', () => {
  const harness = freshHarness()
  try {
    const days = getTrend(harness.db, fixtureRange(), parseFilters({}), 'day')
    const busiest = days.reduce((best, point) => (point.total > best.total ? point : best), days[0])
    const dayStart = new Date(busiest.bucket + 'T00:00:00').getTime()
    const narrow = { from: dayStart, to: dayStart + 86400000 }
    const summary = getSummary(harness.db, narrow, parseFilters({}))
    assert.equal(summary.total, busiest.total)
    assert.ok(summary.requests <= fixture.expected.events)
  } finally {
    harness.dispose()
  }
})

test('provider, account and model filters narrow correctly and combine with the range', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const all = getSummary(harness.db, range, parseFilters({}))
    const provider = fixture.expected.byProviderModel[0].provider
    const byProvider = getSummary(harness.db, range, parseFilters({ provider }))
    let expectedForProvider = 0
    for (const entry of fixture.expected.byProviderModel) {
      if (entry.provider === provider) expectedForProvider += entry.total
    }
    assert.equal(byProvider.total, expectedForProvider)
    assert.ok(byProvider.total < all.total)

    // Account equals the provider route in DSH, so the same slice must appear.
    const byAccount = getSummary(harness.db, range, parseFilters({ provider, account: provider }))
    assert.equal(byAccount.total, byProvider.total)

    const model = fixture.expected.byProviderModel[0].model
    const byModel = getSummary(harness.db, range, parseFilters({ provider, account: provider, model }))
    assert.equal(byModel.total, fixture.expected.byProviderModel[0].total)
  } finally {
    harness.dispose()
  }
})

test('search matches raw ids and renamed display names', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const hit = getSummary(harness.db, range, parseFilters({ q: 'provider-a' }))
    assert.ok(hit.total > 0)
    const miss = getSummary(harness.db, range, parseFilters({ q: 'no-such-model-xyz' }))
    assert.equal(miss.total, 0)

    setLabel(harness.db, { kind: 'model', providerId: 'provider-a', modelId: 'model-beta', name: 'Alpha Prime' })
    const renamed = getSummary(harness.db, range, parseFilters({ q: 'Prime' }))
    assert.ok(renamed.total > 0, 'a display name must be searchable after a rename')
  } finally {
    harness.dispose()
  }
})

test('renaming and plan labels never touch identifiers or token counts', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const before = getSummary(harness.db, range, parseFilters({}))
    const rowBefore = harness.db.prepare('SELECT * FROM requests ORDER BY id LIMIT 1').get()

    setLabel(harness.db, { kind: 'provider', providerId: 'provider-a', name: 'Provider A' })
    setLabel(harness.db, { kind: 'account', providerId: 'provider-a', accountId: 'provider-a', name: 'Account A' })
    setLabel(harness.db, { kind: 'model', providerId: 'provider-a', modelId: 'model-beta', name: 'Alpha Prime' })
    setPlan(harness.db, { providerId: 'provider-a', accountId: 'provider-a', modelId: 'model-beta', plan: 'Plan X' })

    const after = getSummary(harness.db, range, parseFilters({}))
    assert.equal(after.total, before.total)
    const rowAfter = harness.db.prepare('SELECT * FROM requests ORDER BY id LIMIT 1').get()
    assert.deepEqual(rowAfter, rowBefore, 'history rows are immutable')

    const catalog = getCatalog(harness.db, {})
    const provider = catalog.providers.find((entry) => entry.providerId === 'provider-a')
    assert.equal(provider.name, 'Provider A')
    const account = provider.accounts.find((entry) => entry.accountId === 'provider-a')
    assert.equal(account.name, 'Account A')
    const model = account.models.find((entry) => entry.modelId === 'model-beta')
    assert.equal(model.name, 'Alpha Prime')
    assert.equal(model.plan, 'Plan X')
    assert.ok(catalog.plans.includes('Plan X'))
  } finally {
    harness.dispose()
  }
})

test('plan filtering separates assigned and unassigned models', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    setPlan(harness.db, { providerId: 'provider-a', accountId: 'provider-a', modelId: 'model-beta', plan: 'plan-x' })
    setPlan(harness.db, { providerId: 'provider-b', accountId: 'provider-b', modelId: 'model-gamma', plan: 'Pro' })

    const planA = getSummary(harness.db, range, parseFilters({ plan: 'plan-x' }))
    const expectedA = fixture.expected.byProviderModel
      .filter((entry) => entry.provider === 'provider-a' && entry.model === 'model-beta')
      .reduce((sum, entry) => sum + entry.total, 0)
    assert.equal(planA.total, expectedA)

    const unplanned = getSummary(harness.db, range, parseFilters({ plan: NO_PLAN }))
    const all = getSummary(harness.db, range, parseFilters({}))
    assert.equal(planA.total + getSummary(harness.db, range, parseFilters({ plan: 'Pro' })).total + unplanned.total, all.total)

    // Clearing the plan restores the model to the unassigned bucket.
    setPlan(harness.db, { providerId: 'provider-a', accountId: 'provider-a', modelId: 'model-beta', plan: '' })
    const afterClear = getSummary(harness.db, range, parseFilters({ plan: 'plan-x' }))
    assert.equal(afterClear.total, 0)
  } finally {
    harness.dispose()
  }
})

test('rankings respect the active filter and are ordered by total', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const filter = parseFilters({ provider: 'provider-a' })
    for (const by of ['model', 'provider', 'account', 'plan']) {
      const rows = getRankings(harness.db, range, filter, by, 10)
      assert.ok(rows.length > 0, `ranking by ${by} must have rows`)
      for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].total >= rows[i].total)
      if (by === 'provider') {
        assert.equal(rows.length, 1)
        assert.equal(rows[0].key, 'provider-a')
      }
      if (by === 'model') {
        for (const row of rows) assert.equal(row.providerId, 'provider-a')
      }
    }
  } finally {
    harness.dispose()
  }
})

test('records are newest first, paged, and carry the resolved labels', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    setPlan(harness.db, { providerId: 'provider-a', accountId: 'provider-a', modelId: 'model-beta', plan: 'plan-x' })
    const first = getRecords(harness.db, range, parseFilters({}), 0, 20)
    const second = getRecords(harness.db, range, parseFilters({}), 20, 20)
    // Steps that ended without a message are not listed in the request log.
    assert.equal(first.total, fixture.events.filter((event) => event.type === 'assistant/message').length)
    for (const item of first.items) assert.notEqual(item.source, 'attempt')
    for (let i = 1; i < first.items.length; i++) assert.ok(first.items[i - 1].ts >= first.items[i].ts)
    assert.notEqual(first.items[0].id, second.items[0].id)
    const planned = getRecords(harness.db, range, parseFilters({ plan: 'plan-x' }), 0, 500)
    assert.ok(planned.items.length > 0)
    for (const item of planned.items) assert.equal(item.plan, 'plan-x')
    const unknown = first.items.concat(second.items).filter((item) => !item.known)
    for (const item of unknown) {
      assert.equal(item.input, null)
      assert.equal(item.total, null)
    }
  } finally {
    harness.dispose()
  }
})

test('the request log hides steps without a message but keeps real requests', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    // A message the provider answered without a usage block is still a real
    // request: it must stay in the log, marked unknown.
    harness.recorder.handle({ id: 'session-extra' }, {
      type: 'assistant/message',
      seq: 900001,
      time: fixture.events[0].time,
      data: {
        turn: 900,
        step: 1,
        message: { role: 'assistant', content: [], source: { kind: 'model', provider: 'provider-b', model: 'kimi-k3' } },
      },
    })

    const page = getRecords(harness.db, range, parseFilters({}), 0, 500)
    const ids = page.items.map((item) => item.id)
    assert.ok(!ids.some((id) => id.startsWith('step:')), 'no step-only rows are listed')
    const unknownMessage = page.items.find((item) => item.id === 'msg:session-extra:900001')
    assert.ok(unknownMessage, 'a message without usage is still listed')
    assert.equal(unknownMessage.known, false)
    assert.equal(unknownMessage.total, null)
    assert.equal(unknownMessage.providerId, 'provider-b')
  } finally {
    harness.dispose()
  }
})

test('the cache hit rate is weighted across requests, not averaged', () => {
  const harness = createHarness()
  try {
    const now = Date.now()
    const session = { id: 'session-cache' }
    const message = (seq, input, cacheRead) => ({
      type: 'assistant/message',
      seq,
      time: now,
      data: {
        turn: 1,
        step: seq,
        message: { role: 'assistant', content: [], source: { kind: 'model', provider: 'provider-b', model: 'kimi-k3' } },
        usage: {
          inputTokens: input,
          outputTokens: 1,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: 0,
          totalTokens: input + 1 + cacheRead,
        },
      },
    })
    // One almost fully cached request and one large uncached request.
    harness.recorder.handle(session, message(1, 1, 99))
    harness.recorder.handle(session, message(2, 1000, 0))

    const range = { from: now - 86400000, to: now + 86400000 }
    const summary = getSummary(harness.db, range, parseFilters({}))
    // Weighted: 99 / (99 + 1001). A per-request average would be 0.495.
    assert.ok(Math.abs(summary.cacheHitRate - 99 / 1100) < 1e-9, `weighted rate: ${summary.cacheHitRate}`)
    assert.ok(summary.cacheHitRate < 0.2, 'the small request does not dominate the rate')
    assert.equal(summary.cacheRead, 99)
    assert.equal(summary.input, 1001)
  } finally {
    harness.dispose()
  }
})

test('a missing cache counter yields null, never 0%', () => {
  const harness = createHarness()
  try {
    const now = Date.now()
    harness.recorder.handle({ id: 'session-nocache' }, {
      type: 'assistant/message',
      seq: 1,
      time: now,
      data: {
        turn: 1,
        step: 1,
        message: { role: 'assistant', content: [], source: { kind: 'model', provider: 'provider-b', model: 'kimi-k3' } },
        usage: { inputTokens: 500, outputTokens: 10, totalTokens: 510 },
      },
    })
    const summary = getSummary(harness.db, { from: now - 86400000, to: now + 86400000 }, parseFilters({}))
    assert.equal(summary.hasCache, false, 'no provider reported cache counters')
    assert.equal(summary.cacheHitRate, null, 'the rate is unknown, not zero')
  } finally {
    harness.dispose()
  }
})

test('the cache hit rate follows the filter', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const all = getSummary(harness.db, range, parseFilters({}))
    const providers = [...new Set(fixture.events.filter((event) => event.provider).map((event) => event.provider))]
    let sawDifferent = false
    for (const provider of providers) {
      const filtered = getSummary(harness.db, range, parseFilters({ provider }))
      if (filtered.cacheHitRate === null) continue
      assert.ok(filtered.cacheHitRate >= 0 && filtered.cacheHitRate <= 1)
      if (Math.abs(filtered.cacheHitRate - all.cacheHitRate) > 1e-9) sawDifferent = true
    }
    assert.ok(sawDifferent, 'at least one provider has a different hit rate')
  } finally {
    harness.dispose()
  }
})

test('every trend bucket carries the counters its tooltip needs', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const summary = getSummary(harness.db, range, parseFilters({}))
    for (const granularity of ['day', 'week', 'month']) {
      const points = getTrend(harness.db, range, parseFilters({}), granularity)
      for (const point of points) {
        assert.equal(typeof point.cacheRows, 'number', `${granularity} buckets expose cacheRows`)
        assert.equal(typeof point.input, 'number')
        assert.equal(typeof point.cacheRead, 'number')
      }
      // Per-bucket counters must add up to the summary the card shows.
      const read = points.reduce((n, point) => n + point.cacheRead, 0)
      const input = points.reduce((n, point) => n + point.input, 0)
      assert.equal(read, summary.cacheRead, `${granularity} cacheRead sums to the summary`)
      assert.equal(input, summary.input, `${granularity} input sums to the summary`)
      if (summary.cacheHitRate !== null) {
        const rate = read / (read + input)
        assert.ok(Math.abs(rate - summary.cacheHitRate) < 1e-9, `${granularity} rate matches the card`)
      }
    }
  } finally {
    harness.dispose()
  }
})

test('a provider row keeps its raw id when the user renames it', () => {
  const harness = freshHarness()
  try {
    const range = fixtureRange()
    const providers = getRankings(harness.db, range, parseFilters({}), 'provider', 100)
    assert.ok(providers.length > 0)
    for (const row of providers) {
      assert.equal(typeof row.key, 'string')
      assert.equal(typeof row.name, 'string')
      assert.ok(row.key.length > 0)
    }
    const raw = providers[0].key
    setLabel(harness.db, { kind: 'provider', providerId: raw, name: '123' })
    const renamed = getRankings(harness.db, range, parseFilters({}), 'provider', 100)
    const target = renamed.find((row) => row.key === raw)
    assert.ok(target, 'the renamed provider is still ranked under its id')
    assert.equal(target.name, '123', 'the label becomes the display name')
    assert.equal(target.key, raw, 'the raw id is preserved for the subtitle')
  } finally {
    harness.dispose()
  }
})

test('records in a filtered view only mention the filtered identity', () => {
  const harness = freshHarness()
  try {
    const page = getRecords(harness.db, fixtureRange(), parseFilters({ provider: 'provider-b' }), 0, 50)
    assert.ok(page.items.length > 0)
    for (const item of page.items) assert.equal(item.providerId, 'provider-b')
  } finally {
    harness.dispose()
  }
})

test('the catalog only lists identities that actually have records', () => {
  const harness = freshHarness()
  try {
    const catalog = getCatalog(harness.db, { 'provider-a': 'Provider A' })
    assert.ok(catalog.providers.length > 0)
    const total = catalog.providers.reduce((sum, provider) => sum + provider.total, 0)
    assert.equal(total, fixture.expected.total)
    const baidu = catalog.providers.find((entry) => entry.providerId === 'provider-a')
    assert.equal(baidu.name, 'Provider A', 'a default provider name is used until a user label exists')
    for (const provider of catalog.providers) {
      for (const account of provider.accounts) {
        for (const model of account.models) {
          assert.ok(model.requests > 0)
        }
      }
    }
  } finally {
    harness.dispose()
  }
})

test('an empty database answers with zeros rather than failing', () => {
  const harness = createHarness()
  try {
    const range = fixtureRange()
    const summary = getSummary(harness.db, range, parseFilters({}))
    assert.equal(summary.total, 0)
    assert.equal(summary.requests, 0)
    assert.equal(summary.hasCache, false)
    assert.deepEqual(getTrend(harness.db, range, parseFilters({}), 'day').reduce((n, p) => n + p.total, 0), 0)
    assert.deepEqual(getRecords(harness.db, range, parseFilters({}), 0, 10).items, [])
    assert.deepEqual(getCatalog(harness.db, {}).providers, [])
  } finally {
    harness.dispose()
  }
})

test('recordAttempts can be switched off', () => {
  const harness = createHarness({ recordAttempts: false })
  try {
    replay(harness, fixture)
    const rows = countRows(harness.db)
    assert.ok(rows < fixture.events.length)
    assert.equal(countRows(harness.db, 'SELECT COUNT(*) AS n FROM requests WHERE source = ?'.replace('?', "'attempt'")), 0)
    const summary = getSummary(harness.db, fixtureRange(), parseFilters({}))
    assert.equal(summary.total, fixture.expected.total, 'token totals are unaffected')
  } finally {
    harness.dispose()
  }
})
