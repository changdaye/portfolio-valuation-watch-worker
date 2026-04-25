export function toInt(value: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

export function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}


export function formatDisplayNumber(value: number | null | undefined, digits = 2, fallback = 'NA'): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return String(Number(value.toFixed(digits)));
}

export function formatDisplayPercent(value: number | null | undefined, digits = 2, fallback = 'NA'): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return String(Number(value.toFixed(digits)));
}
