export type WatchItemKind = 'theme' | 'macro';
export type MetricMode = 'valuation' | 'price';
export type Availability = 'ok' | 'partial' | 'stale' | 'unavailable';
export type Zone = 'extreme_low' | 'low' | 'neutral' | 'high' | 'extreme_high' | 'unavailable';
export type PreferredMetric = 'pe' | 'pb' | 'price';

export interface Env {
  WATCHER_DB?: D1Database;
  RUNTIME_KV?: KVNamespace;
  AI?: Ai;
  FEISHU_WEBHOOK?: string;
  FEISHU_SECRET?: string;
  MANUAL_TRIGGER_TOKEN?: string;
  TENCENT_COS_SECRET_ID?: string;
  TENCENT_COS_SECRET_KEY?: string;
  TENCENT_COS_BUCKET?: string;
  TENCENT_COS_REGION?: string;
  TENCENT_COS_BASE_URL?: string;
  WORKER_PUBLIC_BASE_URL?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  RUN_HOUR_LOCAL?: string;
  RUN_MINUTE_LOCAL?: string;
  RUN_WEEKDAYS?: string;
  MARKET_TIMEZONE?: string;
  PERCENTILE_WINDOW_YEARS?: string;
  LOW_PERCENTILE_THRESHOLD?: string;
  HIGH_PERCENTILE_THRESHOLD?: string;
  REQUEST_TIMEOUT_MS?: string;
  HEARTBEAT_INTERVAL_HOURS?: string;
  LLM_MODEL?: string;
}

export interface AppConfig {
  feishuWebhook: string;
  feishuSecret: string;
  manualTriggerToken: string;
  cosSecretId: string;
  cosSecretKey: string;
  cosBucket: string;
  cosRegion: string;
  cosBaseUrl: string;
  workerPublicBaseUrl: string;
  llmBaseUrl: string;
  llmApiKey: string;
  runHourLocal: number;
  runMinuteLocal: number;
  runWeekdays: number[];
  marketTimezone: string;
  percentileWindowYears: number;
  lowPercentileThreshold: number;
  highPercentileThreshold: number;
  requestTimeoutMs: number;
  heartbeatIntervalHours: number;
  llmModel: string;
  feishuConfigured: boolean;
  cosConfigured: boolean;
}

export interface SourceLeguleguIndexBasic {
  kind: 'legulegu_index_basic';
  indexCode: string;
}

export interface SourceLeguleguHtmlTable {
  kind: 'legulegu_html_table';
  pageUrl: string;
  columns: {
    pe?: string;
    pb?: string;
    price?: string;
  };
  note?: string;
}

export interface SourceLeguleguAggregation {
  kind: 'legulegu_aggregation';
  pageUrl: string;
  requestedDataKeys: string[];
  primarySeriesIndex: number;
  note?: string;
}

export interface SourceYahooChart {
  kind: 'yahoo_chart';
  symbol: string;
  note?: string;
}

export type SourceDescriptor =
  | SourceLeguleguIndexBasic
  | SourceLeguleguHtmlTable
  | SourceLeguleguAggregation
  | SourceYahooChart;

export interface WatchItem {
  id: string;
  kind: WatchItemKind;
  displayName: string;
  metricMode: MetricMode;
  enabled: boolean;
  sourceHoldings: string[];
  preferredMetrics: PreferredMetric[];
  proxyName: string;
  focusCodes: string[];
  sources: SourceDescriptor[];
  note?: string;
}

export interface DailySnapshot {
  watchItemId: string;
  tradeDate: string;
  asOfDate: string;
  availability: Availability;
  sourceKey: string;
  pe: number | null;
  pb: number | null;
  price: number | null;
  peHistoryJson: string | null;
  pbHistoryJson: string | null;
  priceHistoryJson: string | null;
  notes: string | null;
  rawPayloadJson: string;
}

export interface DailySignal {
  watchItemId: string;
  tradeDate: string;
  asOfDate: string;
  metricMode: MetricMode;
  availability: Availability;
  pe: number | null;
  pb: number | null;
  price: number | null;
  pePct5y: number | null;
  pbPct5y: number | null;
  pricePct5y: number | null;
  zone: Zone;
  extremeReason: string | null;
  focusCodesText: string;
  summaryLine: string;
  metricsJson: string;
}

export interface RuntimeState {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  lastHeartbeatAt?: string;
  itemZones?: Record<string, Zone>;
}

export interface ReportRow {
  item: WatchItem;
  signal: DailySignal;
}

export interface RunResult {
  tradeDate: string;
  headline: string;
  reportUrl?: string;
  messagePreview: string;
  alertPreviews: string[];
  snapshots: DailySnapshot[];
  signals: DailySignal[];
}
