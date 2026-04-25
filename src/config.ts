import { toInt } from './lib/value';
import type { AppConfig, Env } from './types';

export function parseConfig(env: Env): AppConfig {
  return {
    runHourLocal: toInt(env.RUN_HOUR_LOCAL, 22, 0),
    runMinuteLocal: toInt(env.RUN_MINUTE_LOCAL, 30, 0),
    marketTimezone: env.MARKET_TIMEZONE?.trim() || 'Asia/Shanghai',
    percentileWindowYears: toInt(env.PERCENTILE_WINDOW_YEARS, 5, 1),
    lowPercentileThreshold: toInt(env.LOW_PERCENTILE_THRESHOLD, 10, 0),
    highPercentileThreshold: toInt(env.HIGH_PERCENTILE_THRESHOLD, 90, 0),
    requestTimeoutMs: toInt(env.REQUEST_TIMEOUT_MS, 15000, 1000),
    heartbeatIntervalHours: toInt(env.HEARTBEAT_INTERVAL_HOURS, 24, 1),
    llmModel: env.LLM_MODEL?.trim() || '@cf/meta/llama-3.1-8b-instruct',
    feishuConfigured: Boolean(env.FEISHU_WEBHOOK?.trim() && env.FEISHU_SECRET?.trim())
  };
}
