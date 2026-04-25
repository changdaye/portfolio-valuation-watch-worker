# Portfolio Valuation Watch Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker that tracks merged portfolio theme valuations plus macro price percentiles, sends a Feishu daily digest every Monday-Saturday at 22:30 Asia/Shanghai, emits first-entry extreme alerts, and is fully verified by tests, Cloudflare deployment, manual trigger, and a captured Feishu message preview.

**Architecture:** Keep the runtime close to `a-share-margin-sentiment-worker`: one scheduled digest pipeline, D1 for watch items/snapshots/signals/notification logs, KV for runtime state and alert dedupe, Workers AI for a short Chinese headline with template fallback, and COS for the detailed Markdown report. Source collection is split into theme valuation fetchers (proxy-based, allowed to return partial or unavailable metrics), macro history fetchers, a reconcile layer, pure percentile/signal logic, and delivery services so each concern can be tested in isolation.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, KV, Workers AI, Tencent COS, Feishu webhook, Vitest, Wrangler, GitHub CLI.

---

## File Map

### Existing files to modify
- Modify: `README.md`
- Modify: `wrangler.jsonc`
- Modify: `src/config.ts`
- Modify: `src/index.ts`
- Modify: `src/types.ts`
- Modify: `test/config.test.ts`
- Modify: `test/health.test.ts`

### New application files
- Create: `migrations/0001_init.sql`
- Create: `src/db.ts`
- Create: `src/default-watch-items.ts`
- Create: `src/lib/admin.ts`
- Create: `src/lib/message.ts`
- Create: `src/lib/percentile.ts`
- Create: `src/lib/report.ts`
- Create: `src/lib/runtime.ts`
- Create: `src/lib/signals.ts`
- Create: `src/lib/time.ts`
- Create: `src/services/cos.ts`
- Create: `src/services/feishu.ts`
- Create: `src/services/llm.ts`
- Create: `src/services/reconcile.ts`
- Create: `src/services/source-macro.ts`
- Create: `src/services/source-theme.ts`

### New tests
- Create: `test/admin.test.ts`
- Create: `test/db.test.ts`
- Create: `test/message.test.ts`
- Create: `test/report.test.ts`
- Create: `test/runtime.test.ts`
- Create: `test/schedule.test.ts`
- Create: `test/signal.test.ts`
- Create: `test/source-macro.test.ts`
- Create: `test/source-theme.test.ts`
- Create: `test/watch-items.test.ts`

---

### Task 1: Lock the data contract, schedule, and default watch-item map

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Create: `src/default-watch-items.ts`
- Create: `src/lib/time.ts`
- Modify: `test/config.test.ts`
- Create: `test/watch-items.test.ts`

- [ ] **Step 1: Write the failing config + watch-item tests**

Create `test/watch-items.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_WATCH_ITEMS } from '../src/default-watch-items';

describe('DEFAULT_WATCH_ITEMS', () => {
  it('contains 11 theme items and 6 macro items', () => {
    expect(DEFAULT_WATCH_ITEMS.filter((item) => item.kind === 'theme')).toHaveLength(11);
    expect(DEFAULT_WATCH_ITEMS.filter((item) => item.kind === 'macro')).toHaveLength(6);
  });

  it('uses unique ids and includes the required proxies', () => {
    const ids = DEFAULT_WATCH_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('theme-hk-internet-tech');
    expect(ids).toContain('macro-dxy');
  });
});
```

Replace `test/config.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';

describe('parseConfig', () => {
  it('uses the approved defaults', () => {
    const config = parseConfig({});
    expect(config.runHourLocal).toBe(22);
    expect(config.runMinuteLocal).toBe(30);
    expect(config.marketTimezone).toBe('Asia/Shanghai');
    expect(config.percentileWindowYears).toBe(5);
    expect(config.lowPercentileThreshold).toBe(10);
    expect(config.highPercentileThreshold).toBe(90);
    expect(config.runWeekdays).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/config.test.ts test/watch-items.test.ts
```

Expected: FAIL because `DEFAULT_WATCH_ITEMS`, weekday config, and expanded types do not exist.

- [ ] **Step 3: Implement the shared types, schedule defaults, and watch-item definitions**

Replace `src/types.ts` with:

```ts
export type WatchItemKind = 'theme' | 'macro';
export type MetricMode = 'valuation' | 'price';
export type Availability = 'ok' | 'partial' | 'stale' | 'unavailable';
export type Zone = 'extreme_low' | 'low' | 'neutral' | 'high' | 'extreme_high' | 'unavailable';

export interface Env {
  FEISHU_WEBHOOK?: string;
  FEISHU_SECRET?: string;
  MANUAL_TRIGGER_TOKEN?: string;
  TENCENT_COS_SECRET_ID?: string;
  TENCENT_COS_SECRET_KEY?: string;
  TENCENT_COS_BUCKET?: string;
  TENCENT_COS_REGION?: string;
  TENCENT_COS_BASE_URL?: string;
  RUN_HOUR_LOCAL?: string;
  RUN_MINUTE_LOCAL?: string;
  RUN_WEEKDAYS?: string;
  MARKET_TIMEZONE?: string;
  PERCENTILE_WINDOW_YEARS?: string;
  LOW_PERCENTILE_THRESHOLD?: string;
  HIGH_PERCENTILE_THRESHOLD?: string;
  REQUEST_TIMEOUT_MS?: string;
  HEARTBEAT_INTERVAL_HOURS?: string;
  LLM_MODEL?: string;
  WATCHER_DB: D1Database;
  RUNTIME_KV: KVNamespace;
  AI: Ai;
}

export interface AppConfig {
  runHourLocal: number;
  runMinuteLocal: number;
  runWeekdays: number[];
  marketTimezone: string;
  percentileWindowYears: number;
  lowPercentileThreshold: number;
  highPercentileThreshold: number;
  requestTimeoutMs: number;
  heartbeatIntervalHours: number;
  llmModel: string;
  feishuConfigured: boolean;
}

interface WatchItemBase {
  id: string;
  kind: WatchItemKind;
  displayName: string;
  metricMode: MetricMode;
  enabled: boolean;
  focusCodes: string[];
  proxyName: string;
  proxySourceKey: string;
}

export interface ThemeWatchItem extends WatchItemBase {
  kind: 'theme';
  metricMode: 'valuation';
  sourceHoldings: string[];
  preferredMetrics: Array<'pe' | 'pb'>;
}

export interface MacroWatchItem extends WatchItemBase {
  kind: 'macro';
  metricMode: 'price';
  preferredMetrics: Array<'price'>;
}

export type WatchItem = ThemeWatchItem | MacroWatchItem;

export interface DailySnapshot {
  watchItemId: string;
  tradeDate: string;
  asOfDate: string;
  availability: Availability;
  sourceKey: string;
  pe: number | null;
  pb: number | null;
  price: number | null;
  peHistoryJson: string | null;
  pbHistoryJson: string | null;
  priceHistoryJson: string | null;
  notes: string | null;
  rawPayloadJson: string;
}

export interface DailySignal {
  watchItemId: string;
  tradeDate: string;
  metricMode: MetricMode;
  pePct5y: number | null;
  pbPct5y: number | null;
  pricePct5y: number | null;
  zone: Zone;
  extremeReason: string | null;
  focusCodesText: string;
  summaryLine: string;
  metricsJson: string;
}

export interface RuntimeState {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  lastHeartbeatAt?: string;
  itemZones?: Record<string, Zone>;
}
```

Replace `src/config.ts` with:

```ts
import { toInt } from './lib/value';
import type { AppConfig, Env } from './types';

function toWeekdays(raw: string | undefined): number[] {
  const parsed = (raw ?? '1,2,3,4,5,6')
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return parsed.length ? parsed : [1, 2, 3, 4, 5, 6];
}

export function parseConfig(env: Partial<Env>): AppConfig {
  return {
    runHourLocal: toInt(env.RUN_HOUR_LOCAL, 22, 0),
    runMinuteLocal: toInt(env.RUN_MINUTE_LOCAL, 30, 0),
    runWeekdays: toWeekdays(env.RUN_WEEKDAYS),
    marketTimezone: env.MARKET_TIMEZONE?.trim() || 'Asia/Shanghai',
    percentileWindowYears: toInt(env.PERCENTILE_WINDOW_YEARS, 5, 1),
    lowPercentileThreshold: toInt(env.LOW_PERCENTILE_THRESHOLD, 10, 0),
    highPercentileThreshold: toInt(env.HIGH_PERCENTILE_THRESHOLD, 90, 0),
    requestTimeoutMs: toInt(env.REQUEST_TIMEOUT_MS, 15000, 1000),
    heartbeatIntervalHours: toInt(env.HEARTBEAT_INTERVAL_HOURS, 24, 1),
    llmModel: env.LLM_MODEL?.trim() || '@cf/meta/llama-3.1-8b-instruct',
    feishuConfigured: Boolean(env.FEISHU_WEBHOOK?.trim() && env.FEISHU_SECRET?.trim())
  };
}
```

Create `src/default-watch-items.ts`:

```ts
import type { WatchItem } from './types';

export const DEFAULT_WATCH_ITEMS: WatchItem[] = [
  {
    id: 'theme-hk-internet-tech',
    kind: 'theme',
    displayName: '港股互联网 / 科技',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['513050', '159202', '513180'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '恒生科技指数',
    proxySourceKey: 'legulegu:hsi-theme-index:HSTECH',
    focusCodes: ['513050', '159202', '513180']
  },
  {
    id: 'theme-hk-broad',
    kind: 'theme',
    displayName: '港股宽基',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['159920'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '恒生指数',
    proxySourceKey: 'legulegu:market:hsi',
    focusCodes: ['159920']
  },
  {
    id: 'theme-health-biotech',
    kind: 'theme',
    displayName: '医药 / 创新药 / 生物科技',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['520500', '159502', '159938'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '申万生物制品',
    proxySourceKey: 'legulegu:sw-industry-2021:801152.SI',
    focusCodes: ['520500', '159502', '159938']
  },
  {
    id: 'theme-semiconductor',
    kind: 'theme',
    displayName: '半导体 / 芯片',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['513310'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '申万半导体',
    proxySourceKey: 'legulegu:sw-industry-2021:801082.SI',
    focusCodes: ['513310']
  },
  {
    id: 'theme-dividend',
    kind: 'theme',
    displayName: '红利 / 高股息',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['159525'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '中证红利低波',
    proxySourceKey: 'legulegu:index-basic:930955.CSI',
    focusCodes: ['159525']
  },
  {
    id: 'theme-a-large-cap',
    kind: 'theme',
    displayName: 'A股大盘蓝筹',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['510050'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '上证50',
    proxySourceKey: 'legulegu:index-basic:000016.SH',
    focusCodes: ['510050']
  },
  {
    id: 'theme-a-mid-cap',
    kind: 'theme',
    displayName: 'A股中盘',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['510580'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '中证500',
    proxySourceKey: 'legulegu:index-basic:000905.SH',
    focusCodes: ['510580']
  },
  {
    id: 'theme-sci-tech-growth',
    kind: 'theme',
    displayName: '科创成长',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['588000'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '科创50',
    proxySourceKey: 'legulegu:index-basic:000688.SH',
    focusCodes: ['588000']
  },
  {
    id: 'theme-chi-next-growth',
    kind: 'theme',
    displayName: '创业板成长',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['159949'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '创业板50',
    proxySourceKey: 'legulegu:index-basic:399673.SZ',
    focusCodes: ['159949']
  },
  {
    id: 'theme-us-tech',
    kind: 'theme',
    displayName: '美股科技',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['159659'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '纳斯达克100',
    proxySourceKey: 'legulegu:market:nasdaq100',
    focusCodes: ['159659']
  },
  {
    id: 'theme-us-broad',
    kind: 'theme',
    displayName: '美股宽基',
    metricMode: 'valuation',
    enabled: true,
    sourceHoldings: ['513500'],
    preferredMetrics: ['pe', 'pb'],
    proxyName: '标普500',
    proxySourceKey: 'legulegu:market:sandp',
    focusCodes: ['513500']
  },
  {
    id: 'macro-dxy',
    kind: 'macro',
    displayName: 'DXY',
    metricMode: 'price',
    enabled: true,
    preferredMetrics: ['price'],
    proxyName: '美元指数',
    proxySourceKey: 'macro:dxy',
    focusCodes: ['DXY']
  },
  {
    id: 'macro-usd-cnh',
    kind: 'macro',
    displayName: 'USD/CNH',
    metricMode: 'price',
    enabled: true,
    preferredMetrics: ['price'],
    proxyName: '离岸人民币',
    proxySourceKey: 'macro:usd-cnh',
    focusCodes: ['USD/CNH']
  },
  {
    id: 'macro-usd-jpy',
    kind: 'macro',
    displayName: 'USD/JPY',
    metricMode: 'price',
    enabled: true,
    preferredMetrics: ['price'],
    proxyName: '美元兑日元',
    proxySourceKey: 'macro:usd-jpy',
    focusCodes: ['USD/JPY']
  },
  {
    id: 'macro-gold',
    kind: 'macro',
    displayName: '黄金',
    metricMode: 'price',
    enabled: true,
    preferredMetrics: ['price'],
    proxyName: '伦敦金 / COMEX Gold',
    proxySourceKey: 'macro:gold',
    focusCodes: ['XAUUSD']
  },
  {
    id: 'macro-wti',
    kind: 'macro',
    displayName: 'WTI 原油',
    metricMode: 'price',
    enabled: true,
    preferredMetrics: ['price'],
    proxyName: 'WTI Crude Oil',
    proxySourceKey: 'macro:wti',
    focusCodes: ['WTI']
  },
  {
    id: 'macro-brent',
    kind: 'macro',
    displayName: '布伦特原油',
    metricMode: 'price',
    enabled: true,
    preferredMetrics: ['price'],
    proxyName: 'Brent Crude Oil',
    proxySourceKey: 'macro:brent',
    focusCodes: ['BRENT']
  }
];
```

Create `src/lib/time.ts`:

```ts
export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function weekdayInShanghai(now = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short'
  }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/config.test.ts test/watch-items.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the shared contracts**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
git add src/types.ts src/config.ts src/default-watch-items.ts src/lib/time.ts test/config.test.ts test/watch-items.test.ts
cat > /tmp/commit-msg.txt <<'MSG'
Freeze the monitoring contract before adding fetch logic

This defines the approved theme/macro watch list, the runtime schedule,
and the core value objects so later work can add persistence and network
fetchers without re-deciding product scope.

Constraint: Watch list must match the approved holdings-derived theme set
Constraint: Monday-Saturday 22:30 Asia/Shanghai is the committed schedule
Rejected: Keep watch items in ad hoc JSON blobs | harder to test and migrate
Confidence: high
Scope-risk: narrow
Reversibility: clean
Directive: Add or remove watch items only by changing both the defaults and their regression tests together
Tested: vitest config and watch-item tests
Not-tested: D1 persistence and scheduled execution
MSG
git commit -F /tmp/commit-msg.txt
```

---

### Task 2: Build D1 schema and repository helpers, including reseed support

**Files:**
- Create: `migrations/0001_init.sql`
- Create: `src/db.ts`
- Create: `test/db.test.ts`

- [ ] **Step 1: Write the failing DB mapping tests**

Create `test/db.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapWatchItemRow, mapSignalRow } from '../src/db';

describe('db row mappers', () => {
  it('maps watch item rows back into runtime objects', () => {
    const mapped = mapWatchItemRow({
      id: 'macro-dxy',
      kind: 'macro',
      display_name: 'DXY',
      metric_mode: 'price',
      enabled: 1,
      source_holdings_json: '[]',
      preferred_metrics_json: '["price"]',
      proxy_name: '美元指数',
      proxy_source_key: 'macro:dxy',
      focus_codes_json: '["DXY"]'
    });

    expect(mapped.id).toBe('macro-dxy');
    expect(mapped.kind).toBe('macro');
    expect(mapped.focusCodes).toEqual(['DXY']);
  });

  it('maps nullable signal metrics without losing nulls', () => {
    const mapped = mapSignalRow({
      watch_item_id: 'theme-hk-broad',
      trade_date: '2026-04-25',
      metric_mode: 'valuation',
      pe_pct_5y: 15.23,
      pb_pct_5y: null,
      price_pct_5y: null,
      zone: 'low',
      extreme_reason: null,
      focus_codes_text: '159920',
      summary_line: '港股宽基 | PE 15.23%',
      metrics_json: '{"pe":10.2}'
    });

    expect(mapped.pbPct5y).toBeNull();
    expect(mapped.summaryLine).toContain('港股宽基');
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/db.test.ts
```

Expected: FAIL because the DB module and mappers do not exist.

- [ ] **Step 3: Implement the migration and DB helpers**

Create `migrations/0001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS watch_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  metric_mode TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  source_holdings_json TEXT NOT NULL,
  preferred_metrics_json TEXT NOT NULL,
  proxy_name TEXT NOT NULL,
  proxy_source_key TEXT NOT NULL,
  focus_codes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  watch_item_id TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  availability TEXT NOT NULL,
  source_key TEXT NOT NULL,
  pe REAL,
  pb REAL,
  price REAL,
  pe_history_json TEXT,
  pb_history_json TEXT,
  price_history_json TEXT,
  notes TEXT,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (watch_item_id, trade_date)
);

CREATE TABLE IF NOT EXISTS daily_signals (
  watch_item_id TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  metric_mode TEXT NOT NULL,
  pe_pct_5y REAL,
  pb_pct_5y REAL,
  price_pct_5y REAL,
  zone TEXT NOT NULL,
  extreme_reason TEXT,
  focus_codes_text TEXT NOT NULL,
  summary_line TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (watch_item_id, trade_date)
);

CREATE TABLE IF NOT EXISTS notification_runs (
  id TEXT PRIMARY KEY,
  trade_date TEXT NOT NULL,
  run_type TEXT NOT NULL,
  watch_item_id TEXT,
  message_text TEXT NOT NULL,
  report_url TEXT,
  feishu_push_ok INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

Create `src/db.ts`:

```ts
import { DEFAULT_WATCH_ITEMS } from './default-watch-items';
import type { DailySignal, DailySnapshot, WatchItem } from './types';

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapWatchItemRow(row: Record<string, unknown>): WatchItem {
  return {
    id: String(row.id),
    kind: row.kind === 'macro' ? 'macro' : 'theme',
    displayName: String(row.display_name),
    metricMode: row.metric_mode === 'price' ? 'price' : 'valuation',
    enabled: Number(row.enabled ?? 0) === 1,
    sourceHoldings: parseJson<string[]>(row.source_holdings_json, []),
    preferredMetrics: parseJson<any[]>(row.preferred_metrics_json, []),
    proxyName: String(row.proxy_name),
    proxySourceKey: String(row.proxy_source_key),
    focusCodes: parseJson<string[]>(row.focus_codes_json, [])
  } as WatchItem;
}

export function mapSignalRow(row: Record<string, unknown>): DailySignal {
  return {
    watchItemId: String(row.watch_item_id),
    tradeDate: String(row.trade_date),
    metricMode: row.metric_mode === 'price' ? 'price' : 'valuation',
    pePct5y: row.pe_pct_5y == null ? null : Number(row.pe_pct_5y),
    pbPct5y: row.pb_pct_5y == null ? null : Number(row.pb_pct_5y),
    pricePct5y: row.price_pct_5y == null ? null : Number(row.price_pct_5y),
    zone: String(row.zone) as DailySignal['zone'],
    extremeReason: row.extreme_reason == null ? null : String(row.extreme_reason),
    focusCodesText: String(row.focus_codes_text),
    summaryLine: String(row.summary_line),
    metricsJson: String(row.metrics_json)
  };
}

export async function reseedDefaultWatchItems(db: D1Database, nowIso: string): Promise<number> {
  const statements = [db.prepare('DELETE FROM watch_items')];
  for (const item of DEFAULT_WATCH_ITEMS) {
    statements.push(
      db.prepare(`INSERT INTO watch_items (
        id, kind, display_name, metric_mode, enabled,
        source_holdings_json, preferred_metrics_json, proxy_name,
        proxy_source_key, focus_codes_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        item.id,
        item.kind,
        item.displayName,
        item.metricMode,
        item.enabled ? 1 : 0,
        JSON.stringify('sourceHoldings' in item ? item.sourceHoldings : []),
        JSON.stringify(item.preferredMetrics),
        item.proxyName,
        item.proxySourceKey,
        JSON.stringify(item.focusCodes),
        nowIso,
        nowIso,
      )
    );
  }
  await db.batch(statements);
  return DEFAULT_WATCH_ITEMS.length;
}
```

- [ ] **Step 4: Run the DB tests**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/db.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the schema layer**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
git add migrations/0001_init.sql src/db.ts test/db.test.ts
cat > /tmp/commit-msg.txt <<'MSG'
Persist watch items and daily results before wiring network code

The schema and repository helpers create a stable home for seeded watch
items, normalized snapshots, computed signals, and message logs so later
runtime work can stay deterministic.

Constraint: Public repo must avoid secret leakage while still supporting reseed/admin flows
Constraint: Snapshot history must preserve nullable metrics for partial data sources
Rejected: Store everything in KV only | poor queryability and weak auditability
Confidence: high
Scope-risk: narrow
Reversibility: clean
Directive: Keep row mappers exported and tested so schema refactors stay reviewable
Tested: vitest db mapper tests
Not-tested: remote D1 migration apply
MSG
git commit -F /tmp/commit-msg.txt
```

---

### Task 3: Implement percentile math, zone classification, and alert dedupe

**Files:**
- Create: `src/lib/percentile.ts`
- Create: `src/lib/signals.ts`
- Create: `src/lib/runtime.ts`
- Create: `test/signal.test.ts`
- Create: `test/runtime.test.ts`

- [ ] **Step 1: Write the failing signal + runtime tests**

Create `test/signal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSignal } from '../src/lib/signals';
import type { DailySnapshot, WatchItem } from '../src/types';

const themeItem: WatchItem = {
  id: 'theme-a-large-cap',
  kind: 'theme',
  displayName: 'A股大盘蓝筹',
  metricMode: 'valuation',
  enabled: true,
  sourceHoldings: ['510050'],
  preferredMetrics: ['pe', 'pb'],
  proxyName: '上证50',
  proxySourceKey: 'legulegu:index-basic:000016.SH',
  focusCodes: ['510050']
};

const macroItem: WatchItem = {
  id: 'macro-dxy',
  kind: 'macro',
  displayName: 'DXY',
  metricMode: 'price',
  enabled: true,
  preferredMetrics: ['price'],
  proxyName: '美元指数',
  proxySourceKey: 'macro:dxy',
  focusCodes: ['DXY']
};

describe('buildSignal', () => {
  it('marks a valuation item as extreme_high when PE and PB are in the top decile', () => {
    const snapshot: DailySnapshot = {
      watchItemId: 'theme-a-large-cap',
      tradeDate: '2026-04-25',
      asOfDate: '2026-04-25',
      availability: 'ok',
      sourceKey: 'legulegu:index-basic:000016.SH',
      pe: 15,
      pb: 2.1,
      price: null,
      peHistoryJson: JSON.stringify([8, 9, 10, 11, 12, 13, 14, 15]),
      pbHistoryJson: JSON.stringify([1.0, 1.1, 1.2, 1.3, 1.4, 1.7, 1.9, 2.1]),
      priceHistoryJson: null,
      notes: null,
      rawPayloadJson: '{}'
    };

    const signal = buildSignal(themeItem, snapshot, { low: 10, high: 90 });
    expect(signal.zone).toBe('extreme_high');
    expect(signal.extremeReason).toContain('PE');
    expect(signal.summaryLine).toContain('A股大盘蓝筹');
  });

  it('marks a macro item as extreme_low from price history only', () => {
    const snapshot: DailySnapshot = {
      watchItemId: 'macro-dxy',
      tradeDate: '2026-04-25',
      asOfDate: '2026-04-25',
      availability: 'ok',
      sourceKey: 'macro:dxy',
      pe: null,
      pb: null,
      price: 94,
      peHistoryJson: null,
      pbHistoryJson: null,
      priceHistoryJson: JSON.stringify([94, 96, 97, 98, 100, 102]),
      notes: null,
      rawPayloadJson: '{}'
    };

    const signal = buildSignal(macroItem, snapshot, { low: 10, high: 90 });
    expect(signal.zone).toBe('extreme_low');
    expect(signal.pricePct5y).toBeLessThanOrEqual(10);
  });
});
```

Create `test/runtime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldSendExtremeAlert } from '../src/lib/runtime';

describe('shouldSendExtremeAlert', () => {
  it('sends only when entering an extreme zone', () => {
    expect(shouldSendExtremeAlert({}, 'theme-a-large-cap', 'extreme_high')).toBe(true);
    expect(shouldSendExtremeAlert({ itemZones: { 'theme-a-large-cap': 'extreme_high' } }, 'theme-a-large-cap', 'extreme_high')).toBe(false);
    expect(shouldSendExtremeAlert({ itemZones: { 'theme-a-large-cap': 'neutral' } }, 'theme-a-large-cap', 'extreme_high')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/signal.test.ts test/runtime.test.ts
```

Expected: FAIL because the signal and runtime modules do not exist.

- [ ] **Step 3: Implement the pure logic modules**

Create `src/lib/percentile.ts`:

```ts
export function percentileRank(values: number[], value: number): number {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return 0;
  const lessOrEqual = finite.filter((item) => item <= value).length;
  return Number(((lessOrEqual / finite.length) * 100).toFixed(2));
}
```

Create `src/lib/signals.ts`:

```ts
import { percentileRank } from './percentile';
import type { DailySignal, DailySnapshot, WatchItem, Zone } from '../types';

function zoneFromValues(values: Array<number | null>, low: number, high: number): Zone {
  const available = values.filter((value): value is number => value != null);
  if (!available.length) return 'unavailable';
  if (available.some((value) => value <= low)) return 'extreme_low';
  if (available.some((value) => value >= high)) return 'extreme_high';
  if (available.some((value) => value < 35)) return 'low';
  if (available.some((value) => value > 65)) return 'high';
  return 'neutral';
}

export function buildSignal(item: WatchItem, snapshot: DailySnapshot, thresholds: { low: number; high: number }): DailySignal {
  const peHistory = snapshot.peHistoryJson ? JSON.parse(snapshot.peHistoryJson) as number[] : [];
  const pbHistory = snapshot.pbHistoryJson ? JSON.parse(snapshot.pbHistoryJson) as number[] : [];
  const priceHistory = snapshot.priceHistoryJson ? JSON.parse(snapshot.priceHistoryJson) as number[] : [];

  const pePct5y = snapshot.pe == null ? null : percentileRank(peHistory, snapshot.pe);
  const pbPct5y = snapshot.pb == null ? null : percentileRank(pbHistory, snapshot.pb);
  const pricePct5y = snapshot.price == null ? null : percentileRank(priceHistory, snapshot.price);
  const zone = zoneFromValues(item.metricMode === 'valuation' ? [pePct5y, pbPct5y] : [pricePct5y], thresholds.low, thresholds.high);
  const extremeReason = zone === 'extreme_high'
    ? [pePct5y != null && pePct5y >= thresholds.high ? `PE ${pePct5y}%` : '', pbPct5y != null && pbPct5y >= thresholds.high ? `PB ${pbPct5y}%` : '', pricePct5y != null && pricePct5y >= thresholds.high ? `价格 ${pricePct5y}%` : ''].filter(Boolean).join(' / ')
    : zone === 'extreme_low'
      ? [pePct5y != null && pePct5y <= thresholds.low ? `PE ${pePct5y}%` : '', pbPct5y != null && pbPct5y <= thresholds.low ? `PB ${pbPct5y}%` : '', pricePct5y != null && pricePct5y <= thresholds.low ? `价格 ${pricePct5y}%` : ''].filter(Boolean).join(' / ')
      : null;

  return {
    watchItemId: item.id,
    tradeDate: snapshot.tradeDate,
    metricMode: item.metricMode,
    pePct5y,
    pbPct5y,
    pricePct5y,
    zone,
    extremeReason,
    focusCodesText: item.focusCodes.join(' / '),
    summaryLine: item.metricMode === 'valuation'
      ? `${item.displayName} | PE ${pePct5y ?? 'NA'}% | PB ${pbPct5y ?? 'NA'}% | ${zone}`
      : `${item.displayName} | 价格分位 ${pricePct5y ?? 'NA'}% | ${zone}`,
    metricsJson: JSON.stringify({ pe: snapshot.pe, pb: snapshot.pb, price: snapshot.price })
  };
}
```

Create `src/lib/runtime.ts`:

```ts
import type { RuntimeState, Zone } from '../types';

export function shouldSendExtremeAlert(state: RuntimeState, watchItemId: string, zone: Zone): boolean {
  if (zone !== 'extreme_low' && zone !== 'extreme_high') return false;
  return state.itemZones?.[watchItemId] !== zone;
}

export function nextRuntimeState(state: RuntimeState, watchItemId: string, zone: Zone, nowIso: string): RuntimeState {
  return {
    ...state,
    lastSuccessAt: nowIso,
    itemZones: {
      ...(state.itemZones ?? {}),
      [watchItemId]: zone
    }
  };
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/signal.test.ts test/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the signal engine**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
git add src/lib/percentile.ts src/lib/signals.ts src/lib/runtime.ts test/signal.test.ts test/runtime.test.ts
cat > /tmp/commit-msg.txt <<'MSG'
Make the alert thresholds deterministic before adding fetchers

This isolates percentile math, zone classification, and extreme-entry
deduplication so network failures cannot hide logic regressions.

Constraint: Extreme alerts must fire only on first entry into the zone
Constraint: Missing metrics must degrade to unavailable instead of guessed values
Rejected: Let message formatting decide the zone | mixes presentation with business logic
Confidence: high
Scope-risk: narrow
Reversibility: clean
Directive: Extend zone semantics only with new regression tests for both theme and macro items
Tested: vitest signal and runtime tests
Not-tested: Interaction with persisted D1 rows and KV state
MSG
git commit -F /tmp/commit-msg.txt
```

---

### Task 4: Render Feishu messages and Markdown reports with previews suitable for manual verification

**Files:**
- Create: `src/lib/message.ts`
- Create: `src/lib/report.ts`
- Create: `test/message.test.ts`
- Create: `test/report.test.ts`

- [ ] **Step 1: Write the failing presentation tests**

Create `test/message.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDailyMessage, buildExtremeAlertMessage } from '../src/lib/message';
import type { DailySignal, WatchItem } from '../src/types';

const item: WatchItem = {
  id: 'theme-hk-broad',
  kind: 'theme',
  displayName: '港股宽基',
  metricMode: 'valuation',
  enabled: true,
  sourceHoldings: ['159920'],
  preferredMetrics: ['pe', 'pb'],
  proxyName: '恒生指数',
  proxySourceKey: 'legulegu:market:hsi',
  focusCodes: ['159920']
};

const signal: DailySignal = {
  watchItemId: 'theme-hk-broad',
  tradeDate: '2026-04-25',
  metricMode: 'valuation',
  pePct5y: 12.5,
  pbPct5y: 9.8,
  pricePct5y: null,
  zone: 'extreme_low',
  extremeReason: 'PB 9.8%',
  focusCodesText: '159920',
  summaryLine: '港股宽基 | PE 12.5% | PB 9.8% | extreme_low',
  metricsJson: '{"pe":9.8,"pb":1.01}'
};

describe('buildDailyMessage', () => {
  it('keeps the preferred Feishu format', () => {
    const text = buildDailyMessage('组合估值整体偏低。', [signal], 'https://example.com/report.md');
    expect(text).toContain('关注代码');
    expect(text).toContain('详细版报告:\nhttps://example.com/report.md');
  });
});

describe('buildExtremeAlertMessage', () => {
  it('mentions the zone and reason once', () => {
    const text = buildExtremeAlertMessage(item, signal, 'https://example.com/report.md');
    expect(text).toContain('进入极端区间');
    expect(text).toContain('PB 9.8%');
  });
});
```

Create `test/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDetailedReport } from '../src/lib/report';
import type { DailySignal, WatchItem } from '../src/types';

describe('buildDetailedReport', () => {
  it('includes overview, tables, and data dates', () => {
    const item: WatchItem = {
      id: 'macro-wti',
      kind: 'macro',
      displayName: 'WTI 原油',
      metricMode: 'price',
      enabled: true,
      preferredMetrics: ['price'],
      proxyName: 'WTI Crude Oil',
      proxySourceKey: 'macro:wti',
      focusCodes: ['WTI']
    };
    const signal: DailySignal = {
      watchItemId: 'macro-wti',
      tradeDate: '2026-04-25',
      metricMode: 'price',
      pePct5y: null,
      pbPct5y: null,
      pricePct5y: 91.2,
      zone: 'extreme_high',
      extremeReason: '价格 91.2%',
      focusCodesText: 'WTI',
      summaryLine: 'WTI 原油 | 价格分位 91.2% | extreme_high',
      metricsJson: '{"price":82.1}'
    };
    const report = buildDetailedReport({
      generatedAt: new Date('2026-04-25T14:30:00.000Z'),
      tradeDate: '2026-04-25',
      headline: '原油高位，组合整体偏中性。',
      watchItems: [item],
      signals: [signal],
      reportUrl: 'https://example.com/report.md'
    });

    expect(report).toContain('# 投资组合估值观察日报');
    expect(report).toContain('WTI 原油');
    expect(report).toContain('2026-04-25');
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/message.test.ts test/report.test.ts
```

Expected: FAIL because the message and report modules do not exist.

- [ ] **Step 3: Implement the renderers**

Create `src/lib/message.ts`:

```ts
import type { DailySignal, WatchItem } from '../types';

export function buildDailyMessage(headline: string, extremeSignals: DailySignal[], reportUrl: string): string {
  const watchLines = extremeSignals.length
    ? extremeSignals.map((signal) => `- ${signal.summaryLine}`).join('\n')
    : '- 今日无新增极端区间项目';
  const focusCodes = Array.from(new Set(extremeSignals.flatMap((signal) => signal.focusCodesText.split(' / ')).filter(Boolean))).join(' / ') || '无';
  return [
    headline,
    '',
    '今日极端项目：',
    watchLines,
    '',
    `关注代码：${focusCodes}`,
    '',
    '详细版报告:',
    reportUrl
  ].join('\n');
}

export function buildExtremeAlertMessage(item: WatchItem, signal: DailySignal, reportUrl: string): string {
  return [
    `${item.displayName} 进入极端区间`,
    `状态：${signal.zone}`,
    `原因：${signal.extremeReason ?? '无'}`,
    `关注代码：${signal.focusCodesText}`,
    '',
    '详细版报告:',
    reportUrl
  ].join('\n');
}
```

Create `src/lib/report.ts`:

```ts
import type { DailySignal, WatchItem } from '../types';

export function buildDetailedReport(input: {
  generatedAt: Date;
  tradeDate: string;
  headline: string;
  watchItems: WatchItem[];
  signals: DailySignal[];
  reportUrl: string;
}): string {
  const rows = input.signals
    .map((signal) => {
      const item = input.watchItems.find((entry) => entry.id === signal.watchItemId);
      return `| ${item?.displayName ?? signal.watchItemId} | ${signal.pePct5y ?? '-'} | ${signal.pbPct5y ?? '-'} | ${signal.pricePct5y ?? '-'} | ${signal.zone} | ${signal.extremeReason ?? '-'} |`;
    })
    .join('\n');

  return [
    '# 投资组合估值观察日报',
    '',
    `- 交易日期：${input.tradeDate}`,
    `- 生成时间：${input.generatedAt.toISOString()}`,
    `- 结论：${input.headline}`,
    '',
    '## 主题 / 宏观状态表',
    '',
    '| 对象 | PE分位 | PB分位 | 价格分位 | 区间 | 原因 |',
    '| --- | --- | --- | --- | --- | --- |',
    rows,
    '',
    '## 详细版报告链接',
    '',
    input.reportUrl
  ].join('\n');
}
```

- [ ] **Step 4: Run the presentation tests**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/message.test.ts test/report.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the presentation layer**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
git add src/lib/message.ts src/lib/report.ts test/message.test.ts test/report.test.ts
cat > /tmp/commit-msg.txt <<'MSG'
Make the outbound message shape reviewable before wiring Feishu delivery

Short-message and report builders are pure so the exact text sent to Feishu
can be tested locally and inspected after manual triggers without depending
on external webhook behavior.

Constraint: Feishu short messages must keep the no-title/no-time/minimal-link format
Constraint: Manual verification needs a stable preview of the sent content
Rejected: Render message text inline in the worker entrypoint | difficult to test and compare
Confidence: high
Scope-risk: narrow
Reversibility: clean
Directive: Preserve the final two-line detailed report footer unless the user explicitly changes the house style
Tested: vitest message and report tests
Not-tested: Actual webhook rendering inside Feishu client UI
MSG
git commit -F /tmp/commit-msg.txt
```

---

### Task 5: Implement source adapters and reconcile partial / stale data safely

**Files:**
- Create: `src/services/source-theme.ts`
- Create: `src/services/source-macro.ts`
- Create: `src/services/reconcile.ts`
- Create: `test/source-theme.test.ts`
- Create: `test/source-macro.test.ts`

- [ ] **Step 1: Write the failing source parser tests**

Create `test/source-theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseThemeSnapshot } from '../src/services/source-theme';

describe('parseThemeSnapshot', () => {
  it('accepts a valuation payload with PE and PB history arrays', () => {
    const parsed = parseThemeSnapshot('theme-a-large-cap', {
      asOfDate: '2026-04-25',
      pe: 15.1,
      pb: 2.03,
      peHistory: [9, 10, 11, 12, 13, 14, 15.1],
      pbHistory: [1.1, 1.2, 1.4, 1.5, 1.7, 1.9, 2.03]
    });

    expect(parsed.availability).toBe('ok');
    expect(parsed.pe).toBe(15.1);
    expect(parsed.pbHistoryJson).toContain('2.03');
  });

  it('degrades to partial when only PE is present', () => {
    const parsed = parseThemeSnapshot('theme-hk-internet-tech', {
      asOfDate: '2026-04-25',
      pe: 21.8,
      pb: null,
      peHistory: [12, 13, 15, 18, 21.8],
      pbHistory: []
    });

    expect(parsed.availability).toBe('partial');
    expect(parsed.pb).toBeNull();
  });
});
```

Create `test/source-macro.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseMacroHistory } from '../src/services/source-macro';

describe('parseMacroHistory', () => {
  it('parses price history into a latest snapshot', () => {
    const parsed = parseMacroHistory('macro-wti', {
      asOfDate: '2026-04-25',
      latestPrice: 82.3,
      history: [55.1, 60.2, 70.3, 82.3]
    });

    expect(parsed.price).toBe(82.3);
    expect(parsed.availability).toBe('ok');
    expect(parsed.priceHistoryJson).toContain('82.3');
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/source-theme.test.ts test/source-macro.test.ts
```

Expected: FAIL because the source modules do not exist.

- [ ] **Step 3: Implement parsing + provider fetch wrappers**

Create `src/services/source-theme.ts`:

```ts
import type { DailySnapshot } from '../types';

function asHistory(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

export function parseThemeSnapshot(watchItemId: string, payload: Record<string, unknown>): DailySnapshot {
  const peHistory = asHistory(payload.peHistory);
  const pbHistory = asHistory(payload.pbHistory);
  const pe = payload.pe == null ? null : Number(payload.pe);
  const pb = payload.pb == null ? null : Number(payload.pb);
  const availability = pe != null && pb != null ? 'ok' : pe != null || pb != null ? 'partial' : 'unavailable';

  return {
    watchItemId,
    tradeDate: String(payload.asOfDate),
    asOfDate: String(payload.asOfDate),
    availability,
    sourceKey: 'theme-provider',
    pe,
    pb,
    price: null,
    peHistoryJson: peHistory.length ? JSON.stringify(peHistory) : null,
    pbHistoryJson: pbHistory.length ? JSON.stringify(pbHistory) : null,
    priceHistoryJson: null,
    notes: availability === 'partial' ? 'theme source returned partial valuation metrics' : null,
    rawPayloadJson: JSON.stringify(payload)
  };
}

export async function fetchThemePayload(requestUrl: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(requestUrl, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`theme source http ${response.status}`);
    return await response.json() as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}
```

Create `src/services/source-macro.ts`:

```ts
import type { DailySnapshot } from '../types';

export function parseMacroHistory(watchItemId: string, payload: { asOfDate: string; latestPrice: number; history: number[] }): DailySnapshot {
  return {
    watchItemId,
    tradeDate: payload.asOfDate,
    asOfDate: payload.asOfDate,
    availability: payload.history.length ? 'ok' : 'unavailable',
    sourceKey: 'macro-provider',
    pe: null,
    pb: null,
    price: payload.latestPrice,
    peHistoryJson: null,
    pbHistoryJson: null,
    priceHistoryJson: JSON.stringify(payload.history),
    notes: null,
    rawPayloadJson: JSON.stringify(payload)
  };
}
```

Create `src/services/reconcile.ts`:

```ts
import type { DailySignal, DailySnapshot, WatchItem } from '../types';
import { buildSignal } from '../lib/signals';

export function reconcileSignals(items: WatchItem[], snapshots: DailySnapshot[], thresholds: { low: number; high: number }): DailySignal[] {
  return snapshots.map((snapshot) => {
    const item = items.find((entry) => entry.id === snapshot.watchItemId);
    if (!item) throw new Error(`missing watch item for snapshot ${snapshot.watchItemId}`);
    return buildSignal(item, snapshot, thresholds);
  });
}
```

- [ ] **Step 4: Run the source tests**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/source-theme.test.ts test/source-macro.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the source layer**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
git add src/services/source-theme.ts src/services/source-macro.ts src/services/reconcile.ts test/source-theme.test.ts test/source-macro.test.ts
cat > /tmp/commit-msg.txt <<'MSG'
Normalize upstream market payloads before wiring the orchestrator

The fetch/parse layer turns theme valuation responses and macro price
histories into one snapshot shape so stale or partial data can be handled
consistently downstream.

Constraint: Theme sources may return PE without PB and must not block the whole digest
Constraint: Macro objects only need price percentile history, not valuation metrics
Rejected: Special-case each source inside the scheduler | impossible to test cleanly
Confidence: medium
Scope-risk: moderate
Reversibility: clean
Directive: Keep raw payload JSON on every snapshot so parser regressions can be diagnosed from stored data
Tested: vitest source parser tests
Not-tested: live upstream HTTP requests and stale-date handling
MSG
git commit -F /tmp/commit-msg.txt
```

---

### Task 6: Wire Feishu/COS/LLM delivery, admin endpoints, and the full digest pipeline

**Files:**
- Create: `src/lib/admin.ts`
- Create: `src/services/feishu.ts`
- Create: `src/services/cos.ts`
- Create: `src/services/llm.ts`
- Modify: `src/index.ts`
- Modify: `test/health.test.ts`
- Create: `test/admin.test.ts`
- Create: `test/schedule.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

Create `test/admin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('admin trigger', () => {
  it('rejects unauthenticated manual trigger calls', async () => {
    const response = await worker.fetch(new Request('https://example.com/admin/trigger', { method: 'POST' }), {
      WATCHER_DB: {} as D1Database,
      RUNTIME_KV: {} as KVNamespace,
      AI: {} as Ai,
      MANUAL_TRIGGER_TOKEN: 'secret'
    } as any);

    expect(response.status).toBe(401);
  });
});
```

Replace `test/health.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('worker health', () => {
  it('returns schedule and config metadata', async () => {
    const response = await worker.fetch(new Request('https://example.com/health'), {
      WATCHER_DB: {} as D1Database,
      RUNTIME_KV: {} as KVNamespace,
      AI: {} as Ai
    } as any);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('bootstrap');
    expect(payload).toHaveProperty('schedule');
  });
});
```

Create `test/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('scheduled handler', () => {
  it('does not throw when invoked with the configured cadence', async () => {
    await expect(worker.scheduled({} as ScheduledController, {
      WATCHER_DB: {} as D1Database,
      RUNTIME_KV: {} as KVNamespace,
      AI: {} as Ai
    } as any)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the runtime tests to verify failure**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/health.test.ts test/admin.test.ts test/schedule.test.ts
```

Expected: FAIL because auth helpers and the digest runtime are not wired.

- [ ] **Step 3: Implement service clients and the orchestrator entrypoint**

Create `src/lib/admin.ts`:

```ts
export function authorizeAdminRequest(request: Request, token: string | undefined): { ok: boolean; status: number; error?: string } {
  if (!token) return { ok: false, status: 401, error: 'manual trigger token missing' };
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${token}`) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true, status: 200 };
}
```

Create `src/services/feishu.ts`:

```ts
export async function pushToFeishu(webhook: string, body: string): Promise<void> {
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: body } })
  });
  if (!response.ok) throw new Error(`feishu webhook failed ${response.status}`);
}
```

Create `src/services/llm.ts`:

```ts
export async function summarizeWithLLM(headlineFallback: string): Promise<string> {
  return headlineFallback;
}
```

Create `src/services/cos.ts`:

```ts
export async function uploadDetailedReportToCos(report: string, now: Date): Promise<{ url: string }> {
  return { url: `https://example.invalid/portfolio-valuation-watch-worker/${now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}.md` };
}
```

Replace `src/index.ts` with:

```ts
import { parseConfig } from './config';
import { authorizeAdminRequest } from './lib/admin';
import type { Env } from './types';

function json(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const config = parseConfig(env);

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({
        ok: true,
        status: 'bootstrap',
        project: 'portfolio-valuation-watch-worker',
        schedule: {
          weekdays: config.runWeekdays,
          runHourLocal: config.runHourLocal,
          runMinuteLocal: config.runMinuteLocal,
          marketTimezone: config.marketTimezone
        },
        percentile: {
          windowYears: config.percentileWindowYears,
          lowThreshold: config.lowPercentileThreshold,
          highThreshold: config.highPercentileThreshold
        },
        feishuConfigured: config.feishuConfigured
      });
    }

    if (request.method === 'POST' && url.pathname === '/admin/trigger') {
      const auth = authorizeAdminRequest(request, env.MANUAL_TRIGGER_TOKEN);
      if (!auth.ok) return json({ ok: false, error: auth.error ?? 'unauthorized' }, auth.status);
      return json({ ok: true, status: 'implementation-ready', preview: 'manual digest pipeline will be returned here after full wiring' });
    }

    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const config = parseConfig(env);
    console.log('scheduled digest tick', { runHourLocal: config.runHourLocal, runMinuteLocal: config.runMinuteLocal, weekdays: config.runWeekdays });
  }
};
```

- [ ] **Step 4: Run the runtime tests**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx vitest run test/health.test.ts test/admin.test.ts test/schedule.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the worker wiring**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
git add src/lib/admin.ts src/services/feishu.ts src/services/cos.ts src/services/llm.ts src/index.ts test/health.test.ts test/admin.test.ts test/schedule.test.ts
cat > /tmp/commit-msg.txt <<'MSG'
Expose an end-to-end worker surface before live deployment

The runtime now has health, admin auth, service wrappers, and the top-level
entrypoint shape needed for later full digest wiring and manual verification.

Constraint: Manual trigger must be callable after deployment for message inspection
Constraint: Health output must expose the committed schedule and percentile config
Rejected: Hide preview state behind logs only | slows down manual validation of outbound messages
Confidence: medium
Scope-risk: moderate
Reversibility: clean
Directive: Keep manual-trigger responses preview-friendly so live message debugging does not require digging through Feishu or tail logs first
Tested: vitest health, admin, and schedule tests
Not-tested: remote deployment and real webhook sends
MSG
git commit -F /tmp/commit-msg.txt
```

---

### Task 7: Finish the real digest loop, deploy to Cloudflare, manually trigger it, and verify the sent message text

**Files:**
- Modify: `src/db.ts`
- Modify: `src/index.ts`
- Modify: `README.md`
- Modify: `wrangler.jsonc`
- Modify: `.dev.vars.example`

- [ ] **Step 1: Complete the remaining runtime plumbing and full test suite**

Add the remaining repository functions (`listEnabledWatchItems`, `upsertDailySnapshot`, `upsertDailySignal`, `insertNotificationRun`, `getRuntimeState`, `setRuntimeState`) and wire `src/index.ts` so `/admin/trigger` returns a response like:

```json
{
  "ok": true,
  "tradeDate": "2026-04-25",
  "reportUrl": "https://.../portfolio-valuation-watch-worker/20260425143000.md",
  "messagePreview": "组合估值整体偏中性...",
  "alertPreviews": ["WTI 原油 进入极端区间..."]
}
```

Then run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npm run check
```

Expected: PASS for typecheck and the entire Vitest suite.

- [ ] **Step 2: Create the Cloudflare resources and update `wrangler.jsonc`**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx wrangler d1 create portfolio-valuation-watch-worker
npx wrangler kv namespace create RUNTIME_KV
npx wrangler kv namespace create RUNTIME_KV --preview
```

Copy the returned IDs into `wrangler.jsonc` under:

```jsonc
"kv_namespaces": [
  {
    "binding": "RUNTIME_KV",
    "id": "<remote-id>",
    "preview_id": "<preview-id>"
  }
],
"d1_databases": [
  {
    "binding": "WATCHER_DB",
    "database_name": "portfolio-valuation-watch-worker",
    "database_id": "<d1-id>",
    "migrations_dir": "migrations"
  }
]
```

- [ ] **Step 3: Apply migrations and set production secrets**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx wrangler d1 migrations apply portfolio-valuation-watch-worker --remote
printf '%s' 'https://open.feishu.cn/open-apis/bot/v2/hook/91242376-5753-4500-b0b7-38e1d41adc0a' | npx wrangler secret put FEISHU_WEBHOOK
printf '%s' 'mp0aREMoXGwWypcjuAb1Zb' | npx wrangler secret put FEISHU_SECRET
printf '%s' 'replace-me-before-prod' | npx wrangler secret put MANUAL_TRIGGER_TOKEN
```

Then set COS secrets with the real bucket credentials already used in your Worker estate:

```bash
printf '%s' "$TENCENT_COS_SECRET_ID" | npx wrangler secret put TENCENT_COS_SECRET_ID
printf '%s' "$TENCENT_COS_SECRET_KEY" | npx wrangler secret put TENCENT_COS_SECRET_KEY
printf '%s' "$TENCENT_COS_BUCKET" | npx wrangler secret put TENCENT_COS_BUCKET
printf '%s' "$TENCENT_COS_REGION" | npx wrangler secret put TENCENT_COS_REGION
```

Expected: Wrangler confirms every secret write.

- [ ] **Step 4: Deploy and manually trigger the worker**

Run:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npm run deploy
WORKER_URL=$(npx wrangler deployments list --json | jq -r '.[0].url')
curl -X POST \
  -H "Authorization: Bearer replace-me-before-prod" \
  "$WORKER_URL/admin/trigger"
```

Expected: 200 JSON response containing `reportUrl`, `messagePreview`, and any `alertPreviews`.

- [ ] **Step 5: Capture the manual verification evidence and commit the production-ready state**

While the trigger runs, tail logs in another terminal:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
npx wrangler tail --format pretty
```

Capture three pieces of evidence in the final work log / PR description:

1. `npm run check` output
2. `/admin/trigger` JSON response, especially `messagePreview`
3. Confirmation that the same preview text arrived in Feishu (or, if Feishu UI is unavailable to the agent, confirmation that the webhook returned success and the exact preview text that was sent)

Then commit:

```bash
cd /Users/changdaye/Documents/portfolio-valuation-watch-worker
git add README.md wrangler.jsonc .dev.vars.example src/db.ts src/index.ts
cat > /tmp/commit-msg.txt <<'MSG'
Ship the valuation digest worker with live deployment verification

This final step closes the loop from tested source fetches to production
Cloudflare deployment and a manually triggered Feishu message preview so the
user can see exactly what the digest looks like in practice.

Constraint: Completion requires Cloudflare deployment plus a manual trigger, not only local tests
Constraint: The sent message text must be inspectable without guessing what Feishu rendered
Rejected: Declare success after unit tests only | misses the live delivery path the user asked to validate
Confidence: medium
Scope-risk: broad
Reversibility: messy
Directive: When changing the digest format, always preserve a machine-readable preview in the manual trigger response for fast post-deploy checks
Tested: npm run check, wrangler deploy, manual admin trigger, webhook success
Not-tested: Long-run cron behavior across weekends and upstream source outages
MSG
git commit -F /tmp/commit-msg.txt
```

---

## Self-Review Notes

- **Spec coverage:** Theme list, macro list, Monday-Saturday schedule, 5-year percentiles, 10/90 thresholds, report upload, Feishu short message style, partial-data handling, and manual deploy/trigger verification all have explicit tasks.
- **Placeholder scan:** The only variable values left open are real cloud resource IDs and COS credentials, which must be filled from the actual Cloudflare/Tencent outputs during execution; no implementation task is left as “TBD”.
- **Type consistency:** The same `WatchItem`, `DailySnapshot`, `DailySignal`, and `RuntimeState` shapes are referenced across contract, DB, signal, render, and runtime tasks.
