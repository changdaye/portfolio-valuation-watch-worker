import type { RuntimeState, Zone } from '../types';

const KEY = 'runtime_state';

export async function getRuntimeState(kv: KVNamespace): Promise<RuntimeState> {
  const raw = await kv.get(KEY);
  if (!raw) return { itemZones: {} };
  return JSON.parse(raw) as RuntimeState;
}

export async function setRuntimeState(kv: KVNamespace, state: RuntimeState): Promise<void> {
  await kv.put(KEY, JSON.stringify(state));
}

export function shouldSendExtremeAlert(state: RuntimeState, watchItemId: string, zone: Zone): boolean {
  if (zone !== 'extreme_low' && zone !== 'extreme_high') return false;
  return state.itemZones?.[watchItemId] !== zone;
}

export function nextRuntimeState(state: RuntimeState, watchItemId: string, zone: Zone, nowIso: string): RuntimeState {
  return {
    ...state,
    lastSuccessAt: nowIso,
    itemZones: {
      ...(state.itemZones ?? {}),
      [watchItemId]: zone,
    },
  };
}

export function recordFailure(state: RuntimeState, detail: string, nowIso: string): RuntimeState {
  return {
    ...state,
    lastFailureAt: nowIso,
    lastFailureReason: detail,
  };
}
