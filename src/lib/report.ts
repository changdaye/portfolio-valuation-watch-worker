import { describeHoldings } from '../holding-reference';
import type { DailySignal, WatchItem } from '../types';
import { formatDisplayNumber, formatDisplayPercent } from './value';

const PREFIX = 'portfolio-valuation-watch-worker';

function zoneLabel(zone: DailySignal['zone']): string {
  switch (zone) {
    case 'extreme_low': return '极低位';
    case 'low': return '偏低位';
    case 'neutral': return '中性';
    case 'high': return '偏高位';
    case 'extreme_high': return '极高位';
    default: return '不可用';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function utcStamp(now = new Date()): string {
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');
}

export function buildDetailedReportObjectKey(now = new Date()): string {
  return `${PREFIX}/${utcStamp(now)}.html`;
}

export function buildFeishuMessageObjectKey(now = new Date()): string {
  return `${PREFIX}/feishu-messages/${utcStamp(now)}.txt`;
}


function themeRow(item: WatchItem, signal: DailySignal): string {
  return `<tr><td>${escapeHtml(item.displayName)}</td><td>${escapeHtml(describeHoldings(item.sourceHoldings))}</td><td>${escapeHtml(signal.asOfDate)}</td><td>${formatDisplayNumber(signal.pe, 2, '-')}</td><td>${formatDisplayPercent(signal.pePct5y, 2, '-')}%</td><td>${formatDisplayNumber(signal.pb, 2, '-')}</td><td>${formatDisplayPercent(signal.pbPct5y, 2, '-')}%</td><td>${escapeHtml(zoneLabel(signal.zone))}</td><td>${escapeHtml(item.note ?? '-')}</td></tr>`;
}

function macroRow(item: WatchItem, signal: DailySignal): string {
  return `<tr><td>${escapeHtml(item.displayName)}</td><td>${escapeHtml(signal.asOfDate)}</td><td>${formatDisplayNumber(signal.price, 2, '-')}</td><td>${formatDisplayPercent(signal.pricePct5y, 2, '-')}%</td><td>${escapeHtml(zoneLabel(signal.zone))}</td><td>${escapeHtml(item.note ?? '-')}</td></tr>`;
}

export function buildDetailedReport(input: {
  generatedAt: Date;
  tradeDate: string;
  headline: string;
  modelLabel?: string;
  themeRows: Array<{ item: WatchItem; signal: DailySignal }>;
  macroRows: Array<{ item: WatchItem; signal: DailySignal }>;
  reportUrl?: string;
}): string {
  const extremeRows = [...input.themeRows, ...input.macroRows]
    .filter(({ signal }) => signal.zone === 'extreme_low' || signal.zone === 'extreme_high')
    .map(({ item, signal }) => `<li><strong>${escapeHtml(item.displayName)}</strong>：${escapeHtml(signal.extremeReason ?? signal.summaryLine)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>投资组合估值观察日报</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; margin: 0; background: #f6f8fb; color: #1f2937; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 48px; }
    .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08); margin-bottom: 20px; }
    h1 { margin: 0 0 16px; font-size: 28px; }
    h2 { margin: 0 0 16px; font-size: 20px; }
    .meta { color: #64748b; line-height: 1.8; }
    .headline { font-size: 18px; font-weight: 700; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; font-weight: 700; }
    ul { margin: 0; padding-left: 20px; line-height: 1.9; }
    a { color: #2563eb; }
    .tag { display: inline-block; background: #eef2ff; color: #4338ca; border-radius: 999px; padding: 4px 10px; font-size: 12px; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>投资组合估值观察日报</h1>
      <div class="meta">
        <div><strong>交易日期：</strong>${escapeHtml(input.tradeDate)}</div>
        <div><strong>生成时间：</strong>${escapeHtml(input.generatedAt.toISOString())}</div>
        ${input.modelLabel ? `<div><strong>模型：</strong>${escapeHtml(input.modelLabel)}</div>` : ''}
        ${input.reportUrl ? `<div><strong>报告链接：</strong><a href="${escapeHtml(input.reportUrl)}">打开当前 HTML 报告</a></div>` : ''}
      </div>
    </section>

    <section class="card">
      <div class="tag">今日结论</div>
      <div class="headline">${escapeHtml(input.headline)}</div>
    </section>

    <section class="card">
      <h2>主题板块</h2>
      <table>
        <thead>
          <tr>
            <th>主题</th>
            <th>关联持仓</th>
            <th>数据日期</th>
            <th>PE</th>
            <th>PE分位</th>
            <th>PB</th>
            <th>PB分位</th>
            <th>区间</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          ${input.themeRows.map(({ item, signal }) => themeRow(item, signal)).join('')}
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>宏观观察</h2>
      <table>
        <thead>
          <tr>
            <th>对象</th>
            <th>数据日期</th>
            <th>最新值</th>
            <th>5年分位</th>
            <th>区间</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          ${input.macroRows.map(({ item, signal }) => macroRow(item, signal)).join('')}
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>极端项目</h2>
      <ul>
        ${extremeRows || '<li>今日无新增极端项目。</li>'}
      </ul>
    </section>
  </div>
</body>
</html>`;
}
