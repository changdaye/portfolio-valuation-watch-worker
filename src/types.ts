export interface Env {
  FEISHU_WEBHOOK?: string;
  FEISHU_SECRET?: string;
  MANUAL_TRIGGER_TOKEN?: string;
  TENCENT_COS_SECRET_ID?: string;
  TENCENT_COS_SECRET_KEY?: string;
  TENCENT_COS_BUCKET?: string;
  TENCENT_COS_REGION?: string;
  TENCENT_COS_BASE_URL?: string;
  RUN_HOUR_LOCAL?: string;
  RUN_MINUTE_LOCAL?: string;
  MARKET_TIMEZONE?: string;
  PERCENTILE_WINDOW_YEARS?: string;
  LOW_PERCENTILE_THRESHOLD?: string;
  HIGH_PERCENTILE_THRESHOLD?: string;
  REQUEST_TIMEOUT_MS?: string;
  HEARTBEAT_INTERVAL_HOURS?: string;
  LLM_MODEL?: string;
  WATCHER_DB?: D1Database;
  RUNTIME_KV?: KVNamespace;
  AI?: Ai;
}

export interface AppConfig {
  runHourLocal: number;
  runMinuteLocal: number;
  marketTimezone: string;
  percentileWindowYears: number;
  lowPercentileThreshold: number;
  highPercentileThreshold: number;
  requestTimeoutMs: number;
  heartbeatIntervalHours: number;
  llmModel: string;
  feishuConfigured: boolean;
}
