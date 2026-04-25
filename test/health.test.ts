import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('worker health', () => {
  it('returns schedule and config metadata', async () => {
    const response = await worker.fetch(new Request('https://example.com/health'), {} as any);
    const payload = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('bootstrap');
    expect(payload).toHaveProperty('schedule');
  });
});
