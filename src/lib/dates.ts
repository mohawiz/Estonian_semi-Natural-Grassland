// Calendar helpers working on ISO dates (YYYY-MM-DD) without time-zone drift.

export function parseISO(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Inclusive number of days between two ISO dates. */
export function daysInclusive(start: string, end: string): number {
  return Math.round((parseISO(end).getTime() - parseISO(start).getTime()) / 86_400_000) + 1;
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function todayISO(): string {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Estonian public holidays (riigipühad) under the Public Holidays and
 * Days of National Importance Act. Easter Sunday and Pentecost always
 * fall on Sundays, so only Good Friday matters for working-day counts.
 */
export function estonianPublicHolidays(year: number): Set<string> {
  const fixed = ['01-01', '02-24', '05-01', '06-23', '06-24', '08-20', '12-24', '12-25', '12-26'];
  const set = new Set(fixed.map((md) => `${year}-${md}`));
  const easter = easterSunday(year);
  set.add(addDays(easter, -2)); // Suur reede
  set.add(easter); // Ülestõusmispühade 1. püha
  set.add(addDays(easter, 49)); // Nelipühade 1. püha
  return set;
}

export function isWorkingDay(iso: string): boolean {
  const dow = parseISO(iso).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !estonianPublicHolidays(Number(iso.slice(0, 4))).has(iso);
}

/**
 * The date that is `n` working days after `start` (the start day itself is
 * not counted). Used for the configurable notification window.
 */
export function addWorkingDays(start: string, n: number): string {
  let d = start;
  let counted = 0;
  while (counted < n) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) counted++;
  }
  return d;
}

export function workingDaysBetween(from: string, to: string): number {
  if (to <= from) return 0;
  let count = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) count++;
  return count;
}

export function formatDate(iso: string, lang: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return '';
  const d = iso.length > 10 ? new Date(iso) : parseISO(iso);
  return new Intl.DateTimeFormat(lang === 'et' ? 'et-EE' : 'en-GB', { ...opts, timeZone: iso.length > 10 ? undefined : 'UTC' }).format(d);
}
