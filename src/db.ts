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
    focusCodes: parseJson<string[]>(row.focus_codes_json, []),
    sources: parseJson<any[]>(row.sources_json, []),
    note: row.note == null ? undefined : String(row.note),
  } as WatchItem;
}

export function mapSignalRow(row: Record<string, unknown>): DailySignal {
  return {
    watchItemId: String(row.watch_item_id),
    tradeDate: String(row.trade_date),
    asOfDate: String(row.as_of_date),
    metricMode: row.metric_mode === 'price' ? 'price' : 'valuation',
    availability: String(row.availability) as DailySignal['availability'],
    pe: row.pe == null ? null : Number(row.pe),
    pb: row.pb == null ? null : Number(row.pb),
    price: row.price == null ? null : Number(row.price),
    pePct5y: row.pe_pct_5y == null ? null : Number(row.pe_pct_5y),
    pbPct5y: row.pb_pct_5y == null ? null : Number(row.pb_pct_5y),
    pricePct5y: row.price_pct_5y == null ? null : Number(row.price_pct_5y),
    zone: String(row.zone) as DailySignal['zone'],
    extremeReason: row.extreme_reason == null ? null : String(row.extreme_reason),
    focusCodesText: String(row.focus_codes_text),
    summaryLine: String(row.summary_line),
    metricsJson: String(row.metrics_json),
  };
}

export async function listEnabledWatchItems(db: D1Database): Promise<WatchItem[]> {
  const rows = await db.prepare('SELECT * FROM watch_items WHERE enabled = 1 ORDER BY id ASC').all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapWatchItemRow);
}

export async function listAllWatchItems(db: D1Database): Promise<WatchItem[]> {
  const rows = await db.prepare('SELECT * FROM watch_items ORDER BY id ASC').all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapWatchItemRow);
}

export async function reseedDefaultWatchItems(db: D1Database, nowIso: string): Promise<number> {
  const statements = [db.prepare('DELETE FROM watch_items')];
  for (const item of DEFAULT_WATCH_ITEMS) {
    statements.push(db.prepare(`
      INSERT INTO watch_items (
        id, kind, display_name, metric_mode, enabled, source_holdings_json,
        preferred_metrics_json, proxy_name, focus_codes_json, sources_json,
        note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.id,
      item.kind,
      item.displayName,
      item.metricMode,
      item.enabled ? 1 : 0,
      JSON.stringify(item.sourceHoldings),
      JSON.stringify(item.preferredMetrics),
      item.proxyName,
      JSON.stringify(item.focusCodes),
      JSON.stringify(item.sources),
      item.note ?? null,
      nowIso,
      nowIso,
    ));
  }
  await db.batch(statements);
  return DEFAULT_WATCH_ITEMS.length;
}

export async function upsertDailySnapshot(db: D1Database, snapshot: DailySnapshot, nowIso: string): Promise<void> {
  await db.prepare(`
    INSERT INTO daily_snapshots (
      watch_item_id, trade_date, as_of_date, availability, source_key,
      pe, pb, price, pe_history_json, pb_history_json, price_history_json,
      notes, raw_payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (watch_item_id, trade_date) DO UPDATE SET
      as_of_date = excluded.as_of_date,
      availability = excluded.availability,
      source_key = excluded.source_key,
      pe = excluded.pe,
      pb = excluded.pb,
      price = excluded.price,
      pe_history_json = excluded.pe_history_json,
      pb_history_json = excluded.pb_history_json,
      price_history_json = excluded.price_history_json,
      notes = excluded.notes,
      raw_payload_json = excluded.raw_payload_json
  `).bind(
    snapshot.watchItemId,
    snapshot.tradeDate,
    snapshot.asOfDate,
    snapshot.availability,
    snapshot.sourceKey,
    snapshot.pe,
    snapshot.pb,
    snapshot.price,
    snapshot.peHistoryJson,
    snapshot.pbHistoryJson,
    snapshot.priceHistoryJson,
    snapshot.notes,
    snapshot.rawPayloadJson,
    nowIso,
  ).run();
}

export async function upsertDailySignal(db: D1Database, signal: DailySignal, nowIso: string): Promise<void> {
  await db.prepare(`
    INSERT INTO daily_signals (
      watch_item_id, trade_date, as_of_date, metric_mode, availability,
      pe, pb, price, pe_pct_5y, pb_pct_5y, price_pct_5y,
      zone, extreme_reason, focus_codes_text, summary_line, metrics_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (watch_item_id, trade_date) DO UPDATE SET
      as_of_date = excluded.as_of_date,
      metric_mode = excluded.metric_mode,
      availability = excluded.availability,
      pe = excluded.pe,
      pb = excluded.pb,
      price = excluded.price,
      pe_pct_5y = excluded.pe_pct_5y,
      pb_pct_5y = excluded.pb_pct_5y,
      price_pct_5y = excluded.price_pct_5y,
      zone = excluded.zone,
      extreme_reason = excluded.extreme_reason,
      focus_codes_text = excluded.focus_codes_text,
      summary_line = excluded.summary_line,
      metrics_json = excluded.metrics_json
  `).bind(
    signal.watchItemId,
    signal.tradeDate,
    signal.asOfDate,
    signal.metricMode,
    signal.availability,
    signal.pe,
    signal.pb,
    signal.price,
    signal.pePct5y,
    signal.pbPct5y,
    signal.pricePct5y,
    signal.zone,
    signal.extremeReason,
    signal.focusCodesText,
    signal.summaryLine,
    signal.metricsJson,
    nowIso,
  ).run();
}

export async function insertNotificationRun(db: D1Database, input: {
  id: string;
  tradeDate: string;
  runType: string;
  watchItemId?: string;
  messageText: string;
  reportUrl?: string;
  feishuPushOk: boolean;
  createdAt: string;
}): Promise<void> {
  await db.prepare(`
    INSERT INTO notification_runs (
      id, trade_date, run_type, watch_item_id, message_text, report_url, feishu_push_ok, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.tradeDate,
    input.runType,
    input.watchItemId ?? null,
    input.messageText,
    input.reportUrl ?? null,
    input.feishuPushOk ? 1 : 0,
    input.createdAt,
  ).run();
}
