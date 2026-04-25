import { dateMinusYears } from '../lib/time';
import { toNumber } from '../lib/value';
import type { AppConfig, DailySnapshot, SourceDescriptor, SourceYahooChart, WatchItem } from '../types';
import { fetchThemeSnapshot } from './source-theme';

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}

function buildHeaders(extra: Record<string, string> = {}) {
  return {
    'user-agent': 'Mozilla/5.0',
    ...extra,
  };
}

export function parseYahooChart(payload: YahooChartResponse, tradeDate: string, watchItemId: string): DailySnapshot {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const points = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    value: closes[index] == null ? null : Number(closes[index]),
  })).filter((point) => point.value != null);
  const latest = points.at(-1);
  return {
    watchItemId,
    tradeDate,
    asOfDate: latest?.date ?? tradeDate,
    availability: latest ? 'ok' : 'unavailable',
    sourceKey: 'yahoo',
    pe: null,
    pb: null,
    price: latest?.value ?? null,
    peHistoryJson: null,
    pbHistoryJson: null,
    priceHistoryJson: points.length ? JSON.stringify(points.map((point) => point.value)) : null,
    notes: null,
    rawPayloadJson: JSON.stringify(payload),
  };
}

async function fetchYahoo(source: SourceYahooChart, item: WatchItem, config: AppConfig, tradeDate: string): Promise<DailySnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(source.symbol)}?range=5y&interval=1d&includePrePost=false&events=div%2Csplits`;
    const response = await fetch(url, { headers: buildHeaders(), signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${source.symbol}`);
    const payload = await response.json<YahooChartResponse>();
    return parseYahooChart(payload, tradeDate, item.id);
  } finally {
    clearTimeout(timer);
  }
}

function unavailableSnapshot(item: WatchItem, tradeDate: string, detail: string): DailySnapshot {
  return {
    watchItemId: item.id,
    tradeDate,
    asOfDate: tradeDate,
    availability: 'unavailable',
    sourceKey: 'macro',
    pe: null,
    pb: null,
    price: null,
    peHistoryJson: null,
    pbHistoryJson: null,
    priceHistoryJson: null,
    notes: detail,
    rawPayloadJson: JSON.stringify({ error: detail }),
  };
}

export async function fetchMacroSnapshot(item: WatchItem, config: AppConfig, tradeDate: string, now = new Date()): Promise<DailySnapshot> {
  let lastError = 'no source configured';
  for (const source of item.sources) {
    try {
      let snapshot: DailySnapshot;
      if (source.kind === 'yahoo_chart') {
        snapshot = await fetchYahoo(source, item, config, tradeDate);
      } else {
        snapshot = await fetchThemeSnapshot({ ...item, metricMode: 'price' }, config, tradeDate, now);
      }
      if (snapshot.priceHistoryJson) {
        const history = JSON.parse(snapshot.priceHistoryJson) as number[];
        snapshot.priceHistoryJson = JSON.stringify(history.slice(-Math.max(history.length, 1)));
      }
      if (snapshot.availability !== 'unavailable') return snapshot;
      lastError = snapshot.notes ?? lastError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return unavailableSnapshot(item, tradeDate, lastError);
}
