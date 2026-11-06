/**
 * dsh-token-usage — Client half.
 *
 * Renders one full page in the `main` slot plus its sidebar icon. All numbers
 * arrive pre-aggregated from the Host API; the browser only formats and draws.
 * No chart library, no animation, no polling: two local requests per view
 * change (page data + first record page), then nothing while the page sits open.
 */
window.__ModuleLoader__.load({
  // Must match the package name exactly: the loader looks the module up by the
  // specifier it served, and rejects a bundle that registers anything else.
  id: '@aixnest/dsh-token-usage',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } = React

    const NS = 'token-usage'
    const PANEL_ID = 'token-usage'
    const API_PATH = '/dsh-token-usage/api/v1/rpc'
    const NO_PLAN_KEY = '__none__'
    const PAGE_SIZE = 50

    // ------------------------------------------------------------------ i18n
    const DICT_EN = {
      nav: 'Token Usage',
      panelTitle: 'Token Usage',
      'range.today': 'Today',
      'range.week': 'This week',
      'range.month': 'This month',
      'range.year': 'This year',
      'range.all': 'All time',
      'range.custom': 'Custom',
      'range.from': 'Start date',
      'range.to': 'End date',
      'range.apply': 'Apply',
      'range.placeholder': 'YYYY/MM/DD',
      'cal.prev': 'Previous month',
      'cal.next': 'Next month',
      'cal.quick': 'Jump to',
      'cal.year': 'Year',
      'cal.month': 'Month',
      'metric.total': 'Total',
      'metric.input': 'Input',
      'metric.output': 'Output',
      'metric.cache': 'Cached',
      'metric.cacheHit': 'Cache hit rate',
      'metric.reasoning': 'Reasoning',
      'metric.requests': 'Requests',
      'format.label': 'Number format',
      'format.short': 'Short',
      'format.full': 'Full',
      'filter.all': 'All models',
      'filter.search': 'Search models',
      'filter.clear': 'Clear filter',
      'filter.plan': 'Plan',
      'filter.noPlan': 'No plan',
      'filter.rename': 'Rename',
      'filter.setPlan': 'Set plan',
      'filter.save': 'Save',
      'filter.cancel': 'Cancel',
      'filter.empty': 'No data yet',
      'filter.unknown': 'Unidentified',
      'trend.title': 'Trend',
      'trend.hour': 'Hour',
      'trend.day': 'Day',
      'trend.week': 'Week',
      'trend.month': 'Month',
      'trend.year': 'Year',
      'trend.empty': 'No data in this range',
      'heat.hasUsage': 'Has usage',
      'heat.noUsage': 'No usage',
      'heat.future': 'Not reached yet',
      'rank.title': 'Ranking',
      'rank.model': 'Model',
      'rank.provider': 'Provider',
      'rank.account': 'Account',
      'rank.plan': 'Plan',
      'rank.empty': 'No data in this range',
      'records.title': 'Requests',
      'records.time': 'Time',
      'records.provider': 'Provider',
      'records.model': 'Model',
      'records.input': 'Input',
      'records.output': 'Output',
      'records.total': 'Total',
      'records.more': 'Load more',
      'records.empty': 'No requests recorded yet',
      'records.unknown': 'Unknown',
      'records.note': 'Prompts, replies, API keys and request bodies are never stored.',
      'status.since': 'Recording since',
      'status.unknownNote': '{n} request(s) returned no usage and are excluded from the totals',
      'status.unknownDismiss': "Don't show again",
      'settings.label': 'Settings',
      'settings.showUnknownRanking': 'Show unidentified ranking rows',
      'settings.showUnknownUsageNote': 'Show the missing-usage note',
      'status.failed': 'Failed to load statistics',
      'status.retry': 'Retry',
    }

    const DICT_ZH = {
      nav: 'Token 用量',
      panelTitle: 'Token 用量',
      'range.today': '今日',
      'range.week': '本周',
      'range.month': '本月',
      'range.year': '本年',
      'range.all': '全部',
      'range.custom': '自定义',
      'range.from': '开始日期',
      'range.to': '结束日期',
      'range.apply': '应用',
      'range.placeholder': '年/月/日',
      'cal.prev': '上个月',
      'cal.next': '下个月',
      'cal.quick': '快速选择',
      'cal.year': '年份',
      'cal.month': '月份',
      'metric.total': '总计',
      'metric.input': '输入',
      'metric.output': '输出',
      'metric.cache': '缓存',
      'metric.cacheHit': '缓存命中率',
      'metric.reasoning': '推理',
      'metric.requests': '请求数',
      'format.label': '数字格式',
      'format.short': '简写',
      'format.full': '完整',
      'filter.all': '全部模型',
      'filter.search': '搜索模型',
      'filter.clear': '清除筛选',
      'filter.plan': '套餐',
      'filter.noPlan': '未设置套餐',
      'filter.rename': '重命名',
      'filter.setPlan': '设置套餐',
      'filter.save': '保存',
      'filter.cancel': '取消',
      'filter.empty': '暂无数据',
      'filter.unknown': '未识别',
      'trend.title': '趋势',
      'trend.hour': '按小时',
      'trend.day': '按日',
      'trend.week': '按周',
      'trend.month': '按月',
      'trend.year': '按年',
      'trend.empty': '该时间段没有数据',
      'heat.hasUsage': '有用量',
      'heat.noUsage': '无用量',
      'heat.future': '尚未到达',
      'rank.title': '排行',
      'rank.model': '模型',
      'rank.provider': 'Provider',
      'rank.account': '账号',
      'rank.plan': '套餐',
      'rank.empty': '该时间段没有数据',
      'records.title': '请求记录',
      'records.time': '时间',
      'records.provider': 'Provider',
      'records.model': '模型',
      'records.input': '输入',
      'records.output': '输出',
      'records.total': '总 Token',
      'records.more': '加载更多',
      'records.empty': '还没有请求记录',
      'records.unknown': '未知',
      'records.note': '不保存提示词、回复正文、API Key 与请求响应。',
      'status.since': '开始统计于',
      'status.unknownNote': '{n} 条请求未返回 usage，未计入合计',
      'status.unknownDismiss': '不再提示',
      'settings.label': '设置',
      'settings.showUnknownRanking': '显示未识别排行项',
      'settings.showUnknownUsageNote': '显示未返回 usage 提示',
      'status.failed': '统计数据加载失败',
      'status.retry': '重试',
    }

    function detectLang(locale) {
      try {
        const snap = locale && typeof locale.getLocale === 'function' ? locale.getLocale() : null
        const id = typeof snap === 'string' ? snap : (snap && (snap.id || snap.locale || snap.lang))
        if (typeof id === 'string') return /^zh/i.test(id) ? 'zh' : 'en'
      } catch (err) { /* fall through */ }
      try {
        if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')) return 'zh'
      } catch (err) { /* fall through */ }
      return 'en'
    }

    function interpolate(text, vars) {
      if (!vars) return text
      return String(text).replace(/\{(\w+)\}/g, (whole, key) => (
        vars[key] === undefined || vars[key] === null ? whole : String(vars[key])
      ))
    }

    function createTranslator(locale) {
      const dicts = { en: DICT_EN, zh: DICT_ZH }
      let bound = null
      if (locale && typeof locale.register === 'function') {
        for (const lang of Object.keys(dicts)) {
          try { locale.register(NS, lang, dicts[lang]) } catch (err) { /* keep the local fallback */ }
        }
        if (typeof locale.bind === 'function') {
          try {
            const candidate = locale.bind(NS)
            if (typeof candidate === 'function') bound = candidate
          } catch (err) { /* keep the local fallback */ }
        }
      }
      const translate = (key, vars) => {
        // The dictionary that ships with this file is authoritative: it can
        // never be older than the component that asks for a key. The locale
        // service is only consulted for keys this plugin does not define, so a
        // stale registration can never shadow a newly added string.
        const dict = dicts[detectLang(locale)]
        let text = (dict && dict[key]) || DICT_EN[key] || null
        if (text === null && bound) {
          try { text = bound(key) } catch (err) { text = null }
        }
        if (typeof text !== 'string' || text === '' || text === key) text = key
        return interpolate(text, vars)
      }
      // Components that format dates need the active language, not just words.
      translate.lang = detectLang(locale)
      return translate
    }

    // ------------------------------------------------------------ formatting
    function trimZeros(text) {
      return text.indexOf('.') === -1 ? text : text.replace(/\.?0+$/, '')
    }

    /** 1K / 1M / 1B / 4.25B, always derived from the full integer value. */
    function formatShort(value) {
      const n = Number(value) || 0
      const abs = Math.abs(n)
      if (abs < 1000) return String(Math.round(n))
      const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
      for (let i = 0; i < units.length; i++) {
        const [div, suffix] = units[i]
        if (abs >= div) {
          let text = trimZeros((n / div).toFixed(2))
          if (Number(text) >= 1000 && i > 0) {
            const [biggerDiv, biggerSuffix] = units[i - 1]
            text = trimZeros((n / biggerDiv).toFixed(2))
            return text + biggerSuffix
          }
          return text + suffix
        }
      }
      return String(Math.round(n))
    }

    /** 1,000 / 1,000,000 / 4,000,000,000. */
    function formatFull(value) {
      const n = Math.round(Number(value) || 0)
      const sign = n < 0 ? '-' : ''
      return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    const makeFormatter = (mode) => (mode === 'full' ? formatFull : formatShort)

    const pad2 = (n) => (n < 10 ? '0' + n : String(n))

    function formatTime(ts) {
      const d = new Date(ts)
      return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    }

    function formatDateTime(ts) {
      const d = new Date(ts)
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    }

    function formatDay(ts) {
      const d = new Date(ts)
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    }

    /** Split a custom-range string into its date part and optional clock part. */
    function splitInput(value) {
      const text = typeof value === 'string' ? value : ''
      return { date: text.slice(0, 10), time: text.length > 10 ? text.slice(11, 16) : '' }
    }

    function joinInput(date, time) {
      if (!date) return ''
      return time ? `${date}T${time}` : date
    }

    // -------------------------------------------------------------- date picker
    const WEEKDAY_ZH = ['一', '二', '三', '四', '五', '六', '日']
    const WEEKDAY_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

    /** `YYYY-MM-DD` or `YYYY/MM/DD` typed by hand; anything else is rejected. */
    function parseDayText(text) {
      const match = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*$/.exec(String(text ?? ''))
      if (!match) return null
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      if (month < 1 || month > 12 || day < 1 || day > 31) return null
      const probe = new Date(year, month - 1, day, 12, 0, 0, 0)
      if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null
      return `${year}-${pad2(month)}-${pad2(day)}`
    }

    /** What the field shows: the same shape the native control used. */
    function formatDayDisplay(key) {
      if (typeof key !== 'string' || key.length < 10) return ''
      return key.slice(0, 10).replace(/-/g, '/')
    }

    function dayParts(key) {
      const parts = bucketParts(key)
      return parts && parts.day !== null ? parts : null
    }

    /**
     * Six Monday-first weeks for one month, so the grid keeps the same height
     * when the month changes and the popover never jumps.
     */
    function calendarCells(year, month) {
      const first = new Date(year, month - 1, 1, 12, 0, 0, 0)
      const offset = (first.getDay() + 6) % 7
      const cells = []
      for (let index = 0; index < 42; index++) {
        const date = new Date(year, month - 1, 1 - offset + index, 12, 0, 0, 0)
        cells.push({
          key: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
          day: date.getDate(),
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          outside: date.getMonth() + 1 !== month || date.getFullYear() !== year,
        })
      }
      return cells
    }

    function shiftMonth(year, month, delta) {
      const date = new Date(year, month - 1 + delta, 1, 12, 0, 0, 0)
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    }

    /** A stem date as `{ year, month }`, falling back to today. */
    function monthOf(key, fallbackKey) {
      const parts = dayParts(key) || dayParts(fallbackKey)
      if (parts) return { year: parts.year, month: parts.month }
      const now = new Date()
      return { year: now.getFullYear(), month: now.getMonth() + 1 }
    }

    /**
     * A small dropdown used by the calendar's quick jump. It replaces the native
     * `<select>` so the highlight follows the plugin palette instead of the
     * system blue.
     */
    function CalSelect({ value, options, label, onChange }) {
      const [open, setOpen] = useState(false)
      const [visible, setVisible] = useState(false)
      const [entered, setEntered] = useState(false)
      const rootRef = useRef(null)
      const listRef = useRef(null)
      const closeRef = useRef(null)
      closeRef.current = () => setOpen(false)

      useEffect(() => {
        if (open) {
          setVisible(true)
          const id = setTimeout(() => setEntered(true), 16)
          return () => clearTimeout(id)
        }
        setEntered(false)
        const id = setTimeout(() => setVisible(false), 120)
        return () => clearTimeout(id)
      }, [open])

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) closeRef.current()
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [open])

      // Bring the current row into view, so a long year list opens on it. This
      // has to wait for `visible`: the list is not in the DOM on the first pass.
      useEffect(() => {
        if (!open || !visible || !listRef.current || typeof listRef.current.querySelector !== 'function') return
        const node = listRef.current.querySelector('[data-selected="true"]')
        if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
      }, [open, visible])

      const current = options.find((option) => option.value === value)

      return h('div', { className: 'tu-calPick', ref: rootRef },
        h('button', {
          type: 'button',
          className: 'tu-calSelect',
          'aria-haspopup': 'listbox',
          'aria-expanded': open,
          'aria-label': label,
          onClick: () => setOpen((value_) => !value_),
          onKeyDown: (event) => {
            if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false) }
            if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true) }
          },
        },
          h('span', null, current ? current.label : ''),
          h('span', { className: 'tu-calCaret', 'aria-hidden': 'true' }, '▾')),
        visible ? h('div', {
          className: 'tu-calList',
          role: 'listbox',
          'aria-label': label,
          'data-entered': String(entered),
          ref: listRef,
          onKeyDown: (event) => {
            if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) }
          },
        }, options.map((option) => h('button', {
          key: String(option.value),
          type: 'button',
          role: 'option',
          className: 'tu-calOption',
          'data-selected': String(option.value === value),
          'aria-selected': String(option.value === value),
          onClick: () => { onChange(option.value); setOpen(false) },
        }, option.label))) : null)
    }

    /**
     * One date field plus its calendar. The popover is rendered here rather than
     * in the page so it can sit right under the field it belongs to.
     */
    function DatePicker({ which, value, from, to, label, placeholder, open, onToggle, onSelect, onClose, t, todayKey }) {
      const lang = (t && t.lang) || 'en'
      const [month, setMonth] = useState(() => monthOf(value, todayKey))
      const [text, setText] = useState(() => formatDayDisplay(value))
      const [visible, setVisible] = useState(false)
      const [entered, setEntered] = useState(false)
      const rootRef = useRef(null)
      const closeRef = useRef(onClose)
      closeRef.current = onClose

      // Keep the typed text in step with the picked value.
      useEffect(() => { setText(formatDayDisplay(value)) }, [value])

      // Open and close in two steps so the transition has something to animate,
      // and keep the node mounted until the close animation has played.
      useEffect(() => {
        if (open) {
          setMonth(monthOf(value, todayKey))
          setVisible(true)
          const id = setTimeout(() => setEntered(true), 16)
          return () => clearTimeout(id)
        }
        setEntered(false)
        const id = setTimeout(() => setVisible(false), 120)
        return () => clearTimeout(id)
      }, [open])

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) closeRef.current()
        }
        const onKey = (event) => { if (event.key === 'Escape') closeRef.current() }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      // Blurring only commits text the user actually changed. Committing
      // unconditionally would close the calendar on mousedown, before the click
      // on a day could land.
      const commitText = () => {
        const parsed = parseDayText(text)
        if (parsed && parsed !== value) { onSelect(parsed); return }
        setText(formatDayDisplay(value))
      }

      const title = lang === 'zh'
        ? `${month.year}年${month.month}月`
        : `${MONTHS_EN_FULL[month.month - 1]} ${month.year}`
      const weekdays = lang === 'zh' ? WEEKDAY_ZH : WEEKDAY_EN
      const cells = calendarCells(month.year, month.month)
      // Ten years back covers every range this plugin can hold, plus whatever
      // year the calendar is currently parked on.
      const todayYear = Number(String(todayKey || '').slice(0, 4)) || new Date().getFullYear()
      const years = []
      for (let year = Math.min(todayYear - 10, month.year); year <= Math.max(todayYear, month.year); year++) {
        years.push(year)
      }
      const start = parseDayText(from) || from || ''
      const end = parseDayText(to) || to || ''

      return h('div', { className: 'tu-dateField', ref: rootRef },
        h('input', {
          className: 'tu-dateInput',
          type: 'text',
          inputMode: 'numeric',
          autoComplete: 'off',
          spellCheck: 'false',
          value: text,
          placeholder,
          'aria-label': label,
          'aria-expanded': open,
          'aria-haspopup': 'dialog',
          'data-active': String(open),
          'data-which': which,
          onClick: () => onToggle(),
          onChange: (event) => setText(event.target.value),
          onBlur: commitText,
          onKeyDown: (event) => {
            if (event.key === 'Enter') { event.preventDefault(); commitText(); onClose() }
            if (event.key === 'Escape') onClose()
          },
        }),
        h('svg', {
          className: 'tu-dateIcon', viewBox: '0 0 16 16', width: 14, height: 14,
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': 'true',
        }, h('rect', { x: 2.5, y: 3.5, width: 11, height: 10, rx: 2 }),
        h('path', { d: 'M2.5 6.5h11M5.5 2v3M10.5 2v3', strokeLinecap: 'round' })),
        visible ? h('div', {
          className: 'tu-cal',
          role: 'dialog',
          'aria-label': label,
          'data-entered': String(entered),
        },
          h('div', { className: 'tu-calMain' },
            h('div', { className: 'tu-calHead' },
              h('button', {
                type: 'button', className: 'tu-calNav', 'aria-label': t('cal.prev'),
                onClick: () => setMonth((current) => shiftMonth(current.year, current.month, -1)),
              }, '‹'),
              h('span', { className: 'tu-calTitle' }, title),
              h('button', {
                type: 'button', className: 'tu-calNav', 'aria-label': t('cal.next'),
                onClick: () => setMonth((current) => shiftMonth(current.year, current.month, 1)),
              }, '›')),
            h('div', { className: 'tu-calWeek' },
              weekdays.map((name) => h('span', { key: name, className: 'tu-calWeekCell' }, name))),
            h('div', { className: 'tu-calGrid' },
              cells.map((cell) => {
                // The other end of the range bounds this one, so an inverted range
                // cannot be produced by picking a day.
                const disabled = which === 'from'
                  ? Boolean(end) && cell.key > end
                  : Boolean(start) && cell.key < start
                const edge = cell.key === start || cell.key === end
                const inside = Boolean(start) && Boolean(end) && cell.key > start && cell.key < end
                return h('button', {
                  key: cell.key,
                  type: 'button',
                  className: 'tu-calDay',
                  'data-outside': String(cell.outside),
                  'data-disabled': String(disabled),
                  'data-edge': String(edge),
                  'data-inside': String(inside),
                  'data-today': String(cell.key === todayKey),
                  disabled,
                  'aria-label': cell.key,
                  'aria-pressed': String(edge),
                  onClick: () => { if (!disabled) onSelect(cell.key) },
                }, String(cell.day))
              }))),
          // Jump straight to a year or month instead of paging with the arrows.
          h('div', { className: 'tu-calQuick' },
            h('span', { className: 'tu-calQuickTitle' }, t('cal.quick')),
            h(CalSelect, {
              value: month.year,
              label: t('cal.year'),
              options: years.map((year) => ({ value: year, label: lang === 'zh' ? `${year}年` : String(year) })),
              onChange: (year) => setMonth({ year, month: month.month }),
            }),
            h(CalSelect, {
              value: month.month,
              label: t('cal.month'),
              options: MONTH_NUMBERS.map((value) => ({ value, label: lang === 'zh' ? `${value}月` : MONTHS_EN[value - 1] })),
              onChange: (value) => setMonth({ year: month.year, month: value }),
            }))) : null)
    }

    // ------------------------------------------------------------------- RPC
    async function rpc(method, args) {
      const response = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, args: args || {} }),
      })
      let payload = null
      try { payload = await response.json() } catch (err) { payload = null }
      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && payload.error ? payload.error.message : `HTTP ${response.status}`
        throw new Error(message)
      }
      return payload.data
    }

    // ----------------------------------------------------------------- styles
    const CSS = `
.tu-root{--tu-accent:#35CFE3;--tu-success:#49D7C6;--tu-warn:#F2B66D;--tu-danger:#EE8E95;display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px;line-height:20px}
.tu-inner{display:flex;flex-direction:column;gap:16px;width:100%;max-width:1080px;margin:0 auto;padding:22px 26px 40px;box-sizing:border-box}
.tu-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.tu-title{font-size:16px;line-height:24px;font-weight:600;margin:0}
.tu-sub{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.tu-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tu-row-tight{gap:6px}
.tu-spacer{flex:1 1 auto}
.tu-sect{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:14px 16px;background:var(--dsw-alias-bg-layer-1);box-sizing:border-box}
.tu-sectHead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.tu-sectTitle{font-size:13px;line-height:20px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary)}
.tu-seg{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.tu-segBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:4px 10px;cursor:pointer;white-space:nowrap}
.tu-segBtn + .tu-segBtn{border-left:1px solid var(--dsw-alias-border-l1)}
.tu-segBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.tu-segBtn[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.tu-segBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
/* Seven equal cards. The value font follows the container width so a full
   number ("1,234,567,890") always fits on one line instead of wrapping or
   being clipped; the grid wraps to a second row when the panel is narrow. */
.tu-metrics{container-type:inline-size;display:grid;grid-template-columns:repeat(auto-fit,minmax(126px,1fr));border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.tu-metric{display:flex;flex-direction:column;justify-content:center;gap:2px;padding:12px 12px;border-left:1px solid var(--dsw-alias-border-l1);min-width:0}
.tu-metric:first-child{border-left:0}
.tu-metricLabel{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tu-metricValue{font-size:16px;font-size:clamp(12px,1.5cqw,21px);line-height:1.35;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap}
.tu-note{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);margin:0}
.tu-noteRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0}
.tu-linkBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px;white-space:nowrap}
.tu-linkBtn:hover{color:var(--dsw-alias-label-primary)}
.tu-linkBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:3px}
.tu-settingsWrap{position:relative;display:inline-flex}
.tu-popSmall{width:min(260px,calc(100vw - 40px))}
.tu-switchRow{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:7px 6px;min-width:200px}
.tu-switchRow + .tu-switchRow{border-top:1px solid var(--dsw-alias-border-l1)}
.tu-switchLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);min-width:0}
.tu-switch{position:relative;flex:none;width:32px;height:18px;padding:0;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:background-color .12s ease,border-color .12s ease}
.tu-switch[data-on="true"]{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary)}
.tu-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.tu-switchKnob{position:absolute;top:1px;left:1px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);box-sizing:border-box;transition:transform .12s ease}
.tu-switch[data-on="true"] .tu-switchKnob{transform:translateX(14px);border-color:transparent}
@media (prefers-reduced-motion: reduce){.tu-switch,.tu-switchKnob{transition:none}}
.tu-chart{display:flex;align-items:flex-end;gap:2px;height:148px;padding-top:6px;border-bottom:1px solid var(--dsw-alias-border-l1);box-sizing:border-box;overflow:hidden}
/* min-width:0 lets a dense series share the width instead of overflowing the
   card, which used to push the only non-zero bars outside the visible area. */
.tu-bar{flex:1 1 0;min-width:0;min-height:1px;background:var(--tu-accent);opacity:.55;border-radius:2px 2px 0 0;cursor:pointer;transition:opacity .14s ease}
.tu-bar[data-active="true"]{opacity:1}
.tu-chartEmpty{display:flex;align-items:center;justify-content:center;height:148px;color:var(--dsw-alias-label-secondary);font-size:12px}
.tu-axis{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;margin-top:4px;position:relative;height:15px}
/* Dense charts place each tick under its bar; the first one is pinned left so
   it cannot spill past the card edge. */
.tu-axisTick{position:absolute;top:0;white-space:nowrap;transform:translateX(-50%)}
.tu-axisTick[data-edge="start"]{left:0 !important;transform:none}
/* Sparse charts mirror the bar layout, so labels line up with the bars. */
.tu-axisSparse{display:flex;justify-content:center}
.tu-axisCell{flex:1 1 0;min-width:0;text-align:center;white-space:nowrap;overflow:visible}
/* Yearly heatmap: 12 month rows by 31 day columns, one cell per day. */
.tu-heat{display:flex;gap:8px;height:214px}
.tu-heatMonths{display:grid;grid-template-rows:repeat(12,1fr);gap:2px;width:24px;font-size:10px;line-height:1;color:var(--dsw-alias-label-secondary);text-align:right;align-items:center;font-variant-numeric:tabular-nums}
.tu-heatGrid{flex:1;min-width:0;display:grid;grid-template-columns:repeat(31,1fr);grid-template-rows:repeat(12,1fr);gap:2px}
/* Every state carries the same three shadow layers (transparent when unused),
   so the browser can interpolate them instead of snapping between states. */
.tu-heatCell{position:relative;border-radius:2px;background:rgba(140,148,160,.22);cursor:pointer;box-shadow:inset 0 0 0 1px transparent,0 0 0 2px transparent,0 2px 6px transparent;transition:box-shadow .16s ease,transform .16s ease,opacity .14s ease}
/* One hue, four steps: the IXOS cyan at increasing strength. */
.tu-heatCell[data-level="1"]{background:rgba(53,207,227,.28)}
.tu-heatCell[data-level="2"]{background:rgba(53,207,227,.48)}
.tu-heatCell[data-level="3"]{background:rgba(53,207,227,.72)}
.tu-heatCell[data-level="4"]{background:var(--tu-accent)}
/* A day that has not happened yet: an empty box with a thin solid edge. The
   outline is drawn inside the cell, so its size, gap and radius stay identical
   to every other day. A solid edge (not dashed) keeps the grid calm. */
.tu-heatCell[data-future="true"]{background:transparent;outline:1px solid rgba(140,148,160,.55);outline-offset:-1px;box-shadow:inset 0 0 0 1px transparent,0 0 0 2px transparent,0 2px 6px transparent;cursor:default}
/* Today: a quiet marker that exists on its own, whatever the pointer does.
   The stroke is the darker cyan so it stays visible on every usage level, and
   the halo is the accent at low strength. The fill is never touched. */
.tu-heatCell[data-today="true"]{z-index:1;box-shadow:inset 0 0 0 1px #168FA0,0 0 0 2px rgba(53,207,227,.18),0 2px 6px transparent}
/* Hover: a clearer cyan ring, a soft shadow and a one-pixel lift. The lift is
   a transform, so the grid's size, gaps and layout do not move. */
.tu-heatCell[data-active="true"]{z-index:2;transform:translateY(-1px);box-shadow:inset 0 0 0 1px #35CFE3,0 0 0 2px rgba(53,207,227,.32),0 2px 6px rgba(22,143,160,.28)}
/* Today while hovered: one stroke, one halo, one shadow — never two rings. */
.tu-heatCell[data-today="true"][data-active="true"]{box-shadow:inset 0 0 0 1px #168FA0,0 0 0 2px rgba(53,207,227,.38),0 2px 6px rgba(22,143,160,.30)}
.tu-heatBlank{background:transparent}
.tu-heatLegend{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}
.tu-heatKey{display:inline-flex;align-items:center;gap:5px}
.tu-heatSwatch{display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(140,148,160,.22)}
.tu-heatSwatch[data-level="4"]{background:var(--tu-accent)}
.tu-heatSwatch[data-future="true"]{background:transparent;outline:1px solid rgba(140,148,160,.55);outline-offset:-1px}
.tu-plot{position:relative}
/* Three layers, three jobs: the box owns the position, the body owns the
   fade, the content owns the value refresh. They never share a property, so a
   move and a fade can run at the same time without overwriting each other. */
.tu-tipBox{position:absolute;top:0;left:0;z-index:6;pointer-events:none;will-change:transform;transition:transform .14s cubic-bezier(.2,.7,.3,1)}
/* While hidden the position snaps, so the next appearance fades in where it
   belongs instead of sliding in from the previous bar. */
.tu-tipBox[data-visible="false"]{transition:none}
.tu-tipBody{min-width:140px;max-width:210px;padding:7px 10px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.18));opacity:0;transform:translateY(6px);transition:opacity .12s ease,transform .12s ease}
.tu-tipBox[data-visible="true"] .tu-tipBody{opacity:1;transform:none;transition:opacity .16s ease,transform .16s ease}
.tu-tipContent{animation:tu-tipContentIn .08s ease-out}
@keyframes tu-tipContentIn{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){
  .tu-tipBox,.tu-tipBody,.tu-bar,.tu-heatCell{transition:none}
  .tu-tipContent{animation:none}
  .tu-heatCell[data-active="true"]{transform:none}
}
.tu-tipTitle{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);margin-bottom:4px;white-space:nowrap;font-variant-numeric:tabular-nums}
.tu-tipLine{display:flex;align-items:baseline;justify-content:space-between;gap:14px;font-size:12px;line-height:17px;color:var(--dsw-alias-label-primary)}
.tu-tipLine[data-dim="true"]{color:var(--dsw-alias-label-secondary)}
.tu-tipLine > span:last-child{font-variant-numeric:tabular-nums;font-weight:500}
.tu-tip{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;min-height:18px}
.tu-tipDim{color:var(--dsw-alias-label-secondary)}
.tu-table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
.tu-table th{text-align:left;font-weight:500;color:var(--dsw-alias-label-secondary);padding:0 8px 6px 0;white-space:nowrap;border-bottom:1px solid var(--dsw-alias-border-l1)}
.tu-table td{padding:6px 8px 6px 0;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:middle}
/* Numbers hug their own column so the three of them line up as one block, and
   the model column takes whatever is left. */
.tu-table th.tu-num{text-align:right;padding-right:0}
.tu-table td.tu-num{text-align:right;white-space:nowrap;width:1%;padding-right:0}
.tu-table th.tu-num + th.tu-num{padding-left:18px}
.tu-table td.tu-num + td.tu-num{padding-left:18px}
.tu-table td:last-child,.tu-table th:last-child{padding-right:0}
.tu-table tr:last-child td{border-bottom:0}
.tu-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tu-rankBar{position:relative;display:flex;align-items:center;min-height:26px;padding:2px 8px;border-radius:6px;overflow:hidden}
.tu-rankFill{position:absolute;left:0;top:0;bottom:0;background:var(--dsw-alias-bg-layer-2);z-index:0}
.tu-rankText{position:relative;z-index:1;display:flex;align-items:center;gap:8px;width:100%;min-width:0}
.tu-rankName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tu-rankValue{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);font-weight:600;white-space:nowrap;padding-left:8px}
.tu-rankDim{color:var(--dsw-alias-label-secondary);font-weight:400;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}
.tu-btn{appearance:none;box-sizing:border-box;height:28px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:0 10px;cursor:pointer;white-space:nowrap}
.tu-btn:hover{background:var(--dsw-alias-bg-layer-2)}
/* A soft accent ring instead of the default outline, which looked harsh on the
   small buttons. */
.tu-btn:focus-visible{outline:none;border-color:var(--tu-accent)}
.tu-btn[data-primary="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.tu-input{box-sizing:border-box;height:28px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:0 8px;min-width:0;color-scheme:light dark;accent-color:#35CFE3}
.tu-input:focus-visible{outline:none;border-color:var(--tu-accent)}
/* The native calendar popup keeps its own layout; only the trigger icon is ours
   to tone down so it matches the field instead of sitting on top of it. */
.tu-input::-webkit-calendar-picker-indicator{margin:0 0 0 2px;padding:0;opacity:.5;cursor:pointer}
.tu-input::-webkit-calendar-picker-indicator:hover{opacity:.8}
.tu-input::-webkit-datetime-edit{padding:0}
/* Custom date field: the input keeps the old footprint, the calendar is ours. */
.tu-dateField{position:relative;display:inline-flex}
.tu-dateInput{box-sizing:border-box;height:28px;width:126px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:0 26px 0 8px;cursor:pointer}
.tu-dateInput:hover{border-color:var(--dsw-alias-border-l2)}
/* The open calendar is feedback enough; the field keeps its quiet border so it
   does not compete with the popover. */
.tu-dateInput:focus-visible{outline:none;border-color:var(--dsw-alias-border-l2)}
.tu-dateIcon{position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--dsw-alias-label-secondary);opacity:.7}
/* The popover fades in with a small lift; closing plays the same transition
   backwards before the node is unmounted. */
.tu-cal{position:absolute;top:calc(100% + 6px);left:0;z-index:70;display:flex;align-items:stretch;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3,0 10px 30px rgba(0,0,0,.16));opacity:0;transform:translateY(-4px) scale(.98);transform-origin:top left;transition:opacity .12s ease,transform .12s ease;pointer-events:none}
.tu-cal[data-entered="true"]{opacity:1;transform:none;transition:opacity .16s cubic-bezier(.2,.8,.3,1),transform .16s cubic-bezier(.2,.8,.3,1);pointer-events:auto}
.tu-calMain{width:252px}
/* Quick year/month jump, separated from the grid by a hairline. */
.tu-calQuick{display:flex;flex-direction:column;gap:6px;width:112px;margin-left:10px;padding-left:10px;border-left:1px solid var(--dsw-alias-border-l1)}
.tu-calQuickTitle{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.tu-calPick{position:relative;display:block}
.tu-calSelect{appearance:none;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;height:26px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:0 8px;cursor:pointer;text-align:left}
.tu-calSelect:hover{border-color:var(--dsw-alias-border-l2)}
.tu-calSelect:focus-visible{outline:none;border-color:var(--tu-accent)}
.tu-calSelect[aria-expanded="true"]{border-color:var(--tu-accent)}
.tu-calCaret{color:var(--dsw-alias-label-secondary);font-size:9px;line-height:1;flex:none}
/* Custom list: the native menu paints its own blue highlight, which does not
   belong to this palette. */
.tu-calList{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:80;max-height:176px;overflow-y:auto;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.16));opacity:0;transform:translateY(-4px) scale(.98);transform-origin:top center;transition:opacity .12s ease,transform .12s ease;pointer-events:none}
.tu-calList[data-entered="true"]{opacity:1;transform:none;transition:opacity .16s cubic-bezier(.2,.8,.3,1),transform .16s cubic-bezier(.2,.8,.3,1);pointer-events:auto}
.tu-calOption{appearance:none;display:block;width:100%;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:24px;height:24px;padding:0 8px;text-align:left;cursor:pointer;white-space:nowrap}
.tu-calOption:hover{background:rgba(53,207,227,.12)}
.tu-calOption[data-selected="true"]{background:rgba(53,207,227,.2);font-weight:600}
.tu-calOption[data-selected="true"]:hover{background:rgba(53,207,227,.28)}
.tu-calOption:focus-visible{outline:none;box-shadow:inset 0 0 0 1px var(--tu-accent)}
.tu-calHead{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.tu-calTitle{flex:1;text-align:center;font-size:12px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.tu-calNav{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:15px;line-height:1;padding:0}
.tu-calNav:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.tu-calNav:focus-visible{outline:none;box-shadow:inset 0 0 0 1px var(--tu-accent)}
.tu-calWeek{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:2px}
.tu-calWeekCell{text-align:center;font-size:11px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.tu-calGrid{display:grid;grid-template-columns:repeat(7,1fr)}
.tu-calDay{position:relative;appearance:none;border:0;background:transparent;font:inherit;font-size:12px;line-height:28px;height:28px;padding:0;border-radius:6px;color:var(--dsw-alias-label-primary);cursor:pointer;font-variant-numeric:tabular-nums}
.tu-calDay:hover{background:var(--dsw-alias-bg-layer-2)}
.tu-calDay[data-outside="true"]{color:var(--dsw-alias-label-secondary);opacity:.6}
.tu-calDay[data-disabled="true"]{color:var(--dsw-alias-label-secondary);opacity:.35;cursor:default;background:transparent}
/* The soft band between the two ends; the ends themselves carry the accent. */
.tu-calDay[data-inside="true"]{background:rgba(53,207,227,.16);border-radius:0}
.tu-calDay[data-edge="true"],.tu-calDay[data-edge="true"]:hover{background:var(--tu-accent);color:#062c33;font-weight:600}
/* Today is a small dot, not a ring: a box read as a second selection. */
.tu-calDay[data-today="true"]:not([data-edge="true"])::after{content:'';position:absolute;left:50%;bottom:3px;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:var(--tu-accent)}
.tu-calDay:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--tu-accent)}
@media (prefers-reduced-motion: reduce){
  .tu-cal,.tu-cal[data-entered="true"]{transition:none}
}
.tu-filterWrap{position:relative}
.tu-trigger{display:inline-flex;align-items:center;gap:6px;max-width:min(420px,70vw);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:5px 10px;cursor:pointer}
.tu-trigger:hover{background:var(--dsw-alias-bg-layer-2)}
.tu-triggerText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tu-triggerDim{color:var(--dsw-alias-label-secondary);flex:none}
.tu-pop{position:absolute;top:calc(100% + 6px);right:0;z-index:60;width:min(440px,calc(100vw - 40px));max-height:min(460px,70vh);display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3,0 10px 30px rgba(0,0,0,.18));overflow:hidden}
.tu-popHead{padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.tu-popBody{overflow:auto;padding:4px;min-height:0}
.tu-popFoot{display:flex;gap:8px;justify-content:flex-end;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1)}
.tu-item{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 auto;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;text-align:left;padding:5px 8px;border-radius:6px;cursor:pointer}
.tu-item:hover{background:var(--dsw-alias-bg-layer-2)}
.tu-item[data-active="true"]{background:var(--dsw-alias-bg-layer-2)}
.tu-item[data-depth="1"]{padding-left:20px}
.tu-item[data-depth="2"]{padding-left:32px}
.tu-item[data-depth="3"]{padding-left:44px}
.tu-itemText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.tu-itemValue{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;font-size:11px;padding-left:6px}
.tu-itemRow{display:flex;align-items:center}
.tu-iconBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;padding:2px 4px;border-radius:4px;cursor:pointer;flex:none}
.tu-iconBtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.tu-iconBtn:disabled{opacity:.3;cursor:default}
.tu-edit{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);margin:4px}
.tu-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.tu-fieldLabel{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tu-tag{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-brand-primary);border-radius:999px;padding:0 7px;font-size:11px;line-height:16px;color:var(--dsw-alias-brand-primary);white-space:nowrap;flex:none}
.tu-empty{display:flex;align-items:center;justify-content:center;padding:22px;color:var(--dsw-alias-label-secondary);font-size:12px}
.tu-err{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}
.tu-loading{opacity:.65}
`

    function insertStyles() {
      const element = document.createElement('style')
      element.setAttribute('data-plugin', 'dsh-token-usage')
      element.textContent = CSS
      document.head.appendChild(element)
      return () => {
        try { element.remove() } catch (err) { /* already detached */ }
      }
    }

    // ----------------------------------------------------------- tiny pieces
    function Segmented({ options, value, onChange, ariaLabel }) {
      return h('div', { className: 'tu-seg', role: 'group', 'aria-label': ariaLabel },
        options.map((option) => h('button', {
          key: option.value,
          type: 'button',
          className: 'tu-segBtn',
          'data-active': String(option.value === value),
          'aria-pressed': option.value === value,
          onClick: () => onChange(option.value),
        }, option.label)))
    }

    function Metric({ label, value }) {
      return h('div', { className: 'tu-metric' },
        h('span', { className: 'tu-metricLabel' }, label),
        h('span', { className: 'tu-metricValue' }, value))
    }

    /** A compact on/off switch; `role="switch"` keeps it usable by keyboard. */
    function Switch({ on, label, onChange }) {
      return h('button', {
        type: 'button',
        className: 'tu-switch',
        role: 'switch',
        'aria-checked': on,
        'aria-label': label,
        'data-on': String(on),
        onClick: () => onChange(!on),
      }, h('span', { className: 'tu-switchKnob' }))
    }

    /** The page's display preferences, in a small popover beside the header. */
    function SettingsMenu({ prefs, t, onChange }) {
      const [open, setOpen] = useState(false)
      const wrapRef = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      const row = (key, label) => h('div', { className: 'tu-switchRow' },
        h('span', { className: 'tu-switchLabel' }, label),
        h(Switch, { on: prefs[key] === true, label, onChange: (value) => onChange(key, value) }))

      return h('div', { className: 'tu-settingsWrap', ref: wrapRef },
        h('button', {
          type: 'button',
          className: 'tu-btn',
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          title: t('settings.label'),
          onClick: () => setOpen((value) => !value),
        }, t('settings.label')),
        open ? h('div', {
          className: 'tu-pop tu-popSmall',
          role: 'dialog',
          'aria-label': t('settings.label'),
        },
          h('div', { className: 'tu-popBody' },
            row('showUnknownRanking', t('settings.showUnknownRanking')),
            row('showUnknownUsageNote', t('settings.showUnknownUsageNote'))))
          : null)
    }

    // ------------------------------------------------------------ time labels
    const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const MONTHS_EN_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December']

    /**
     * Split a bucket key into its parts by reading the string, never by parsing
     * it into a Date. The Host formats every key in local time, so string
     * handling keeps the label on the same day the row was grouped into.
     */
    function bucketParts(bucket) {
      const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}))?$/.exec(String(bucket == null ? '' : bucket))
      if (!match) return null
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: match[3] === undefined ? null : Number(match[3]),
        hour: match[4] === undefined ? null : Number(match[4]),
      }
    }

    /** The short axis label for one bucket. */
    function axisLabel(bucket, granularity, lang) {
      const parts = bucketParts(bucket)
      if (!parts) return String(bucket == null ? '' : bucket)
      switch (granularity) {
        case 'hour':
          return pad2(parts.hour == null ? 0 : parts.hour) + ':00'
        case 'month':
          return lang === 'zh' ? parts.month + '月' : MONTHS_EN[parts.month - 1]
        case 'year':
          return String(parts.year)
        case 'week':
          // The key is the week's start day, so the label is simply that day.
        case 'day':
        default:
          return pad2(parts.month) + '-' + pad2(parts.day == null ? 1 : parts.day)
      }
    }

    /** Last day of the week that starts at `bucket` (noon avoids DST edges). */
    function weekEndKey(bucket) {
      const parts = bucketParts(bucket)
      if (!parts || parts.day === null) return null
      const date = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0)
      date.setDate(date.getDate() + 6)
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    /** The full period a bucket stands for, for the hover tooltip. */
    function periodLabel(bucket, granularity, lang) {
      const parts = bucketParts(bucket)
      if (!parts) return String(bucket == null ? '' : bucket)
      const day = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day == null ? 1 : parts.day)}`
      switch (granularity) {
        case 'hour': {
          const hour = parts.hour == null ? 0 : parts.hour
          const next = (hour + 1) % 24
          return `${day} ${pad2(hour)}:00–${pad2(next)}:00`
        }
        case 'week': {
          const end = weekEndKey(bucket)
          return end ? `${day} – ${end}` : day
        }
        case 'month':
          return lang === 'zh'
            ? `${parts.year}年${parts.month}月`
            : `${MONTHS_EN_FULL[parts.month - 1]} ${parts.year}`
        case 'year':
          return lang === 'zh' ? `${parts.year}年` : String(parts.year)
        case 'day':
        default:
          return day
      }
    }

    /**
     * Which buckets get an axis label. The step follows the measured plot width
     * so labels never collide; hourly data snaps to clock-friendly steps.
     */
    function axisTicks(points, granularity, width, lang) {
      const total = points.length
      if (!total) return []
      const room = Number.isFinite(width) && width > 0 ? width : 900
      // ~86px per label keeps a four-character date comfortably separated.
      const target = Math.max(2, Math.min(12, Math.floor(room / 86)))
      if (total <= target) {
        return points.map((point, index) => ({ index, label: axisLabel(point.bucket, granularity, lang) }))
      }
      let step = Math.ceil(total / target)
      if (granularity === 'hour') {
        // Whole-hour steps read better on a clock than an arbitrary stride.
        for (const candidate of [1, 2, 6, 12, 24]) {
          if (candidate >= step) { step = candidate; break }
        }
      }
      const ticks = []
      for (let index = 0; index < total; index += step) {
        ticks.push({ index, label: axisLabel(points[index].bucket, granularity, lang) })
      }
      return ticks
    }

    // ------------------------------------------------------------- heatmap
    const HEAT_COLUMNS = 31
    const HEAT_ROWS = 12
    const HEAT_GAP = 2

    /**
     * Cache hit rate for one bucket, using the same weighted definition as the
     * summary card: cached prompt tokens over all prompt tokens. Returns null
     * when the bucket has no cache counters to work with, so it renders as a
     * dash instead of a misleading 0%.
     */
    function bucketCacheRate(point) {
      if (!point || !(Number(point.cacheRows) > 0)) return null
      const read = Number(point.cacheRead) || 0
      const input = Number(point.input) || 0
      const base = read + input
      return base > 0 ? read / base : null
    }

    /** 0 for no usage, then four steps of the accent colour. */
    function heatLevel(total, max) {
      if (!(total > 0) || !(max > 0)) return 0
      return Math.min(4, Math.max(1, Math.ceil((total / max) * 4)))
    }

    /** Where one day sits in the 12 x 31 grid, in plot coordinates. */
    function heatCellRect(bucket, width, height) {
      const parts = bucketParts(bucket)
      if (!parts || parts.day === null) return null
      const cellWidth = (width - (HEAT_COLUMNS - 1) * HEAT_GAP) / HEAT_COLUMNS
      const cellHeight = (height - (HEAT_ROWS - 1) * HEAT_GAP) / HEAT_ROWS
      return {
        left: (parts.day - 1) * (cellWidth + HEAT_GAP),
        top: (parts.month - 1) * (cellHeight + HEAT_GAP),
        width: cellWidth,
        height: cellHeight,
      }
    }

    /**
     * The 12 x 31 grid for one year. Days the year does not have (31 February)
     * stay blank, and days after today are marked so they never read as data.
     */
    function heatCells(points, todayKey) {
      const byKey = new Map(points.map((point) => [point.bucket, point]))
      const first = bucketParts(points.length ? points[0].bucket : '')
      const year = first ? first.year : new Date().getFullYear()
      const max = points.reduce((peak, point) => Math.max(peak, point.total), 0)
      const cells = []
      for (let month = 1; month <= HEAT_ROWS; month++) {
        const daysInMonth = new Date(year, month, 0).getDate()
        for (let day = 1; day <= HEAT_COLUMNS; day++) {
          const key = `${year}-${pad2(month)}-${pad2(day)}`
          if (day > daysInMonth) {
            cells.push({ key, blank: true })
            continue
          }
          const point = byKey.get(key) ?? null
          cells.push({
            key,
            blank: false,
            point,
            level: point ? heatLevel(point.total, max) : 0,
            future: todayKey ? key > todayKey : false,
            today: todayKey ? key === todayKey : false,
          })
        }
      }
      return cells
    }

    // -------------------------------------------------------- tooltip layout
    /** Hover timing, in milliseconds. */
    const HOVER_SHOW_DELAY = 300
    const HOVER_HIDE_DELAY = 100
    /** Space between the card and the bar it describes. */
    const TIP_GAP = 14
    /** Space kept between the card and the edge of the section. */
    const TIP_MARGIN = 10

    const clamp = (value, low, high) => Math.max(low, Math.min(value, high))

    /** Overlapping area of two rectangles; 0 when they are apart. */
    function overlapArea(a, b) {
      const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
      const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
      return width > 0 && height > 0 ? width * height : 0
    }

    /**
     * Geometry of one bar inside the plot, mirroring the CSS layout: a dense
     * series shares the width, a sparse one is capped and centred.
     */
    function barRect(index, count, width, height, max, total, sparse, gap) {
      // `.tu-chart` is 148px tall with 6px padding-top and a 1px bottom border.
      const inner = Math.max(1, height - 7)
      const percent = max > 0 ? Math.max(1, Math.round((total / max) * 100)) : 0
      const barHeight = Math.max(1, (percent / 100) * inner)
      const barTop = 6 + (inner - barHeight)
      const cell = sparse
        ? Math.min(56, (width - (count - 1) * gap) / count)
        : (width - (count - 1) * gap) / count
      const left = sparse
        ? (width - (count * cell + (count - 1) * gap)) / 2 + index * (cell + gap)
        : index * (cell + gap)
      return { left, top: barTop, width: cell, height: barHeight }
    }

    /**
     * Choose a spot for the card around the active bar.
     *
     * Candidates are tried in order of preference; each is clamped inside the
     * section and scored by how much of the bar it would cover, so the card
     * never sits on the bar being read unless there is nowhere else to go.
     */
    function placeTooltip({ bar, tip, width, minTop, maxTop }) {
      const maxLeft = Math.max(TIP_MARGIN, width - tip.width - TIP_MARGIN)
      const lowest = Math.max(minTop, maxTop)
      const candidates = [
        { side: 'above', left: bar.left + bar.width / 2 - tip.width / 2, top: bar.top - TIP_GAP - tip.height },
        { side: 'above-right', left: bar.left + bar.width - tip.width, top: bar.top - TIP_GAP - tip.height },
        { side: 'above-left', left: bar.left, top: bar.top - TIP_GAP - tip.height },
        { side: 'right', left: bar.left + bar.width + TIP_GAP, top: bar.top + bar.height / 2 - tip.height / 2 },
        { side: 'left', left: bar.left - TIP_GAP - tip.width, top: bar.top + bar.height / 2 - tip.height / 2 },
        { side: 'below', left: bar.left + bar.width / 2 - tip.width / 2, top: bar.top + bar.height + TIP_GAP },
      ]
      let best = null
      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index]
        const left = clamp(candidate.left, TIP_MARGIN, maxLeft)
        const top = clamp(candidate.top, minTop, lowest)
        const covered = overlapArea({ left, top, width: tip.width, height: tip.height }, bar)
        // Prefer no overlap at all, then the earliest candidate.
        const score = covered * 1000 + index
        if (!best || score < best.score) best = { left, top, side: candidate.side, score, covered }
      }
      return best
    }

    // ----------------------------------------------------------------- chart
    function TrendChart({ points, format, granularity, t, mode, serverTime }) {
      // Every hook runs before any early return: the empty state and the data
      // state must call the same hooks in the same order, or React throws
      // "Rendered more hooks than during the previous render" (#310) the moment
      // the first payload arrives.
      const [hover, setHover] = useState(null)
      // `hover` survives the fade-out so the card keeps its content while it
      // disappears; `shown` drives the opacity.
      const [shown, setShown] = useState(false)
      const [chartNode, setChartNode] = useState(null)
      const [chartSize, setChartSize] = useState({ width: 900, height: 148 })
      const [tipNode, setTipNode] = useState(null)
      const [tipSize, setTipSize] = useState({ width: 0, height: 0 })
      // How far the card may rise above the plot before it leaves the section.
      const [headroom, setHeadroom] = useState(0)
      const showTimer = useRef(null)
      const hideTimer = useRef(null)
      const revealTimer = useRef(null)
      const lang = (t && t.lang) || 'en'
      const plotWidth = chartSize.width
      const plotHeight = chartSize.height
      const max = useMemo(() => points.reduce((peak, point) => Math.max(peak, point.total), 0), [points])
      const ticks = useMemo(
        () => axisTicks(points, granularity, plotWidth, lang),
        [points, granularity, plotWidth, lang],
      )

      // The axis thins itself out against the real plot width, so a resized
      // window changes the label density rather than the data.
      useEffect(() => {
        if (!chartNode || typeof ResizeObserver === 'undefined') return undefined
        const measure = () => {
          const rect = typeof chartNode.getBoundingClientRect === 'function'
            ? chartNode.getBoundingClientRect()
            : null
          if (!rect || !(rect.width > 0)) return
          const width = Math.round(rect.width)
          const height = Math.round(rect.height)
          setChartSize((current) => (
            current.width === width && current.height === height ? current : { width, height }
          ))
          // The section header above the plot is usable space for the card, so
          // measure it instead of assuming a fixed offset.
          const section = typeof chartNode.closest === 'function' ? chartNode.closest('.tu-sect') : null
          const sectionRect = section && typeof section.getBoundingClientRect === 'function'
            ? section.getBoundingClientRect()
            : null
          const room = sectionRect ? Math.max(0, Math.round(rect.top - sectionRect.top)) : 0
          setHeadroom((current) => (current === room ? current : room))
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(chartNode)
        return () => observer.disconnect()
      }, [chartNode])

      // Measure the card itself so it can be placed without guessing its size.
      // A layout effect keeps the correction inside the same frame, so the card
      // never appears at a provisional spot and then jumps.
      useLayoutEffect(() => {
        if (!tipNode || typeof tipNode.getBoundingClientRect !== 'function') return
        const rect = tipNode.getBoundingClientRect()
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        if (width > 0 && height > 0 && (width !== tipSize.width || height !== tipSize.height)) {
          setTipSize({ width, height })
        }
      }, [tipNode, hover, tipSize.width, tipSize.height])

      // A quick pass over the bars must not flash a card, so showing waits and
      // hiding is short. Every timer is cleared whenever the pointer moves.
      const clearHoverTimers = () => {
        if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null }
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
        if (revealTimer.current) { clearTimeout(revealTimer.current); revealTimer.current = null }
      }
      useEffect(() => clearHoverTimers, [])

      // Which bar the pointer is on right now. React may deliver the leave of
      // the old bar before or after the enter of the new one, so the handlers
      // compare against this instead of assuming an order.
      const pointerBar = useRef(null)

      /**
       * Point the card at a bar, then reveal it on the next tick. The two steps
       * are separate renders on purpose: the position is applied while the card
       * is still invisible, so it fades in where it belongs instead of sliding
       * in from wherever it was last seen.
       */
      const showBar = (index) => {
        setHover(index)
        revealTimer.current = setTimeout(() => {
          revealTimer.current = null
          if (pointerBar.current === index) setShown(true)
        }, 0)
      }

      const enterBar = (index) => {
        pointerBar.current = index
        clearHoverTimers()
        if (shown) {
          // Already on screen: move straight to the new bar, no second delay.
          if (hover !== index) setHover(index)
          return
        }
        showTimer.current = setTimeout(() => {
          showTimer.current = null
          if (pointerBar.current === index) showBar(index)
        }, HOVER_SHOW_DELAY)
      }

      const leaveBar = (index) => {
        // A leave that arrives after the pointer already moved on is stale.
        if (index !== undefined && pointerBar.current !== index) return
        pointerBar.current = null
        clearHoverTimers()
        hideTimer.current = setTimeout(() => {
          hideTimer.current = null
          // `hover` is kept so the card fades out with its content intact.
          if (pointerBar.current === null) setShown(false)
        }, HOVER_HIDE_DELAY)
      }

      if (!points.length) return h('div', { className: 'tu-chartEmpty' }, t('trend.empty'))

      const active = hover === null ? null : points[hover]
      // A handful of buckets must not stretch into one full-width slab: cap the
      // bar width and centre the cluster. Many buckets still fill the plot.
      const sparse = points.length <= 8
      // A dense series needs a tighter gap so every bar keeps a visible width.
      const gap = points.length > 180 ? 0 : points.length > 60 ? 1 : 2
      const barStyle = (point) => ({
        height: max > 0 ? Math.max(1, Math.round((point.total / max) * 100)) + '%' : '1px',
        ...(sparse ? { maxWidth: '56px' } : null),
      })

      // Anchor the card to the bar, not to the pointer: the position depends
      // only on the bar's geometry and the measured sizes, so it stays put
      // while the mouse moves inside the same bar.
      const tipWidth = tipSize.width || 190
      const tipHeight = tipSize.height || 130
      const isHeatmap = mode === 'heatmap'
      const anchor = active
        ? (isHeatmap
          ? heatCellRect(active.bucket, plotWidth, plotHeight)
          : barRect(hover, points.length, plotWidth, plotHeight, max, active.total, sparse, gap))
        : null
      const placement = anchor
        ? placeTooltip({
          bar: anchor,
          tip: { width: tipWidth, height: tipHeight },
          width: plotWidth,
          minTop: -headroom + TIP_MARGIN,
          maxTop: plotHeight - tipHeight - TIP_MARGIN,
        })
        : null

      const tickAt = new Map(ticks.map((tick) => [tick.index, tick.label]))
      const todayKey = (() => {
        const stamp = Number(serverTime)
        if (!Number.isFinite(stamp)) return null
        const date = new Date(stamp)
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
      })()
      const cells = isHeatmap ? heatCells(points, todayKey) : null
      const monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
      const indexOf = new Map(points.map((point, index) => [point.bucket, index]))

      const tipLine = (label, value, dim) => h('div', {
        className: 'tu-tipLine',
        'data-dim': String(Boolean(dim)),
      }, h('span', null, label), h('span', null, value))

      return h('div', null,
        h('div', { className: 'tu-tip' },
          h('span', { className: 'tu-tipDim' }, t('trend.title') + ' · ' + t('trend.' + granularity))),
        h('div', { className: 'tu-plot' },
          isHeatmap
            ? h('div', null,
              h('div', { className: 'tu-heat' },
                h('div', { className: 'tu-heatMonths' },
                  monthLabels.map((label) => h('span', { key: label }, label))),
                h('div', {
                  className: 'tu-heatGrid',
                  ref: setChartNode,
                  onMouseLeave: () => leaveBar(),
                }, cells.map((cell) => {
                  if (cell.blank) return h('div', { key: cell.key, className: 'tu-heatBlank' })
                  const index = cell.point ? indexOf.get(cell.key) : undefined
                  // A day that has not happened yet is not interactive: it has
                  // no usage to report, so it must not open a card saying 0.
                  const interactive = index !== undefined && !cell.future
                  return h('div', {
                    key: cell.key,
                    className: 'tu-heatCell',
                    'data-level': String(cell.level),
                    'data-future': String(cell.future),
                    'data-today': String(cell.today),
                    'data-active': String(shown && hover === index),
                    role: 'img',
                    'aria-label': cell.future
                      ? `${cell.key} · ${t('heat.future')}`
                      : `${cell.key} · ${format(cell.point ? cell.point.total : 0)}`,
                    onMouseEnter: interactive ? () => enterBar(index) : undefined,
                    onMouseLeave: interactive ? () => leaveBar(index) : undefined,
                  })
                }))),
              h('div', { className: 'tu-heatLegend' },
                h('span', { className: 'tu-heatKey' },
                  h('i', { className: 'tu-heatSwatch', 'data-level': '4' }), t('heat.hasUsage')),
                h('span', { className: 'tu-heatKey' },
                  h('i', { className: 'tu-heatSwatch', 'data-level': '0' }), t('heat.noUsage')),
                h('span', { className: 'tu-heatKey' },
                  h('i', { className: 'tu-heatSwatch', 'data-future': 'true' }), t('heat.future'))))
            : h('div', {
              className: 'tu-chart',
              ref: setChartNode,
              style: { gap: gap + 'px', ...(sparse ? { justifyContent: 'center' } : null) },
              onMouseLeave: () => leaveBar(),
            },
              points.map((point, index) => h('div', {
                key: point.bucket,
                className: 'tu-bar',
                // The highlight follows visibility, not `hover`: the card keeps its
                // last bar while fading out, and the bar must fade with it.
                'data-active': String(shown && hover === index),
                // An accessible name replaces the native `title`, whose OS tooltip
                // used to appear on top of the custom card.
                role: 'img',
                'aria-label': `${periodLabel(point.bucket, granularity, lang)} · ${format(point.total)}`,
                style: barStyle(point),
                onMouseEnter: () => enterBar(index),
                // Leaving the bar itself hides the card; waiting for the whole
                // chart to be left would keep it on screen over empty space.
                onMouseLeave: () => leaveBar(index),
              }))),
          isHeatmap ? null : (sparse
            ? h('div', {
              className: 'tu-axis tu-axisSparse',
              style: { gap: gap + 'px' },
            }, points.map((point, index) => h('span', {
              key: point.bucket,
              className: 'tu-axisCell',
              style: { maxWidth: '56px' },
            }, tickAt.get(index) || '')))
            : h('div', { className: 'tu-axis' }, ticks.map((tick) => h('span', {
              key: tick.index,
              className: 'tu-axisTick',
              'data-edge': tick.index === 0 ? 'start' : 'none',
              style: { left: (((tick.index + 0.5) / points.length) * 100) + '%' },
            }, tick.label)))),
          active && placement ? h('div', {
            className: 'tu-tipBox',
            role: 'status',
            ref: setTipNode,
            'data-side': placement.side,
            'data-visible': String(shown),
            'aria-hidden': shown ? undefined : 'true',
            // Position lives on the outer box so it can transition on its own;
            // the fade below never fights it for the same transform.
            style: { transform: `translate3d(${placement.left}px, ${placement.top}px, 0)` },
          },
            h('div', { className: 'tu-tipBody' },
              h('div', { className: 'tu-tipContent', key: active.bucket },
                h('div', { className: 'tu-tipTitle' }, periodLabel(active.bucket, granularity, lang)),
                tipLine(t('metric.total'), format(active.total)),
                tipLine(t('metric.input'), format(active.input), true),
                tipLine(t('metric.output'), format(active.output), true),
                // Cache rows appear together: a bucket either has cache counters
                // for this period or it does not.
                active.cacheRows > 0 ? tipLine(t('metric.cache'), format(active.cacheRead), true) : null,
                active.cacheRows > 0
                  ? tipLine(t('metric.cacheHit'), bucketCacheRate(active) === null
                    ? '—'
                    : (bucketCacheRate(active) * 100).toFixed(1) + '%', true)
                  : null,
                active.reasoning > 0 ? tipLine(t('metric.reasoning'), format(active.reasoning), true) : null,
                tipLine(t('metric.requests'), formatFull(active.requests), true)))) : null))
    }

    // --------------------------------------------------------------- ranking
    /**
     * The synthetic bucket: rows whose provider, account and model are all
     * `unknown`. The plan ranking has no such bucket (its "no plan" group is a
     * real category), so it is never filtered.
     */
    function isUnknownRankRow(row, by) {
      return by !== 'plan' && row != null && row.key === 'unknown'
    }

    /**
     * Drop the unknown bucket from a ranking unless the user asked to see it.
     * This is a display filter over the API's rows only — it never changes a
     * query, a total, a stored record or the request log.
     */
    function visibleRankingRows(rows, by, showUnknown) {
      if (showUnknown) return rows
      return rows.filter((row) => !isUnknownRankRow(row, by))
    }

    function Ranking({ rows, format, t, by, onPick }) {
      const max = rows.reduce((peak, row) => Math.max(peak, row.total), 0)
      if (!rows.length) return h('div', { className: 'tu-empty' }, t('rank.empty'))
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, rows.map((row, index) => {
        const planName = row.key === NO_PLAN_KEY ? t('filter.noPlan') : row.key
        // The synthetic bucket reads as one label, not "unknown · unknown".
        const unknownBucket = by !== 'plan' && row.key === 'unknown'
        const name = unknownBucket ? t('filter.unknown') : (row.name || (by === 'plan' ? planName : row.key))
        // The subtitle names the parent dimension: the provider for a model, and
        // the raw provider id for a provider the user renamed. When the display
        // name already equals the id there is nothing extra to say.
        const dim = unknownBucket ? '' : by === 'model' && row.providerName
          ? `${row.providerName}${row.accountName && row.accountName !== row.providerName ? ' · ' + row.accountName : ''}`
          : by === 'provider' && row.key && row.name !== row.key
            ? row.key
            : ''
        return h('div', {
          key: name + ':' + index,
          className: 'tu-rankBar',
          title: `${name} · ${format(row.total)}`,
          role: onPick ? 'button' : undefined,
          tabIndex: onPick ? 0 : undefined,
          style: onPick ? { cursor: 'pointer' } : undefined,
          onClick: onPick ? () => onPick(row) : undefined,
          onKeyDown: onPick ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick(row) }
          } : undefined,
        },
          h('div', { className: 'tu-rankFill', style: { width: max > 0 ? Math.max(2, Math.round((row.total / max) * 100)) + '%' : '0%' } }),
          h('div', { className: 'tu-rankText' },
            h('span', { className: 'tu-rankName' }, name),
            dim ? h('span', { className: 'tu-rankDim' }, dim) : null,
            h('span', { className: 'tu-rankValue' }, format(row.total))))
      }))
    }

    // --------------------------------------------------------------- filters
    function modelEntry(item, model, depth) {
      return {
        kind: 'model',
        depth,
        label: model.name,
        raw: model.modelId,
        signature: item.provider.providerId + '\u0000' + item.account.accountId + '\u0000' + model.modelId,
        total: model.total,
        node: model,
        provider: item.provider,
        account: item.account,
      }
    }

    /**
     * The `unknown` bucket is a single synthetic identity: the recorder writes
     * provider, account and model as `unknown` together when a step produced no
     * assistant message. Rendering it as provider → account → model would show
     * the same word three times, so it collapses to one row.
     */
    function isUnknownBucket(provider) {
      if (provider.providerId !== 'unknown') return false
      if (provider.accounts.length !== 1) return false
      const account = provider.accounts[0]
      if (account.accountId !== 'unknown' || account.models.length !== 1) return false
      return account.models[0].modelId === 'unknown'
    }

    function flattenTree(catalog, t) {
      const items = []
      for (const provider of catalog.providers) {
        if (isUnknownBucket(provider)) {
          items.push({
            kind: 'provider',
            depth: 0,
            label: provider.providerLabel || t('filter.unknown'),
            raw: provider.providerId,
            signature: provider.providerId,
            total: provider.total,
            node: provider,
            provider,
            collapsed: true,
          })
          continue
        }
        const providerItem = { kind: 'provider', depth: 0, provider }
        items.push({
          ...providerItem,
          label: provider.name,
          raw: provider.providerId,
          signature: provider.providerId,
          total: provider.total,
          node: provider,
        })
        for (const account of provider.accounts) {
          // In DSH one configured provider route is one credential source, so a
          // provider with a single account whose name matches the provider adds
          // a level that says nothing. Show it only when it carries information:
          // several accounts, or an account renamed away from the provider.
          const redundantAccount = provider.accounts.length === 1
            && account.accountId === provider.providerId
            && account.name === provider.name
          const accountItem = { kind: 'account', depth: 1, provider, account }
          if (!redundantAccount) {
            items.push({
              ...accountItem,
              label: account.name,
              raw: account.accountId,
              signature: provider.providerId + '\u0000' + account.accountId,
              total: account.total,
              node: account,
            })
          }
          const level = redundantAccount ? 1 : 2
          const planned = account.models.filter((model) => model.plan)
          const unplanned = account.models.filter((model) => !model.plan)
          if (planned.length === 0) {
            for (const model of account.models) items.push(modelEntry(accountItem, model, level))
            continue
          }
          const byPlan = new Map()
          for (const model of planned) {
            if (!byPlan.has(model.plan)) byPlan.set(model.plan, [])
            byPlan.get(model.plan).push(model)
          }
          for (const [planName, models] of [...byPlan.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
            const planItem = {
              kind: 'plan',
              depth: level,
              label: planName,
              signature: provider.providerId + '\u0000' + account.accountId + '\u0000p\u0000' + planName,
              total: models.reduce((sum, model) => sum + model.total, 0),
              provider,
              account,
            }
            items.push(planItem)
            for (const model of models) items.push(modelEntry(accountItem, model, level + 1))
          }
          if (unplanned.length) {
            items.push({
              kind: 'plan',
              depth: level,
              label: t('filter.noPlan'),
              signature: provider.providerId + '\u0000' + account.accountId + '\u0000p\u0000' + NO_PLAN_KEY,
              total: unplanned.reduce((sum, model) => sum + model.total, 0),
              provider,
              account,
              noPlan: true,
            })
            for (const model of unplanned) items.push(modelEntry(accountItem, model, level + 1))
          }
        }
      }
      return items
    }

    function EditPanel({ target, t, onSave, onCancel }) {
      const initialName = target.kind === 'model'
        ? (target.node.modelLabel || '')
        : target.kind === 'account'
          ? (target.account.accountLabel || '')
          : (target.provider.providerLabel || '')
      const [name, setName] = useState(initialName)
      const [plan, setPlan] = useState(target.kind === 'model' && target.node.plan ? target.node.plan : '')
      const rawId = target.kind === 'model'
        ? target.node.modelId
        : target.kind === 'account' ? target.account.accountId : target.provider.providerId
      return h('div', { className: 'tu-edit' },
        h('div', { className: 'tu-field' },
          h('span', { className: 'tu-fieldLabel', title: rawId }, t('filter.rename') + ' · ' + rawId),
          h('input', {
            className: 'tu-input',
            value: name,
            placeholder: rawId,
            maxLength: 120,
            onChange: (event) => setName(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') onSave(name, plan) },
          })),
        target.kind === 'model'
          ? h('div', { className: 'tu-field' },
            h('span', { className: 'tu-fieldLabel' }, t('filter.setPlan')),
            h('input', {
              className: 'tu-input',
              value: plan,
              placeholder: t('filter.noPlan'),
              maxLength: 60,
              onChange: (event) => setPlan(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') onSave(name, plan) },
            }))
          : null,
        h('div', { className: 'tu-row tu-row-tight' },
          h('button', { type: 'button', className: 'tu-btn', 'data-primary': 'true', onClick: () => onSave(name, plan) }, t('filter.save')),
          h('button', { type: 'button', className: 'tu-btn', onClick: onCancel }, t('filter.cancel'))))
    }

    function FilterMenu({ catalog, filter, t, format, onChange, onClear, onLabel, onPlan }) {
      const [open, setOpen] = useState(false)
      const [query, setQuery] = useState('')
      const [editing, setEditing] = useState(null)
      const wrapRef = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (wrapRef.current && !wrapRef.current.contains(event.target)) {
            setOpen(false)
            setEditing(null)
          }
        }
        const onKey = (event) => {
          if (event.key === 'Escape') { setOpen(false); setEditing(null) }
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      const summary = useMemo(() => {
        if (filter.model) return filter.model
        if (filter.plan) return filter.plan === NO_PLAN_KEY ? t('filter.noPlan') : filter.plan
        if (filter.account) return filter.account
        if (filter.provider) return filter.provider
        return null
      }, [filter, t])

      const items = useMemo(() => {
        const all = flattenTree(catalog, t)
        const needle = query.trim().toLowerCase()
        if (!needle) return all
        return all.filter((item) => `${item.label} ${item.raw || ''}`.toLowerCase().indexOf(needle) !== -1)
      }, [catalog, query, t])

      const isAll = !filter.provider && !filter.account && !filter.model && !filter.plan

      function pick(item) {
        if (item.kind === 'provider') onChange({ provider: item.node.providerId, account: null, model: null, plan: null })
        else if (item.kind === 'account') onChange({ provider: item.provider.providerId, account: item.account.accountId, model: null, plan: null })
        else if (item.kind === 'plan') onChange({ provider: item.provider.providerId, account: item.account.accountId, model: null, plan: item.noPlan ? NO_PLAN_KEY : item.label })
        else onChange({ provider: item.provider.providerId, account: item.account.accountId, model: item.node.modelId, plan: null })
        setOpen(false)
        setEditing(null)
      }

      function isActive(item) {
        if (item.kind === 'provider') return filter.provider === item.node.providerId && !filter.account && !filter.model && !filter.plan
        if (item.kind === 'account') return filter.account === item.node.accountId && !filter.model && !filter.plan
        if (item.kind === 'plan') return filter.account === item.account.accountId && filter.plan === (item.noPlan ? NO_PLAN_KEY : item.label) && !filter.model
        return filter.model === item.node.modelId && filter.account === item.account.accountId
      }

      function commit(name, plan) {
        const target = editing
        if (!target) return
        if (target.kind === 'model') {
          onLabel({ kind: 'model', providerId: target.provider.providerId, modelId: target.node.modelId, name })
          onPlan({ providerId: target.provider.providerId, accountId: target.account.accountId, modelId: target.node.modelId, plan })
        } else if (target.kind === 'account') {
          onLabel({ kind: 'account', providerId: target.provider.providerId, accountId: target.account.accountId, name })
        } else if (target.kind === 'provider') {
          onLabel({ kind: 'provider', providerId: target.provider.providerId, name })
        }
        setEditing(null)
      }

      return h('div', { className: 'tu-filterWrap', ref: wrapRef },
        h('button', {
          type: 'button',
          className: 'tu-trigger',
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          title: t('filter.all'),
          onClick: () => { setOpen((previous) => !previous); setEditing(null) },
        },
          h('span', { className: 'tu-triggerText' }, summary || t('filter.all')),
          h('span', { className: 'tu-triggerDim', 'aria-hidden': 'true' }, '▾')),
        open ? h('div', { className: 'tu-pop', role: 'dialog', 'aria-label': t('filter.all') },
          h('div', { className: 'tu-popHead' },
            h('input', {
              className: 'tu-input',
              style: { width: '100%' },
              value: query,
              placeholder: t('filter.search'),
              onChange: (event) => setQuery(event.target.value),
            })),
          editing ? h(EditPanel, { target: editing, t, onSave: commit, onCancel: () => setEditing(null) }) : null,
          h('div', { className: 'tu-popBody' },
            catalog.providers.length === 0 ? h('div', { className: 'tu-empty' }, t('filter.empty')) : null,
            query.trim() === ''
              ? h('div', { className: 'tu-itemRow' },
                h('button', {
                  type: 'button',
                  className: 'tu-item',
                  'data-active': String(isAll),
                  onClick: () => { onClear(); setOpen(false) },
                }, h('span', { className: 'tu-itemText' }, t('filter.all'))))
              : null,
            items.map((item, index) => h('div', { key: item.signature + ':' + index, className: 'tu-itemRow' },
              h('button', {
                type: 'button',
                className: 'tu-item',
                'data-depth': String(item.depth),
                'data-active': String(isActive(item)),
                onClick: () => pick(item),
                title: item.raw ? `${item.label} — ${item.raw}` : item.label,
              },
                h('span', { className: 'tu-itemText' }, item.label),
                item.kind === 'model' && item.node.plan ? h('span', { className: 'tu-tag' }, item.node.plan) : null,
                h('span', { className: 'tu-itemValue' }, format(item.total))),
              h('button', {
                type: 'button',
                className: 'tu-iconBtn',
                title: t('filter.rename'),
                'aria-label': t('filter.rename') + ' ' + item.label,
                disabled: item.kind === 'plan',
                onClick: () => setEditing(item),
              }, '✎')))),
          h('div', { className: 'tu-popFoot' },
            h('button', { type: 'button', className: 'tu-btn', onClick: () => { onClear(); setOpen(false) } }, t('filter.clear'))))
          : null)
    }

    // ------------------------------------------------------------------ page
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      render() {
        if (this.state.error) {
          const message = (this.state.error && this.state.error.message) || String(this.state.error)
          return h('div', { className: 'tu-root' }, h('div', { className: 'tu-inner' },
            h('p', { className: 'tu-err' }, message)))
        }
        return this.props.children
      }
    }

    function createPage(t) {
      return function TokenUsagePage() {
        const [range, setRange] = useState(null)
        const [customFrom, setCustomFrom] = useState('')
        const [customTo, setCustomTo] = useState('')
        // Which date field owns the open calendar, if any.
        const [openField, setOpenField] = useState(null)
        const [filter, setFilter] = useState({ provider: null, account: null, model: null, plan: null })
        const [format, setFormat] = useState('short')
        const [data, setData] = useState(null)
        const [records, setRecords] = useState({ items: [], total: 0, offset: 0 })
        const [loading, setLoading] = useState(true)
        const [error, setError] = useState(null)
        const [rankBy, setRankBy] = useState('model')
        // Display preferences. They only decide what the page draws; no query,
        // total or stored record depends on them.
        const [prefs, setPrefs] = useState({ showUnknownRanking: false, showUnknownUsageNote: true })
        const [settingsOpen, setSettingsOpen] = useState(false)
        const seq = useRef(0)
        const mounted = useRef(true)

        useEffect(() => () => { mounted.current = false }, [])

        const formatter = useMemo(() => makeFormatter(format), [format])

        const read = useCallback(async (next) => {
          const ticket = ++seq.current
          setLoading(true)
          setError(null)
          const args = {
            range: next.range || undefined,
            from: next.customFrom || undefined,
            to: next.customTo || undefined,
            granularity: next.granularity || undefined,
            provider: next.filter.provider || undefined,
            account: next.filter.account || undefined,
            model: next.filter.model || undefined,
            plan: next.filter.plan || undefined,
          }
          try {
            const [bootstrap, page] = await Promise.all([
              rpc('bootstrap', args),
              rpc('records', { ...args, offset: 0, limit: PAGE_SIZE }),
            ])
            if (ticket !== seq.current || !mounted.current) return
            setData(bootstrap)
            setRecords({ items: page.items, total: page.total, offset: page.items.length })
            setLoading(false)
            return bootstrap
          } catch (err) {
            if (ticket !== seq.current || !mounted.current) return
            setError(String((err && err.message) || err))
            setLoading(false)
            return null
          }
        }, [])

        // One load on mount: the Host resolves the persisted range when the
        // client sends none, so startup is a single round trip pair.
        useEffect(() => {
          let cancelled = false
          ;(async () => {
            const bootstrap = await read({ range: null, customFrom: '', customTo: '', filter: { provider: null, account: null, model: null, plan: null }, granularity: null })
            if (cancelled || !bootstrap) return
            const settings = bootstrap.settings || {}
            setFormat(settings.numberFormat === 'full' ? 'full' : 'short')
            setRange(bootstrap.range.kind)
            setCustomFrom(settings.lastCustomFrom || '')
            setCustomTo(settings.lastCustomTo || '')
            setPrefs({
              showUnknownRanking: settings.showUnknownRanking === true,
              showUnknownUsageNote: settings.showUnknownUsageNote !== false,
            })
          })()
          return () => { cancelled = true }
        }, [read])

        const applyRange = (kind) => {
          setRange(kind)
          if (kind === 'custom') {
            // Seed the pickers from whatever range is on screen, so switching to
            // 自定义 never shows two empty fields over a populated chart and never
            // overwrites the saved dates with an empty string.
            const shown = data && data.range && data.range.to > data.range.from ? data.range : null
            const nextFrom = customFrom || (shown ? formatDay(shown.from) : '')
            const nextTo = customTo || (shown ? formatDay(shown.to - 1) : '')
            if (!customFrom && nextFrom) setCustomFrom(nextFrom)
            if (!customTo && nextTo) setCustomTo(nextTo)
            // Send the current granularity: the Host keeps it when the new range
            // still offers it, and falls back to that range's default otherwise.
            read({ range: 'custom', customFrom: nextFrom, customTo: nextTo, filter, granularity })
            rpc('settings', { lastRange: 'custom', lastCustomFrom: nextFrom, lastCustomTo: nextTo }).catch(() => {})
          } else {
            read({ range: kind, customFrom: '', customTo: '', filter, granularity })
            rpc('settings', { lastRange: kind }).catch(() => {})
          }
        }

        const applyCustom = () => {
          setRange('custom')
          read({ range: 'custom', customFrom, customTo, filter, granularity })
          rpc('settings', { lastRange: 'custom', lastCustomFrom: customFrom, lastCustomTo: customTo }).catch(() => {})
        }

        const changeFilter = (patch) => {
          const next = { provider: patch.provider, account: patch.account, model: patch.model, plan: patch.plan }
          setFilter(next)
          read({ range: range || 'today', customFrom, customTo, filter: next, granularity })
        }

        const changeGranularity = (value) => {
          read({ range: range || 'today', customFrom, customTo, filter, granularity: value })
        }

        const changeFormat = (value) => {
          setFormat(value)
          rpc('settings', { numberFormat: value }).catch(() => {})
        }

        /** Flip one display preference: apply it now, persist it in the background. */
        const changePref = (key, value) => {
          setPrefs((current) => ({ ...current, [key]: value }))
          rpc('settings', { [key]: value }).catch(() => {})
        }

        const dismissUnknownNote = () => changePref('showUnknownUsageNote', false)

        const loadMore = async () => {
          try {
            const page = await rpc('records', {
              range: range || 'today',
              from: customFrom || undefined,
              to: customTo || undefined,
              provider: filter.provider || undefined,
              account: filter.account || undefined,
              model: filter.model || undefined,
              plan: filter.plan || undefined,
              offset: records.offset,
              limit: PAGE_SIZE,
            })
            setRecords((current) => ({
              items: current.items.concat(page.items),
              total: page.total,
              offset: current.offset + page.items.length,
            }))
          } catch (err) {
            setError(String((err && err.message) || err))
          }
        }

        const saveLabel = async (args) => {
          try { await rpc('label', args) } catch (err) { setError(String((err && err.message) || err)) }
          read({ range: range || 'today', customFrom, customTo, filter, granularity: null })
        }

        const savePlan = async (args) => {
          try { await rpc('plan', args) } catch (err) { setError(String((err && err.message) || err)) }
          read({ range: range || 'today', customFrom, customTo, filter, granularity: null })
        }

        const summary = (data && data.summary) || null
        const catalog = (data && data.catalog) || { providers: [], plans: [] }
        const trends = (data && data.trend) || []
        const rankings = (data && data.rankings) || { model: [], provider: [], account: [], plan: [] }
        const startedAt = data ? (data.firstRecordAt || data.startedAt) : null
        const granularity = data && data.granularity ? data.granularity : 'day'

        const rangeOptions = ['today', 'week', 'month', 'year', 'all', 'custom']
          .map((value) => ({ value, label: t('range.' + value) }))
        // The account is always the provider and the plan is an unused label,
        // so the ranking only offers the two dimensions that carry information.
        const rankOptions = ['model', 'provider']
          .map((value) => ({ value, label: t('rank.' + value) }))
        // The Host decides which granularities the current range offers, so the
        // selector can never show an option that would not change the grouping.
        const granularityOptions = ((data && data.granularityOptions) || ['day'])
          .map((value) => ({ value, label: t('trend.' + value) }))

        const fromParts = splitInput(customFrom)
        const toParts = splitInput(customTo)
        // Today, in the Host's clock, so the calendar marker matches the data.
        const todayKey = formatDay(Number(data && data.serverTime) || Date.now())

        return h('div', { className: 'tu-root' },
          h('div', { className: 'tu-inner' + (loading ? ' tu-loading' : '') },
            h('div', { className: 'tu-head' },
              h('div', null,
                h('h1', { className: 'tu-title' }, t('panelTitle')),
                startedAt ? h('div', { className: 'tu-sub' }, t('status.since') + ' ' + formatDay(startedAt)) : null),
              h('div', { className: 'tu-row tu-row-tight' },
                h('span', { className: 'tu-sub' }, t('format.label')),
                h(Segmented, {
                  ariaLabel: t('format.label'),
                  value: format,
                  options: [{ value: 'short', label: t('format.short') }, { value: 'full', label: t('format.full') }],
                  onChange: changeFormat,
                }),
                h(SettingsMenu, { prefs, t, onChange: changePref }))),

            h('div', { className: 'tu-row' },
              h(Segmented, { ariaLabel: t('status.rangeLabel'), value: range, options: rangeOptions, onChange: applyRange }),
              range === 'custom' ? h('div', { className: 'tu-row tu-row-tight' },
                h(DatePicker, {
                  which: 'from',
                  value: fromParts.date,
                  from: fromParts.date,
                  to: toParts.date,
                  label: t('range.from'),
                  placeholder: t('range.placeholder'),
                  open: openField === 'from',
                  onToggle: () => setOpenField(openField === 'from' ? null : 'from'),
                  onSelect: (day) => { setCustomFrom(day); setOpenField(null) },
                  onClose: () => setOpenField(null),
                  t,
                  todayKey,
                }),
                h('span', { className: 'tu-sub' }, '→'),
                h(DatePicker, {
                  which: 'to',
                  value: toParts.date,
                  from: fromParts.date,
                  to: toParts.date,
                  label: t('range.to'),
                  placeholder: t('range.placeholder'),
                  open: openField === 'to',
                  onToggle: () => setOpenField(openField === 'to' ? null : 'to'),
                  onSelect: (day) => { setCustomTo(day); setOpenField(null) },
                  onClose: () => setOpenField(null),
                  t,
                  todayKey,
                }),
                h('button', { type: 'button', className: 'tu-btn', onClick: applyCustom }, t('range.apply')))
                : null,
              h('div', { className: 'tu-spacer' }),
              h(FilterMenu, {
                catalog,
                filter,
                t,
                format: formatter,
                onChange: changeFilter,
                onClear: () => changeFilter({ provider: null, account: null, model: null, plan: null }),
                onLabel: saveLabel,
                onPlan: savePlan,
              })),

            error ? h('p', { className: 'tu-err' }, t('status.failed') + ': ' + error) : null,

            summary ? h('div', { className: 'tu-metrics' },
              h(Metric, { label: t('metric.total'), value: formatter(summary.total) }),
              h(Metric, { label: t('metric.input'), value: formatter(summary.input) }),
              h(Metric, { label: t('metric.output'), value: formatter(summary.output) }),
              summary.hasCache ? h(Metric, { label: t('metric.cache'), value: formatter(summary.cacheRead) }) : null,
              summary.hasCache
                ? h(Metric, {
                  label: t('metric.cacheHit'),
                  // A missing denominator means "no provider reported cache
                  // counters", which must not read as 0%.
                  value: summary.cacheHitRate === null || summary.cacheHitRate === undefined
                    ? '—'
                    : (summary.cacheHitRate * 100).toFixed(1) + '%',
                })
                : null,
              summary.hasReasoning ? h(Metric, { label: t('metric.reasoning'), value: formatter(summary.reasoning) }) : null,
              h(Metric, { label: t('metric.requests'), value: formatFull(summary.requests) })) : null,

            summary && summary.unknownCount > 0 && prefs.showUnknownUsageNote
              ? h('p', { className: 'tu-noteRow' },
                h('span', { className: 'tu-note' }, t('status.unknownNote', { n: summary.unknownCount })),
                h('button', {
                  type: 'button',
                  className: 'tu-linkBtn',
                  onClick: dismissUnknownNote,
                }, t('status.unknownDismiss')))
              : null,

            h('div', { className: 'tu-sect' },
              h('div', { className: 'tu-sectHead' },
                h('h2', { className: 'tu-sectTitle' }, t('trend.title')),
                h(Segmented, { ariaLabel: t('trend.title'), value: granularity, options: granularityOptions, onChange: changeGranularity })),
              h(TrendChart, {
                points: trends,
                format: formatter,
                granularity,
                t,
                // A whole year of days is a heatmap; every other view is bars.
                mode: data && data.range && data.range.kind === 'year' && granularity === 'day' ? 'heatmap' : 'bar',
                serverTime: data ? data.serverTime : null,
              })),

            h('div', { className: 'tu-sect' },
              h('div', { className: 'tu-sectHead' },
                h('h2', { className: 'tu-sectTitle' }, t('rank.title')),
                h(Segmented, { ariaLabel: t('rank.title'), value: rankBy, options: rankOptions, onChange: setRankBy })),
              h(Ranking, {
                rows: visibleRankingRows(rankings[rankBy] || [], rankBy, prefs.showUnknownRanking),
                format: formatter,
                t,
                by: rankBy,
                onPick: rankBy === 'model'
                  ? (row) => changeFilter({ provider: row.providerId, account: row.accountId, model: row.key, plan: null })
                  : rankBy === 'provider'
                    ? (row) => changeFilter({ provider: row.key, account: null, model: null, plan: null })
                    : rankBy === 'account'
                      ? (row) => changeFilter({ provider: row.providerId, account: row.key, model: null, plan: null })
                      : (row) => changeFilter({ provider: null, account: null, model: null, plan: row.key }),
              })),

            h('div', { className: 'tu-sect' },
              h('div', { className: 'tu-sectHead' },
                h('h2', { className: 'tu-sectTitle' }, t('records.title')),
                h('span', { className: 'tu-sub' }, formatFull(records.total))),
              records.items.length === 0
                ? h('div', { className: 'tu-empty' }, t('records.empty'))
                : h('table', { className: 'tu-table' },
                  h('thead', null, h('tr', null,
                    h('th', null, t('records.time')),
                    h('th', null, t('records.provider')),
                    h('th', null, t('records.model')),
                    h('th', { className: 'tu-num' }, t('records.input')),
                    h('th', { className: 'tu-num' }, t('records.output')),
                    h('th', { className: 'tu-num' }, t('records.total')))),
                  h('tbody', null, records.items.map((row) => h('tr', { key: row.id },
                    h('td', { title: formatDateTime(row.ts) }, formatTime(row.ts)),
                    h('td', null, row.providerName),
                    h('td', { title: row.modelId }, row.modelName),
                    h('td', { className: 'tu-num' }, row.known ? formatter(row.input) : t('records.unknown')),
                    h('td', { className: 'tu-num' }, row.known ? formatter(row.output) : t('records.unknown')),
                    h('td', { className: 'tu-num' }, row.known ? formatter(row.total) : t('records.unknown')))))),
              records.items.length < records.total
                ? h('div', { className: 'tu-row' },
                  h('button', { type: 'button', className: 'tu-btn', onClick: loadMore }, t('records.more')))
                : null,
              h('p', { className: 'tu-note' }, t('records.note')))))
      }
    }

    // ------------------------------------------------------------------ icon
    function PanelIcon({ size }) {
      const edge = typeof size === 'number' && size > 0 ? size : 16
      return h('svg', {
        className: 'tu-icon',
        viewBox: '0 0 64 64',
        width: edge,
        height: edge,
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
        h('rect', { x: '14', y: '34', width: '7', height: '16', rx: '2.5', fill: 'currentColor', opacity: '.45' }),
        h('rect', { x: '25', y: '26', width: '7', height: '24', rx: '2.5', fill: 'currentColor', opacity: '.7' }),
        h('rect', { x: '36', y: '18', width: '7', height: '32', rx: '2.5', fill: 'currentColor' }),
        h('circle', { cx: '49.5', cy: '22.5', r: '6.5', stroke: 'currentColor', strokeWidth: '3' }))
    }

    // ----------------------------------------------------------------- apply
    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (!slots) return
        const locale = ctx.get('locale')
        const t = createTranslator(locale || null)

        ctx.effect(() => insertStyles())

        const Page = createPage(t)
        const renderPage = () => h(Boundary, null, h(Page))

        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ t }),
        }, renderPage)))

        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('nav'),
          locale: NS,
        }, (ownerProps) => h(PanelIcon, { size: ownerProps && ownerProps.size }))))
      },
    }
  },
})
