import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('scheduled handler', () => {
  it('does not throw when not on an active weekday', async () => {
    await expect(worker.scheduled({} as ScheduledController, {} as any)).resolves.toBeUndefined();
  });
});
