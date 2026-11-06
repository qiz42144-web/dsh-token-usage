import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeUsage, readIdentity } from '../lib/usage.js'

test('a missing usage object is unknown, never zero', () => {
  for (const raw of [undefined, null, {}, 42, 'n/a']) {
    const usage = normalizeUsage(raw)
    assert.equal(usage.known, false)
    assert.equal(usage.input, null)
    assert.equal(usage.output, null)
    assert.equal(usage.total, null)
  }
})

test('input and output alone are enough to be known', () => {
  const usage = normalizeUsage({ inputTokens: 100, outputTokens: 20 })
  assert.equal(usage.known, true)
  assert.equal(usage.input, 100)
  assert.equal(usage.output, 20)
  assert.equal(usage.total, 120)
  assert.equal(usage.totalSource, 'derived')
})

test('a provider total wins over the derived sum', () => {
  const usage = normalizeUsage({ inputTokens: 100, outputTokens: 20, totalTokens: 130 })
  assert.equal(usage.total, 130)
  assert.equal(usage.totalSource, 'provider')
})

test('cache counters are additive, as every adapter in this deployment reports them', () => {
  // Real shape from a live assistant/message event.
  const usage = normalizeUsage({ inputTokens: 20525, outputTokens: 172, totalTokens: 21209, cacheReadTokens: 512 })
  assert.equal(usage.total, 21209)
  assert.equal(usage.input + usage.output + usage.cacheRead, 21209)
})

test('reasoning tokens are never added to the total again', () => {
  const usage = normalizeUsage({ inputTokens: 10, outputTokens: 90, reasoningTokens: 60 })
  assert.equal(usage.total, 100, 'reasoning is a subset of output')
  const declared = normalizeUsage({ inputTokens: 10, outputTokens: 90, reasoningTokens: 60, totalTokens: 100 })
  assert.equal(declared.total, 100)
})

test('counts are integers and negative or non-finite values are rejected', () => {
  assert.equal(normalizeUsage({ inputTokens: 10.7, outputTokens: 3.2 }).input, 11)
  assert.equal(normalizeUsage({ inputTokens: 10.2, outputTokens: 3.2 }).output, 3)
  assert.equal(normalizeUsage({ inputTokens: -5, outputTokens: 3 }).known, false)
  assert.equal(normalizeUsage({ inputTokens: Number.NaN, outputTokens: 3 }).known, false)
  assert.equal(normalizeUsage({ inputTokens: '10', outputTokens: 3 }).known, false)
})

test('identity falls back to the unknown bucket instead of dropping the record', () => {
  assert.deepEqual(readIdentity({ message: { source: { kind: 'model', provider: 'baidu', model: 'glm-5.3' } } }), { provider: 'baidu', model: 'glm-5.3' })
  assert.deepEqual(readIdentity({ message: {} }), { provider: 'unknown', model: 'unknown' })
  assert.deepEqual(readIdentity({}), { provider: 'unknown', model: 'unknown' })
  assert.deepEqual(readIdentity(null), { provider: 'unknown', model: 'unknown' })
})
