// Show what happened around the steps that produced no assistant message.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const sessionId = process.argv[2]
const targets = (process.argv[3] ?? '').split(',').map(Number).filter(Number.isFinite)

function decode(file) {
  const buf = readFileSync(file)
  const offs = []
  let i = 0
  while ((i = buf.indexOf(MAGIC, i)) !== -1) { offs.push(i); i += 4 }
  const parts = []
  for (let k = 0; k < offs.length; k++) {
    const end = k + 1 < offs.length ? offs[k + 1] : buf.length
    try { parts.push(zstdDecompressSync(buf.subarray(offs[k], end)).toString('utf8')) } catch {}
  }
  return parts.join('')
}

function find(dir, depth = 0) {
  if (depth > 4) return null
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return null }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === sessionId) {
        const file = readdirSync(path).find((name) => name.endsWith('.jsonl.zstd'))
        if (file) return join(path, file)
      }
      const found = find(path, depth + 1)
      if (found) return found
    }
  }
  return null
}

const file = find('E:/dsh/sessions')
if (!file) { console.error('session log not found'); process.exit(1) }
console.log('log:', file)

const events = decode(file).split('\n').filter(Boolean).map((line) => {
  try { return JSON.parse(line) } catch { return null }
}).filter(Boolean)

for (const target of targets) {
  console.log(`\n=== around seq ${target} ===`)
  const near = events.filter((event) => Math.abs(event.seq - target) <= 3)
  for (const event of near) {
    const data = event.data ?? {}
    const summary = event.type === 'assistant/message'
      ? `provider=${data.message?.source?.provider} model=${data.message?.source?.model} usage=${data.usage ? 'yes' : 'NO'}`
      : event.type === 'assistant/attempt'
        ? `finish=${JSON.stringify(data.stream?.at(-1)?.chunk?.reason ?? null).slice(0, 160)}`
        : event.type === 'turn/end'
          ? `reason=${JSON.stringify(data.reason ?? null)}`
          : ''
    console.log(`  seq ${String(event.seq).padStart(5)}  ${event.type.padEnd(22)} turn=${data.turn ?? '-'} step=${data.step ?? '-'}  ${summary}`)
  }
}
