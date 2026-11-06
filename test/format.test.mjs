import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * The number formatter lives in the Client bundle, which is a plain browser
 * script with no module system. The test therefore lifts the shipped function
 * bodies out of `client.js` instead of testing a copy, so the assertions cover
 * the code the page actually runs.
 */
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

function lift(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} must exist in client.js`)
  let depth = 0
  let index = source.indexOf('{', start)
  for (; index < source.length; index++) {
    if (source[index] === '{') depth++
    else if (source[index] === '}') {
      depth--
      if (depth === 0) { index++; break }
    }
  }
  return source.slice(start, index)
}

const trimZeros = new Function(`return (${lift('trimZeros')})`)()
const formatShort = new Function('trimZeros', `return (${lift('formatShort')})`)(trimZeros)
const formatFull = new Function(`return (${lift('formatFull')})`)()

test('short format matches the specified examples', () => {
  assert.equal(formatShort(0), '0')
  assert.equal(formatShort(999), '999')
  assert.equal(formatShort(1000), '1K')
  assert.equal(formatShort(1500), '1.5K')
  assert.equal(formatShort(1_000_000), '1M')
  assert.equal(formatShort(1_000_000_000), '1B')
  assert.equal(formatShort(4_000_000_000), '4B')
  assert.equal(formatShort(4_250_000_000), '4.25B')
  assert.equal(formatShort(4_250_000), '4.25M')
})

test('short format trims trailing zeros and never prints a bare dot', () => {
  assert.equal(formatShort(2_000_000), '2M')
  assert.equal(formatShort(2_500_000), '2.5M')
  assert.equal(formatShort(1_010_000), '1.01M')
  assert.ok(!formatShort(3_000_000).includes('.'))
})

test('short format rounds up into the next unit instead of printing 1000K', () => {
  assert.equal(formatShort(999_999), '1M')
  assert.equal(formatShort(999_999_999), '1B')
})

test('full format groups thousands with commas', () => {
  assert.equal(formatFull(0), '0')
  assert.equal(formatFull(999), '999')
  assert.equal(formatFull(1000), '1,000')
  assert.equal(formatFull(1_000_000), '1,000,000')
  assert.equal(formatFull(1_000_000_000), '1,000,000,000')
  assert.equal(formatFull(4_000_000_000), '4,000,000,000')
  assert.equal(formatFull(1_234_567_890), '1,234,567,890')
})

test('both modes keep the full integer value', () => {
  const value = 4_254_321_987
  assert.equal(formatShort(value), '4.25B')
  assert.equal(formatFull(value), '4,254,321,987')
  // The short form is a rendering of the same integer; it is never rounded back
  // into storage, because the plugin stores integers only.
  assert.equal(Number(formatFull(value).replace(/,/g, '')), value)
})
