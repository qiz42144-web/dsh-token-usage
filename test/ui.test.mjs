import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

import { createRenderer, findAll, findByText, textOf } from './mini-react.mjs'

/** True when a node carries `name` among its classes. */
const hasClass = (node, name) => Boolean(
  node && node.props && typeof node.props.className === 'string'
  && node.props.className.split(' ').includes(name),
)

/** The tooltip element, which stays mounted while hidden. */
const tipBox = (tree) => findAll(tree, (node) => node.props && node.props.className === 'tu-tipBox')[0]
/** Whether the tooltip is currently faded in. */
const tipShown = (tree) => {
  const box = tipBox(tree)
  return Boolean(box) && box.props['data-visible'] === 'true'
}

/** Read the translate3d offsets the tooltip is positioned with. */
const tipPosition = (box) => {
  const match = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(String(box.props.style.transform || ''))
  return match ? { left: Number(match[1]), top: Number(match[2]) } : { left: NaN, top: NaN }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** A little over the component's 300ms show delay. */
const HOVER_WAIT = 340

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

/** Load the shipping `client.js` in a stub browser and return its plugin half. */
function loadClient(fetchImpl, { language = 'zh-CN' } = {}) {
  const renderer = createRenderer()
  const registrations = []
  const styleElements = []
  const calls = []
  let plugin = null

  const document = {
    head: { appendChild: (element) => styleElements.push(element) },
    createElement: () => ({
      setAttribute() {},
      set textContent(value) { this._text = value },
      get textContent() { return this._text },
      remove() {},
    }),
    addEventListener() {},
    removeEventListener() {},
  }

  const window = {
    __ModuleLoader__: {
      load: (definition) => {
        assert.equal(definition.id, 'dsh-token-usage')
        plugin = definition.factory((name) => {
          assert.equal(name, 'react')
          return renderer.React
        })
      },
    },
  }

  const sandbox = {
    window,
    document,
    navigator: { language },
    console,
    setTimeout,
    clearTimeout,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body)
      calls.push({ url, body })
      const payload = await fetchImpl(body.method, body.args)
      return { ok: true, status: 200, json: async () => ({ ok: true, data: payload }) }
    },
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.ok(plugin, 'the module loader must receive the plugin definition')

  const locale = {
    registered: [],
    register(ns, lang, dict) { this.registered.push({ ns, lang, size: Object.keys(dict).length }); return () => {} },
    // `options.staleBind` simulates a locale service still holding an older
    // dictionary: it answers with a value the shipped dictionary disagrees with.
    bind: () => (key) => (options.staleBind && options.staleBind[key]) || key,
    getLocale: () => ({ id: language }),
  }
  const slots = {
    inject: (key, callback) => {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    register: (options, component) => {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const ctx = {
    slots,
    get: (name) => (name === 'slots' ? slots : name === 'locale' ? locale : undefined),
    effect: (fn) => { const disposer = fn(); return disposer },
  }
  plugin.apply(ctx)
  return { plugin, registrations, calls, styleElements, locale, renderer }
}

const summary = {
  requests: 42, knownCount: 40, unknownCount: 2,
  total: 4_254_321_987, input: 12_345_678, output: 1_234_567,
  cacheRead: 4_000_000_000, cacheWrite: 0, reasoning: 98_765,
  cacheHitRate: 4_000_000_000 / (4_000_000_000 + 12_345_678),
  hasCache: true, hasReasoning: true,
}

const catalog = {
  plans: ['1017 套餐'],
  providers: [
    {
      providerId: 'baidu',
      name: '百度千帆',
      providerLabel: null,
      defaultName: 'baidu',
      total: 3_000_000_000,
      requests: 30,
      accounts: [
        {
          accountId: 'baidu',
          name: '百度千帆',
          accountLabel: null,
          total: 3_000_000_000,
          requests: 30,
          models: [
            { modelId: 'deepseek-v4.1-flash-1017', name: 'V4.1 Flash 1017', modelLabel: 'V4.1 Flash 1017', plan: '1017 套餐', requests: 20, total: 2_000_000_000 },
            { modelId: 'glm-5.3', name: 'glm-5.3', modelLabel: null, plan: null, requests: 10, total: 1_000_000_000 },
          ],
        },
      ],
    },
    {
      providerId: 'ark',
      name: 'ark',
      providerLabel: null,
      defaultName: 'ark',
      total: 1_254_321_987,
      requests: 12,
      accounts: [
        {
          accountId: 'ark',
          name: 'ark',
          accountLabel: null,
          total: 1_254_321_987,
          requests: 12,
          models: [
            { modelId: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash', modelLabel: null, plan: null, requests: 12, total: 1_254_321_987 },
          ],
        },
      ],
    },
  ],
}

function bootstrapPayload(overrides = {}) {
  return {
    settings: {
      numberFormat: 'short',
      lastRange: 'month',
      lastCustomFrom: '',
      lastCustomTo: '',
      showUnknownRanking: false,
      showUnknownUsageNote: true,
    },
    range: { kind: 'month', from: new Date(2026, 10, 1).getTime(), to: new Date(2026, 11, 1).getTime() },
    granularity: 'day',
    granularityOptions: ['day', 'week'],
    autoGranularity: 'day',
    filter: { provider: null, account: null, model: null, plan: null, q: null },
    summary,
    trend: [
      { bucket: '2026-11-01', requests: 10, total: 1_000_000_000, input: 100, output: 10, cacheRead: 400, cacheRows: 10 },
      { bucket: '2026-11-02', requests: 12, total: 2_000_000_000, input: 200, output: 20, cacheRead: 0, cacheRows: 12 },
      { bucket: '2026-11-03', requests: 20, total: 1_254_321_987, input: 300, output: 30, cacheRead: 0, cacheRows: 0 },
    ],
    rankings: {
      model: [
        { key: 'deepseek-v4.1-flash-1017', name: 'V4.1 Flash 1017', providerId: 'baidu', accountId: 'baidu', providerName: '百度千帆', accountName: '百度千帆', requests: 20, total: 2_000_000_000, input: 1, output: 1 },
        { key: 'glm-5.3', name: 'glm-5.3', providerId: 'baidu', accountId: 'baidu', providerName: '百度千帆', accountName: '百度千帆', requests: 10, total: 1_000_000_000, input: 1, output: 1 },
      ],
      provider: [
        { key: 'baidu', name: '百度千帆', requests: 30, total: 3_000_000_000, input: 1, output: 1, modelCount: 2 },
        { key: 'ark', name: 'ark', requests: 12, total: 1_254_321_987, input: 1, output: 1, modelCount: 1 },
      ],
      account: [
        { key: 'baidu', name: '百度千帆', providerId: 'baidu', providerName: '百度千帆', requests: 30, total: 3_000_000_000, input: 1, output: 1 },
      ],
      plan: [
        { key: '1017 套餐', name: '1017 套餐', requests: 20, total: 2_000_000_000, input: 1, output: 1 },
        { key: '__none__', name: null, requests: 22, total: 2_254_321_987, input: 1, output: 1 },
      ],
    },
    catalog,
    startedAt: new Date(2026, 9, 1).getTime(),
    firstRecordAt: new Date(2026, 9, 1).getTime(),
    serverTime: Date.now(),
    noPlanKey: '__none__',
    ...overrides,
  }
}

function recordsPayload() {
  return {
    total: 42,
    offset: 0,
    limit: 50,
    items: [
      {
        id: 'msg:s1:10', ts: new Date(2026, 10, 3, 14, 5).getTime(), turn: 1, step: 1, source: 'message',
        providerId: 'baidu', providerName: '百度千帆', accountId: 'baidu', accountName: '百度千帆',
        modelId: 'deepseek-v4.1-flash-1017', modelName: 'V4.1 Flash 1017', plan: '1017 套餐',
        known: true, input: 12_000, output: 800, total: 12_800, cacheRead: 0, cacheWrite: 0, reasoning: null,
      },
      {
        id: 'step:s1:11', ts: new Date(2026, 10, 3, 14, 6).getTime(), turn: 1, step: 2, source: 'attempt',
        providerId: 'unknown', providerName: 'unknown', accountId: 'unknown', accountName: 'unknown',
        modelId: 'unknown', modelName: 'unknown', plan: null,
        known: false, input: null, output: null, total: null, cacheRead: null, cacheWrite: null, reasoning: null,
      },
    ],
  }
}

function handler(overrides = {}) {
  return async (method, args) => {
    if (method === 'bootstrap') {
      // A realistic month range: the page seeds the custom pickers from it.
      return bootstrapPayload({
        range: {
          kind: args.range || 'month',
          from: new Date(2026, 10, 1).getTime(),
          to: new Date(2026, 11, 1).getTime(),
        },
        ...overrides,
      })
    }
    if (method === 'records') return recordsPayload()
    if (method === 'settings') return { numberFormat: args.numberFormat || 'short', lastRange: args.lastRange || 'month' }
    if (method === 'label' || method === 'plan') return { ok: true }
    throw new Error(`unexpected method ${method}`)
  }
}

async function renderPage(options = {}) {
  const loaded = loadClient(options.fetchImpl || handler(options.bootstrap || {}), options)
  const main = loaded.registrations.find((entry) => entry.options.name === 'main')
  assert.ok(main, 'the page must register in the main slot')
  const tree = await loaded.renderer.render(main.component({}))
  return { ...loaded, tree, main }
}

test('the plugin registers a sidebar entry and a main page', () => {
  const loaded = loadClient(handler())
  const sidebar = loaded.registrations.find((entry) => entry.options.name === 'sidebar.panellist')
  assert.ok(sidebar, 'a sidebar icon must be registered')
  assert.equal(sidebar.options.id, 'token-usage')
  assert.equal(typeof sidebar.options.label, 'function')
  const main = loaded.registrations.find((entry) => entry.options.name === 'main')
  assert.equal(main.options.key, 'token-usage', 'the sidebar id addresses the same main panel')
  assert.equal(loaded.styleElements.length, 1, 'one stylesheet is inserted')
  const icon = loaded.renderer.render(sidebar.component({ size: 16, active: true }))
  assert.ok(icon)
})

test('the render harness rejects a component that changes its hook count', async () => {
  // Guards the guard: without this, a hook-order regression could pass the
  // suite the way it passed the first time.
  const { React, render } = createRenderer()
  function Unstable({ withExtra }) {
    const [value] = React.useState(0)
    if (withExtra) React.useMemo(() => 1, [withExtra])
    return React.createElement('div', null, String(value))
  }
  await render(React.createElement(Unstable, { withExtra: false }))
  await assert.rejects(
    () => render(React.createElement(Unstable, { withExtra: true })),
    /Rendered more hooks than during the previous render/,
  )
})

test('the page survives the empty state to the data state without a hook-order error', async () => {
  // This is the exact sequence that produced React error #310 in the desktop
  // app: the first paint has no data, so the chart renders its empty branch,
  // and the payload arrives on a later render.
  const loaded = loadClient(handler())
  const main = loaded.registrations.find((entry) => entry.options.name === 'main')
  const first = await loaded.renderer.render(main.component({}), { passes: 1 })
  assert.ok(textOf(first).includes('该时间段没有数据'), 'the first paint is the empty state')
  const second = await loaded.renderer.render(main.component({}))
  const text = textOf(second)
  assert.ok(text.includes('4.25B'), 'the data state renders after the empty state')
  const bars = findAll(second, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  assert.equal(bars.length, 3, 'the chart draws its bars on the later render')
})

test('the page renders real aggregated numbers after the first load', async () => {
  const { tree, calls } = await renderPage()
  const text = textOf(tree)
  assert.ok(calls.length >= 2, 'the page loads the dashboard and the first record page')
  assert.equal(calls[0].body.method, 'bootstrap')
  assert.ok(text.includes('Token 用量'), 'the localized title is rendered')
  // Short format is the stored preference.
  assert.ok(text.includes('4.25B'), `expected the short total, got: ${text.slice(0, 400)}`)
  assert.ok(text.includes('12.35M'), 'input tokens are rendered in short form')
  assert.ok(text.includes('1.23M'), 'output tokens are rendered in short form')
  assert.ok(text.includes('98.77K'), 'reasoning tokens are rendered')
  assert.ok(text.includes('42'), 'the request count is rendered')
  assert.ok(text.includes('百度千帆'), 'provider display names come from the catalog')
  assert.ok(text.includes('V4.1 Flash 1017'), 'model display names come from the catalog')
  assert.ok(text.includes('2 条请求未返回 usage'), 'unknown usage is disclosed, not counted as zero')
  assert.ok(text.includes('2026-10-01'), 'the recording start date is shown')
})

test('switching the number format reformats everything and persists', async () => {
  const { tree, renderer, registrations, calls } = await renderPage()
  const main = registrations.find((entry) => entry.options.name === 'main')
  // Find the "完整" segment button inside the format group and click it.
  const formatButtons = findAll(tree, (node) => node.tag === 'button')
  const full = formatButtons.find((node) => (node.children || []).some((child) => child.text === '完整'))
  assert.ok(full, `the full-format control must exist (${formatButtons.length} buttons found)`)
  full.props.onClick()
  const next = await renderer.render(main.component({}))
  const text = textOf(next)
  assert.ok(text.includes('4,254,321,987'), `full format must group thousands: ${text.slice(0, 300)}`)
  assert.ok(!text.includes('4.25B'), 'the short form must be gone after switching')
  const saved = calls.filter((call) => call.body.method === 'settings').pop()
  assert.equal(saved.body.args.numberFormat, 'full', 'the preference is persisted')
})

test('the trend chart exposes every bucket and a hover readout', async () => {
  const { tree, renderer, main } = await renderPage()
  const bars = findAll(tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  assert.equal(bars.length, 3, 'one bar per bucket in the range')

  // The axis is short and local: no ISO timestamp, no year.
  const axis = findAll(tree, (node) => hasClass(node, 'tu-axis'))[0]
  const axisText = textOf(axis)
  assert.ok(axisText.includes('11-01'), `the axis uses MM-DD: ${axisText}`)
  assert.ok(axisText.includes('11-03'), `the axis uses MM-DD: ${axisText}`)
  assert.ok(!axisText.includes('2026-'), 'the axis never shows the ISO year')

  // A few buckets must not stretch into one full-width slab.
  for (const bar of bars) {
    assert.equal(bar.props.style.maxWidth, '56px', 'sparse buckets are width-capped')
    assert.ok(bar.props.style.height.endsWith('%'), 'bar height is a percentage of the peak')
  }
  const chart = findAll(tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-chart')[0]
  assert.equal(chart.props.style.justifyContent, 'center', 'a sparse chart centres its bars')

  // Hovering a bar opens a tooltip with the full period and the totals.
  bars[0].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  const hovered = await renderer.render(main.component({}))
  const box = findAll(hovered, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-tipBox')[0]
  assert.ok(box, 'the tooltip appears on hover')
  const tip = textOf(box)
  assert.ok(tip.includes('2026-11-01'), `the tooltip uses the full date: ${tip}`)
  assert.ok(tip.includes('1B'), `the tooltip shows the total in the current format: ${tip}`)
  assert.ok(box.props.style.transform.includes('translate3d'), 'the tooltip is positioned by transform')
})

test('the axis and the tooltip follow the granularity', async () => {
  const hourly = await renderPage({
    bootstrap: {
      granularity: 'hour',
      granularityOptions: ['hour'],
      trend: [
        { bucket: '2026-11-05T00', requests: 2, total: 10, input: 1, output: 1, cacheRead: 0 },
        { bucket: '2026-11-05T06', requests: 3, total: 20, input: 2, output: 2, cacheRead: 0 },
      ],
    },
  })
  const hourAxis = findAll(hourly.tree, (node) => hasClass(node, 'tu-axis'))[0]
  const hourText = textOf(hourAxis)
  assert.ok(hourText.includes('00:00'), `hourly labels are HH:mm: ${hourText}`)
  assert.ok(hourText.includes('06:00'), `hourly labels are HH:mm: ${hourText}`)
  assert.ok(!hourText.includes('T00'), 'no ISO hour marker on the axis')

  const bars = findAll(hourly.tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  bars[1].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  const hovered = await hourly.renderer.render(hourly.main.component({}))
  const box = findAll(hovered, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-tipBox')[0]
  assert.ok(textOf(box).includes('2026-11-05 06:00–07:00'), `an hour spans a clock range: ${textOf(box)}`)

  const monthly = await renderPage({
    bootstrap: {
      granularity: 'month',
      granularityOptions: ['month'],
      trend: [
        { bucket: '2026-01', requests: 1, total: 5, input: 1, output: 1, cacheRead: 0 },
        { bucket: '2026-02', requests: 1, total: 6, input: 1, output: 1, cacheRead: 0 },
      ],
    },
  })
  const monthAxis = findAll(monthly.tree, (node) => hasClass(node, 'tu-axis'))[0]
  const monthText = textOf(monthAxis)
  assert.ok(monthText.includes('1月'), `months read as Chinese months: ${monthText}`)
  assert.ok(monthText.includes('2月'), `months read as Chinese months: ${monthText}`)
})

test('the tooltip shows the cache hit rate for the hovered period', async () => {
  const { tree, renderer, main } = await renderPage()
  const barsOf = (rendered) => findAll(rendered, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  const openTip = async (index) => {
    barsOf(tree)[index].props.onMouseEnter()
    await sleep(HOVER_WAIT)
    const rendered = await renderer.render(main.component({}))
    return textOf(tipBox(rendered))
  }

  // 400 cached of 500 prompt tokens for 2026-11-01.
  const first = await openTip(0)
  assert.ok(first.includes('缓存命中率'), `the row is present: ${first}`)
  assert.ok(first.includes('80.0%'), `the rate uses this bucket's data: ${first}`)
  // The row sits under 缓存.
  assert.ok(first.indexOf('缓存命中率') > first.indexOf('缓存'), 'the rate follows the cache row')

  // A bucket whose provider reported cache counters but no hits is a real 0%.
  const second = await openTip(1)
  assert.ok(second.includes('0.0%'), `a real zero is shown as 0.0%: ${second}`)

  // No cache counters at all in that period: unknown, never 0%.
  const third = await openTip(2)
  assert.ok(!third.includes('缓存命中率'), `no cache data means no row: ${third}`)
  assert.ok(!third.includes('0.0%'), 'and never a misleading zero')
})

test('the tooltip never covers the hovered bar and stays inside the plot', async () => {
  const { tree, renderer, main } = await renderPage({
    bootstrap: {
      trend: [
        { bucket: '2026-11-01', requests: 1, total: 100, input: 1, output: 1, cacheRead: 0 },
        { bucket: '2026-11-02', requests: 1, total: 5000, input: 1, output: 1, cacheRead: 0 },
      ],
    },
  })
  const bars = findAll(tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  assert.equal(bars.length, 2)
  // The native `title` used to draw a second, OS-level tooltip on top of the
  // custom card. The accessible name replaces it without any visual popup.
  for (const bar of bars) {
    assert.equal(bar.props.title, undefined, 'no native title tooltip')
    assert.ok(bar.props['aria-label'], 'the bar keeps an accessible name')
  }

  // A short bar leaves room above, so the card sits above it.
  bars[0].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  let hovered = await renderer.render(main.component({}))
  let box = findAll(hovered, (node) => node.props && node.props.className === 'tu-tipBox')[0]
  assert.equal(box.props['data-side'], 'above', 'a short bar gets the card above it')
  assert.ok(tipPosition(box).top >= 0, 'the card stays below the plot top')

  // A full-height bar has no room above, so the card moves beside it.
  bars[1].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  hovered = await renderer.render(main.component({}))
  box = findAll(hovered, (node) => node.props && node.props.className === 'tu-tipBox')[0]
  assert.ok(['right', 'left'].includes(box.props['data-side']), `a tall bar gets the card beside it: ${box.props['data-side']}`)
  const left = tipPosition(box).left
  const top = tipPosition(box).top
  assert.ok(left >= 0 && left <= 900 - 190, `left stays inside the plot: ${left}`)
  assert.ok(top >= 0 && top <= 148 - 130, `top stays inside the plot: ${top}`)
  // The card sits clear of the bar itself. Two sparse bars are capped at 56px
  // and centred, so the second one starts at this offset.
  const cell = Math.min(56, (900 - 2) / 2)
  const start = (900 - (2 * cell + 2)) / 2
  const barLeft = start + (cell + 2)
  const barRight = barLeft + cell
  assert.ok(left + 190 <= barLeft || left >= barRight, `the card does not cover the bar: ${left}`)
})

test('the card waits for the pointer to settle before appearing', async () => {
  const { tree, renderer, main } = await renderPage()
  const bars = findAll(tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  const chart = findAll(tree, (node) => node.props && node.props.className === 'tu-chart')[0]

  // A quick pass over a bar must not open the card.
  bars[0].props.onMouseEnter()
  await sleep(120)
  let tree2 = await renderer.render(main.component({}))
  assert.equal(tipShown(tree2), false, 'nothing appears during the delay')

  // Leaving before the delay elapses cancels it.
  chart.props.onMouseLeave()
  await sleep(HOVER_WAIT)
  tree2 = await renderer.render(main.component({}))
  assert.equal(tipShown(tree2), false, 'a cancelled hover never opens the card')

  // Staying long enough opens it.
  bars[0].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  tree2 = await renderer.render(main.component({}))
  assert.equal(tipShown(tree2), true, 'the card opens once the pointer settles')

  // Once the card is on screen, moving to another bar swaps it straight away
  // instead of making the user wait out the delay again.
  const second = findAll(tree2, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')[1]
  second.props.onMouseEnter()
  tree2 = await renderer.render(main.component({}))
  const swapped = tipBox(tree2)
  assert.ok(textOf(swapped).includes('2026-11-02'), 'the card follows the new bar immediately')
  assert.equal(tipShown(tree2), true, 'and stays visible throughout the swap')
})

test('the card is reused across bars instead of being rebuilt', async () => {
  const { tree, renderer, main } = await renderPage()
  const bars = findAll(tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')

  bars[0].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  let current = await renderer.render(main.component({}))
  const first = tipBox(current)
  const firstPosition = tipPosition(first)
  assert.ok(textOf(first).includes('2026-11-01'))

  // Switching bars must move the same card, not hide it and build a new one.
  // Re-read the bars from the latest render so the handlers see current state.
  const freshBars = findAll(current, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  freshBars[1].props.onMouseEnter()
  current = await renderer.render(main.component({}))
  const second = tipBox(current)
  assert.equal(tipShown(current), true, 'the card never disappears during the swap')
  assert.ok(textOf(second).includes('2026-11-02'), 'the content follows the new bar')
  assert.notDeepEqual(tipPosition(second), firstPosition, 'the card moves to the new bar')
  // The position is carried by transform so it can be transitioned.
  assert.ok(second.props.style.transform.includes('translate3d'))
})

test('the bar highlight follows the card, not the last hovered bar', async () => {
  const { tree, renderer, main } = await renderPage()
  const bars = findAll(tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  const activeBars = (rendered) => findAll(rendered, (node) => (
    node.props && node.props.className === 'tu-bar' && node.props['data-active'] === 'true'
  ))

  bars[0].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  let current = await renderer.render(main.component({}))
  assert.equal(activeBars(current).length, 1, 'the hovered bar is highlighted')

  // Leaving hides the card; the highlight must go with it.
  bars[0].props.onMouseLeave()
  await sleep(160)
  current = await renderer.render(main.component({}))
  assert.equal(tipShown(current), false, 'the card is hidden')
  assert.equal(activeBars(current).length, 0, 'no bar stays highlighted after the card hides')
})

test('leaving a bar hides the card without leaving the chart', async () => {
  const { tree, renderer, main } = await renderPage()
  const bars = findAll(tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  const boxes = (rendered) => findAll(rendered, (node) => node.props && node.props.className === 'tu-tipBox')

  bars[0].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  let current = await renderer.render(main.component({}))
  assert.equal(tipShown(current), true, 'the card is open')

  // Leaving the bar for empty plot space must hide it, even though the pointer
  // is still inside the chart.
  bars[0].props.onMouseLeave()
  await sleep(160)
  current = await renderer.render(main.component({}))
  assert.equal(tipShown(current), false, 'the card hides when the pointer leaves the bar')
})

test('moving between bars settles on the new bar in either event order', async () => {
  const openFirst = async () => {
    const page = await renderPage()
    const bars = findAll(page.tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
    bars[0].props.onMouseEnter()
    await sleep(HOVER_WAIT)
    await page.renderer.render(page.main.component({}))
    return { page, bars }
  }
  const boxText = async (page) => {
    const rendered = await page.renderer.render(page.main.component({}))
    const box = findAll(rendered, (node) => node.props && node.props.className === 'tu-tipBox')[0]
    return box ? textOf(box) : ''
  }

  // leave(A) then enter(B)
  const first = await openFirst()
  first.bars[0].props.onMouseLeave()
  first.bars[1].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  assert.ok((await boxText(first.page)).includes('2026-11-02'), 'leave-then-enter lands on the new bar')

  // enter(B) then leave(A): the stale leave must not cancel the new card
  const second = await openFirst()
  second.bars[1].props.onMouseEnter()
  second.bars[0].props.onMouseLeave()
  await sleep(HOVER_WAIT)
  assert.ok((await boxText(second.page)).includes('2026-11-02'), 'a stale leave does not cancel the new card')
})

test('leaving the chart hides the card', async () => {
  const { tree, renderer, main } = await renderPage()
  const bars = findAll(tree, (node) => node.tag === 'div' && node.props && node.props.className === 'tu-bar')
  const chart = findAll(tree, (node) => node.props && node.props.className === 'tu-chart')[0]

  bars[0].props.onMouseEnter()
  await sleep(HOVER_WAIT)
  let current = await renderer.render(main.component({}))
  assert.equal(tipShown(current), true)

  chart.props.onMouseLeave()
  await sleep(160)
  current = await renderer.render(main.component({}))
  assert.equal(tipShown(current), false, 'the card hides when the pointer leaves the chart')
})

test('a dense axis thins its labels instead of overlapping them', async () => {
  const buckets = []
  for (let day = 1; day <= 30; day++) {
    const key = `2026-11-${day < 10 ? '0' + day : day}`
    buckets.push({ bucket: key, requests: 1, total: day, input: 1, output: 1, cacheRead: 0 })
  }
  const dense = await renderPage({ bootstrap: { trend: buckets } })
  const axis = findAll(dense.tree, (node) => hasClass(node, 'tu-axis'))[0]
  const ticks = findAll(axis, (node) => node.props && node.props.className === 'tu-axisTick')
  assert.ok(ticks.length >= 2, 'some labels remain')
  assert.ok(ticks.length <= 12, `the axis thins out: ${ticks.length} labels`)
  assert.ok(ticks.length < 30, 'not every one of 30 buckets is labelled')
  // Every tick carries its own position, so they cannot pile up on one spot.
  const positions = ticks.map((tick) => tick.props.style.left)
  assert.equal(new Set(positions).size, positions.length, 'each label has a distinct position')
})

test('record rows render, including an explicit unknown row', async () => {
  const { tree } = await renderPage()
  const rows = findAll(tree, (node) => node.tag === 'tr')
  // header + two records
  assert.equal(rows.length, 3)
  const text = textOf(tree)
  assert.ok(text.includes('11-03 14:05'))
  assert.ok(text.includes('未知'), 'a record without usage shows 未知 rather than 0')
  assert.ok(text.includes('不保存提示词、回复正文'))

  // Only the columns that carry information are listed.
  const header = findAll(tree, (node) => node.tag === 'th').map((node) => textOf(node).trim())
  assert.deepEqual(header, ['时间', 'Provider', '模型', '输入', '输出', '总 Token'])
  assert.ok(!header.includes('账号'), 'the account duplicates the provider')
  assert.ok(!header.includes('套餐'), 'the plan is an unused label')

  // The three numeric columns are right aligned.
  const numeric = findAll(tree, (node) => node.tag === 'td' && node.props && node.props.className === 'tu-num')
  assert.ok(numeric.length >= 6, 'every record has three right-aligned numbers')
})

test('the filter tree groups models under provider and plan', async () => {
  const { tree, renderer, registrations } = await renderPage()
  const main = registrations.find((entry) => entry.options.name === 'main')
  const trigger = findAll(tree, (node) => node.tag === 'button' && node.props && node.props.className === 'tu-trigger')[0]
  assert.ok(trigger, 'the filter trigger exists')
  trigger.props.onClick()
  const opened = await renderer.render(main.component({}))
  const rows = findAll(opened, (node) => node.tag === 'button' && node.props && node.props['data-depth'] !== undefined)
  const depths = rows.map((node) => node.props['data-depth'])
  assert.ok(depths.includes('0'), 'providers are listed')
  assert.ok(depths.includes('1'), 'the plan level appears when a model has a plan')
  assert.ok(depths.includes('2'), 'models sit under their plan')
  // One provider route is one account, so an account whose name repeats the
  // provider is not rendered as its own level.
  assert.ok(!depths.includes('3'), 'no redundant account level')
  const labels = rows.map((node) => textOf(node))
  assert.equal(labels.filter((label) => label.startsWith('百度千帆')).length, 1, 'the provider name appears once')
  const text = textOf(opened)
  assert.ok(text.includes('1017 套餐'), 'the plan label is rendered in the tree')
  assert.ok(text.includes('未设置套餐'), 'models without a plan get their own group')
  // The raw model id stays reachable as a tooltip so it is never hidden.
  const modelRow = rows.find((node) => node.props.title && node.props.title.includes('deepseek-v4.1-flash-1017'))
  assert.ok(modelRow, 'the real model id is exposed')
})

test('the account level appears only when it carries information', async () => {
  const base = bootstrapPayload()
  const twoAccounts = {
    plans: [],
    providers: [{
      providerId: 'baidu',
      name: '百度千帆',
      providerLabel: null,
      defaultName: 'baidu',
      total: 3_000_000_000,
      requests: 30,
      accounts: [
        {
          accountId: 'baidu',
          name: '百度千帆',
          accountLabel: null,
          total: 2_000_000_000,
          requests: 20,
          models: [{ modelId: 'glm-5.3', name: 'glm-5.3', modelLabel: null, plan: null, requests: 20, total: 2_000_000_000 }],
        },
        {
          accountId: 'baidu-b',
          name: '账号 B',
          accountLabel: '账号 B',
          total: 1_000_000_000,
          requests: 10,
          models: [{ modelId: 'glm-5.3', name: 'glm-5.3', modelLabel: null, plan: null, requests: 10, total: 1_000_000_000 }],
        },
      ],
    }],
  }
  const { tree, renderer, registrations } = await renderPage({ bootstrap: { catalog: twoAccounts, rankings: base.rankings } })
  const main = registrations.find((entry) => entry.options.name === 'main')
  const trigger = findAll(tree, (node) => node.tag === 'button' && node.props && node.props.className === 'tu-trigger')[0]
  trigger.props.onClick()
  const opened = await renderer.render(main.component({}))
  const rows = findAll(opened, (node) => node.tag === 'button' && node.props && node.props['data-depth'] !== undefined)
  const labels = rows.map((node) => textOf(node))
  assert.ok(labels.some((label) => label.startsWith('账号 B')), 'a second account is listed')
  assert.equal(labels.filter((label) => label.startsWith('百度千帆')).length, 2, 'provider and its default account are both shown')
  // Both accounts keep their own model row, so filtering still separates them.
  const modelRows = rows.filter((node) => node.props.title && node.props.title.includes('glm-5.3'))
  assert.equal(modelRows.length, 2, 'each account keeps its own model entry')
})

test('the unknown bucket collapses to one row instead of three', async () => {
  const base = bootstrapPayload()
  const unknownProvider = {
    providerId: 'unknown',
    name: 'unknown',
    providerLabel: null,
    defaultName: 'unknown',
    total: 0,
    requests: 3,
    accounts: [{
      accountId: 'unknown',
      name: 'unknown',
      accountLabel: null,
      total: 0,
      requests: 3,
      models: [{
        modelId: 'unknown', name: 'unknown', modelLabel: null, plan: null, requests: 3, total: 0,
      }],
    }],
  }
  const overrides = {
    catalog: { plans: [], providers: [...catalog.providers, unknownProvider] },
    rankings: {
      ...base.rankings,
      model: [
        ...base.rankings.model,
        {
          key: 'unknown', name: 'unknown', providerId: 'unknown', accountId: 'unknown',
          providerName: 'unknown', accountName: 'unknown', modelId: 'unknown',
          requests: 3, total: 0, input: 0, output: 0,
        },
      ],
    },
  }
  const { tree, renderer, registrations } = await renderPage({ bootstrap: overrides })
  const main = registrations.find((entry) => entry.options.name === 'main')
  const trigger = findAll(tree, (node) => node.tag === 'button' && node.props && node.props.className === 'tu-trigger')[0]
  trigger.props.onClick()
  const opened = await renderer.render(main.component({}))
  const rows = findAll(opened, (node) => node.tag === 'button' && node.props && node.props['data-depth'] !== undefined)
  const labels = rows.map((node) => textOf(node))
  assert.ok(!labels.some((label) => label.includes('unknown')), `the raw word must not appear in the tree: ${labels.join(' | ')}`)
  const unknownRows = rows.filter((node) => textOf(node).includes('未识别'))
  assert.equal(unknownRows.length, 1, 'the unknown bucket is a single row')
  assert.equal(unknownRows[0].props['data-depth'], '0', 'and it sits at the provider level')
  // The filter tree is unaffected by the ranking display preference, but the
  // ranking itself hides the bucket by default (see the dedicated tests below).
  const rankRows = findAll(opened, (node) => node.tag === 'div' && node.props && node.props.role === 'button')
  assert.ok(!rankRows.some((node) => textOf(node).includes('未识别')), 'the ranking hides it by default')
})

test('a provider filter reloads the dashboard with that filter', async () => {
  const { tree, renderer, registrations, calls } = await renderPage()
  const main = registrations.find((entry) => entry.options.name === 'main')
  // Open the filter popover, then pick the first provider row.
  const trigger = findAll(tree, (node) => node.tag === 'button' && node.props && node.props.className === 'tu-trigger')[0]
  trigger.props.onClick()
  const opened = await renderer.render(main.component({}))
  const providerButton = findAll(opened, (node) => (
    node.tag === 'button' && node.props && node.props['data-depth'] === '0' && node.props.title
  ))[0]
  assert.ok(providerButton, 'a provider row is clickable in the tree')
  providerButton.props.onClick()
  const after = await renderer.render(main.component({}))
  const last = calls.filter((call) => call.body.method === 'bootstrap').pop()
  assert.equal(last.body.args.provider, 'baidu')
  assert.ok(textOf(after).includes('4.25B'))
})

test('the page survives an API failure and offers the error text', async () => {
  const failing = async () => { throw new Error('boom') }
  const loaded = loadClient(async () => { throw new Error('boom') })
  const main = loaded.registrations.find((entry) => entry.options.name === 'main')
  let tree = null
  try {
    tree = await loaded.renderer.render(main.component({}))
  } catch (err) {
    // The page must not throw out of render; a rejection here is a failure.
    assert.fail(`render threw: ${err.message}`)
  }
  assert.ok(tree, 'the page still renders after a failed load')
  assert.ok(textOf(tree).includes('Token 用量'))
  void failing
})

test('a stale locale registration cannot shadow a shipped string', async () => {
  // The service still answers with the English value for a key this version
  // added; the dictionary in client.js must win.
  const loaded = loadClient(handler({
    granularity: 'hour',
    granularityOptions: ['hour'],
  }), { language: 'zh-CN', staleBind: { 'trend.hour': 'Hour' } })
  const main = loaded.registrations.find((entry) => entry.options.name === 'main')
  const tree = await loaded.renderer.render(main.component({}))
  const labels = findAll(tree, (node) => node.tag === 'button').map((node) => textOf(node).trim())
  assert.ok(labels.includes('按小时'), `the shipped Chinese label wins: ${labels.join(' | ')}`)
  assert.ok(!labels.includes('Hour'), 'the stale English value is not used')
})

test('an English locale falls back without calling the locale service', async () => {
  const loaded = loadClient(handler(), { language: 'en-US' })
  const main = loaded.registrations.find((entry) => entry.options.name === 'main')
  const tree = await loaded.renderer.render(main.component({}))
  assert.ok(textOf(tree).includes('Token Usage'))
  assert.ok(loaded.locale.registered.some((entry) => entry.lang === 'en'))
  assert.ok(loaded.locale.registered.some((entry) => entry.lang === 'zh'))
})

test('the custom range uses a custom calendar instead of the native picker', async () => {
  const { tree, renderer, registrations, calls } = await renderPage()
  const main = registrations.find((entry) => entry.options.name === 'main')
  const customTab = findAll(tree, (node) => node.tag === 'button')
    .find((node) => (node.children || []).some((child) => child.text === '自定义'))
  assert.ok(customTab, 'the custom range tab exists')
  customTab.props.onClick()
  let current = await renderer.render(main.component({}))

  const fields = findAll(current, (node) => node.tag === 'input' && node.props && node.props.className === 'tu-dateInput')
  assert.equal(fields.length, 2, 'two date fields')
  assert.deepEqual(fields.map((field) => field.props['data-which']), ['from', 'to'])
  // No native date or time control anywhere on the page.
  assert.equal(findAll(current, (node) => node.tag === 'input'
    && (node.props.type === 'date' || node.props.type === 'time')).length, 0, 'no native picker')
  // Switching to 自定义 seeds the fields from the range already on screen.
  assert.equal(fields[0].props.value, '2026/11/01', 'the start date is seeded')
  assert.equal(fields[1].props.value, '2026/11/30', 'the end date is seeded')

  // Clicking anywhere on the field opens the calendar.
  fields[0].props.onClick()
  current = await renderer.render(main.component({}))
  let calendar = findAll(current, (node) => node.props && node.props.className === 'tu-cal')[0]
  assert.ok(calendar, 'the calendar opens')
  const days = findAll(calendar, (node) => node.props && node.props.className === 'tu-calDay')
  assert.equal(days.length, 42, 'six Monday-first weeks')
  assert.ok(textOf(calendar).includes('2026年11月'), 'the month title is centred content')
  await sleep(120)
  current = await renderer.render(main.component({}))
  calendar = findAll(current, (node) => node.props && node.props.className === 'tu-cal')[0]
  assert.equal(calendar.props['data-entered'], 'true', 'the open animation completes')

  // The selected range is marked, and the days between carry the band.
  const byDay = (key) => findAll(calendar, (node) => node.props && node.props.className === 'tu-calDay')
    .find((node) => node.props['aria-label'] === key)
  assert.equal(byDay('2026-11-01').props['data-edge'], 'true', 'the start is an edge')
  assert.equal(byDay('2026-11-30').props['data-edge'], 'true', 'the end is an edge')
  assert.equal(byDay('2026-11-15').props['data-inside'], 'true', 'the middle is inside the band')
  assert.equal(byDay('2026-11-06').props['data-today'], 'true', 'today is marked')

  // Picking a day sets the value and closes the calendar.
  byDay('2026-11-05').props.onClick()
  current = await renderer.render(main.component({}))
  const updated = findAll(current, (node) => node.tag === 'input' && node.props && node.props.className === 'tu-dateInput')
  assert.equal(updated[0].props.value, '2026/11/05', 'the picked day lands in the field')
  await sleep(300)
  current = await renderer.render(main.component({}))
  assert.equal(findAll(current, (node) => node.props && node.props.className === 'tu-cal').length, 0,
    'the calendar unmounts once the close animation has played')

  // Applying is still what refreshes the statistics.
  const apply = findAll(current, (node) => node.tag === 'button')
    .find((node) => textOf(node).trim() === '应用')
  assert.ok(apply, 'the apply button appears')
  apply.props.onClick()
  await renderer.render(main.component({}))
  const last = calls.filter((call) => call.body.method === 'bootstrap').pop()
  assert.equal(last.body.args.range, 'custom')
  assert.equal(last.body.args.from, '2026-11-05')
  assert.equal(last.body.args.to, '2026-11-30')
})

test('the calendar jumps to any month without touching the range', async () => {
  const { tree, renderer, registrations } = await renderPage()
  const main = registrations.find((entry) => entry.options.name === 'main')
  findAll(tree, (node) => node.tag === 'button')
    .find((node) => (node.children || []).some((child) => child.text === '自定义'))
    .props.onClick()
  let current = await renderer.render(main.component({}))
  findAll(current, (node) => node.tag === 'input' && node.props && node.props.className === 'tu-dateInput')[0]
    .props.onClick()
  current = await renderer.render(main.component({}))

  const calendarOf = (rendered) => findAll(rendered, (node) => node.props && node.props.className === 'tu-cal')[0]
  const triggersOf = (rendered) => findAll(calendarOf(rendered), (node) => node.props && node.props.className === 'tu-calSelect')
  const optionsOf = (rendered) => findAll(calendarOf(rendered), (node) => node.props && node.props.className === 'tu-calOption')
  assert.equal(triggersOf(current).length, 2, 'a year dropdown and a month dropdown')
  assert.equal(findAll(calendarOf(current), (node) => node.tag === 'select').length, 0, 'no native select is used')
  assert.ok(textOf(triggersOf(current)[0]).includes('2026'), 'the year shows the month on screen')
  assert.ok(textOf(triggersOf(current)[1]).includes('11月'), 'so does the month')

  // Open the year list: exactly one row is marked, and it is the shown year.
  triggersOf(current)[0].props.onClick()
  current = await renderer.render(main.component({}))
  const years = optionsOf(current)
  assert.ok(years.length >= 10, 'the year list is long enough to need scrolling')
  const marked = years.filter((node) => node.props['data-selected'] === 'true')
  assert.equal(marked.length, 1, 'exactly one year is marked selected')
  assert.ok(textOf(marked[0]).includes('2026'), 'and it matches the year on screen')
  years.find((node) => textOf(node).includes('2024')).props.onClick()
  current = await renderer.render(main.component({}))
  assert.ok(textOf(calendarOf(current)).includes('2024年11月'), 'the year jump lands immediately')

  // Same for the month. Wait for the year list to finish closing first.
  await sleep(200)
  current = await renderer.render(main.component({}))
  triggersOf(current)[1].props.onClick()
  current = await renderer.render(main.component({}))
  const months = optionsOf(current)
  assert.equal(months.length, 12, 'twelve months')
  assert.equal(months.filter((node) => node.props['data-selected'] === 'true').length, 1, 'one month is marked')
  months.find((node) => textOf(node).includes('3月')).props.onClick()
  current = await renderer.render(main.component({}))
  assert.ok(textOf(calendarOf(current)).includes('2024年3月'), 'the month jump lands immediately')

  // The chosen range is untouched by browsing elsewhere.
  const fields = findAll(current, (node) => node.tag === 'input' && node.props && node.props.className === 'tu-dateInput')
  assert.equal(fields[0].props.value, '2026/11/01', 'the start date is unchanged')
  assert.equal(fields[1].props.value, '2026/11/30', 'the end date is unchanged')
  assert.equal(findAll(calendarOf(current), (node) => node.props && node.props['data-edge'] === 'true').length, 0,
    'no day of 2024-03 is marked as an edge')
})

test('the calendar cannot produce an inverted range', async () => {
  const { tree, renderer, registrations } = await renderPage()
  const main = registrations.find((entry) => entry.options.name === 'main')
  const customTab = findAll(tree, (node) => node.tag === 'button')
    .find((node) => (node.children || []).some((child) => child.text === '自定义'))
  customTab.props.onClick()
  let current = await renderer.render(main.component({}))

  // Open the start field: days after the current end are disabled.
  findAll(current, (node) => node.tag === 'input' && node.props && node.props.className === 'tu-dateInput')[0]
    .props.onClick()
  current = await renderer.render(main.component({}))
  const dayCell = (key) => findAll(current, (node) => node.props && node.props.className === 'tu-calDay')
    .find((node) => node.props['aria-label'] === key)
  assert.equal(dayCell('2026-11-30').props['data-disabled'], 'false', 'the end day is still selectable')
  assert.equal(dayCell('2026-12-02').props['data-disabled'], 'true', 'a day past the end is not')
})


test('load more appends the next page', async () => {
  const loaded = loadClient(async (method, args) => {
    if (method === 'bootstrap') return bootstrapPayload()
    if (method === 'records') {
      const offset = args.offset || 0
      return {
        total: 120,
        offset,
        limit: 50,
        items: [{
          id: `msg:s1:${offset}`,
          ts: new Date(2026, 10, 3, 14, 5).getTime() - offset,
          turn: 1, step: 1, source: 'message',
          providerId: 'baidu', providerName: '百度千帆', accountId: 'baidu', accountName: '百度千帆',
          modelId: 'glm-5.3', modelName: 'glm-5.3', plan: null,
          known: true, input: 10, output: 5, total: 15, cacheRead: 0, cacheWrite: 0, reasoning: null,
        }],
      }
    }
    return {}
  })
  const main = loaded.registrations.find((entry) => entry.options.name === 'main')
  const tree = await loaded.renderer.render(main.component({}))
  const more = findAll(tree, (node) => node.tag === 'button')
    .find((node) => (node.children || []).some((child) => child.text === '加载更多'))
  assert.ok(more, 'the load-more control appears while rows remain')
  await more.props.onClick()
  const after = await loaded.renderer.render(main.component({}))
  const rows = findAll(after, (node) => node.tag === 'tr')
  assert.equal(rows.length, 3, 'header plus two appended records')
})

// ------------------------------------------------------------- metric cards

test('the metric row shows seven identical cards', async () => {
  const { tree } = await renderPage()
  const cards = findAll(tree, (node) => node.props && node.props.className === 'tu-metric')
  assert.equal(cards.length, 7, 'seven metrics')
  const labels = cards.map((card) => textOf(card))
  assert.ok(labels[0].includes('总计'))
  assert.ok(labels[4].includes('缓存命中率'), `the hit rate sits after the cache card: ${labels.join(' | ')}`)
  assert.ok(labels[6].includes('请求数'))

  // No card is styled differently: same class, no emphasis flag.
  for (const card of cards) {
    const value = findAll(card, (node) => node.props && node.props.className === 'tu-metricValue')[0]
    assert.ok(value, 'every card has a value')
    assert.equal(value.props['data-primary'], undefined, 'no card is singled out')
  }
})

test('the cache hit rate card shows a percentage, or a dash when unknown', async () => {
  const { tree } = await renderPage()
  const cards = findAll(tree, (node) => node.props && node.props.className === 'tu-metric')
  const hit = cards.find((card) => textOf(card).includes('缓存命中率'))
  assert.ok(textOf(hit).includes('%'), `the rate is a percentage: ${textOf(hit)}`)

  // A provider that never reports cache counters must not read as 0%.
  const unknown = await renderPage({
    bootstrap: { summary: { ...summary, cacheRead: 0, cacheWrite: 0, cacheHitRate: null } },
  })
  const unknownCards = findAll(unknown.tree, (node) => node.props && node.props.className === 'tu-metric')
  const unknownHit = unknownCards.find((card) => textOf(card).includes('缓存命中率'))
  assert.ok(textOf(unknownHit).includes('—'), `an unknown rate is a dash: ${textOf(unknownHit)}`)
  assert.ok(!textOf(unknownHit).includes('0.0%'), 'never a misleading zero')
})

// ------------------------------------------------------------ yearly heatmap

const pad2 = (value) => (value < 10 ? '0' + value : String(value))

/** A full year of daily buckets, with a few days carrying usage. */
function yearTrend(year, usageByDay = {}) {
  const buckets = []
  for (let month = 1; month <= 12; month++) {
    const days = new Date(year, month, 0).getDate()
    for (let day = 1; day <= days; day++) {
      const key = `${year}-${pad2(month)}-${pad2(day)}`
      const total = usageByDay[key] ?? 0
      // Split a used day into an uncached third and a cached two thirds, so the
      // tooltip's hit rate is a real number rather than a placeholder.
      buckets.push({
        bucket: key,
        requests: total > 0 ? 1 : 0,
        total,
        input: total > 0 ? Math.round(total / 3) : 0,
        output: 0,
        cacheRead: total > 0 ? total - Math.round(total / 3) : 0,
        cacheRows: total > 0 ? 1 : 0,
      })
    }
  }
  return buckets
}

const yearPayload = (overrides = {}) => ({
  range: { kind: 'year', from: new Date(2026, 0, 1).getTime(), to: new Date(2027, 0, 1).getTime() },
  granularity: 'day',
  granularityOptions: ['day', 'week', 'month'],
  serverTime: new Date(2026, 10, 6, 12, 0).getTime(),
  trend: yearTrend(2026, {
    '2026-01-15': 100,
    '2026-06-01': 400,
    '2026-11-04': 900,
    '2026-11-06': 300,
  }),
  ...overrides,
})

test('a year of days renders as a heatmap with one cell per day', async () => {
  const { tree } = await renderPage({ bootstrap: yearPayload() })
  const cells = findAll(tree, (node) => node.props && node.props.className === 'tu-heatCell')
  // 2026 is not a leap year.
  assert.equal(cells.length, 365, 'one cell per day of the year')
  assert.equal(findAll(tree, (node) => node.props && node.props.className === 'tu-bar').length, 0,
    'no bars in the heatmap view')

  const byKey = new Map(cells.map((cell) => [cell.props['aria-label'].split(' · ')[0], cell]))
  assert.equal(byKey.get('2026-01-15').props['data-level'], '1', 'a small day is the lightest step')
  assert.equal(byKey.get('2026-06-01').props['data-level'], '2')
  assert.equal(byKey.get('2026-11-04').props['data-level'], '4', 'the peak day is the strongest step')
  assert.equal(byKey.get('2026-02-01').props['data-level'], '0', 'a day without usage stays neutral')

  // Days after today are outlines, never filled cells.
  assert.equal(byKey.get('2026-11-06').props['data-today'], 'true', 'today is marked')
  assert.equal(byKey.get('2026-11-07').props['data-future'], 'true', 'tomorrow is in the future')
  assert.equal(byKey.get('2026-12-31').props['data-future'], 'true')
  assert.equal(byKey.get('2026-11-05').props['data-future'], 'false', 'yesterday already happened')
})

test('a leap year gets 366 cells', async () => {
  const { tree } = await renderPage({
    bootstrap: yearPayload({
      range: { kind: 'year', from: new Date(2028, 0, 1).getTime(), to: new Date(2029, 0, 1).getTime() },
      trend: yearTrend(2028, { '2028-02-29': 50 }),
      serverTime: new Date(2028, 11, 31, 12, 0).getTime(),
    }),
  })
  const cells = findAll(tree, (node) => node.props && node.props.className === 'tu-heatCell')
  assert.equal(cells.length, 366, '2028 is a leap year')
  const leapDay = cells.find((cell) => cell.props['aria-label'].startsWith('2028-02-29'))
  assert.ok(leapDay, '29 February exists')
  assert.notEqual(leapDay.props['data-level'], '0', 'and carries its usage')
})

test('the today marker is independent of the hover state', async () => {
  const { tree, renderer, main } = await renderPage({ bootstrap: yearPayload() })
  const cellsOf = (rendered) => findAll(rendered, (node) => node.props && node.props.className === 'tu-heatCell')
  const find = (rendered, key) => cellsOf(rendered)
    .find((cell) => cell.props['aria-label'].startsWith(key))

  // Today is marked before any pointer interaction.
  assert.equal(find(tree, '2026-11-06').props['data-today'], 'true')
  assert.equal(find(tree, '2026-11-06').props['data-active'], 'false')

  // Hovering another day must not remove today's marker.
  find(tree, '2026-11-04').props.onMouseEnter()
  await sleep(HOVER_WAIT)
  let current = await renderer.render(main.component({}))
  assert.equal(find(current, '2026-11-04').props['data-active'], 'true', 'the hovered day is active')
  assert.equal(find(current, '2026-11-06').props['data-today'], 'true', 'today keeps its marker')
  assert.equal(find(current, '2026-11-06').props['data-active'], 'false', 'today is not active')

  // Hovering today carries both flags, which the stylesheet merges into one ring.
  find(current, '2026-11-06').props.onMouseEnter()
  await sleep(HOVER_WAIT)
  current = await renderer.render(main.component({}))
  const today = find(current, '2026-11-06')
  assert.equal(today.props['data-today'], 'true')
  assert.equal(today.props['data-active'], 'true')
  assert.equal(find(current, '2026-11-04').props['data-active'], 'false', 'the previous day is released')
})

test('future days are inert and the legend explains the three states', async () => {
  const { tree } = await renderPage({ bootstrap: yearPayload() })
  const cells = findAll(tree, (node) => node.props && node.props.className === 'tu-heatCell')
  const byKey = (key) => cells.find((cell) => cell.props['aria-label'].startsWith(key))

  const future = byKey('2026-12-31')
  assert.equal(future.props['data-future'], 'true')
  assert.equal(future.props.onMouseEnter, undefined, 'a future day opens no card')
  assert.ok(future.props['aria-label'].includes('尚未到达'), 'its label says it has not been reached')

  // A counted day with zero usage is still a real day: it stays interactive.
  const zero = byKey('2026-02-01')
  assert.equal(zero.props['data-future'], 'false')
  assert.equal(typeof zero.props.onMouseEnter, 'function', 'a zero-usage day still opens a card')

  const legend = findAll(tree, (node) => node.props && node.props.className === 'tu-heatLegend')[0]
  assert.ok(legend, 'the heatmap has a legend')
  const text = textOf(legend)
  assert.ok(text.includes('有用量'), text)
  assert.ok(text.includes('无用量'), text)
  assert.ok(text.includes('尚未到达'), text)
})

test('the heatmap tooltip names the day and its usage', async () => {
  const { tree, renderer, main } = await renderPage({ bootstrap: yearPayload() })
  const cells = findAll(tree, (node) => node.props && node.props.className === 'tu-heatCell')
  const target = cells.find((cell) => cell.props['aria-label'].startsWith('2026-11-04'))
  target.props.onMouseEnter()
  await sleep(HOVER_WAIT)
  const current = await renderer.render(main.component({}))
  const box = tipBox(current)
  assert.ok(box, 'the card opens over a heatmap cell')
  assert.equal(tipShown(current), true)
  const text = textOf(box)
  assert.ok(text.includes('2026-11-04'), `the tooltip names the day: ${text}`)
  assert.ok(text.includes('900'), `the tooltip shows the usage: ${text}`)
  // The heatmap card carries the same hit-rate row as the bar chart.
  assert.ok(text.includes('缓存命中率'), `the heatmap card shows the rate: ${text}`)
  // 900 total split into 300 uncached and 600 cached.
  assert.ok(text.includes('66.7%'), `the rate uses this day's counters: ${text}`)
})

test('the year view still offers bars for weeks and months', async () => {
  const weekly = await renderPage({
    bootstrap: yearPayload({ granularity: 'week', trend: [
      { bucket: '2026-11-02', requests: 1, total: 10, input: 1, output: 1, cacheRead: 0 },
      { bucket: '2026-11-09', requests: 1, total: 20, input: 1, output: 1, cacheRead: 0 },
    ] }),
  })
  assert.equal(findAll(weekly.tree, (node) => node.props && node.props.className === 'tu-bar').length, 2,
    'weekly buckets are bars')
  assert.equal(findAll(weekly.tree, (node) => node.props && node.props.className === 'tu-heatCell').length, 0,
    'no heatmap for weekly buckets')
})

test('other ranges keep the bar chart', async () => {
  const { tree } = await renderPage()
  assert.ok(findAll(tree, (node) => node.props && node.props.className === 'tu-bar').length > 0)
  assert.equal(findAll(tree, (node) => node.props && node.props.className === 'tu-heatCell').length, 0)
})

// ------------------------------------------------------ granularity selector

const buttonLabels = (tree) => findAll(tree, (node) => node.tag === 'button')
  .map((node) => textOf(node).trim())

test('the ranking offers only the two dimensions that carry information', async () => {
  const { tree } = await renderPage()
  const labels = buttonLabels(tree)
  assert.ok(labels.includes('模型'))
  assert.ok(labels.includes('Provider'))
  assert.ok(!labels.includes('账号'), 'the account duplicates the provider')
  assert.ok(!labels.includes('套餐'), 'the plan is an unused label')
})

test('a provider row shows the raw id under its display name', async () => {
  const { tree, renderer, main } = await renderPage()
  const providerTab = findAll(tree, (node) => node.tag === 'button')
    .find((node) => textOf(node).trim() === 'Provider')
  assert.ok(providerTab, 'the Provider tab exists')
  providerTab.props.onClick()
  const current = await renderer.render(main.component({}))

  const rows = findAll(current, (node) => node.tag === 'div' && node.props && node.props.role === 'button')
  const target = rows.find((row) => textOf(row).includes('百度千帆'))
  assert.ok(target, 'the renamed provider is listed')
  const text = textOf(target)
  assert.ok(text.includes('百度千帆'), `the display name is kept: ${text}`)
  assert.ok(text.includes('baidu'), `the raw id is shown too: ${text}`)
  // The subtitle is the id, not a repeat of the name.
  const dim = findAll(target, (node) => node.props && node.props.className === 'tu-rankDim')[0]
  assert.ok(dim, 'the row has a subtitle')
  assert.equal(textOf(dim), 'baidu')
  // A provider whose name already equals its id needs no subtitle.
  const arkRow = rows.find((row) => textOf(row).includes('ark'))
  assert.ok(arkRow, 'the unlabelled provider is listed')
  assert.equal(findAll(arkRow, (node) => node.props && node.props.className === 'tu-rankDim').length, 0,
    'no subtitle when the name is already the id')
})

test('the granularity selector only offers what the range supports', async () => {
  const yearish = await renderPage({
    bootstrap: { granularity: 'week', granularityOptions: ['week', 'month'] },
  })
  const labels = buttonLabels(yearish.tree)
  assert.ok(labels.includes('按周'), 'week is offered')
  assert.ok(labels.includes('按月'), 'month is offered')
  assert.ok(!labels.includes('按日'), 'day is not offered for a year range')
  assert.ok(!labels.includes('按年'), 'year is not offered for a year range')

  const hourly = await renderPage({
    bootstrap: { granularity: 'hour', granularityOptions: ['hour'] },
  })
  const hourLabels = buttonLabels(hourly.tree)
  assert.ok(hourLabels.includes('按小时'), 'today offers hours')
  assert.ok(!hourLabels.includes('按日'), 'today does not offer days')
  assert.ok(!hourLabels.includes('按周'), 'today does not offer weeks')
})

test('switching range keeps a granularity that is still valid', async () => {
  const { tree, renderer, main, calls } = await renderPage({
    bootstrap: { granularity: 'week', granularityOptions: ['day', 'week'] },
  })
  const yearTab = findAll(tree, (node) => node.tag === 'button')
    .find((node) => textOf(node).trim() === '本年')
  assert.ok(yearTab, 'the year tab exists')
  yearTab.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await renderer.render(main.component({}))

  const last = calls.filter((call) => call.body.method === 'bootstrap').pop()
  assert.equal(last.body.args.range, 'year')
  assert.equal(last.body.args.granularity, 'week', 'a still-valid granularity is kept')
})

// ------------------------------------------------ ranking display preference
const BASE_SETTINGS = {
  numberFormat: 'short',
  lastRange: 'month',
  lastCustomFrom: '',
  lastCustomTo: '',
  showUnknownRanking: false,
  showUnknownUsageNote: true,
}

/** A payload whose model ranking contains the synthetic unknown bucket. */
function payloadWithUnknown(settingsPatch = {}) {
  const base = bootstrapPayload()
  return {
    settings: { ...BASE_SETTINGS, ...settingsPatch },
    rankings: {
      ...base.rankings,
      model: [
        ...base.rankings.model,
        {
          key: 'unknown', name: 'unknown', providerId: 'unknown', accountId: 'unknown',
          providerName: 'unknown', accountName: 'unknown', modelId: 'unknown',
          requests: 3, total: 0, input: 0, output: 0,
        },
      ],
      provider: [
        ...base.rankings.provider,
        { key: 'unknown', name: 'unknown', requests: 3, total: 0, input: 0, output: 0 },
      ],
    },
  }
}

const rankLabels = (tree) => findAll(tree, (node) => node.tag === 'div' && node.props && node.props.role === 'button')
  .map((node) => textOf(node))

/** The first button whose visible text is exactly `label`. */
function findButtonByText(tree, label) {
  return findAll(tree, (node) => node.tag === 'button')
    .find((node) => textOf(node).trim() === label)
}

/** Click a button found by its exact visible text. */
async function clickAndRender(tree, label, renderer, main) {
  const button = findButtonByText(tree, label)
  assert.ok(button, `button "${label}" must exist`)
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  return renderer.render(main.component({}))
}

const switchByLabel = (tree, label) => findAll(tree, (node) => (
  node.tag === 'button' && node.props && node.props.role === 'switch' && node.props['aria-label'] === label
))[0]

test('the ranking hides the unidentified row by default', async () => {
  const { tree } = await renderPage({ bootstrap: payloadWithUnknown() })
  const labels = rankLabels(tree)
  assert.ok(labels.length > 0, 'the ranking renders rows')
  assert.ok(!labels.some((label) => label.includes('未识别')), `no unidentified row: ${labels.join(' | ')}`)
  // The normal rows are untouched.
  assert.ok(labels.some((label) => label.includes('V4.1 Flash 1017')))
})

test('turning the switch on reveals the unidentified row and persists the choice', async () => {
  const { tree, renderer, main, calls } = await renderPage({ bootstrap: payloadWithUnknown() })
  const opened = await clickAndRender(tree, '设置', renderer, main)
  const toggle = switchByLabel(opened, '显示未识别排行项')
  assert.ok(toggle, 'the ranking switch exists')
  assert.equal(toggle.props['aria-checked'], false, 'it starts off')

  toggle.props.onClick(true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const after = await renderer.render(main.component({}))
  assert.ok(rankLabels(after).some((label) => label.includes('未识别')), 'the row appears')

  const saved = calls.filter((call) => call.body.method === 'settings').pop()
  assert.deepEqual(saved.body.args, { showUnknownRanking: true }, 'the choice is persisted')
})

test('the ranking preference is read back from the settings file', async () => {
  const { tree } = await renderPage({ bootstrap: payloadWithUnknown({ showUnknownRanking: true }) })
  assert.ok(rankLabels(tree).some((label) => label.includes('未识别')), 'an enabled preference survives a reload')
})

test('the missing-usage note can be dismissed without touching any number', async () => {
  const { tree, renderer, main, calls } = await renderPage({ bootstrap: payloadWithUnknown() })
  assert.ok(textOf(tree).includes('2 条请求未返回 usage'), 'the note is visible by default')
  assert.ok(textOf(tree).includes('4.25B'), 'the total is rendered')

  const dismissed = await clickAndRender(tree, '不再提示', renderer, main)
  const text = textOf(dismissed)
  assert.ok(!text.includes('条请求未返回 usage'), 'the note disappears immediately')
  assert.ok(text.includes('4.25B'), 'the total is unchanged')
  assert.ok(!text.includes('0.0B'), 'unknown rows are never folded in as zero')

  const saved = calls.filter((call) => call.body.method === 'settings').pop()
  assert.deepEqual(saved.body.args, { showUnknownUsageNote: false }, 'the dismissal is persisted')
})

test('a dismissed note stays hidden on the next load', async () => {
  const { tree } = await renderPage({ bootstrap: payloadWithUnknown({ showUnknownUsageNote: false }) })
  assert.ok(!textOf(tree).includes('条请求未返回 usage'), 'no note after a reload')
  assert.ok(textOf(tree).includes('4.25B'), 'and the totals are still there')
})

test('the note comes back when the setting is turned on again', async () => {
  const { tree, renderer, main } = await renderPage({
    bootstrap: payloadWithUnknown({ showUnknownUsageNote: false }),
  })
  assert.ok(!textOf(tree).includes('条请求未返回 usage'))
  const opened = await clickAndRender(tree, '设置', renderer, main)
  const toggle = switchByLabel(opened, '显示未返回 usage 提示')
  assert.ok(toggle, 'the note switch exists')
  assert.equal(toggle.props['aria-checked'], false, 'it reflects the stored choice')
  toggle.props.onClick(true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const after = await renderer.render(main.component({}))
  assert.ok(textOf(after).includes('2 条请求未返回 usage'), 'the note is restored')
})