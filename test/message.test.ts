import { describe, expect, it } from 'vitest';
import { buildDailyMessage, buildDailyPostMessage, buildExtremeAlertMessage, buildExtremeAlertPostMessage } from '../src/lib/message';
import type { DailySignal, WatchItem } from '../src/types';

const item: WatchItem = {
  id: 'theme-hk-broad',
  kind: 'theme',
  displayName: '港股宽基',
  metricMode: 'valuation',
  enabled: true,
  sourceHoldings: ['159920'],
  preferredMetrics: ['pe'],
  proxyName: '恒生指数',
  focusCodes: ['159920'],
  sources: [],
};

const signal: DailySignal = {
  watchItemId: 'theme-hk-broad',
  tradeDate: '2026-04-25',
  asOfDate: '2026-04-25',
  metricMode: 'valuation',
  availability: 'partial',
  pe: 12.2,
  pb: null,
  price: null,
  pePct5y: 12.5,
  pbPct5y: null,
  pricePct5y: null,
  zone: 'extreme_low',
  extremeReason: 'PE 12.2（12.5%）',
  focusCodesText: '159920',
  summaryLine: '港股宽基 | PE 12.2 / 12.5% | PB NA / NA% | 极低位',
  metricsJson: '{}',
};

describe('message builders', () => {
  it('keeps the preferred Feishu report footer', () => {
    const text = buildDailyMessage('组合估值整体偏低。', [{ item, signal }], [], 'https://example.com/report.md');
    expect(text).toContain('【主题板块】');
    expect(text).toContain('港股宽基｜持仓 恒生ETF华夏');
    expect(text).toContain('关注代码');
    expect(text).toContain('详细版报告:\nhttps://example.com/report.md');
  });

  it('mentions the zone and reason once in alerts', () => {
    const text = buildExtremeAlertMessage(item, signal, 'https://example.com/report.md');
    expect(text).toContain('进入极端区间');
    expect(text).toContain('【港股宽基 进入极端区间】');
    expect(text).toContain('关联持仓：恒生ETF华夏(159920)');
    expect(text).toContain('PE 12.2');
  });

  it('shows the full report URL in post messages without wrapping it behind custom link text', () => {
    const dailyPost = buildDailyPostMessage('组合估值整体偏低。', [{ item, signal }], [], 'https://example.com/report.md');
    const alertPost = buildExtremeAlertPostMessage(item, signal, 'https://example.com/report.md');

    expect(JSON.stringify(dailyPost)).toContain('https://example.com/report.md');
    expect(JSON.stringify(alertPost)).toContain('https://example.com/report.md');
    expect(JSON.stringify(dailyPost)).not.toContain('点击查看 HTML 详细报告');
    expect(JSON.stringify(alertPost)).not.toContain('点击查看 HTML 详细报告');
  });
});
