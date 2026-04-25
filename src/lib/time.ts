function partsFor(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    weekday: map.weekday,
  };
}

export function formatDateInZone(date: Date, timeZone: string): string {
  const parts = partsFor(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function weekdayInZone(date: Date, timeZone: string): number {
  const weekday = partsFor(date, timeZone).weekday;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

export function isoNow(now = new Date()): string {
  return now.toISOString();
}

export function dateMinusYears(date: Date, years: number): string {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() - years);
  return copy.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const aMs = Date.parse(`${a}T00:00:00Z`);
  const bMs = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.floor((aMs - bMs) / (24 * 60 * 60 * 1000));
}
