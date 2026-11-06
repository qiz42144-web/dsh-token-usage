/**
 * Proves the UI test harness catches the React #310 defect.
 *
 * Temporarily moves the chart's `axis` useMemo back below the empty-state early
 * return (the original bug), runs the UI suite, restores the file, and reports
 * whether the suite failed for the expected reason.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const clientPath = join(root, 'client.js')
const backupPath = join(root, 'client.js.guard-backup')

const FIXED = [
  '      const axis = useMemo(() => {',
  '        if (points.length <= 4) return points.slice(0, 4)',
  '        return [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]',
  '      }, [points])',
  '',
  "      if (!points.length) return h('div', { className: 'tu-chartEmpty' }, t('trend.empty'))",
  '',
  '      const active = hover === null ? null : points[hover]',
].join('\n')

const BROKEN = [
  "      if (!points.length) return h('div', { className: 'tu-chartEmpty' }, t('trend.empty'))",
  '',
  '      const active = hover === null ? null : points[hover]',
  '      const axis = useMemo(() => {',
  '        if (points.length <= 4) return points.slice(0, 4)',
  '        return [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]',
  '      }, [points])',
].join('\n')

const source = readFileSync(clientPath, 'utf8')
if (!source.includes(FIXED)) {
  console.error('the fixed chart block was not found; nothing to prove')
  process.exit(2)
}

copyFileSync(clientPath, backupPath)
writeFileSync(clientPath, source.replace(FIXED, BROKEN), 'utf8')

let output = ''
let failed = false
try {
  output = execFileSync(process.execPath, ['--test', 'test/ui.test.mjs'], { cwd: root, encoding: 'utf8' })
} catch (error) {
  failed = true
  output = String(error.stdout ?? '') + String(error.stderr ?? '')
} finally {
  copyFileSync(backupPath, clientPath)
  rmSync(backupPath, { force: true })
}

const caught = /Rendered more hooks than during the previous render in <TrendChart>/.test(output)
const passLine = /ℹ pass (\d+)/.exec(output)
const failLine = /ℹ fail (\d+)/.exec(output)

console.log(JSON.stringify({
  defectReintroduced: true,
  suiteFailed: failed,
  guardCaughtTrendChart: caught,
  pass: passLine ? Number(passLine[1]) : null,
  fail: failLine ? Number(failLine[1]) : null,
  restored: readFileSync(clientPath, 'utf8').includes(FIXED),
}, null, 2))

process.exitCode = caught && failed ? 0 : 1
