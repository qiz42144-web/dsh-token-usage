# dsh-token-usage

Local Token usage statistics for the DeepSeek Harness, split by **provider**, **account**, **plan** and **model**, with time ranges, trends, rankings and request records.

It is a passive observer: it reads the usage metadata DSH already records for every model step, stores it in a local SQLite file, and aggregates it with SQL. It never calls a model, never sends anything off the machine, and never reads a prompt, a reply, a tool argument or an API key.

---

## 1. What it shows

| Question | Where |
|---|---|
| How many tokens today / this week / this month / this year / all time? | range tabs + the metric row |
| How many tokens in an arbitrary range? | `自定义` with start/end date and optional times |
| Which provider / account / plan / model used the most? | ranking tabs |
| How did usage change over time? | trend chart, day / week / month / year |
| What exactly was requested, and when? | request records, newest first |
| `4.25B` or `4,254,321,987`? | number-format switch, persisted |

Metrics: **total**, **input**, **output**, plus **cached** and **reasoning** when the provider reports them, and the request count.

### Using the page

- **Range** — click `今日 / 本周 / 本月 / 本年 / 全部 / 自定义`. `自定义` shows a start and an end date plus optional times; `应用` reloads everything for that interval. The last choice is remembered.
- **Number format** — `简写` (`4.25B`) or `完整` (`4,254,321,987`). Applies to every number on the page and is remembered.
- **Filter** — the `全部模型 ▾` button opens the tree: provider → account → plan → model. Click any level to filter by it; type in the search box to narrow the list; `清除筛选` returns to all models. The current filter is shown on the button. A level that carries no information is not drawn: an account whose name repeats its provider (the normal one-route-one-account case) is skipped, and the `未识别` bucket is a single row.
- **Rename / plan** — the `✎` beside a provider, account or model row opens an inline editor for its display name, and for a model also its plan label. The real model id is always shown as a tooltip and in the editor.
- **Trend** — hover a bar to read that period's numbers; switch `按日 / 按周 / 按月 / 按年` to change the bucket.
- **Ranking** — switch between model, provider, account and plan; click a row to apply it as the filter.
- **Records** — newest first, 50 at a time with `加载更多`. A row whose provider returned no usage shows `未知` instead of a zero.

---

## 2. Install

The plugin is a normal DSH bundle. From a DSH session:

```
plugin_manager install_bundle  target = <absolute path to this directory>
```

or, with the `dsh` CLI on the PATH:

```
dsh plugin --profile <profile> add <absolute path to this directory>
```

The bundle patch inserts one Host row (`token-usage`) and the Client half adds a sidebar icon plus a full page. Open the page from the sidebar icon.

**Restart DSH after changing the plugin's own source.** A new bundle activates immediately, but a changed Host module needs a fresh module generation; the plugin manager reports `restart-required` for that case.

### Uninstall

```
plugin_manager remove_bundle  target = dsh-token-usage
```

The database is not deleted. Remove `$DSH_HOME/token-usage/` yourself if you want the history gone.

---

## 3. Configuration

All keys are optional; the patch ships `config: {}`.

| Key | Default | Meaning |
|---|---|---|
| `dbPath` | `$DSH_HOME/token-usage/usage.db` | Absolute path of the SQLite history file. |
| `recordAttempts` | `true` | Record a model step that returned no assistant message at all (no usage available) as an "unknown" request row. Set `false` to keep only steps that produced a response. |

Example:

```yaml
- insert:
    - id: token-usage
      name: dsh-token-usage
      config:
        dbPath: 'D:\dsh-data\token-usage.db'
        recordAttempts: false
```

---

## 4. Where the numbers come from

### 4.1 The observation point

DSH emits `session/event` after every committed session event. For each model step it appends an `assistant/message` event whose payload carries the provider id, the real model id and the provider-reported usage:

```json
{
  "type": "assistant/message",
  "seq": 17,
  "time": 1793386668602,
  "data": {
    "turn": 1, "step": 1,
    "message": { "source": { "kind": "model", "provider": "baidu", "model": "deepseek-v4.1-flash-1017" } },
    "usage": { "inputTokens": 20525, "outputTokens": 172, "totalTokens": 21209, "cacheReadTokens": 512 }
  }
}
```

The plugin subscribes to that feed and writes one row per event. It does **not** wrap `llm/stream`, so it cannot delay, retry or veto a request: `session/event` is a fire-and-forget emit feed that runs after the commit.

### 4.2 The usage adapter

DSH normalizes every provider into one `TokenUsage` shape (`@deepseek-ai/dsh-llm`), so the plugin never parses provider-specific JSON and never estimates tokens from text length.

Rules in `lib/usage.js`:

- `inputTokens` and `outputTokens` must both be finite numbers, otherwise the row is stored as **unknown** with `NULL` counters — never as zero.
- `totalTokens` is used when the provider supplies it; otherwise it is `input + output + cacheRead + cacheWrite`.
- `reasoningTokens` is **never** added: DSH guarantees it is a subset of `outputTokens`.

The additive-cache rule is not a guess. Across **19,614 real `assistant/message` events** from this machine (6 providers: `commandcode`, `baidu`, `ark`, `deepseek-official`, `deepseek-account`, `openai-codex`), every event that carried `totalTokens` satisfied `totalTokens = input + output + cacheRead + cacheWrite` (17,926 cases with a non-zero cache, 152 with a zero cache, 0 exceptions).

### 4.3 Deduplication

The record id is the durable event coordinate: `msg:<sessionId>:<seq>`, or `step:<sessionId>:<seq>` for a step that produced no message. `seq` is the append-only session sequence, so:

- a re-delivered event, a plugin reload or an HMR re-activation cannot double count (the primary key rejects it);
- a step that produced a message is never also counted as an attempt (the attempt insert is guarded by `NOT EXISTS (session_id, turn, step)`).

Measured: a duplicate delivery costs ~27 µs and writes nothing.

### 4.4 Provider, account, plan, model

| Field | Source |
|---|---|
| Provider id | `message.source.provider` — the real DSH provider route |
| Provider name | your label → `llm.listProviders()` display name → raw id |
| Account id | the provider route (in DSH one configured provider route is one credential source) |
| Account name | your label → provider display name → raw id |
| Model id | `message.source.model` — the real API model id |
| Model name | your label → raw id |
| Plan | **your label only** |

DSH publishes no plan metadata for a model request, so the plugin never guesses one from a model name. You assign a plan to a provider/account/model triple in the filter popover; until you do, the model sits in `未设置套餐`.

The same model id under different providers stays separate, because the identity is the `(provider, account, model)` triple, not the model string.

### 4.5 Time

- Ranges are half-open local-calendar intervals `[from, to)`, computed with `Date` component setters, so a DST day (23 or 25 hours) is still one day.
- Each row stores the local `day` and ISO `week` it was recorded in, so history keeps the calendar day it happened on.
- Weeks start on Monday.
- A custom range accepts `YYYY-MM-DD` (whole local day) or `YYYY-MM-DDTHH:mm` (exact instant).

---

## 5. Storage

```
$DSH_HOME/token-usage/
  usage.db          # history + your labels (SQLite, WAL)
  settings.json     # user preferences, separate from the history
```

Schema (version 1, tracked in `PRAGMA user_version`):

| Table | Purpose |
|---|---|
| `requests` | one row per model step; `NULL` counters mean "usage unknown" |
| `provider_labels`, `account_labels`, `model_labels` | display-name overrides |
| `plan_assignments` | plan label per provider/account/model |
| `meta` | `started_at`, `first_record_at` |

Indexes: `ts`, `(provider_id, ts)`, `(provider_id, model_id, ts)`, `(account_id, ts)`, `(session_id, turn, step)`.

Renaming or re-labelling never rewrites a history row: labels are joined at query time, so the raw provider/model ids and every token count stay untouched.

Nothing else is stored. There is no prompt text, no reply text, no tool argument, no request body, no API key and no response payload in the database.

---

## 6. Resource behaviour

Measured on this machine (Node 24.21, `node:sqlite`, WAL). Full numbers in `TEST-REPORT.md`.

| | 2,000 rows | 20,000 rows | 100,000 rows |
|---|---|---|---|
| write, per event | 126 µs | 164 µs | 212 µs |
| write CPU, per event | ~40 µs | ~40 µs | 38 µs |
| database size | 716 KB | 6.6 MB | 33 MB |
| summary, all time | 0.4 ms | 5.1 ms | 26 ms |
| trend, all time | 0.7 ms | 8.6 ms | 42 ms |
| ranking, all time | 1.4 ms | 17.6 ms | 95 ms |
| records page (50) | 0.4 ms | 0.7 ms | 2.0 ms |
| live API round trip | — | — | 4.1 ms |

Design consequences:

- **No timers, no polling, no interval.** The Host half contains no `setTimeout`, `setInterval`, `fetch` or socket call; it reacts only to `session/event`.
- **No per-session state.** The recorder keeps no map of sessions, so memory does not grow with conversation count.
- **No full rescan per page.** Every number is a SQL aggregate over indexed columns; the filter tree is cached for 2 s and invalidated on a rename.
- **No third-party dependency.** Only Node built-ins: `node:sqlite`, `node:fs`, `node:path`, `node:os`.
- **No LLM call, ever.** The plugin has no model client and no network code.

---

## 7. Known limitations

1. **No history import.** Statistics start at the moment the plugin first activates. The page shows `开始统计于 <date>` from the first recorded row; earlier usage is not invented or back-filled.
2. **Coverage is the session log.** A model call that DSH does not commit as an `assistant/message` event is not counted. In this deployment that means session-title generation (`session/title-llm-request`) and compaction summaries, whose usage DSH does not persist per request. Ordinary chat, tool-driven steps and subagent steps are all counted.
3. **A step with no response is "unknown", not zero.** If a model step ends without an assistant message (for example a quota rejection), the row is stored with `NULL` counters and the page reports `N 条请求未返回 usage，未计入合计`. Those rows never contribute to a total.
4. **Account is the provider route.** DSH does not attach an account id to a request, so the account dimension is the configured provider route. If you run two accounts on one provider route, rename the account label to keep them apart — the plugin cannot split them by itself.
5. **Plan is a user label.** DSH has no plan metadata. The plugin never infers a plan from a model name.
6. **Renaming is retroactive by design.** A display name or plan label applies to the whole history of that identity; the raw ids and token counts never change.
7. **Timezone changes.** Rows keep the local day they were recorded in. Changing the machine timezone does not rewrite history.
8. **The page needs the Host.** If the Host row is disabled, the page shows a load error instead of stale numbers.

---

## 8. Layout

```
dsh-token-usage/
  package.json          bundle manifest (dsh.bundle.patch + dsh.client)
  cordis.patch.yml      inserts the Host row
  index.js              Host entry: open DB, record, serve the API
  client.js             Client module: sidebar icon + page (no build step)
  icon.svg              panel icon
  locale/en.json        Plugin Manager title/description
  locale/zh.json
  lib/
    db.js               schema, migration, prepared statements
    recorder.js         session/event → one row per model step
    usage.js            TokenUsage adapter (unknown vs zero, cache, reasoning)
    time.js             local-calendar ranges, buckets, DST handling
    query.js            SQL aggregation, labels, plans
    api.js              same-origin JSON API
    settings.js         preferences file
  test/                 unit, integration, API and UI-render tests
  dev/                  benchmark and live acceptance scripts
  TEST-REPORT.md
```

Run the tests:

```
node --test test/*.test.mjs
node dev/bench.mjs 100000
node dev/verify-live.mjs http://127.0.0.1:<port>
```

---

## 9. V1 scope

Implemented: token statistics (input / output / total / cached / reasoning), six time ranges including custom with times, day/week/month/year trends, provider/account/plan/model filtering with search, model and provider/account/plan rankings, request records, number-format switch, local persistence, label and plan editing.

Deliberately not implemented (V2): cost, token-per-minute or speed monitoring, AI analysis or generated reports, cloud or multi-device sync, online account management, external uploads.
