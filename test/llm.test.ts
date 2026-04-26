import { describe, expect, it, vi } from 'vitest';
import { summarizeWithLLM } from '../src/services/llm';
import type { AppConfig, DailySignal, WatchItem } from '../src/types';

function makeConfig(): AppConfig {
  return {
    feishuWebhook: 'https://example.com/hook',
    feishuSecret: '',
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
    runWeekdays: [1, 2, 3, 4, 5, 6],
    marketTimezone: 'Asia/Shanghai',
    percentileWindowYears: 5,
    lowPercentileThreshold: 10,
    highPercentileThreshold: 90,
    requestTimeoutMs: 15000,
    heartbeatIntervalHours: 24,
    llmModel: '@cf/meta/llama-3.1-8b-instruct',
    feishuConfigured: true,
    cosConfigured: true,
  };
}

function makeItem(overrides: Partial<WatchItem> = {}): WatchItem {
  return {
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
    ...overrides,
  };
}

function makeSignal(overrides: Partial<DailySignal> = {}): DailySignal {
  return {
    watchItemId: 'theme-hk-broad',
    tradeDate: '2026-04-26',
    asOfDate: '2026-04-26',
    metricMode: 'valuation',
    availability: 'ok',
    pe: 12.2,
    pb: null,
    price: null,
    pePct5y: 12.5,
    pbPct5y: null,
    pricePct5y: null,
    zone: 'low',
    extremeReason: null,
    focusCodesText: '159920',
    summaryLine: '港股宽基 | PE 12.2 / 12.5% | PB NA / NA% | 偏低位',
    metricsJson: '{}',
    ...overrides,
  };
}

describe('summarizeWithLLM', () => {
  it('prefers the OpenAI-compatible proxy when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '组合估值分化，整体仍偏高位。' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await summarizeWithLLM(
      { ...makeConfig(), llmBaseUrl: 'https://proxy.example.com/v1', llmApiKey: 'proxy-key', llmModel: 'gpt-5.4' },
      { run: vi.fn() } as unknown as Ai,
      [{ item: makeItem(), signal: makeSignal() }],
      [],
      '本地兜底结论',
    );

    expect(result).toEqual({ headline: '组合估值分化，整体仍偏高位。', modelLabel: 'GPT 5.4 (xhigh)' });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.model).toBe('gpt-5.4');
    expect(body.reasoning_effort).toBe('xhigh');
    expect(body.max_completion_tokens).toBe(180);
  });

  it('falls back to Workers AI when the proxy fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })));
    const run = vi.fn().mockResolvedValue({ response: '组合估值虽高，短线先看分化。' });

    const result = await summarizeWithLLM(
      { ...makeConfig(), llmBaseUrl: 'https://proxy.example.com/v1', llmApiKey: 'proxy-key', llmModel: 'gpt-5.4' },
      { run } as unknown as Ai,
      [{ item: makeItem(), signal: makeSignal() }],
      [],
      '本地兜底结论',
    );

    expect(result).toEqual({ headline: '组合估值虽高，短线先看分化。', modelLabel: 'Llama 3.2 1B Instruct' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('@cf/meta/llama-3.2-1b-instruct');
  });
});
