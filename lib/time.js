/**
 * Local-calendar time handling.
 *
 * Every boundary is computed from the host's local calendar with `Date`
 * component setters, never by adding fixed millisecond offsets. `setHours(0,0,0,0)`
 * and `setDate(getDate() + 1)` therefore stay correct across a DST transition
 * (a 23- or 25-hour local day keeps one calendar day), across months and across
 * years.
 *
 * Buckets are persisted per record at write time (`day` and `week`), so the
 * history keeps the calendar day it was recorded on even if the machine's
 * timezone is changed later.
 */

export const MS_PER_DAY = 86400000

/** Local midnight of the day containing `ts`. */
export function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Local midnight `n` calendar days after the day containing `ts`. */
export function addDays(ts, n) {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** Monday 00:00 of the ISO week containing `ts`. */
export function startOfWeek(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const mondayBased = (d.getDay() + 6) % 7 // Sunday 0 -> 6, Monday 1 -> 0
  d.setDate(d.getDate() - mondayBased)
  return d.getTime()
}

/** First day of the month containing `ts`, at 00:00. */
export function startOfMonth(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d.getTime()
}

/** First day of the month `n` months after the month containing `ts`. */
export function addMonths(ts, n) {
  const d = new Date(ts)
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return d.getTime()
}

/** January 1st of the year containing `ts`, at 00:00. */
export function startOfYear(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setMonth(0, 1)
  return d.getTime()
}

export function addYears(ts, n) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setMonth(0, 1)
  d.setFullYear(d.getFullYear() + n)
  return d.getTime()
}

const pad = (n) => (n < 10 ? '0' + n : String(n))

/** Local `YYYY-MM-DD`. */
export function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local `YYYY-MM-DD` of the Monday starting the ISO week containing `ts`. */
export function weekKey(ts) {
  return dayKey(startOfWeek(ts))
}

/** Local `YYYY-MM` of the month containing `ts`. */
export function monthKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** Local `YYYY` of the year containing `ts`. */
export function yearKey(ts) {
  return String(new Date(ts).getFullYear())
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Parse a local calendar date (`YYYY-MM-DD`) or date-time (`YYYY-MM-DDTHH:mm[:ss]`).
 * Returns epoch milliseconds, or `null` when the input is not a valid local time.
 */
export function parseLocal(input) {
  if (typeof input !== 'string') return null
  const text = input.trim()
  let m = DATE_RE.exec(text)
  if (m) {
    const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime()
    return Number.isFinite(ts) ? ts : null
  }
  m = DATETIME_RE.exec(text)
  if (m) {
    const ts = new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6] ?? 0), 0,
    ).getTime()
    return Number.isFinite(ts) ? ts : null
  }
  return null
}

/** True when the input carries a clock component rather than a bare date. */
export function hasTimeOfDay(input) {
  return typeof input === 'string' && DATETIME_RE.test(input.trim())
}

export const RANGE_KINDS = ['today', 'week', 'month', 'year', 'all', 'custom']

/**
 * Resolve a named or custom range into a half-open epoch interval `[from, to)`.
 *
 * `firstRecordAt` clamps the open-ended `all` range so that the span reflects
 * what is actually recorded instead of the epoch.
 *
 * @returns {{kind: string, from: number, to: number}}
 */
export function resolveRange(kind, options = {}) {
  const now = options.now ?? Date.now()
  switch (kind) {
    case 'week': {
      const from = startOfWeek(now)
      return { kind, from, to: addDays(from, 7) }
    }
    case 'month': {
      const from = startOfMonth(now)
      return { kind, from, to: addMonths(from, 1) }
    }
    case 'year': {
      const from = startOfYear(now)
      return { kind, from, to: addYears(from, 1) }
    }
    case 'all': {
      const first = Number.isFinite(options.firstRecordAt) ? options.firstRecordAt : now
      return { kind, from: Math.min(first, now), to: now + 1 }
    }
    case 'custom': {
      const rawFrom = options.from
      const rawTo = options.to
      let from = parseLocal(rawFrom)
      let to = parseLocal(rawTo)
      if (from === null && to === null) return resolveRange('today', { now })
      if (from === null) from = startOfDay(to)
      // A bare `to` date means the whole local day; an explicit time is used as-is.
      if (to === null) to = now
      else if (!hasTimeOfDay(rawTo)) to = addDays(startOfDay(to), 1)
      else to += 1000
      if (to <= from) to = addDays(startOfDay(from), 1)
      return { kind: 'custom', from, to }
    }
    case 'today':
    default: {
      const from = startOfDay(now)
      return { kind: 'today', from, to: addDays(from, 1) }
    }
  }
}

export const GRANULARITIES = ['hour', 'day', 'week', 'month', 'year']

/**
 * Which granularities each named range offers.
 *
 * The list is deliberately narrow: a range only offers the buckets that keep
 * the chart readable. `year` has no `day` (365 bars) and no `year` (a single
 * bar), and `today` has no `day` (a single bar) — the summary card already
 * answers those questions.
 */
export const RANGE_GRANULARITIES = Object.freeze({
  today: ['hour'],
  week: ['day'],
  month: ['day', 'week'],
  // A whole year opens on days: that is what the heatmap draws. Weeks and
  // months stay available for the bar chart.
  year: ['day', 'week', 'month'],
  // "All" covers the whole history, so it always works in weeks, months or
  // years — hourly and daily buckets would be unreadable on a long span.
  all: ['week', 'month', 'year'],
})

/** Local `YYYY-MM-DDTHH` of the hour containing `ts`. */
export function hourKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`
}

/** Local hour start of the hour containing `ts`. */
export function startOfHour(ts) {
  const d = new Date(ts)
  d.setMinutes(0, 0, 0)
  return d.getTime()
}

/** The instant one local hour after `ts`'s hour start. */
export function addHours(ts, n) {
  const d = new Date(ts)
  d.setHours(d.getHours() + n)
  return d.getTime()
}

/**
 * The granularities a range may use. `all` and `custom` follow the real span
 * instead of a fixed list, so a two-month custom range offers days and weeks
 * while a three-year one offers months and years.
 */
export function granularityOptionsFor(kind, from, to) {
  const fixed = RANGE_GRANULARITIES[kind]
  if (fixed) return fixed.slice()
  const days = Math.max(0, to - from) / MS_PER_DAY
  // Hourly stays readable up to about one day. Beyond that a 2-3 day range
  // would draw fifty-plus thin bars, many of them a single pixel tall and hard
  // to point at, so those ranges open on days instead.
  if (days <= 1) return ['hour', 'day']
  if (days <= 3) return ['day']
  if (days <= 70) return ['day', 'week']
  if (days <= 800) return ['week', 'month']
  return ['month', 'year']
}

/** The granularity a range opens with: the finest one it offers. */
export function defaultGranularityFor(kind, from, to) {
  return granularityOptionsFor(kind, from, to)[0]
}

/** Pick a readable granularity for a span; the user may override it. */
export function autoGranularity(from, to) {
  return defaultGranularityFor('custom', from, to)
}

/** Bucket key of `ts` for one granularity. */
export function bucketKey(ts, granularity) {
  switch (granularity) {
    case 'hour': return hourKey(ts)
    case 'week': return weekKey(ts)
    case 'month': return monthKey(ts)
    case 'year': return yearKey(ts)
    case 'day':
    default: return dayKey(ts)
  }
}

/** First instant of the bucket that `ts` belongs to. */
export function bucketStart(ts, granularity) {
  switch (granularity) {
    case 'hour': return startOfHour(ts)
    case 'week': return startOfWeek(ts)
    case 'month': return startOfMonth(ts)
    case 'year': return startOfYear(ts)
    case 'day':
    default: return startOfDay(ts)
  }
}

/** The instant after the bucket that `ts` belongs to. */
export function bucketNext(ts, granularity) {
  switch (granularity) {
    case 'hour': return addHours(startOfHour(ts), 1)
    case 'week': return addDays(startOfWeek(ts), 7)
    case 'month': return addMonths(startOfMonth(ts), 1)
    case 'year': return addYears(startOfYear(ts), 1)
    case 'day':
    default: return addDays(startOfDay(ts), 1)
  }
}

/**
 * Every bucket key in `[from, to)`, so a chart can render empty periods.
 * Clamped to `maxBuckets` entries to keep a pathological range cheap.
 */
export function bucketKeysInRange(from, to, granularity, maxBuckets = 4000) {
  const keys = []
  let cursor = bucketStart(from, granularity)
  for (let i = 0; cursor < to && i < maxBuckets; i++) {
    keys.push(bucketKey(cursor, granularity))
    cursor = bucketNext(cursor, granularity)
  }
  return keys
}
