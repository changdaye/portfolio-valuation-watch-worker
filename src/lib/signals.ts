import type { DailySignal, DailySnapshot, WatchItem, Zone } from '../types';
import { percentileRank } from './percentile';

function parseHistory(raw: string | null): number[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

function zoneFromPercentiles(percentiles: Array<number | null>, low: number, high: number): Zone {
  const available = percentiles.filter((value): value is number => value != null);
  if (!available.length) return 'unavailable';
  if (available.some((value) => value <= low)) return 'extreme_low';
  if (available.some((value) => value >= high)) return 'extreme_high';
  if (available.some((value) => value < 35)) return 'low';
  if (available.some((value) => value > 65)) return 'high';
  return 'neutral';
}

function extremeReason(snapshot: DailySnapshot, pePct5y: number | null, pbPct5y: number | null, pricePct5y: number | null, low: number, high: number): string | null {
  const parts: string[] = [];
  if (snapshot.pe != null && pePct5y != null && (pePct5y <= low || pePct5y >= high)) parts.push(`PE ${snapshot.pe}（${pePct5y}%）`);
  if (snapshot.pb != null && pbPct5y != null && (pbPct5y <= low || pbPct5y >= high)) parts.push(`PB ${snapshot.pb}（${pbPct5y}%）`);
  if (snapshot.price != null && pricePct5y != null && (pricePct5y <= low || pricePct5y >= high)) parts.push(`价格 ${snapshot.price}（${pricePct5y}%）`);
  return parts.length ? parts.join(' / ') : null;
}

function zoneLabel(zone: Zone): string {
  switch (zone) {
    case 'extreme_low': return '极低位';
    case 'low': return '偏低位';
    case 'neutral': return '中性';
    case 'high': return '偏高位';
    case 'extreme_high': return '极高位';
    default: return '不可用';
  }
}

export function buildSignal(item: WatchItem, snapshot: DailySnapshot, thresholds: { low: number; high: number }): DailySignal {
  const peHistory = parseHistory(snapshot.peHistoryJson);
  const pbHistory = parseHistory(snapshot.pbHistoryJson);
  const priceHistory = parseHistory(snapshot.priceHistoryJson);
  const pePct5y = snapshot.pe == null ? null : percentileRank(peHistory, snapshot.pe);
  const pbPct5y = snapshot.pb == null ? null : percentileRank(pbHistory, snapshot.pb);
  const pricePct5y = snapshot.price == null ? null : percentileRank(priceHistory, snapshot.price);
  const zone = snapshot.availability === 'unavailable'
    ? 'unavailable'
    : zoneFromPercentiles(item.metricMode === 'valuation' ? [pePct5y, pbPct5y] : [pricePct5y], thresholds.low, thresholds.high);
  const reason = extremeReason(snapshot, pePct5y, pbPct5y, pricePct5y, thresholds.low, thresholds.high);
  const metrics = item.metricMode === 'valuation'
    ? [`PE ${snapshot.pe ?? 'NA'} / ${pePct5y ?? 'NA'}%`, `PB ${snapshot.pb ?? 'NA'} / ${pbPct5y ?? 'NA'}%`]
    : [`价格 ${snapshot.price ?? 'NA'} / ${pricePct5y ?? 'NA'}%`];

  return {
    watchItemId: item.id,
    tradeDate: snapshot.tradeDate,
    asOfDate: snapshot.asOfDate,
    metricMode: item.metricMode,
    availability: snapshot.availability,
    pe: snapshot.pe,
    pb: snapshot.pb,
    price: snapshot.price,
    pePct5y,
    pbPct5y,
    pricePct5y,
    zone,
    extremeReason: reason,
    focusCodesText: item.focusCodes.join(' / '),
    summaryLine: `${item.displayName} | ${metrics.join(' | ')} | ${zoneLabel(zone)}`,
    metricsJson: JSON.stringify({ pe: snapshot.pe, pb: snapshot.pb, price: snapshot.price }),
  };
}
