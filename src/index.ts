import { parseConfig } from './config';
import type { Env } from './types';

function json(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const config = parseConfig(env);

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({
        ok: true,
        status: 'bootstrap',
        project: 'portfolio-valuation-watch-worker',
        schedule: {
          weekdays: '1-6',
          runHourLocal: config.runHourLocal,
          runMinuteLocal: config.runMinuteLocal,
          marketTimezone: config.marketTimezone
        },
        percentile: {
          windowYears: config.percentileWindowYears,
          lowThreshold: config.lowPercentileThreshold,
          highThreshold: config.highPercentileThreshold
        },
        feishuConfigured: config.feishuConfigured
      });
    }

    if (request.method === 'POST' && url.pathname === '/admin/trigger') {
      return json({ ok: false, error: 'implementation pending after spec review' }, 501);
    }

    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const config = parseConfig(env);
    console.log('scheduled bootstrap trigger', {
      project: 'portfolio-valuation-watch-worker',
      runHourLocal: config.runHourLocal,
      runMinuteLocal: config.runMinuteLocal,
      marketTimezone: config.marketTimezone
    });
  }
};
