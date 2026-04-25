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
      focus_codes_json: '["DXY"]',
      sources_json: '[]',
      note: null,
    });

    expect(mapped.id).toBe('macro-dxy');
    expect(mapped.kind).toBe('macro');
    expect(mapped.focusCodes).toEqual(['DXY']);
  });

  it('maps nullable signal metrics without losing nulls', () => {
    const mapped = mapSignalRow({
      watch_item_id: 'theme-hk-broad',
      trade_date: '2026-04-25',
      as_of_date: '2026-04-25',
      metric_mode: 'valuation',
      availability: 'partial',
      pe: 11.1,
      pb: null,
      price: null,
      pe_pct_5y: 15.23,
      pb_pct_5y: null,
      price_pct_5y: null,
      zone: 'low',
      extreme_reason: null,
      focus_codes_text: '159920',
      summary_line: '港股宽基 | PE 15.23%',
      metrics_json: '{"pe":10.2}',
    });

    expect(mapped.pbPct5y).toBeNull();
    expect(mapped.summaryLine).toContain('港股宽基');
  });
});
