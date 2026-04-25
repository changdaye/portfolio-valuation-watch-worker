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
