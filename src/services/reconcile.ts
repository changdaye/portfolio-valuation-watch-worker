import { buildSignal } from '../lib/signals';
import type { DailySignal, DailySnapshot, WatchItem } from '../types';

export function reconcileSignals(items: WatchItem[], snapshots: DailySnapshot[], thresholds: { low: number; high: number }): DailySignal[] {
  return snapshots.map((snapshot) => {
    const item = items.find((entry) => entry.id === snapshot.watchItemId);
    if (!item) throw new Error(`missing watch item for ${snapshot.watchItemId}`);
    return buildSignal(item, snapshot, thresholds);
  });
}
