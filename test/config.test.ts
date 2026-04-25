import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';

describe('parseConfig', () => {
  it('uses the approved defaults', () => {
    const config = parseConfig({});
    expect(config.runHourLocal).toBe(22);
    expect(config.runMinuteLocal).toBe(30);
    expect(config.marketTimezone).toBe('Asia/Shanghai');
    expect(config.percentileWindowYears).toBe(5);
    expect(config.lowPercentileThreshold).toBe(10);
    expect(config.highPercentileThreshold).toBe(90);
    expect(config.runWeekdays).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
