/**
 * Passive recorder.
 *
 * The plugin never wraps, delays or re-drives a model request. It subscribes to
 * the post-commit session feed (`session/event`) and reads the durable
 * `assistant/message` event that DSH writes for every model step. That event
 * carries the provider id, the real model id and the provider-reported
 * `usage` (see `lib/usage.js`).
 *
 * Deduplication uses the durable event sequence: one step is one row keyed
 * `msg:<sessionId>:<seq>`. The Session log is append-only and `seq` is stable,
 * so re-delivery, a plugin reload, or an HMR re-activation cannot double count.
 */

import { insertAttempt, insertRecord, readMeta, timeColumns, writeMeta } from './db.js'
import { normalizeUsage, readIdentity } from './usage.js'

function finiteInt(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

/**
 * @param {object} options
 * @param {import('node:sqlite').DatabaseSync} options.db
 * @param {{ insert: any, insertAttempt: any }} options.statements
 * @param {(error: unknown) => void} [options.onError]
 * @param {boolean} [options.recordAttempts] record steps that produced no
 *   assistant message at all (no usage available) as unknown request rows.
 */
export function createRecorder({ db, statements, onError, recordAttempts = true }) {
  /** Rows written since the process started (diagnostics only). */
  let written = 0
  let dropped = 0

  function markStarted(ts) {
    if (readMeta(db, 'started_at') === null) writeMeta(db, 'started_at', ts)
  }

  function markFirstRecord(ts) {
    const current = readMeta(db, 'first_record_at')
    if (current === null) {
      writeMeta(db, 'first_record_at', ts)
      return
    }
    const previous = Number(current)
    if (Number.isFinite(previous) && ts < previous) writeMeta(db, 'first_record_at', ts)
  }

  function handleMessage(session, event) {
    const data = event.data ?? {}
    const identity = readIdentity(data)
    const usage = normalizeUsage(data.usage)
    const ts = Number.isFinite(event.time) ? event.time : Date.now()
    const { day, week } = timeColumns(ts)
    const record = {
      id: `msg:${session.id}:${event.seq}`,
      sessionId: String(session.id),
      seq: finiteInt(event.seq) ?? 0,
      ts,
      day,
      week,
      turn: finiteInt(data.turn),
      step: finiteInt(data.step),
      providerId: identity.provider,
      modelId: identity.model,
      // An account is the provider's credential source in DSH: one configured
      // provider route is one account. A user may rename it, but the request
      // record keeps this raw id.
      accountId: identity.provider,
      input: usage.input,
      output: usage.output,
      total: usage.total,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      reasoning: usage.reasoning,
      known: usage.known,
      source: 'message',
    }
    written += insertRecord(statements, record)
    markFirstRecord(ts)
  }

  function handleStepEnd(session, event) {
    if (!recordAttempts) return
    const data = event.data ?? {}
    const turn = finiteInt(data.turn)
    const step = finiteInt(data.step)
    if (turn === null || step === null) return
    const ts = Number.isFinite(event.time) ? event.time : Date.now()
    const { day, week } = timeColumns(ts)
    const written_ = insertAttempt(statements, {
      id: `step:${session.id}:${event.seq}`,
      sessionId: String(session.id),
      seq: finiteInt(event.seq) ?? 0,
      ts,
      day,
      week,
      turn,
      step,
    })
    if (written_ > 0) {
      written += written_
      markFirstRecord(ts)
    }
  }

  /**
   * One session event. Never throws: a recorder failure must not reach the
   * Session emitter that DSH drives its own commit feed through.
   */
  function handle(session, event) {
    try {
      if (!session || typeof session.id !== 'string' || !event || typeof event.type !== 'string') return
      if (typeof event.seq !== 'number' || !Number.isFinite(event.seq)) { dropped++; return }
      if (event.type === 'assistant/message') {
        markStarted(Number.isFinite(event.time) ? event.time : Date.now())
        handleMessage(session, event)
      } else if (event.type === 'step/end') {
        handleStepEnd(session, event)
      }
    } catch (error) {
      dropped++
      try { onError?.(error) } catch {}
    }
  }

  return {
    handle,
    stats: () => ({ written, dropped }),
  }
}
