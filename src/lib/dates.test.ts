import { describe, expect, it } from 'vitest';
import { addWorkingDays, daysInclusive, easterSunday, eachDay, estonianPublicHolidays, isWorkingDay, workingDaysBetween } from './dates';

describe('calendar', () => {
  it('computes Easter Sunday', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
  });
  it('lists Estonian public holidays including Good Friday', () => {
    const h = estonianPublicHolidays(2026);
    expect(h.has('2026-04-03')).toBe(true); // Suur reede
    expect(h.has('2026-06-23')).toBe(true);
    expect(h.has('2026-08-20')).toBe(true);
    expect(h.has('2026-07-01')).toBe(false);
  });
  it('counts inclusive days', () => {
    expect(daysInclusive('2026-07-01', '2026-07-31')).toBe(31);
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });
  it('skips weekends and holidays when adding working days', () => {
    expect(isWorkingDay('2026-07-04')).toBe(false); // Saturday
    // 1 July 2026 (Wed) + 15 working days = 22 July 2026 (no holidays in between)
    expect(addWorkingDays('2026-07-01', 15)).toBe('2026-07-22');
    // Across Võidupüha and jaanipäev (Tue 23 + Wed 24 June 2026)
    expect(addWorkingDays('2026-06-19', 3)).toBe('2026-06-26');
    expect(workingDaysBetween('2026-07-01', '2026-07-22')).toBe(15);
  });
});
