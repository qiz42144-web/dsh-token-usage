/**
 * User preferences, stored beside the history database but in a separate file
 * so configuration and request records never share one medium.
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs'

export const DEFAULT_SETTINGS = Object.freeze({
  /** 'short' → 4.25B, 'full' → 4,250,000,000 */
  numberFormat: 'short',
  /** Last range the user looked at, restored on the next visit. */
  lastRange: 'today',
  lastCustomFrom: '',
  lastCustomTo: '',
  /** Show the synthetic "unidentified" row in the rankings. */
  showUnknownRanking: false,
  /** Show the "N requests returned no usage" note above the metrics. */
  showUnknownUsageNote: true,
})

export function readSettings(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }
    return {
      numberFormat: parsed.numberFormat === 'full' ? 'full' : 'short',
      lastRange: typeof parsed.lastRange === 'string' ? parsed.lastRange : DEFAULT_SETTINGS.lastRange,
      lastCustomFrom: typeof parsed.lastCustomFrom === 'string' ? parsed.lastCustomFrom : '',
      lastCustomTo: typeof parsed.lastCustomTo === 'string' ? parsed.lastCustomTo : '',
      // An absent key means "never chosen", so it falls back to the documented
      // default instead of whatever a falsy coercion would produce.
      showUnknownRanking: parsed.showUnknownRanking === true,
      showUnknownUsageNote: parsed.showUnknownUsageNote !== false,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeSettings(file, next) {
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8')
  renameSync(temp, file)
  return next
}
