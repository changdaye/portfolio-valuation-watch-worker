CREATE TABLE IF NOT EXISTS watch_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  metric_mode TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  source_holdings_json TEXT NOT NULL,
  preferred_metrics_json TEXT NOT NULL,
  proxy_name TEXT NOT NULL,
  focus_codes_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  watch_item_id TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  availability TEXT NOT NULL,
  source_key TEXT NOT NULL,
  pe REAL,
  pb REAL,
  price REAL,
  pe_history_json TEXT,
  pb_history_json TEXT,
  price_history_json TEXT,
  notes TEXT,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (watch_item_id, trade_date)
);

CREATE TABLE IF NOT EXISTS daily_signals (
  watch_item_id TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  metric_mode TEXT NOT NULL,
  availability TEXT NOT NULL,
  pe REAL,
  pb REAL,
  price REAL,
  pe_pct_5y REAL,
  pb_pct_5y REAL,
  price_pct_5y REAL,
  zone TEXT NOT NULL,
  extreme_reason TEXT,
  focus_codes_text TEXT NOT NULL,
  summary_line TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (watch_item_id, trade_date)
);

CREATE TABLE IF NOT EXISTS notification_runs (
  id TEXT PRIMARY KEY,
  trade_date TEXT NOT NULL,
  run_type TEXT NOT NULL,
  watch_item_id TEXT,
  message_text TEXT NOT NULL,
  report_url TEXT,
  feishu_push_ok INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
