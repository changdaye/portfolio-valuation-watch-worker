import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('worker bootstrap health', () => {
  it('returns bootstrap status on /health', async () => {
    const response = await worker.fetch(new Request('https://example.com/health'), {});
    expect(response.status).toBe(200);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('bootstrap');
    expect(payload.project).toBe('portfolio-valuation-watch-worker');
  });
});
