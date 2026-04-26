import { describeHoldingNames, describeHoldings } from '../holding-reference';
import type { DailySignal, WatchItem } from '../types';
import { formatDisplayNumber, formatDisplayPercent } from './value';

export interface FeishuPostMessage {
  msg_type: 'post';
  content: {
    post: {
      zh_cn: {
        title: string;
        content: Array<Array<{ tag: 'text'; text: string } | { tag: 'a'; text: string; href: string }>>;
      };
    };
  };
}

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

function zoneIcon(zone: DailySignal['zone']): string {
  switch (zone) {
    case 'extreme_low': return '🟢';
    case 'low': return '🟡';
    case 'high': return '🟠';
    case 'extreme_high': return '🔴';
    default: return '⚪️';
  }
}

function themeLine(item: WatchItem, signal: DailySignal): string {
  const holdings = describeHoldingNames(item.sourceHoldings);
  if (signal.metricMode === 'valuation') {
    return `${zoneIcon(signal.zone)} ${item.displayName}｜持仓 ${holdings}｜PE ${formatDisplayPercent(signal.pePct5y)}%｜PB ${formatDisplayPercent(signal.pbPct5y)}%｜${zoneLabel(signal.zone)}`;
  }
  return `${zoneIcon(signal.zone)} ${item.displayName}｜持仓 ${holdings}｜价格 ${formatDisplayNumber(signal.price)}｜分位 ${formatDisplayPercent(signal.pricePct5y)}%｜${zoneLabel(signal.zone)}`;
}

function macroLine(item: WatchItem, signal: DailySignal): string {
  return `${zoneIcon(signal.zone)} ${item.displayName}｜价格 ${formatDisplayNumber(signal.price)}｜分位 ${formatDisplayPercent(signal.pricePct5y)}%｜${zoneLabel(signal.zone)}`;
}

function buildPost(paragraphs: Array<Array<{ tag: 'text'; text: string } | { tag: 'a'; text: string; href: string }>>): FeishuPostMessage {
  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: '',
          content: paragraphs,
        },
      },
    },
  };
}

export function buildDailyMessage(headline: string, themeRows: Array<{ item: WatchItem; signal: DailySignal }>, macroRows: Array<{ item: WatchItem; signal: DailySignal }>, reportUrl?: string): string {
  const extremeRows = [...themeRows, ...macroRows].filter(({ signal }) => signal.zone === 'extreme_low' || signal.zone === 'extreme_high');
  const focusCodes = Array.from(new Set(extremeRows.flatMap(({ item }) => item.focusCodes)));
  const sections = [
    `【今日结论】\n${headline}`,
    `【极端区间】\n${extremeRows.length ? extremeRows.map(({ item, signal }) => item.kind === 'theme' ? themeLine(item, signal) : macroLine(item, signal)).join('\n') : '今日无新增极端区间项目'}`,
    `【主题板块】\n${themeRows.map(({ item, signal }) => themeLine(item, signal)).join('\n')}`,
    `【宏观观察】\n${macroRows.map(({ item, signal }) => macroLine(item, signal)).join('\n')}`,
    `【关注代码】\n${focusCodes.length ? focusCodes.join(' / ') : '无新增极端项目'}`,
  ];
  if (reportUrl) sections.push(`详细版报告:\n${reportUrl}`);
  return sections.join('\n\n');
}

export function buildDailyPostMessage(headline: string, themeRows: Array<{ item: WatchItem; signal: DailySignal }>, macroRows: Array<{ item: WatchItem; signal: DailySignal }>, reportUrl?: string): FeishuPostMessage {
  const extremeRows = [...themeRows, ...macroRows].filter(({ signal }) => signal.zone === 'extreme_low' || signal.zone === 'extreme_high');
  const focusCodes = Array.from(new Set(extremeRows.flatMap(({ item }) => item.focusCodes)));
  const paragraphs: FeishuPostMessage['content']['post']['zh_cn']['content'] = [
    [{ tag: 'text', text: '【今日结论】' }],
    [{ tag: 'text', text: headline }],
    [{ tag: 'text', text: '【极端区间】' }],
  ];
  if (extremeRows.length) {
    for (const { item, signal } of extremeRows) {
      paragraphs.push([{ tag: 'text', text: item.kind === 'theme' ? themeLine(item, signal) : macroLine(item, signal) }]);
    }
  } else {
    paragraphs.push([{ tag: 'text', text: '今日无新增极端区间项目' }]);
  }
  paragraphs.push([{ tag: 'text', text: '【主题板块】' }]);
  for (const { item, signal } of themeRows) paragraphs.push([{ tag: 'text', text: themeLine(item, signal) }]);
  paragraphs.push([{ tag: 'text', text: '【宏观观察】' }]);
  for (const { item, signal } of macroRows) paragraphs.push([{ tag: 'text', text: macroLine(item, signal) }]);
  paragraphs.push([{ tag: 'text', text: '【关注代码】' }]);
  paragraphs.push([{ tag: 'text', text: focusCodes.length ? focusCodes.join(' / ') : '无新增极端项目' }]);
  if (reportUrl) {
    paragraphs.push([{ tag: 'text', text: '详细版报告：' }]);
    paragraphs.push([{ tag: 'text', text: reportUrl }]);
  }
  return buildPost(paragraphs);
}

export function buildExtremeAlertMessage(item: WatchItem, signal: DailySignal, reportUrl?: string): string {
  const sections = [
    `【${item.displayName} 进入极端区间】`,
    item.kind === 'theme' && item.sourceHoldings.length ? `关联持仓：${describeHoldings(item.sourceHoldings)}` : undefined,
    `当前状态：${zoneLabel(signal.zone)}`,
    `触发原因：${signal.extremeReason ?? '达到阈值'}`,
    `关注代码：${signal.focusCodesText}`,
  ].filter((line): line is string => Boolean(line));
  if (reportUrl) sections.push(`详细版报告:\n${reportUrl}`);
  return sections.join('\n\n');
}

export function buildExtremeAlertPostMessage(item: WatchItem, signal: DailySignal, reportUrl?: string): FeishuPostMessage {
  const paragraphs: FeishuPostMessage['content']['post']['zh_cn']['content'] = [
    [{ tag: 'text', text: `【${item.displayName} 进入极端区间】` }],
  ];
  if (item.kind === 'theme' && item.sourceHoldings.length) {
    paragraphs.push([{ tag: 'text', text: `关联持仓：${describeHoldings(item.sourceHoldings)}` }]);
  }
  paragraphs.push([{ tag: 'text', text: `当前状态：${zoneLabel(signal.zone)}` }]);
  paragraphs.push([{ tag: 'text', text: `触发原因：${signal.extremeReason ?? '达到阈值'}` }]);
  paragraphs.push([{ tag: 'text', text: `关注代码：${signal.focusCodesText}` }]);
  if (reportUrl) {
    paragraphs.push([{ tag: 'text', text: '详细版报告：' }]);
    paragraphs.push([{ tag: 'text', text: reportUrl }]);
  }
  return buildPost(paragraphs);
}
