import { describe, expect, it } from 'vitest';
import { parseYahooChart } from '../src/services/source-macro';

describe('parseYahooChart', () => {
  it('parses price history into a latest snapshot', () => {
    const parsed = parseYahooChart({
      chart: {
        result: [{
          timestamp: [1711929600, 1712016000, 1712102400],
          indicators: { quote: [{ close: [80.1, 81.2, 82.3] }] },
        }],
      },
    }, '2026-04-25', 'macro-wti');

    expect(parsed.price).toBe(82.3);
    expect(parsed.availability).toBe('ok');
    expect(parsed.priceHistoryJson).toContain('82.3');
  });
});
