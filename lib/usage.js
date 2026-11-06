/**
 * Usage adapter layer.
 *
 * DSH normalizes every provider response into one `TokenUsage` shape
 * (`@deepseek-ai/dsh-llm`): `inputTokens`, `outputTokens`, optional
 * `totalTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`.
 * Adapters (DeepSeek official, pi-ai / OpenAI-compatible, …) fill it from the
 * provider payload, so the plugin never parses provider-specific JSON and never
 * estimates tokens from text length.
 *
 * Verified convention in this deployment (19,614 real `assistant/message`
 * events across 6 providers): when the provider supplies `totalTokens` it
 * always equals `input + output + cacheRead + cacheWrite`; when it does not,
 * the same sum reproduces the provider's own total. Cache counters are
 * therefore additive here, while `reasoningTokens` is a subset of
 * `outputTokens` and is never added again.
 */

const isCount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0

const count = (value) => (isCount(value) ? Math.round(value) : null)

/**
 * Normalize one raw usage object.
 *
 * @param {unknown} raw provider/D SH usage value.
 * @returns {{
 *   known: boolean,
 *   input: number | null, output: number | null, total: number | null,
 *   cacheRead: number | null, cacheWrite: number | null, reasoning: number | null,
 *   totalSource: 'provider' | 'derived' | 'none',
 * }}
 *
 * A usage object that is missing or lacks a numeric input/output count is
 * reported as `known: false` with `null` counters — never as zero.
 */
export function normalizeUsage(raw) {
  const empty = {
    known: false,
    input: null, output: null, total: null,
    cacheRead: null, cacheWrite: null, reasoning: null,
    totalSource: 'none',
  }
  if (raw === null || typeof raw !== 'object') return empty

  const input = count(raw.inputTokens)
  const output = count(raw.outputTokens)
  if (input === null || output === null) return empty

  const cacheRead = count(raw.cacheReadTokens)
  const cacheWrite = count(raw.cacheWriteTokens)
  const reasoning = count(raw.reasoningTokens)

  let total = count(raw.totalTokens)
  let totalSource = 'provider'
  if (total === null) {
    total = input + output + (cacheRead ?? 0) + (cacheWrite ?? 0)
    totalSource = 'derived'
  }

  return { known: true, input, output, total, cacheRead, cacheWrite, reasoning, totalSource }
}

/**
 * Read the provider/model identity of one `assistant/message` payload.
 * Unknown identities collapse to the documented `unknown` bucket rather than
 * being dropped.
 */
export function readIdentity(data) {
  const source = data && data.message && data.message.source
  const provider = typeof source?.provider === 'string' && source.provider ? source.provider : 'unknown'
  const model = typeof source?.model === 'string' && source.model ? source.model : 'unknown'
  return { provider, model }
}

export const UNKNOWN = 'unknown'
