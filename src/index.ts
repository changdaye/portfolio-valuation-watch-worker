import { parseConfig, assertRuntimeEnv } from './config';
import { insertNotificationRun, listAllWatchItems, listEnabledWatchItems, reseedDefaultWatchItems, upsertDailySignal, upsertDailySnapshot } from './db';
import { authorizeAdminRequest } from './lib/admin';
import { buildDailyMessage, buildDailyPostMessage, buildExtremeAlertMessage, buildExtremeAlertPostMessage } from './lib/message';
import { buildDetailedReport } from './lib/report';
import { buildDetailedReportPublicUrl, maybeHandleDetailedReportRequest, saveDetailedReportCopy } from './lib/report-storage';
import { getRuntimeState, nextRuntimeState, recordFailure, setRuntimeState, shouldSendExtremeAlert } from './lib/runtime';
import { formatDateInZone, isoNow, weekdayInZone } from './lib/time';
import { uploadDetailedReportToCos } from './services/cos';
import { pushToFeishu } from './services/feishu';
import { summarizeWithLLM } from './services/llm';
import { reconcileSignals } from './services/reconcile';
import { fetchMacroSnapshot } from './services/source-macro';
import { fetchThemeSnapshot } from './services/source-theme';
import type { DailySnapshot, Env, RunResult, RuntimeState, WatchItem } from './types';

function json(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

function fallbackHeadline(themeRows: Array<{ item: WatchItem; signal: RunResult['signals'][number] }>, macroRows: Array<{ item: WatchItem; signal: RunResult['signals'][number] }>): string {
  const rows = [...themeRows, ...macroRows];
  const high = rows.filter(({ signal }) => signal.zone === 'extreme_high').length;
  const low = rows.filter(({ signal }) => signal.zone === 'extreme_low').length;
  const unavailable = rows.filter(({ signal }) => signal.zone === 'unavailable').length;
  if (high === 0 && low === 0 && unavailable === 0) return '组合估值与宏观位置整体中性，暂无新增极端信号。';
  return `组合观察：极高位 ${high} 项，极低位 ${low} 项，暂不可用 ${unavailable} 项。`;
}

async function ensureWatchItems(db: D1Database, nowIsoValue: string): Promise<WatchItem[]> {
  let items = await listEnabledWatchItems(db);
  if (items.length) return items;
  await reseedDefaultWatchItems(db, nowIsoValue);
  items = await listEnabledWatchItems(db);
  return items;
}

async function collectSnapshots(items: WatchItem[], env: Env, tradeDate: string, now: Date): Promise<DailySnapshot[]> {
  const config = parseConfig(env);
  const snapshots = await Promise.all(items.map(async (item) => {
    try {
      return item.kind === 'theme'
        ? await fetchThemeSnapshot(item, config, tradeDate, now)
        : await fetchMacroSnapshot(item, config, tradeDate, now);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        watchItemId: item.id,
        tradeDate,
        asOfDate: tradeDate,
        availability: 'unavailable' as const,
        sourceKey: 'runtime',
        pe: null,
        pb: null,
        price: null,
        peHistoryJson: null,
        pbHistoryJson: null,
        priceHistoryJson: null,
        notes: detail,
        rawPayloadJson: JSON.stringify({ error: detail }),
      };
    }
  }));
  return snapshots;
}

export async function runDailyDigest(env: Env, now = new Date()): Promise<RunResult> {
  const config = parseConfig(env);
  assertRuntimeEnv(env, config);
  const tradeDate = formatDateInZone(now, config.marketTimezone);
  const currentIso = isoNow(now);
  const items = await ensureWatchItems(env.WATCHER_DB!, currentIso);
  const snapshots = await collectSnapshots(items, env, tradeDate, now);
  await Promise.all(snapshots.map((snapshot) => upsertDailySnapshot(env.WATCHER_DB!, snapshot, currentIso)));

  const signals = reconcileSignals(items, snapshots, {
    low: config.lowPercentileThreshold,
    high: config.highPercentileThreshold,
  });
  await Promise.all(signals.map((signal) => upsertDailySignal(env.WATCHER_DB!, signal, currentIso)));

  const themeRows = items.filter((item) => item.kind === 'theme').map((item) => ({ item, signal: signals.find((signal) => signal.watchItemId === item.id)! }));
  const macroRows = items.filter((item) => item.kind === 'macro').map((item) => ({ item, signal: signals.find((signal) => signal.watchItemId === item.id)! }));
  const fallback = fallbackHeadline(themeRows, macroRows);
  let headline = fallback;
  let modelLabel = '';
  try {
    const llmResult = await summarizeWithLLM(config, env.AI, themeRows, macroRows, fallback);
    headline = llmResult.headline;
    modelLabel = llmResult.modelLabel;
  } catch {
    headline = fallback;
  }

  let reportUrl: string | undefined;
  const report = buildDetailedReport({
    generatedAt: now,
    tradeDate,
    headline,
    modelLabel,
    themeRows,
    macroRows,
  });
  try {
    const uploaded = await uploadDetailedReportToCos(config, report, now);
    await saveDetailedReportCopy(env.RUNTIME_KV!, uploaded.key, report);
    reportUrl = buildDetailedReportPublicUrl(config.workerPublicBaseUrl, uploaded.key);
  } catch {
    reportUrl = undefined;
  }

  const messagePreview = buildDailyMessage(headline, themeRows, macroRows, reportUrl, modelLabel);
  await pushToFeishu(config, buildDailyPostMessage(headline, themeRows, macroRows, reportUrl, modelLabel));
  await insertNotificationRun(env.WATCHER_DB!, {
    id: crypto.randomUUID(),
    tradeDate,
    runType: 'daily_summary',
    messageText: messagePreview,
    reportUrl,
    feishuPushOk: true,
    createdAt: currentIso,
  });

  let state: RuntimeState = await getRuntimeState(env.RUNTIME_KV!);
  const alertPreviews: string[] = [];
  for (const item of items) {
    const signal = signals.find((entry) => entry.watchItemId === item.id)!;
    if (!shouldSendExtremeAlert(state, item.id, signal.zone)) continue;
    const text = buildExtremeAlertMessage(item, signal, reportUrl, modelLabel);
    await pushToFeishu(config, buildExtremeAlertPostMessage(item, signal, reportUrl, modelLabel));
    await insertNotificationRun(env.WATCHER_DB!, {
      id: crypto.randomUUID(),
      tradeDate,
      runType: 'extreme_alert',
      watchItemId: item.id,
      messageText: text,
      reportUrl,
      feishuPushOk: true,
      createdAt: currentIso,
    });
    alertPreviews.push(text);
    state = nextRuntimeState(state, item.id, signal.zone, currentIso);
  }
  await setRuntimeState(env.RUNTIME_KV!, { ...state, lastSuccessAt: currentIso });

  return {
    tradeDate,
    headline,
    modelLabel,
    reportUrl,
    messagePreview,
    alertPreviews,
    snapshots,
    signals,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const config = parseConfig(env);

    if (request.method === 'GET' && env.RUNTIME_KV) {
      const reportResponse = await maybeHandleDetailedReportRequest(request, env.RUNTIME_KV);
      if (reportResponse) return reportResponse;
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({
        ok: true,
        status: 'bootstrap',
        project: 'portfolio-valuation-watch-worker',
        schedule: {
          weekdays: config.runWeekdays,
          runHourLocal: config.runHourLocal,
          runMinuteLocal: config.runMinuteLocal,
          marketTimezone: config.marketTimezone,
        },
        percentile: {
          windowYears: config.percentileWindowYears,
          lowThreshold: config.lowPercentileThreshold,
          highThreshold: config.highPercentileThreshold,
        },
        feishuConfigured: config.feishuConfigured,
        cosConfigured: config.cosConfigured,
      });
    }

    if (request.method === 'GET' && url.pathname === '/admin/watch-items') {
      const auth = authorizeAdminRequest(request, config.manualTriggerToken);
      if (!auth.ok) return json({ ok: false, error: auth.error ?? 'unauthorized' }, auth.status);
      if (!env.WATCHER_DB) return json({ ok: false, error: 'missing WATCHER_DB binding' }, 500);
      return json({ ok: true, items: await listAllWatchItems(env.WATCHER_DB) });
    }

    if (request.method === 'POST' && url.pathname === '/admin/watch-items/reseed-defaults') {
      const auth = authorizeAdminRequest(request, config.manualTriggerToken);
      if (!auth.ok) return json({ ok: false, error: auth.error ?? 'unauthorized' }, auth.status);
      if (!env.WATCHER_DB) return json({ ok: false, error: 'missing WATCHER_DB binding' }, 500);
      const inserted = await reseedDefaultWatchItems(env.WATCHER_DB, isoNow());
      return json({ ok: true, inserted });
    }

    if (request.method === 'POST' && url.pathname === '/admin/trigger') {
      const auth = authorizeAdminRequest(request, config.manualTriggerToken);
      if (!auth.ok) return json({ ok: false, error: auth.error ?? 'unauthorized' }, auth.status);
      try {
        const result = await runDailyDigest(env);
        return json({
          ok: true,
          tradeDate: result.tradeDate,
          reportUrl: result.reportUrl,
          headline: result.headline,
          modelLabel: result.modelLabel,
          messagePreview: result.messagePreview,
          alertPreviews: result.alertPreviews,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (env.RUNTIME_KV) {
          const state = await getRuntimeState(env.RUNTIME_KV);
          await setRuntimeState(env.RUNTIME_KV, recordFailure(state, detail, isoNow()));
        }
        return json({ ok: false, error: detail }, 500);
      }
    }

    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    if (!env.WATCHER_DB || !env.RUNTIME_KV) return;
    const config = parseConfig(env);
    const now = new Date();
    if (!config.runWeekdays.includes(weekdayInZone(now, config.marketTimezone))) return;
    await runDailyDigest(env, now);
  },
};
