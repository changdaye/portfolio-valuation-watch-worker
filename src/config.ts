import type { AppConfig, Env } from './types';
import { toInt } from './lib/value';

function toWeekdays(raw: string | undefined): number[] {
  const parsed = (raw ?? '1,2,3,4,5,6')
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return parsed.length ? parsed : [1, 2, 3, 4, 5, 6];
}

export function parseConfig(env: Partial<Env>): AppConfig {
  const bucket = env.TENCENT_COS_BUCKET?.trim() ?? '';
  const region = env.TENCENT_COS_REGION?.trim() ?? '';
  const cosConfigured = Boolean(
    env.TENCENT_COS_SECRET_ID?.trim()
      && env.TENCENT_COS_SECRET_KEY?.trim()
      && bucket
      && region,
  );

  return {
    feishuWebhook: env.FEISHU_WEBHOOK?.trim() ?? '',
    feishuSecret: env.FEISHU_SECRET?.trim() ?? '',
    manualTriggerToken: env.MANUAL_TRIGGER_TOKEN?.trim() ?? '',
    cosSecretId: env.TENCENT_COS_SECRET_ID?.trim() ?? '',
    cosSecretKey: env.TENCENT_COS_SECRET_KEY?.trim() ?? '',
    cosBucket: bucket,
    cosRegion: region,
    cosBaseUrl: env.TENCENT_COS_BASE_URL?.trim() || (bucket && region ? `https://${bucket}.cos.${region}.myqcloud.com` : ''),

    workerPublicBaseUrl: env.WORKER_PUBLIC_BASE_URL?.trim() || 'https://portfolio-valuation-watch-worker.wanggejiancai822.workers.dev',
    runHourLocal: toInt(env.RUN_HOUR_LOCAL, 22, 0),
    runMinuteLocal: toInt(env.RUN_MINUTE_LOCAL, 30, 0),
    runWeekdays: toWeekdays(env.RUN_WEEKDAYS),
    marketTimezone: env.MARKET_TIMEZONE?.trim() || 'Asia/Shanghai',
    percentileWindowYears: toInt(env.PERCENTILE_WINDOW_YEARS, 5, 1),
    lowPercentileThreshold: toInt(env.LOW_PERCENTILE_THRESHOLD, 10, 0),
    highPercentileThreshold: toInt(env.HIGH_PERCENTILE_THRESHOLD, 90, 0),
    requestTimeoutMs: toInt(env.REQUEST_TIMEOUT_MS, 15000, 1000),
    heartbeatIntervalHours: toInt(env.HEARTBEAT_INTERVAL_HOURS, 24, 1),
    llmModel: env.LLM_MODEL?.trim() || '@cf/meta/llama-3.1-8b-instruct',
    feishuConfigured: Boolean(env.FEISHU_WEBHOOK?.trim() && env.FEISHU_SECRET?.trim()),
    cosConfigured,
  };
}

export function assertRuntimeEnv(env: Partial<Env>, config: AppConfig): void {
  if (!env.WATCHER_DB) throw new Error('missing WATCHER_DB binding');
  if (!env.RUNTIME_KV) throw new Error('missing RUNTIME_KV binding');
  if (!config.feishuConfigured) throw new Error('missing FEISHU_WEBHOOK or FEISHU_SECRET');
  if (!config.cosConfigured) throw new Error('missing Tencent COS configuration');
}
