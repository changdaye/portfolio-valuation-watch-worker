import { describe, expect, it, vi } from 'vitest';
import { runFinalSummary } from '../src/services/final-summary';
import type { AppConfig } from '../src/types';
import * as cos from '../src/services/cos';

function makeConfig(): AppConfig {
  return {
    feishuWebhook: 'https://example.com/hook',
    feishuSecret: 'secret',
    manualTriggerToken: 'token',
    cosSecretId: 'secret-id',
    cosSecretKey: 'secret-key',
    cosBucket: 'bucket',
    cosRegion: 'ap-shanghai',
    cosBaseUrl: 'https://bucket.cos.ap-shanghai.myqcloud.com',
    workerPublicBaseUrl: 'https://example.workers.dev',
    llmBaseUrl: '',
    llmApiKey: '',
    runHourLocal: 22,
    runMinuteLocal: 30,
    runWeekdays: [1,2,3,4,5,6],
    marketTimezone: 'Asia/Shanghai',
    percentileWindowYears: 5,
    lowPercentileThreshold: 10,
    highPercentileThreshold: 90,
    requestTimeoutMs: 15000,
    heartbeatIntervalHours: 24,
    llmModel: '@cf/meta/llama-3.2-1b-instruct',
    finalSummaryHourLocal: 0,
    finalSummaryMinuteLocal: 30,
    finalSummaryLookbackHours: 24,
    feishuConfigured: true,
    cosConfigured: true,
  };
}

describe('runFinalSummary', () => {
  it('reads archived feishu messages and uploads a final summary txt', async () => {
    vi.spyOn(cos, 'listCosObjects').mockResolvedValue([
      { key: 'portfolio-valuation-watch-worker/feishu-messages/20260427080055.txt' },
      { key: 'portfolio-valuation-watch-worker/feishu-messages/20260427100055.txt' },
    ] as any);
    vi.spyOn(cos, 'fetchCosObjectText')
      .mockResolvedValueOnce('【今日结论】\n第一条')
      .mockResolvedValueOnce('【今日结论】\n第二条');
    vi.spyOn(cos, 'uploadFinalSummaryToCos').mockResolvedValue({
      key: 'portfolio-valuation-watch-worker/final-summaries/20260428003000.txt',
      url: 'https://bucket.cos.ap-shanghai.myqcloud.com/portfolio-valuation-watch-worker/final-summaries/20260428003000.txt',
    });

    const result = await runFinalSummary({ AI: { run: vi.fn().mockResolvedValue({ response: '【凌晨总结】\n\n【核心脉络】\n两条消息偏低位。\n\n【主要风险】\n波动仍大。' }) } as any } as any, makeConfig(), new Date('2026-04-28T00:30:00.000Z'));

    expect(result?.includedCount).toBe(2);
    expect(result?.key).toContain('final-summaries/20260428003000.txt');
    expect(result?.content).toContain('【凌晨总结】');
  });
});
