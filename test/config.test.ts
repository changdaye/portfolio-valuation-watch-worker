import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';

describe('parseConfig', () => {
  it('uses defaults when optional vars are absent', () => {
    const config = parseConfig({});
    expect(config.runHourLocal).toBe(22);
    expect(config.runMinuteLocal).toBe(30);
    expect(config.marketTimezone).toBe('Asia/Shanghai');
    expect(config.percentileWindowYears).toBe(5);
    expect(config.lowPercentileThreshold).toBe(10);
    expect(config.highPercentileThreshold).toBe(90);
    expect(config.feishuConfigured).toBe(false);
  });

  it('marks feishu as configured when webhook and secret are present', () => {
    const config = parseConfig({
      FEISHU_WEBHOOK: 'https://example.com/hook',
      FEISHU_SECRET: 'secret'
    });
    expect(config.feishuConfigured).toBe(true);
  });
});
