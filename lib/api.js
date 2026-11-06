/**
 * Same-origin JSON API for the plugin page.
 *
 * One POST route keeps the surface small: the page sends
 * `{ method, args }` and receives `{ ok, data }`. Only aggregate numbers and
 * identifiers are ever returned — no prompt text, no reply text, no request
 * body and no credential is read or stored, so none can be served here.
 */

import { NO_PLAN, getCatalog, getRankings, getRecords, getSummary, getTrend, parseFilters, setLabel, setPlan } from './query.js'
import { defaultGranularityFor, granularityOptionsFor, resolveRange } from './time.js'

export const API_PREFIX = '/dsh-token-usage/api/v1'
const MAX_BODY_BYTES = 64 * 1024

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  response.end(body)
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'), { code: 'body-too-large' })
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('body must be an object')
    return parsed
  } catch {
    throw Object.assign(new Error('invalid JSON body'), { code: 'bad-json' })
  }
}

/**
 * Build the request handler.
 *
 * @param {object} deps
 * @param {import('node:sqlite').DatabaseSync} deps.db
 * @param {() => Record<string, string>} deps.providerNames
 * @param {() => object} deps.readSettings
 * @param {(patch: object) => object} deps.writeSettings
 * @param {() => object} deps.diagnostics
 * @param {(key: string) => number | null} deps.metaNumber
 */
export function createApi({ db, providerNames, readSettings, writeSettings, diagnostics, metaNumber }) {
  // The provider/account/plan/model tree is unfiltered and all-time, so it does
  // not change when the user switches range or filter. Caching it for a couple
  // of seconds keeps rapid filter changes from re-scanning the history, while a
  // rename or plan edit invalidates it immediately.
  let catalogCache = { at: 0, value: null }
  const CATALOG_TTL_MS = 2000

  function catalog() {
    const now = Date.now()
    if (catalogCache.value && now - catalogCache.at < CATALOG_TTL_MS) return catalogCache.value
    const value = getCatalog(db, providerNames())
    catalogCache = { at: now, value }
    return value
  }

  function invalidateCatalog() {
    catalogCache = { at: 0, value: null }
  }

  function resolveRequestedRange(args) {
    // An absent range means "whatever the user last selected", so the first
    // paint needs one request rather than a settings round trip plus a reload.
    const settings = readSettings()
    const kind = typeof args?.range === 'string' && args.range !== ''
      ? args.range
      : (settings.lastRange || 'today')
    const firstRecordAt = metaNumber('first_record_at')
    const range = resolveRange(kind, {
      firstRecordAt: firstRecordAt === null ? undefined : firstRecordAt,
      from: typeof args?.from === 'string' && args.from !== '' ? args.from : settings.lastCustomFrom || undefined,
      to: typeof args?.to === 'string' && args.to !== '' ? args.to : settings.lastCustomTo || undefined,
    })
    const requested = typeof args?.granularity === 'string' ? args.granularity : null
    // Only the granularities this range offers are accepted. A request for one
    // that no longer applies (for example `day` after switching to this year)
    // falls back to the range's default instead of rendering 365 bars.
    const options = granularityOptionsFor(range.kind, range.from, range.to)
    const granularity = requested && options.includes(requested) ? requested : options[0]
    return { range, granularity, granularityOptions: options }
  }

  function bootstrap(args) {
    const { range, granularity, granularityOptions } = resolveRequestedRange(args)
    const filter = parseFilters(args)
    const settings = readSettings()
    const providerNameMap = providerNames()
    return {
      settings,
      range,
      granularity,
      granularityOptions,
      autoGranularity: defaultGranularityFor(range.kind, range.from, range.to),
      filter,
      summary: getSummary(db, range, filter),
      trend: getTrend(db, range, filter, granularity),
      rankings: {
        model: getRankings(db, range, filter, 'model', 10, providerNameMap),
        provider: getRankings(db, range, filter, 'provider', 10, providerNameMap),
        account: getRankings(db, range, filter, 'account', 10, providerNameMap),
        plan: getRankings(db, range, filter, 'plan', 10, providerNameMap),
      },
      catalog: catalog(),
      startedAt: metaNumber('started_at'),
      firstRecordAt: metaNumber('first_record_at'),
      serverTime: Date.now(),
      noPlanKey: NO_PLAN,
    }
  }

  function records(args) {
    const { range } = resolveRequestedRange(args)
    const filter = parseFilters(args)
    return getRecords(db, range, filter, args?.offset, args?.limit, providerNames())
  }

  const handlers = {
    bootstrap,
    records,
    label(args) {
      setLabel(db, {
        kind: args?.kind,
        providerId: args?.providerId,
        accountId: args?.accountId,
        modelId: args?.modelId,
        name: args?.name,
      })
      invalidateCatalog()
      return { ok: true }
    },
    plan(args) {
      setPlan(db, {
        providerId: args?.providerId,
        accountId: args?.accountId,
        modelId: args?.modelId,
        plan: args?.plan,
      })
      invalidateCatalog()
      return { ok: true }
    },
    settings(args) {
      const current = readSettings()
      const next = { ...current }
      if (args?.numberFormat === 'short' || args?.numberFormat === 'full') next.numberFormat = args.numberFormat
      for (const key of ['lastRange', 'lastCustomFrom', 'lastCustomTo']) {
        if (typeof args?.[key] === 'string') next[key] = args[key]
      }
      for (const key of ['showUnknownRanking', 'showUnknownUsageNote']) {
        if (typeof args?.[key] === 'boolean') next[key] = args[key]
      }
      return writeSettings(next)
    },
    diagnostics() {
      return diagnostics()
    },
  }

  return async function handleApi(request, response) {
    if (request.method !== 'POST') {
      sendJson(response, 405, { ok: false, error: { code: 'method-not-allowed', message: 'use POST' } })
      return
    }
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      sendJson(response, 400, { ok: false, error: { code: error.code ?? 'bad-request', message: String(error.message ?? error) } })
      return
    }
    const method = typeof body.method === 'string' ? body.method : ''
    const handler = handlers[method]
    if (!handler) {
      sendJson(response, 404, { ok: false, error: { code: 'unknown-method', message: `unknown method: ${method}` } })
      return
    }
    try {
      const data = handler(body.args ?? {})
      sendJson(response, 200, { ok: true, data })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: { code: error?.code ?? 'internal', message: String(error?.message ?? error) } })
    }
  }
}
