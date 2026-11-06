import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

import {
  addDays,
  bucketKey,
  bucketKeysInRange,
  bucketNext,
  bucketStart,
  dayKey,
  defaultGranularityFor,
  granularityOptionsFor,
  monthKey,
  parseLocal,
  resolveRange,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  weekKey,
  yearKey,
} from '../lib/time.js'

const at = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm, 0, 0).getTime()

test('day, week, month and year keys use the local calendar', () => {
  const ts = at(2026, 11, 4, 19, 15)
  assert.equal(dayKey(ts), '2026-11-04')
  assert.equal(monthKey(ts), '2026-11')
  assert.equal(yearKey(ts), '2026')
  const week = startOfWeek(ts)
  assert.equal(new Date(week).getDay(), 1, 'weeks start on Monday')
  assert.equal(weekKey(ts), dayKey(week))
  assert.ok(week <= startOfDay(ts))
  assert.equal(startOfMonth(ts), at(2026, 11, 1, 0, 0))
  assert.equal(startOfYear(ts), at(2026, 1, 1, 0, 0))
})

test('today is the local day around the instant, not a fixed 24h window', () => {
  const now = at(2026, 11, 4, 19, 15)
  const range = resolveRange('today', { now })
  assert.equal(range.kind, 'today')
  assert.equal(dayKey(range.from), '2026-11-04')
  assert.equal(dayKey(range.to), '2026-11-05')
  assert.ok(range.from <= now && now < range.to)
})

test('this week spans Monday to Monday', () => {
  const now = at(2026, 11, 4, 19, 15)
  const range = resolveRange('week', { now })
  assert.equal(new Date(range.from).getDay(), 1)
  assert.equal(new Date(range.to).getDay(), 1)
  assert.equal(range.to, addDays(range.from, 7))
  assert.ok(range.from <= now && now < range.to)
})

test('this month and this year use calendar boundaries', () => {
  const now = at(2026, 11, 4, 19, 15)
  const month = resolveRange('month', { now })
  assert.equal(startOfMonth(month.from), month.from)
  assert.equal(dayKey(month.from), '2026-11-01')
  assert.equal(dayKey(month.to), '2026-12-01')

  const year = resolveRange('year', { now })
  assert.equal(dayKey(year.from), '2026-01-01')
  assert.equal(dayKey(year.to), '2027-01-01')
})

test('all time is clamped to the first recorded instant', () => {
  const now = at(2026, 11, 4, 19, 15)
  const first = at(2026, 9, 22, 9, 0)
  const range = resolveRange('all', { now, firstRecordAt: first })
  assert.equal(range.from, first)
  assert.equal(range.to, now + 1)
  const empty = resolveRange('all', { now })
  assert.equal(empty.from, now)
})

test('a custom date range covers whole local days', () => {
  const range = resolveRange('custom', { from: '2026-11-01', to: '2026-11-04' })
  assert.equal(range.kind, 'custom')
  assert.equal(dayKey(range.from), '2026-11-01')
  assert.equal(dayKey(range.from), '2026-11-01')
  // `to` is inclusive of the named day.
  assert.equal(dayKey(range.to), '2026-11-05')
})

test('a custom range crossing month and year boundaries is exact', () => {
  const range = resolveRange('custom', { from: '2026-12-30', to: '2027-01-02' })
  assert.equal(dayKey(range.from), '2026-12-30')
  assert.equal(dayKey(range.to), '2027-01-03')
  const wide = resolveRange('custom', { from: '2026-01-01', to: '2026-12-31' })
  assert.equal(dayKey(wide.from), '2026-01-01')
  assert.equal(dayKey(wide.to), '2027-01-01')
})

test('a custom range accepts explicit times', () => {
  const range = resolveRange('custom', { from: '2026-11-01T08:30', to: '2026-11-01T18:00' })
  const from = new Date(range.from)
  const to = new Date(range.to)
  assert.equal(from.getHours(), 8)
  assert.equal(from.getMinutes(), 30)
  assert.equal(to.getHours(), 18)
  assert.equal(to.getMinutes(), 0)
  assert.ok(range.to > range.from)
})

test('an inverted custom range is widened to one day instead of returning nothing', () => {
  const range = resolveRange('custom', { from: '2026-11-05', to: '2026-11-01' })
  assert.ok(range.to > range.from)
  assert.equal(dayKey(range.from), '2026-11-05')
})

test('parseLocal rejects partial or impossible input', () => {
  assert.equal(parseLocal('2026-11-04'), at(2026, 11, 4, 0, 0))
  assert.equal(parseLocal('2026-11-04T07:05'), at(2026, 11, 4, 7, 5))
  assert.equal(parseLocal('2026-11-04 07:05:30'), at(2026, 11, 4, 7, 5) + 30000)
  assert.equal(parseLocal('2026-11'), null)
  assert.equal(parseLocal('11/04/2026'), null)
  assert.equal(parseLocal(''), null)
  assert.equal(parseLocal(null), null)
})

test('each named range offers only the granularities that stay readable', () => {
  const day = 86400000
  const from = at(2026, 1, 1, 0, 0)

  assert.deepEqual(granularityOptionsFor('today', from, from + day), ['hour'])
  assert.deepEqual(granularityOptionsFor('week', from, from + 7 * day), ['day'])
  assert.deepEqual(granularityOptionsFor('month', from, from + 30 * day), ['day', 'week'])
  // A whole year opens on days, which is what the heatmap draws.
  assert.deepEqual(granularityOptionsFor('year', from, from + 365 * day), ['day', 'week', 'month'])

  // The default is the finest option the range offers.
  assert.equal(defaultGranularityFor('today', from, from + day), 'hour')
  assert.equal(defaultGranularityFor('week', from, from + 7 * day), 'day')
  assert.equal(defaultGranularityFor('month', from, from + 30 * day), 'day')
  assert.equal(defaultGranularityFor('year', from, from + 365 * day), 'day')
})

test('all always works in weeks, months and years', () => {
  const day = 86400000
  const from = at(2026, 1, 1, 0, 0)
  // Whatever the span, "all" stays coarse: hourly and daily buckets would be
  // unreadable once the history is long.
  assert.deepEqual(granularityOptionsFor('all', from, from + 2 * day), ['week', 'month', 'year'])
  assert.deepEqual(granularityOptionsFor('all', from, from + 30 * day), ['week', 'month', 'year'])
  assert.deepEqual(granularityOptionsFor('all', from, from + 900 * day), ['week', 'month', 'year'])
  assert.equal(defaultGranularityFor('all', from, from + 30 * day), 'week')
})

test('custom follows the real span instead of a fixed list', () => {
  const day = 86400000
  const from = at(2026, 1, 1, 0, 0)
  // One day still fits hourly buckets.
  assert.deepEqual(granularityOptionsFor('custom', from, from + day), ['hour', 'day'])
  // Past a day hourly would draw fifty-plus thin bars, so only days are offered.
  assert.deepEqual(granularityOptionsFor('custom', from, from + 2 * day), ['day'])
  assert.deepEqual(granularityOptionsFor('custom', from, from + 3 * day), ['day'])
  assert.deepEqual(granularityOptionsFor('custom', from, from + 30 * day), ['day', 'week'])
  assert.deepEqual(granularityOptionsFor('custom', from, from + 200 * day), ['week', 'month'])
  assert.deepEqual(granularityOptionsFor('custom', from, from + 2000 * day), ['month', 'year'])
  // A zero-length span still yields a usable option.
  assert.deepEqual(granularityOptionsFor('custom', from, from), ['hour', 'day'])
})

test('hourly buckets are local hours and cover the range', () => {
  const from = at(2026, 11, 4, 22, 0)
  const to = at(2026, 11, 5, 2, 0)
  assert.deepEqual(bucketKeysInRange(from, to, 'hour'), [
    '2026-11-04T22', '2026-11-04T23', '2026-11-05T00', '2026-11-05T01',
  ])
  assert.equal(bucketKey(at(2026, 11, 4, 22, 45), 'hour'), '2026-11-04T22')
  assert.equal(bucketStart(at(2026, 11, 4, 22, 45), 'hour'), at(2026, 11, 4, 22, 0))
  assert.equal(bucketNext(at(2026, 11, 4, 22, 45), 'hour'), at(2026, 11, 4, 23, 0))
  // Crossing midnight rolls the date forward.
  assert.equal(bucketNext(at(2026, 11, 4, 23, 30), 'hour'), at(2026, 11, 5, 0, 0))
})

test('bucket keys cover every period in a range, including empty ones', () => {
  const from = at(2026, 10, 28, 0, 0)
  const to = at(2026, 11, 3, 0, 0)
  const days = bucketKeysInRange(from, to, 'day')
  assert.deepEqual(days, ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  const months = bucketKeysInRange(at(2026, 1, 1, 0, 0), at(2026, 4, 1, 0, 0), 'month')
  assert.deepEqual(months, ['2026-01', '2026-02', '2026-03'])
  const years = bucketKeysInRange(at(2025, 6, 1, 0, 0), at(2028, 1, 1, 0, 0), 'year')
  assert.deepEqual(years, ['2025', '2026', '2027'])
  assert.equal(bucketKey(at(2026, 11, 4, 23, 59), 'day'), '2026-11-04')
})

test('a DST-observing timezone keeps one calendar day per local day', () => {
  // Asia/Shanghai has no DST, so the transition behaviour is asserted in a child
  // process pinned to a zone that does.
  const script = `
    import { dayKey, addDays, startOfDay, resolveRange } from ${JSON.stringify(new URL('../lib/time.js', import.meta.url).href)};
    const spring = new Date(2026, 2, 8, 12, 0, 0, 0).getTime();   // the spring-forward day in America/New_York
    const before = new Date(2026, 2, 7, 12, 0, 0, 0).getTime();
    const fall = new Date(2026, 10, 1, 12, 0, 0, 0).getTime();    // the fall-back day
    const today = resolveRange('today', { now: spring });
    console.log(JSON.stringify({
      day: dayKey(before),
      nextDay: dayKey(addDays(startOfDay(before), 1)),
      todayLength: today.to - today.from,
      springDayLength: addDays(startOfDay(spring), 1) - startOfDay(spring),
      fallDayLength: addDays(startOfDay(fall), 1) - startOfDay(fall),
    }));
  `
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
  })
  const result = JSON.parse(out.trim())
  assert.equal(result.day, '2026-03-07')
  assert.equal(result.nextDay, '2026-03-08')
  // The spring-forward local day is 23 hours long and the fall-back day is 25,
  // yet each is still exactly one calendar day with the right date key.
  assert.equal(result.springDayLength, 23 * 3600 * 1000)
  assert.equal(result.todayLength, 23 * 3600 * 1000)
  assert.equal(result.fallDayLength, 25 * 3600 * 1000)
})
