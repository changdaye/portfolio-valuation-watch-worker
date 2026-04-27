import { describe, expect, it } from 'vitest';
import { buildDetailedReport, buildFeishuMessageObjectKey } from '../src/lib/report';
import type { DailySignal, WatchItem } from '../src/types';

describe('buildDetailedReport', () => {
  it('includes overview, tables, and data dates', () => {
    const item: WatchItem = {
      id: 'macro-wti',
      kind: 'macro',
      displayName: 'WTI 原油',
      metricMode: 'price',
      enabled: true,
      sourceHoldings: ['159934'],
      preferredMetrics: ['price'],
      proxyName: 'WTI',
      focusCodes: ['WTI'],
      sources: [],
    };
    const signal: DailySignal = {
      watchItemId: 'macro-wti',
      tradeDate: '2026-04-25',
      asOfDate: '2026-04-25',
      metricMode: 'price',
      availability: 'ok',
      pe: null,
      pb: null,
      price: 82.1,
      pePct5y: null,
      pbPct5y: null,
      pricePct5y: 91.2,
      zone: 'extreme_high',
      extremeReason: '价格 82.1（91.2%）',
      focusCodesText: 'WTI',
      summaryLine: 'WTI 原油 | 价格 82.1 | 5年分位 91.2% | 极高位',
      metricsJson: '{"price":82.1}',
    };
    const report = buildDetailedReport({
      generatedAt: new Date('2026-04-25T14:30:00.000Z'),
      tradeDate: '2026-04-25',
      headline: '原油高位，组合整体偏中性。',
      modelLabel: 'GPT 5.4 (xhigh)',
      themeRows: [],
      macroRows: [{ item, signal }],
      reportUrl: 'https://example.com/report.md',
    });

    expect(report).toContain('<!doctype html>');
    expect(report).toContain('模型：</strong>GPT 5.4 (xhigh)');
    expect(report).toContain('WTI 原油');
    expect(report).toContain('关联持仓');
    expect(report).toContain('<table>');
    expect(report).toContain('2026-04-25');
  });
});


describe('buildFeishuMessageObjectKey', () => {
  it('stores feishu messages under the dedicated directory', () => {
    expect(buildFeishuMessageObjectKey(new Date('2026-04-27T08:00:55.625Z'))).toBe('portfolio-valuation-watch-worker/feishu-messages/20260427080055.txt');
  });
});
