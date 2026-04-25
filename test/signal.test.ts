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
  focusCodes: ['510050'],
  sources: [],
};

const macroItem: WatchItem = {
  id: 'macro-dxy',
  kind: 'macro',
  displayName: 'DXY',
  metricMode: 'price',
  enabled: true,
  sourceHoldings: [],
  preferredMetrics: ['price'],
  proxyName: '美元指数',
  focusCodes: ['DXY'],
  sources: [],
};

describe('buildSignal', () => {
  it('marks a valuation item as extreme_high when PE and PB are in the top decile', () => {
    const snapshot: DailySnapshot = {
      watchItemId: 'theme-a-large-cap',
      tradeDate: '2026-04-25',
      asOfDate: '2026-04-25',
      availability: 'ok',
      sourceKey: 'test',
      pe: 15,
      pb: 2.1,
      price: null,
      peHistoryJson: JSON.stringify([8, 9, 10, 11, 12, 13, 14, 15]),
      pbHistoryJson: JSON.stringify([1.0, 1.1, 1.2, 1.3, 1.4, 1.7, 1.9, 2.1]),
      priceHistoryJson: null,
      notes: null,
      rawPayloadJson: '{}',
    };

    const signal = buildSignal(themeItem, snapshot, { low: 10, high: 90 });
    expect(signal.zone).toBe('extreme_high');
    expect(signal.extremeReason).toContain('PE');
  });

  it('marks a macro item as extreme_low from price history only', () => {
    const snapshot: DailySnapshot = {
      watchItemId: 'macro-dxy',
      tradeDate: '2026-04-25',
      asOfDate: '2026-04-25',
      availability: 'ok',
      sourceKey: 'test',
      pe: null,
      pb: null,
      price: 94,
      peHistoryJson: null,
      pbHistoryJson: null,
      priceHistoryJson: JSON.stringify([94, 95, 96, 97, 98, 99, 100, 101, 102, 103]),
      notes: null,
      rawPayloadJson: '{}',
    };

    const signal = buildSignal(macroItem, snapshot, { low: 10, high: 90 });
    expect(signal.zone).toBe('extreme_low');
  });
});
