/**
 * Aggregation layer.
 *
 * Every total, bucket and ranking is computed by SQLite over the indexed
 * `requests` table; the plugin never folds history in JavaScript and never
 * re-reads every record to answer a page.
 *
 * Unknown-usage rows store NULL counters, so `SUM()` ignores them and the
 * totals stay honest: the UI shows how many such rows exist instead of
 * treating them as zero.
 */

import { GRANULARITIES, bucketKeysInRange } from './time.js'

export const NO_PLAN = '__none__'

const NUMERIC_COLUMNS = ['total_tokens', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens']

const BUCKETS = {
  // SQLite's `localtime` modifier uses the host's timezone rules, so the hour
  // key follows DST exactly like the stored `day` column does. The alias must
  // not be called `hour`: an older schema revision left a column with that
  // name, and SQLite would resolve the GROUP BY to the column instead.
  hour: "strftime('%Y-%m-%dT%H', r.ts / 1000, 'unixepoch', 'localtime')",
  day: 'r.day',
  week: 'r.week',
  month: 'substr(r.day, 1, 7)',
  year: 'substr(r.day, 1, 4)',
}

/** Coerce untrusted query input into the filter shape the SQL builder accepts. */
export function parseFilters(raw = {}) {
  const str = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)
  return {
    provider: str(raw.provider),
    account: str(raw.account),
    model: str(raw.model),
    plan: str(raw.plan),
    q: str(raw.q),
  }
}

function buildWhere(range, filter) {
  const clauses = ['r.ts >= ?', 'r.ts < ?']
  const params = [range.from, range.to]
  if (filter.provider) { clauses.push('r.provider_id = ?'); params.push(filter.provider) }
  if (filter.account) { clauses.push('r.account_id = ?'); params.push(filter.account) }
  if (filter.model) { clauses.push('r.model_id = ?'); params.push(filter.model) }
  if (filter.plan === NO_PLAN) {
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM plan_assignments pa
      WHERE pa.provider_id = r.provider_id AND pa.account_id = r.account_id AND pa.model_id = r.model_id
    )`)
  } else if (filter.plan) {
    clauses.push(`EXISTS (
      SELECT 1 FROM plan_assignments pa
      WHERE pa.provider_id = r.provider_id AND pa.account_id = r.account_id
        AND pa.model_id = r.model_id AND pa.plan = ?
    )`)
    params.push(filter.plan)
  }
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_\\]/g, (c) => '\\' + c)}%`
    clauses.push(`(
      r.model_id LIKE ? ESCAPE '\\'
      OR r.provider_id LIKE ? ESCAPE '\\'
      OR r.account_id LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM model_labels ml WHERE ml.provider_id = r.provider_id AND ml.model_id = r.model_id AND ml.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM provider_labels pl WHERE pl.provider_id = r.provider_id AND pl.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM account_labels al WHERE al.account_id = r.account_id AND al.name LIKE ? ESCAPE '\\')
    )`)
    params.push(like, like, like, like, like, like)
  }
  return { sql: clauses.join(' AND '), params }
}

const sumOf = (column) => `COALESCE(SUM(r.${column}), 0)`

/** Headline numbers for one range and filter. */
export function getSummary(db, range, filter) {
  const where = buildWhere(range, filter)
  const sumFields = NUMERIC_COLUMNS.map((column) => `${sumOf(column)} AS ${column}`).join(',\n      ')
  const row = db.prepare(`
    SELECT
      COUNT(*) AS requests,
      COALESCE(SUM(CASE WHEN r.usage_known = 1 THEN 1 ELSE 0 END), 0) AS known_count,
      COALESCE(SUM(CASE WHEN r.usage_known = 0 THEN 1 ELSE 0 END), 0) AS unknown_count,
      ${sumFields}
    FROM requests r
    WHERE ${where.sql}
  `).get(...where.params)
  // Whether any row in range reported the auxiliary counters at all, so the
  // UI can hide a metric its providers never send instead of showing 0.
  const hasCache = hasNonNull(db, where, 'cache_read_tokens', 'cache_write_tokens')
  const cacheRead = Number(row?.cache_read_tokens ?? 0)
  const input = Number(row?.input_tokens ?? 0)
  // Weighted hit rate: cached prompt tokens over all prompt tokens. `input` is
  // the uncached remainder (total = input + output + cacheRead + cacheWrite),
  // so cacheWrite is deliberately left out — those tokens are already counted
  // in `input` and adding them would count the same prompt twice.
  const cacheBase = cacheRead + input
  return {
    requests: Number(row?.requests ?? 0),
    knownCount: Number(row?.known_count ?? 0),
    unknownCount: Number(row?.unknown_count ?? 0),
    total: Number(row?.total_tokens ?? 0),
    input,
    output: Number(row?.output_tokens ?? 0),
    cacheRead,
    cacheWrite: Number(row?.cache_write_tokens ?? 0),
    reasoning: Number(row?.reasoning_tokens ?? 0),
    // null means "no provider reported cache counters", which the UI shows as
    // an em dash rather than a misleading 0%.
    cacheHitRate: hasCache && cacheBase > 0 ? cacheRead / cacheBase : null,
    hasCache,
    hasReasoning: hasNonNull(db, where, 'reasoning_tokens'),
  }
}

function hasNonNull(db, where, ...columns) {
  const predicate = columns.map((c) => `r.${c} IS NOT NULL`).join(' OR ')
  const row = db.prepare(`SELECT EXISTS (SELECT 1 FROM requests r WHERE ${where.sql} AND (${predicate})) AS hit`)
    .get(...where.params)
  return Number(row?.hit ?? 0) === 1
}

/**
 * Bucketed series for the trend chart, with empty buckets included so the axis
 * stays continuous.
 */
export function getTrend(db, range, filter, granularity) {
  const bucket = BUCKETS[GRANULARITIES.includes(granularity) ? granularity : 'day']
  const where = buildWhere(range, filter)
  const rows = db.prepare(`
    SELECT
      ${bucket} AS bucket,
      COUNT(*) AS requests,
      ${sumOf('total_tokens')} AS total,
      ${sumOf('input_tokens')} AS input,
      ${sumOf('output_tokens')} AS output,
      ${sumOf('cache_read_tokens')} AS cache_read,
      -- How many rows actually reported a cache counter, so a bucket can tell
      -- "no cache hits" apart from "this provider sends no cache data".
      SUM(CASE WHEN r.cache_read_tokens IS NOT NULL THEN 1 ELSE 0 END) AS cache_rows
    FROM requests r
    WHERE ${where.sql}
    GROUP BY bucket
    ORDER BY bucket
  `).all(...where.params)
  const byBucket = new Map(rows.map((row) => [String(row.bucket), row]))
  const keys = bucketKeysInRange(range.from, range.to, granularity)
  const keySet = new Set(keys)
  const points = keys.map((key) => {
    const row = byBucket.get(key)
    return {
      bucket: key,
      requests: Number(row?.requests ?? 0),
      total: Number(row?.total ?? 0),
      input: Number(row?.input ?? 0),
      output: Number(row?.output ?? 0),
      cacheRead: Number(row?.cache_read ?? 0),
      cacheRows: Number(row?.cache_rows ?? 0),
    }
  })
  // A custom range can start mid-bucket; keep anything the key walk skipped.
  for (const [key, row] of byBucket) {
    if (!keySet.has(key)) {
      points.push({
        bucket: key,
        requests: Number(row.requests ?? 0),
        total: Number(row.total ?? 0),
        input: Number(row.input ?? 0),
        output: Number(row.output ?? 0),
        cacheRead: Number(row.cache_read ?? 0),
        cacheRows: Number(row.cache_rows ?? 0),
      })
    }
  }
  points.sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0))
  return points
}

const LABEL_JOINS = `
  LEFT JOIN provider_labels pl ON pl.provider_id = r.provider_id
  LEFT JOIN account_labels  al ON al.account_id  = r.account_id
  LEFT JOIN model_labels    ml ON ml.provider_id = r.provider_id AND ml.model_id = r.model_id
  LEFT JOIN plan_assignments pa ON pa.provider_id = r.provider_id AND pa.account_id = r.account_id AND pa.model_id = r.model_id
`

/**
 * Display-name resolution, in the precedence the plugin documents:
 * user label → DSH provider name → raw id. The raw id is always kept beside the
 * display name so a rename never hides which provider or model a row is.
 */
function createNameResolver(providerNames = {}) {
  const providerName = (providerId, label) => label || providerNames[providerId] || providerId
  const accountName = (accountId, label, providerId, providerLabel) => (
    label || providerName(providerId, providerLabel) || accountId
  )
  const modelName = (modelId, label) => label || modelId
  return { providerName, accountName, modelName }
}

/**
 * Top rows for one dimension. Honors the active range and filter.
 * @param {'model'|'provider'|'account'|'plan'} by
 * @param {Record<string, string>} providerNames DSH provider display names.
 */
export function getRankings(db, range, filter, by, limit = 10, providerNames = {}) {
  const where = buildWhere(range, filter)
  const capped = Math.min(Math.max(Number(limit) || 10, 1), 100)
  const names = createNameResolver(providerNames)

  if (by === 'plan') {
    const rows = db.prepare(`
      SELECT
        COALESCE(pa.plan, '${NO_PLAN}') AS plan_key,
        COUNT(*) AS requests,
        ${sumOf('total_tokens')} AS total,
        ${sumOf('input_tokens')} AS input,
        ${sumOf('output_tokens')} AS output
      FROM requests r
      ${LABEL_JOINS}
      WHERE ${where.sql}
      GROUP BY plan_key
      ORDER BY total DESC
      LIMIT ?
    `).all(...where.params, capped)
    return rows.map((row) => ({
      key: String(row.plan_key),
      name: row.plan_key === NO_PLAN ? null : String(row.plan_key),
      requests: Number(row.requests),
      total: Number(row.total),
      input: Number(row.input),
      output: Number(row.output),
    }))
  }

  const group = by === 'provider'
    ? 'r.provider_id'
    : by === 'account'
      ? 'r.provider_id, r.account_id'
      : 'r.provider_id, r.account_id, r.model_id'
  const rows = db.prepare(`
    SELECT
      r.provider_id AS provider_id,
      r.account_id AS account_id,
      r.model_id AS model_id,
      pl.name AS provider_label,
      al.name AS account_label,
      ml.name AS model_label,
      COUNT(*) AS requests,
      ${sumOf('total_tokens')} AS total,
      ${sumOf('input_tokens')} AS input,
      ${sumOf('output_tokens')} AS output
    FROM requests r
    ${LABEL_JOINS}
    WHERE ${where.sql}
    GROUP BY ${group}
    ORDER BY total DESC
    LIMIT ?
  `).all(...where.params, capped)

  return rows.map((row) => {
    const providerId = String(row.provider_id)
    const accountId = String(row.account_id)
    const modelId = String(row.model_id)
    const providerDisplay = names.providerName(providerId, row.provider_label)
    const accountDisplay = names.accountName(accountId, row.account_label, providerId, row.provider_label)
    let key
    let name
    if (by === 'provider') {
      key = providerId
      name = providerDisplay
    } else if (by === 'account') {
      key = accountId
      name = accountDisplay
    } else {
      key = modelId
      name = names.modelName(modelId, row.model_label)
    }
    return {
      key,
      name,
      providerId,
      accountId,
      providerName: providerDisplay,
      accountName: accountDisplay,
      modelId,
      requests: Number(row.requests),
      total: Number(row.total),
      input: Number(row.input),
      output: Number(row.output),
    }
  })
}

/** Paged request records, newest first. */
export function getRecords(db, range, filter, offset, limit, providerNames = {}) {
  const where = buildWhere(range, filter)
  // The request log lists real model requests. A step that ended without an
  // assistant message has no provider, no model and no tokens, so it would only
  // be noise here; it still counts in the summary and stays in the database.
  const recordsWhere = { sql: `(${where.sql}) AND r.source <> 'attempt'`, params: where.params }
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 500)
  const skip = Math.max(Number(offset) || 0, 0)
  const names = createNameResolver(providerNames)
  const rows = db.prepare(`
    SELECT
      r.id, r.ts, r.turn, r.step, r.source,
      r.provider_id, r.account_id, r.model_id, r.usage_known,
      r.input_tokens, r.output_tokens, r.total_tokens,
      r.cache_read_tokens, r.cache_write_tokens, r.reasoning_tokens,
      pl.name AS provider_label,
      al.name AS account_label,
      ml.name AS model_label,
      pa.plan AS plan
    FROM requests r
    ${LABEL_JOINS}
    WHERE ${recordsWhere.sql}
    ORDER BY r.ts DESC, r.seq DESC
    LIMIT ? OFFSET ?
  `).all(...recordsWhere.params, capped, skip)
  const total = db.prepare(`SELECT COUNT(*) AS n FROM requests r WHERE ${recordsWhere.sql}`).get(...recordsWhere.params)
  return {
    total: Number(total?.n ?? 0),
    offset: skip,
    limit: capped,
    items: rows.map((row) => ({
      id: row.id,
      ts: Number(row.ts),
      turn: row.turn === null ? null : Number(row.turn),
      step: row.step === null ? null : Number(row.step),
      source: row.source,
      providerId: row.provider_id,
      providerName: names.providerName(row.provider_id, row.provider_label),
      accountId: row.account_id,
      accountName: names.accountName(row.account_id, row.account_label, row.provider_id, row.provider_label),
      modelId: row.model_id,
      modelName: names.modelName(row.model_id, row.model_label),
      plan: row.plan ?? null,
      known: Number(row.usage_known) === 1,
      input: row.input_tokens === null ? null : Number(row.input_tokens),
      output: row.output_tokens === null ? null : Number(row.output_tokens),
      total: row.total_tokens === null ? null : Number(row.total_tokens),
      cacheRead: row.cache_read_tokens === null ? null : Number(row.cache_read_tokens),
      cacheWrite: row.cache_write_tokens === null ? null : Number(row.cache_write_tokens),
      reasoning: row.reasoning_tokens === null ? null : Number(row.reasoning_tokens),
    })),
  }
}

/**
 * The provider → account → plan → model tree, built only from identities that
 * actually appear in the history.
 *
 * @param {Record<string, string>} providerNames default provider labels from
 *   `llm.listProviders()`; a user label always wins.
 */
export function getCatalog(db, providerNames = {}) {
  const names = createNameResolver(providerNames)
  const rows = db.prepare(`
    SELECT
      r.provider_id, r.account_id, r.model_id,
      COUNT(*) AS requests,
      ${sumOf('total_tokens')} AS total,
      MIN(r.ts) AS first_ts,
      MAX(r.ts) AS last_ts,
      pl.name AS provider_label,
      al.name AS account_label,
      ml.name AS model_label,
      pa.plan AS plan
    FROM requests r
    ${LABEL_JOINS}
    GROUP BY r.provider_id, r.account_id, r.model_id
    ORDER BY r.provider_id, r.account_id, r.model_id
  `).all()

  const providers = new Map()
  const plans = new Set()
  for (const row of rows) {
    const providerId = String(row.provider_id)
    let provider = providers.get(providerId)
    if (!provider) {
      provider = {
        providerId,
        name: row.provider_label || providerNames[providerId] || providerId,
        providerLabel: row.provider_label || null,
        defaultName: providerNames[providerId] || providerId,
        total: 0,
        requests: 0,
        accounts: new Map(),
      }
      providers.set(providerId, provider)
    }
    let account = provider.accounts.get(String(row.account_id))
    if (!account) {
      account = {
        accountId: String(row.account_id),
        name: names.accountName(String(row.account_id), row.account_label, providerId, row.provider_label),
        accountLabel: row.account_label || null,
        total: 0,
        requests: 0,
        models: [],
      }
      provider.accounts.set(String(row.account_id), account)
    }
    const plan = row.plan ? String(row.plan) : null
    if (plan) plans.add(plan)
    account.models.push({
      modelId: String(row.model_id),
      name: names.modelName(String(row.model_id), row.model_label),
      modelLabel: row.model_label || null,
      plan,
      requests: Number(row.requests ?? 0),
      total: Number(row.total ?? 0),
      firstTs: Number(row.first_ts ?? 0),
      lastTs: Number(row.last_ts ?? 0),
    })
    account.total += Number(row.total ?? 0)
    account.requests += Number(row.requests ?? 0)
    provider.total += Number(row.total ?? 0)
    provider.requests += Number(row.requests ?? 0)
  }

  // Order the plan level the way the tree reads: plan name, then model.
  const list = [...providers.values()].map((provider) => {
    const accounts = [...provider.accounts.values()].map((account) => {
      account.models.sort((a, b) => b.total - a.total || (a.modelId < b.modelId ? -1 : 1))
      return account
    })
    accounts.sort((a, b) => b.total - a.total || (a.accountId < b.accountId ? -1 : 1))
    return { ...provider, accounts }
  })
  list.sort((a, b) => b.total - a.total || (a.providerId < b.providerId ? -1 : 1))
  return { providers: list, plans: [...plans].sort() }
}

/** Rename one entity. An empty name removes the override and restores the raw id. */
export function setLabel(db, { kind, providerId, accountId, modelId, name }) {
  const clean = typeof name === 'string' ? name.trim().slice(0, 120) : ''
  if (kind === 'provider') {
    if (!providerId) throw new Error('providerId is required')
    if (!clean) { db.prepare('DELETE FROM provider_labels WHERE provider_id = ?').run(providerId); return }
    db.prepare('INSERT INTO provider_labels (provider_id, name) VALUES (?, ?) ON CONFLICT(provider_id) DO UPDATE SET name = excluded.name')
      .run(providerId, clean)
    return
  }
  if (kind === 'account') {
    if (!accountId || !providerId) throw new Error('accountId and providerId are required')
    if (!clean) { db.prepare('DELETE FROM account_labels WHERE account_id = ?').run(accountId); return }
    db.prepare('INSERT INTO account_labels (account_id, provider_id, name) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET name = excluded.name, provider_id = excluded.provider_id')
      .run(accountId, providerId, clean)
    return
  }
  if (kind === 'model') {
    if (!providerId || !modelId) throw new Error('providerId and modelId are required')
    if (!clean) { db.prepare('DELETE FROM model_labels WHERE provider_id = ? AND model_id = ?').run(providerId, modelId); return }
    db.prepare('INSERT INTO model_labels (provider_id, model_id, name) VALUES (?, ?, ?) ON CONFLICT(provider_id, model_id) DO UPDATE SET name = excluded.name')
      .run(providerId, modelId, clean)
    return
  }
  throw new Error(`unknown label kind: ${kind}`)
}

/** Assign (or clear) the plan label of one provider/account/model triple. */
export function setPlan(db, { providerId, accountId, modelId, plan }) {
  if (!providerId || !accountId || !modelId) throw new Error('providerId, accountId and modelId are required')
  const clean = typeof plan === 'string' ? plan.trim().slice(0, 60) : ''
  if (!clean) {
    db.prepare('DELETE FROM plan_assignments WHERE provider_id = ? AND account_id = ? AND model_id = ?')
      .run(providerId, accountId, modelId)
    return
  }
  db.prepare('INSERT INTO plan_assignments (provider_id, account_id, model_id, plan) VALUES (?, ?, ?, ?) ON CONFLICT(provider_id, account_id, model_id) DO UPDATE SET plan = excluded.plan')
    .run(providerId, accountId, modelId, clean)
}
