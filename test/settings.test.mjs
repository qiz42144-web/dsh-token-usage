import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { DEFAULT_SETTINGS, readSettings, writeSettings } from '../lib/settings.js'

function withTempFile(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-token-usage-settings-'))
  const file = join(dir, 'settings.json')
  try {
    return fn(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a missing settings file yields the documented defaults', () => {
  withTempFile((file) => {
    const settings = readSettings(file)
    assert.equal(settings.showUnknownRanking, false, 'unidentified ranking rows are hidden by default')
    assert.equal(settings.showUnknownUsageNote, true, 'the missing-usage note is on by default')
    assert.equal(settings.numberFormat, 'short')
    assert.equal(settings.lastRange, 'today')
  })
})

test('a settings file written before this feature keeps working', () => {
  withTempFile((file) => {
    // Exactly the shape the previous version wrote: no new keys at all.
    writeFileSync(file, JSON.stringify({
      numberFormat: 'full',
      lastRange: 'month',
      lastCustomFrom: '2026-11-01',
      lastCustomTo: '2026-11-04',
    }, null, 2))

    const settings = readSettings(file)
    assert.equal(settings.numberFormat, 'full', 'existing values are preserved')
    assert.equal(settings.lastRange, 'month')
    assert.equal(settings.lastCustomFrom, '2026-11-01')
    assert.equal(settings.showUnknownRanking, false, 'the new key falls back to its default')
    assert.equal(settings.showUnknownUsageNote, true)
  })
})

test('explicit choices round-trip through the file', () => {
  withTempFile((file) => {
    writeSettings(file, { ...DEFAULT_SETTINGS, showUnknownRanking: true, showUnknownUsageNote: false })
    const settings = readSettings(file)
    assert.equal(settings.showUnknownRanking, true)
    assert.equal(settings.showUnknownUsageNote, false)
  })
})

test('only a real boolean flips the flags', () => {
  withTempFile((file) => {
    writeFileSync(file, JSON.stringify({ showUnknownRanking: 'yes', showUnknownUsageNote: 0 }))
    const settings = readSettings(file)
    assert.equal(settings.showUnknownRanking, false, 'a string is not a true')
    assert.equal(settings.showUnknownUsageNote, true, 'a number is not a false')
  })
})

test('a corrupt or non-object file falls back to the defaults', () => {
  withTempFile((file) => {
    for (const body of ['{not json', '[]', 'null', '"text"']) {
      writeFileSync(file, body)
      const settings = readSettings(file)
      assert.equal(settings.showUnknownRanking, false, body)
      assert.equal(settings.showUnknownUsageNote, true, body)
      assert.equal(settings.numberFormat, 'short', body)
    }
  })
})

test('changing one preference leaves the others untouched', () => {
  withTempFile((file) => {
    writeSettings(file, {
      numberFormat: 'full',
      lastRange: 'year',
      lastCustomFrom: '2026-01-01',
      lastCustomTo: '2026-12-31',
      showUnknownRanking: false,
      showUnknownUsageNote: true,
    })
    // What the settings RPC does: merge one key into the current projection.
    const current = readSettings(file)
    writeSettings(file, { ...current, showUnknownRanking: true })

    const after = readSettings(file)
    assert.equal(after.showUnknownRanking, true)
    assert.equal(after.numberFormat, 'full', 'the number format survives')
    assert.equal(after.lastRange, 'year')
    assert.equal(after.lastCustomFrom, '2026-01-01')
    assert.equal(after.showUnknownUsageNote, true)
  })
})
