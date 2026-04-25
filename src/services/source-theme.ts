import { md5 } from '../lib/md5';
import { dateMinusYears, daysBetween, formatDateInZone } from '../lib/time';
import { toNumber } from '../lib/value';
import type { AppConfig, Availability, DailySnapshot, SourceDescriptor, SourceLeguleguAggregation, SourceLeguleguHtmlTable, SourceLeguleguIndexBasic, WatchItem } from '../types';

interface WarmLeguleguResult {
  cookie: string;
  csrf: string;
}

function buildHeaders(extra: Record<string, string> = {}) {
  return {
    'user-agent': 'Mozilla/5.0',
    ...extra,
  };
}

async function fetchText(url: string, config: AppConfig, headers?: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, { headers: buildHeaders(headers), signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, config: AppConfig, headers?: Record<string, string>): Promise<any> {
  const text = await fetchText(url, config, headers);
  return text ? JSON.parse(text) : {};
}

let leguleguSession: Promise<WarmLeguleguResult> | undefined;

async function getLeguleguSession(config: AppConfig): Promise<WarmLeguleguResult> {
  if (!leguleguSession) {
    leguleguSession = (async () => {
      const pageUrl = 'https://legulegu.com/stockdata/box';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      try {
        const response = await fetch(pageUrl, { headers: buildHeaders(), signal: controller.signal, redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${pageUrl}`);
        const html = await response.text();
        const cookieRaw = response.headers.get('set-cookie') ?? '';
        const cookie = cookieRaw.split(',').map((part) => part.split(';')[0].trim()).filter(Boolean).join('; ');
        const csrf = html.match(/<meta name="_csrf" content="([^"]+)"/)?.[1] ?? '';
        return { cookie, csrf };
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return leguleguSession;
}

function extractHtmlTable(html: string): { headers: string[]; rows: string[][] } {
  const headMatch = html.match(/<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const headers = [...(headMatch?.[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi) ?? [])]
    .map((match) => stripHtml(match[1]));
  const rows = [...(bodyMatch?.[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [])]
    .map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripHtml(cell[1])));
  return { headers, rows };
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function filterHistory<T extends { date: string; value: number | null }>(rows: T[], sinceDate: string): T[] {
  return rows.filter((row) => row.value != null && row.date >= sinceDate);
}

function determineAvailability(metricMode: WatchItem['metricMode'], pe: number | null, pb: number | null, price: number | null, asOfDate: string, tradeDate: string): Availability {
  if (metricMode === 'valuation') {
    if (pe == null && pb == null) return 'unavailable';
    if (daysBetween(tradeDate, asOfDate) > 10) return 'stale';
    return pe != null && pb != null ? 'ok' : 'partial';
  }
  if (price == null) return 'unavailable';
  if (daysBetween(tradeDate, asOfDate) > 10) return 'stale';
  return 'ok';
}

function snapshotFromSeries(item: WatchItem, tradeDate: string, sourceKey: string, asOfDate: string, series: { pe?: Array<{ date: string; value: number | null }>; pb?: Array<{ date: string; value: number | null }>; price?: Array<{ date: string; value: number | null }> }, note?: string, rawPayload?: unknown): DailySnapshot {
  const peHistory = series.pe?.map((row) => row.value).filter((value): value is number => value != null) ?? [];
  const pbHistory = series.pb?.map((row) => row.value).filter((value): value is number => value != null) ?? [];
  const priceHistory = series.price?.map((row) => row.value).filter((value): value is number => value != null) ?? [];
  const pe = peHistory.at(-1) ?? null;
  const pb = pbHistory.at(-1) ?? null;
  const price = priceHistory.at(-1) ?? null;
  return {
    watchItemId: item.id,
    tradeDate,
    asOfDate,
    availability: determineAvailability(item.metricMode, pe, pb, price, asOfDate, tradeDate),
    sourceKey,
    pe,
    pb,
    price,
    peHistoryJson: peHistory.length ? JSON.stringify(peHistory) : null,
    pbHistoryJson: pbHistory.length ? JSON.stringify(pbHistory) : null,
    priceHistoryJson: priceHistory.length ? JSON.stringify(priceHistory) : null,
    notes: note ?? item.note ?? null,
    rawPayloadJson: JSON.stringify(rawPayload ?? series),
  };
}

function leguleguToken(now: Date, timeZone: string): string {
  return md5(formatDateInZone(now, timeZone));
}

async function fetchLeguleguIndexBasic(item: WatchItem, source: SourceLeguleguIndexBasic, config: AppConfig, tradeDate: string, now: Date): Promise<DailySnapshot> {
  const pageUrl = `https://legulegu.com/stockdata/index-basic?indexCode=${encodeURIComponent(source.indexCode)}`;
  const warmed = await getLeguleguSession(config);
  const token = leguleguToken(now, config.marketTimezone);
  const url = `https://legulegu.com/api/stockdata/index-basic?indexCode=${encodeURIComponent(source.indexCode)}&token=${token}`;
  const payload = await fetchJson(url, config, {
    Referer: pageUrl,
    Cookie: warmed.cookie,
  });
  const sinceDate = dateMinusYears(now, config.percentileWindowYears);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const peRows = filterHistory(rows.map((row: any) => ({ date: String(row.date), value: toNumber(row.addTtmPe ?? row.ttmPe ?? row.addLyrPe ?? row.lyrPe) })), sinceDate);
  const pbRows = filterHistory(rows.map((row: any) => ({ date: String(row.date), value: toNumber(row.addPb ?? row.pb) })), sinceDate);
  const latestDate = rows.length ? String(rows[rows.length - 1].date) : tradeDate;
  return snapshotFromSeries(item, tradeDate, `legulegu:index-basic:${source.indexCode}`, latestDate, { pe: peRows, pb: pbRows }, item.note, payload);
}

async function fetchLeguleguHtmlTable(item: WatchItem, source: SourceLeguleguHtmlTable, config: AppConfig, tradeDate: string, now: Date): Promise<DailySnapshot> {
  const html = await fetchText(source.pageUrl, config);
  const table = extractHtmlTable(html);
  const sinceDate = dateMinusYears(now, config.percentileWindowYears);
  const dateIndex = table.headers.findIndex((header) => header === '时间' || header === '日期');
  const peIndex = source.columns.pe ? table.headers.findIndex((header) => header.includes(source.columns.pe!)) : -1;
  const pbIndex = source.columns.pb ? table.headers.findIndex((header) => header.includes(source.columns.pb!)) : -1;
  const priceIndex = source.columns.price ? table.headers.findIndex((header) => header.includes(source.columns.price!)) : -1;
  const rows = table.rows.map((row) => ({
    date: row[dateIndex] ?? '',
    pe: peIndex >= 0 ? toNumber(row[peIndex]) : null,
    pb: pbIndex >= 0 ? toNumber(row[pbIndex]) : null,
    price: priceIndex >= 0 ? toNumber(row[priceIndex]) : null,
  })).filter((row) => row.date).reverse();
  const latestDate = rows.at(-1)?.date ?? tradeDate;
  return snapshotFromSeries(
    item,
    tradeDate,
    `legulegu:html-table:${source.pageUrl}`,
    latestDate,
    {
      pe: filterHistory(rows.map((row) => ({ date: row.date, value: row.pe })), sinceDate),
      pb: filterHistory(rows.map((row) => ({ date: row.date, value: row.pb })), sinceDate),
      price: filterHistory(rows.map((row) => ({ date: row.date, value: row.price })), sinceDate),
    },
    source.note ?? item.note,
    { headers: table.headers, sampleRows: rows.slice(-12) },
  );
}

async function fetchLeguleguAggregation(item: WatchItem, source: SourceLeguleguAggregation, config: AppConfig, tradeDate: string, now: Date): Promise<DailySnapshot> {
  const warmed = await getLeguleguSession(config);
  const token = leguleguToken(now, config.marketTimezone);
  const url = `https://legulegu.com/api/get-aggregation-data/exp?token=${token}`;
  const body = {
    requestedDataKeys: source.requestedDataKeys,
    types: source.requestedDataKeys.map(() => 'line'),
    requestedDataColors: ['#1f97c4', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6'],
    splitLines: [false, true],
    inverses: null,
    gridIndices: null,
    markLinesOfQuantile: null,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: buildHeaders({
        'Content-Type': 'application/json',
        'X-CSRF-Token': warmed.csrf,
        Referer: source.pageUrl,
        Cookie: warmed.cookie,
      }),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const payload = await response.json<any>();
    const xAxis = Array.isArray(payload.xAxis) ? payload.xAxis[0]?.data ?? [] : payload.xAxis?.data ?? [];
    const series = Array.isArray(payload.series) ? payload.series[source.primarySeriesIndex] : undefined;
    const history = Array.isArray(series?.data) ? series.data : [];
    const points = xAxis.map((date: unknown, index: number) => ({ date: String(date), value: toNumber(history[index]) }));
    const latest = [...points].reverse().find((point) => point.value != null);
    const filtered = filterHistory(points, dateMinusYears(now, config.percentileWindowYears));
    const seriesPayload = item.metricMode === 'valuation'
      ? { pe: filtered }
      : { price: filtered };
    return snapshotFromSeries(
      item,
      tradeDate,
      `legulegu:aggregation:${source.requestedDataKeys.join(',')}`,
      latest?.date ?? tradeDate,
      seriesPayload,
      source.note ?? item.note,
      payload,
    );
  } finally {
    clearTimeout(timer);
  }
}

function unavailableSnapshot(item: WatchItem, tradeDate: string, sourceKey: string, detail: string): DailySnapshot {
  return {
    watchItemId: item.id,
    tradeDate,
    asOfDate: tradeDate,
    availability: 'unavailable',
    sourceKey,
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

async function fetchFromSource(item: WatchItem, source: SourceDescriptor, config: AppConfig, tradeDate: string, now: Date): Promise<DailySnapshot> {
  switch (source.kind) {
    case 'legulegu_index_basic':
      return fetchLeguleguIndexBasic(item, source, config, tradeDate, now);
    case 'legulegu_html_table':
      return fetchLeguleguHtmlTable(item, source, config, tradeDate, now);
    case 'legulegu_aggregation':
      return fetchLeguleguAggregation(item, source, config, tradeDate, now);
    default:
      return unavailableSnapshot(item, tradeDate, source.kind, 'theme source kind unsupported');
  }
}

export async function fetchThemeSnapshot(item: WatchItem, config: AppConfig, tradeDate: string, now = new Date()): Promise<DailySnapshot> {
  let lastError = 'no source configured';
  for (const source of item.sources) {
    if (source.kind === 'yahoo_chart') continue;
    try {
      const snapshot = await fetchFromSource(item, source, config, tradeDate, now);
      if (snapshot.availability !== 'unavailable') return snapshot;
      lastError = snapshot.notes ?? lastError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return unavailableSnapshot(item, tradeDate, item.sources[0]?.kind ?? 'theme', lastError);
}

export { extractHtmlTable };
