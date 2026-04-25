import { describe, expect, it } from 'vitest';
import { shouldSendExtremeAlert } from '../src/lib/runtime';

describe('shouldSendExtremeAlert', () => {
  it('sends only when entering an extreme zone', () => {
    expect(shouldSendExtremeAlert({}, 'theme-a-large-cap', 'extreme_high')).toBe(true);
    expect(shouldSendExtremeAlert({ itemZones: { 'theme-a-large-cap': 'extreme_high' } }, 'theme-a-large-cap', 'extreme_high')).toBe(false);
    expect(shouldSendExtremeAlert({ itemZones: { 'theme-a-large-cap': 'neutral' } }, 'theme-a-large-cap', 'extreme_high')).toBe(true);
  });
});
