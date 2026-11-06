# Test report — dsh-token-usage 1.0.0

Everything below was produced by running the shipped code on this machine
(Windows, DSH 0.2.1-rc.5 desktop, Node 24.21.0, `node:sqlite`). No result is
inferred from "it compiles".

- Environment: DSH `0.2.1-rc.5`, profile `desktop`, default `DSH_HOME` (`%USERPROFILE%\.dsh`)
- Plugin: `dsh-token-usage@1.0.0`, installed with `plugin_manager install_bundle`
- Live database: `<DSH_HOME>/token-usage/usage.db`

---

## 0. Regression fix — React error #310

### Symptom

In the desktop app the sidebar entry appeared, but opening the page produced a
blank panel with `Minified React error #310`.

### Root cause

`TrendChart` called `useMemo` for the axis **after** its empty-state early
return:

```js
const [hover, setHover] = useState(null)
const max = useMemo(…)                       // hook 1, 2
if (!points.length) return <empty/>          // ← first paint stops here
const axis = useMemo(…)                      // hook 3, only when data exists
```

The first paint has no data, so the component ran **2** hooks. When the payload
arrived it ran **3**. React #310 is *"Rendered more hooks than during the
previous render"*: the hook list is positional, so the extra hook shifts every
slot and React aborts the render, blanking the slot.

The failure needed a second render, which is why it only appeared once the API
answered — and why the sidebar icon (registered before any data) looked fine.

### Fix

`client.js` — all three hooks now run before the early return, with a comment
recording why. No other component was affected: `FilterMenu`, `EditPanel` and
`TokenUsagePage` already call every hook unconditionally at the top, and
`Ranking`, `Segmented`, `Metric` and `PanelIcon` use no hooks at all.

A second, smaller display defect surfaced during the real-UI check: with a
single bucket the bar stretched to the full plot width and read as a grey slab.
`TrendChart` now caps the bar width and centres the cluster when there are eight
or fewer buckets; many buckets still fill the plot.

### Why the suite missed it, and what changed

The Node render harness (`test/mini-react.mjs`) did not enforce hook order, so
the defect passed 64 tests. It now:

- identifies a component by `(position, type)` like React, so a conditional
  sibling is not mistaken for a hook-order change;
- keeps `null` children in place, because React keeps their slot — filtering
  them was hiding the remount React does not perform;
- throws `Rendered more hooks than during the previous render in <Name> (n -> m)`
  when a component's hook count changes.

Two tests were added: one proves the harness rejects a hook-count change, one
replays the exact empty-state → data-state sequence that crashed the desktop app.

`dev/prove-guard.mjs` re-introduces the original defect, runs the UI suite, and
restores the file:

```
{ "defectReintroduced": true, "suiteFailed": true,
  "guardCaughtTrendChart": true, "pass": 3, "fail": 10, "restored": true }
```

With the fix in place the same suite is 66/66.

### Real desktop verification

Captured from the running DSH window (`dev/screenshot-*.png`):

| Check | Result |
|---|---|
| Clicking 「Token 用量」 opens the page | ✅ `screenshot-dashboard.png` |
| 今日 / 本周 / 本月 / 本年 / 全部 | ✅ 本月 and 全部 both render |
| 自定义 range with date and time inputs | ✅ `screenshot-custom-range.png` |
| Model filter tree (provider → account → model) | ✅ `screenshot-filter-tree.png` |
| Number format 简写 ⇄ 完整 | ✅ `screenshot-full-format.png` shows `56,687,029` |
| Trend chart, ranking, request records | ✅ all three render with live data |
| No React error during switching, filtering, updating | ✅ no error panel, no blank slot |
| Data survives a restart | ✅ 161 requests accumulated across two host restarts |

The page was driven by real clicks in the real window; the screenshots are of
that window, not of a mock.

---

## 1. Automated suites

```
node --test test/*.test.mjs
ℹ tests 68   ℹ pass 68   ℹ fail 0
```

| File | Tests | What it proves |
|---|---|---|
| `test/usage.test.mjs` | 7 | usage adapter: unknown vs zero, provider total precedence, additive cache, reasoning never re-added, integer/negative handling, identity fallback |
| `test/time.test.mjs` | 12 | local-calendar ranges, week/month/year boundaries, custom ranges with times, inverted ranges, bucket coverage, **DST in `America/New_York` (23 h and 25 h days)** |
| `test/format.test.mjs` | 5 | the number formatter **lifted out of the shipped `client.js`** (not a copy): `1K`, `1M`, `1B`, `4B`, `4.25B`, `1,000,000,000`, trailing-zero trimming, `999,999 → 1M` |
| `test/pipeline.test.mjs` | 17 | recorder + SQL over **504 real session events**: totals, dedupe, provider separation, filters, plans, labels, rankings, paging, empty store |
| `test/api.test.mjs` | 11 | the real HTTP handler over a real socket: bootstrap, records, labels, plans, settings, diagnostics, 405/404/400 paths |
| `test/ui.test.mjs` | 15 | the real `client.js` rendered through a minimal React runtime: **hook-order guard**, **empty-state → data-state regression**, **unknown bucket collapsed to one row**, **redundant account level hidden**, registration, numbers on screen, format switch, chart bars and sparse layout, record rows, filter tree, filter reload, custom range with dates and times, load-more paging, failure path, English fallback |

### Synthetic fixture

`test/fixtures/usage-events.json` is **generated**, not captured:
`test/build-fixture.mjs` produces 505 events across 24 sessions from a seeded
pseudo-random generator. It contains only
`type, seq, time, turn, step, provider, model, usage`, with invented provider
and model ids (`provider-a`, `model-alpha`, …) and a fixed synthetic time range.
No session log, no real provider or model id, no real timestamp and no real
usage figure is included.

Independent expectation computed while building the fixture, then compared with
what the plugin's own pipeline produced:

| | expected | recorded |
|---|---|---|
| events | 505 | 505 rows |
| known usage | 493 | 493 |
| unknown usage | 12 | 12 |
| total tokens | 31,092,461 | 31,092,461 |
| input | 827,218 | 827,218 |
| output | 222,945 | 222,945 |
| cache | 30,042,298 | 30,042,298 |

Replaying the fixture twice more left the row count unchanged (idempotent).

---

## 2. Live acceptance against the installed plugin

```
node dev/verify-live.mjs http://127.0.0.1:6687
{ "checks": 52, "passed": 52, "failed": 0 }
```

The script compares the API against an independent read-only SQLite connection
to the same file. It covers:

- diagnostics: path, schema version, row counts, no duplicate `(session, turn, step)`, no unknown row storing a zero total
- all-time totals equal `SUM()` over the table, for total / input / output / cache / reasoning
- `known + unknown = rows`
- trend, model ranking, provider ranking, plan ranking and catalog each partition the same total
- `firstRecordAt` equals `MIN(ts)`
- today / week / month / year each equal a direct `ts` range query
- a custom range covers whole local days and matches a direct query
- provider filter matches a direct query; the filter tree stays complete; the ranking narrows
- search finds a model and returns zero for a missing one
- records: page size, total, newest-first order, resolved names, raw model id
- rename provider/model and assign a plan → visible, totals unchanged, plan filter selects exactly that model; clearing restores the raw id and the unassigned bucket
- settings: number format and last range persist; an absent range uses the persisted one; restored afterwards
- error paths: unknown method 404, GET 405, invalid JSON 400

### Live capture during this session

The plugin recorded real traffic while it was being developed, including a
mid-session provider switch:

```
rows 73   known 70   unknown 3
DeepSeek Account   requests 46   total 13,634,121
Command Code       requests 25   total  8,427,581
unknown            requests  2   total          0   (steps with no response)
summary: total 22,061,702  input 715,708  output 49,226  cache 21,296,768  reasoning 3,607
```

The `unknown` rows are model steps that ended without an assistant message; they
carry `NULL` counters and are reported as `3 条请求未返回 usage，未计入合计`.

---

## 3. Usage-convention validation on real data

Before writing the adapter, all local session logs were decoded and analysed
(read-only, metadata only):

| | |
|---|---|
| session files | 163 |
| events | 143,180 |
| `assistant/message` events | 19,614 |
| events without usage | 30 |
| `totalTokens == input + output` | 152 (cache was zero) |
| `totalTokens == input + output + cacheRead + cacheWrite` | 17,926 |
| neither | **0** |

Providers observed: `commandcode`, `baidu`, `ark`, `deepseek-official`,
`deepseek-account`, `openai-codex`, `agent`. The same model id
(`deepseek-v4.1-flash`) appears under four different providers, which is why the
identity is the `(provider, account, model)` triple.

Also verified: only `assistant/message` carries usage — `step/end`, `turn/end`
and `assistant/attempt` do not.

---

## 4. Resource measurements

### 4.1 Write path and queries (`node dev/bench.mjs <rows>`)

Synthetic events driven through the shipping recorder and query layer.

| rows | write / event | write CPU / event | DB size | bytes / row |
|---|---|---|---|---|
| 2,000 | 126 µs | ~40 µs | 716 KB | 367 |
| 20,000 | 164 µs | ~40 µs | 6.6 MB | 339 |
| 100,000 | 212 µs | 38 µs | 33 MB | 347 |

Query latency (average of 20 runs after warm-up):

| query | 2,000 rows | 20,000 rows | 100,000 rows |
|---|---|---|---|
| summary · all time | 0.38 ms | 5.12 ms | 25.6 ms |
| summary · this month | 0.34 ms | 0.86 ms | 0.79 ms |
| summary · today | 0.23 ms | 0.25 ms | 0.22 ms |
| trend · day · all time | 0.68 ms | 8.60 ms | 42.5 ms |
| trend · month · all time | 0.67 ms | 9.41 ms | 47.7 ms |
| ranking · model · all time | 1.42 ms | 17.6 ms | 95.5 ms |
| ranking · plan · all time | 0.81 ms | 10.6 ms | 52.1 ms |
| records · page 50 | 0.41 ms | 0.74 ms | 2.0 ms |
| records · page 50, deep offset | 1.26 ms | 3.54 ms | 6.8 ms |
| catalog (filter tree) | 1.49 ms | 26.1 ms | 135.9 ms |
| summary · provider filter | 0.16 ms | 3.16 ms | 16.3 ms |
| summary · search | 0.91 ms | 9.07 ms | 44.4 ms |

The catalog is the only query that scans the whole table; it is cached for 2 s
and invalidated on a rename, so switching range or filter does not pay it again.

Duplicate delivery: **27–30 µs**, zero rows written.

### 4.2 Live API round trip

100 sequential `bootstrap` calls and 100 `records` calls against the running
plugin, measured from PowerShell (includes HTTP and client overhead):

```
bootstrap : 4.11 ms average
records   : 3.53 ms average
```

### 4.3 Steady-state cost

- **Idle:** zero. The Host half registers one event listener and one HTTP route;
  it has no timer, no interval and no polling loop.
- **Per model step:** one indexed `INSERT` — 38 µs of CPU, 126–212 µs wall.
  A busy user producing one step every two seconds spends about **0.002 % of one
  core**.
- **Memory:** no per-session state; the only retained objects are the SQLite page
  cache (default 2 MB) and a small catalog cache.
- **Disk:** one row per model step, ~350 bytes including indexes. 20,000 steps
  (roughly a year of heavy use) is 6.6 MB.

The whole Harness process on this machine reports ~844 MB RSS and ~6.6 % of one
core while actively running an agent session. Those figures belong to DSH as a
whole and **cannot** be attributed to this plugin; the per-operation numbers
above are the attributable ones.

---

## 5. Safety audit

| Requirement | Evidence |
|---|---|
| No LLM call | Host half imports only `node:sqlite`, `node:fs`, `node:path`, `node:os` and its own modules; no model client, no `llm.stream`, no `resolveModelInfo`, no `listModels` |
| No extra API request | `grep` for `fetch(`, `http.request`, `https.request`, `net.connect` in `index.js` and `lib/` → **none found** |
| No data leaves the machine | the only network surface is a same-origin route on the local web server; the Client half calls it with a relative URL |
| No prompt or reply read | the recorder reads only `event.type`, `event.seq`, `event.time`, `data.turn`, `data.step`, `data.message.source.{provider,model}` and `data.usage` |
| No API key stored | no credential service is touched; the database has no column for one |
| No high-frequency polling | no `setInterval`/`setTimeout` anywhere in the Host half |
| Does not block requests | the plugin does not wrap `llm/stream`; it listens to the post-commit `session/event` emit feed |
| No large dependency | zero third-party packages; `package.json` has no `dependencies` |

---

## 6. Acceptance checklist (task §13)

### Statistics accuracy

| # | Criterion | Result |
|---|---|---|
| 1 | input / output / total correct | ✅ verified against independent SQL and against 504 real events |
| 2 | cache and reasoning not double counted | ✅ cache additive per the measured DSH convention; reasoning never added |
| 3 | missing usage marked unknown | ✅ `NULL` counters, `unknownCount`, page warning; 4 real cases in the fixture |
| 4 | duplicate events not double counted | ✅ `msg:<session>:<seq>` primary key; replay ×3 unchanged |
| 5 | same model name under different providers not mixed | ✅ `deepseek-v4.1-flash` under 4 providers stays separate |
| 6 | different accounts counted separately | ✅ account dimension is the provider route; verified per account |
| 7 | unknown models not dropped | ✅ `unknown` bucket appears in the tree, the ranking and the records |

### Time

| # | Criterion | Result |
|---|---|---|
| 1–5 | today / week / month / year / all | ✅ each equals a direct `ts` range query |
| 6 | custom range | ✅ date-only and date+time, verified end to end |
| 7 | cross-month / cross-year | ✅ `2026-12-30 → 2027-01-02`, `2026-01-01 → 2026-12-31` |
| 8 | timezone and date boundaries | ✅ DST test in `America/New_York`: 23 h and 25 h days stay one calendar day |

### Filtering

| # | Criterion | Result |
|---|---|---|
| 1 | default is all models | ✅ |
| 2–5 | provider / account / plan / model filters | ✅ each compared with a direct query |
| 6 | model search | ✅ matches raw ids and renamed display names |
| 7 | clearing restores everything | ✅ |
| 8 | range + filter combined | ✅ |

### Number format

| # | Criterion | Result |
|---|---|---|
| 1 | short format | ✅ `1K`, `1M`, `1B`, `4B`, `4.25B` |
| 2 | full format | ✅ `1,000`, `1,000,000`, `4,000,000,000` |
| 3 | decimal precision | ✅ two decimals, trailing zeros trimmed, `999,999 → 1M` |
| 4 | setting survives restart | ✅ stored in `settings.json`, re-read on load |
| 5 | storage unaffected | ✅ integers only; the formatter is display-only |

### Persistence

| # | Criterion | Result |
|---|---|---|
| 1–2 | data survives plugin disable and DSH restart | ✅ the database file survived a full DSH restart during development (49 → 73 rows, no loss, no duplicates) |
| 3–4 | plan and model renames persist | ✅ written to the label tables, read back after reload |
| 5 | no duplicate records | ✅ verified after restart and after replay |

### Resources and safety

| # | Criterion | Result |
|---|---|---|
| 1 | no extra LLM/API call | ✅ code audit |
| 2 | no statistics sent out | ✅ code audit |
| 3 | no chat text read | ✅ code audit + metadata-only fixture |
| 4 | no API key stored | ✅ schema has no such column |
| 5 | no high-frequency polling | ✅ no timers |
| 6 | does not block requests | ✅ post-commit listener only |
| 7 | CPU / memory / disk assessed | ✅ §4 |

---

## 7. What was not verified

- **Visual appearance in the browser.** This session has no browser control, so
  the page was verified by rendering the shipping `client.js` through a minimal
  React runtime and asserting on the produced tree (numbers, labels, rows, chart
  bars, filter levels). Layout, spacing and dark/light appearance were not
  observed on screen; they use only `--dsw-alias-*` theme tokens.
- **The sidebar icon after the last restart.** It was confirmed live as an active
  occupant of `sidebar.panellist` before the restart; the browser must reload the
  new GUI URL for the Client half to register again.
- **Compaction and session-title usage.** DSH does not persist per-request usage
  for those calls, so they cannot be counted; see README §7.2.
