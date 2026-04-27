import { describe, expect, it, vi } from 'vitest';
import { uploadFeishuMessageToCos } from '../src/services/cos';
import type { AppConfig } from '../src/types';

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
    llmModel: 'gpt-5.4',
    feishuConfigured: true,
    cosConfigured: true,
  };
}

describe('uploadFeishuMessageToCos', () => {
  it('uploads message archives to the dedicated folder', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date('2026-04-27T08:00:55.625Z');

    const result = await uploadFeishuMessageToCos(makeConfig(), 'hello', now);

    expect(result.key).toBe('portfolio-valuation-watch-worker/feishu-messages/20260427080055.txt');
    expect(result.url).toBe('https://bucket.cos.ap-shanghai.myqcloud.com/portfolio-valuation-watch-worker/feishu-messages/20260427080055.txt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
