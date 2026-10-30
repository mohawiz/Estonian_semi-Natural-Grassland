import { describe, expect, it } from 'vitest';
import type { ReportInput } from '../lib/types';
import { demoRecords, DEMO_SCENARIO } from './demo';
import { allPassages } from './library';
import { buildReport, weatherVerdict } from './report';
import { summarizeWeather, type WeatherSeries } from './weather';

const recs = demoRecords('2026-08-20T00:00:00Z');
const farm = recs.farms[0];
const parcel = recs.parcels.find((p) => p.id === DEMO_SCENARIO.parcelId)!;
const photos = recs.photoSpecs.map((p) => ({ id: p.id, entryId: p.entryId, parcelId: p.parcelId, fileName: 'x.jpg', takenAt: p.takenAt, takenAtSource: 'demo' as const, blob: new Blob() }));

function series(rain: (d: number) => number): WeatherSeries {
  const days = Array.from({ length: 61 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 5, 17 + i)).toISOString().slice(0, 10);
    return { date, precipitationMm: rain(i), tMaxC: 18, tMinC: 10, soilMoisture: 0.35 };
  });
  return { lat: parcel.lat, lon: parcel.lon, gridLat: 58.73, gridLon: 23.85, start: days[0].date, end: days[60].date, days, source: { name: 't', url: 'u', licence: 'l', note: 'n' }, fetchedAt: '' };
}

const input: ReportInput = { parcelId: parcel.id, start: DEMO_SCENARIO.start, end: DEMO_SCENARIO.end, plannedAction: 'mowing', reason: 'too-wet', affectedHa: 6.8, severity: 'moderate', justification: 'Too wet.', farmerName: 'Test' };
const base = { input, farm, parcel, entries: recs.entries, photos, baseline: null, rules: allPassages().slice(0, 2), noticeWorkingDays: 15, today: '2026-07-10' };

describe('buildReport', () => {
  it('assembles planned vs completed, photos, extent and duration for the demo scenario', () => {
    const r = buildReport({ ...base, weather: series((i) => (i % 2 ? 12 : 0)) });
    expect(r.period.days).toBe(31);
    expect(r.duration.days).toBe(31);
    expect(r.planned).toEqual([{ action: 'mowing', start: '2026-07-01', end: '2026-07-31', source: 'entry' }]);
    expect(r.completed).toHaveLength(0); // mowing happened on 14 Aug, after the window
    expect(r.missedEntries.map((e) => e.id)).toEqual(['demo-e3']);
    expect(r.photos.map((p) => p.id)).toEqual(['demo-photo-1', 'demo-photo-2']);
    expect(r.extent).toEqual({ affectedHa: 6.8, parcelHa: 6.8, percent: 100 });
    expect(r.isDemo).toBe(true);
  });

  it('uses only in-period days for the weather summary', () => {
    const r = buildReport({ ...base, weather: series(() => 1) });
    expect(r.weather.summary?.daysWithData).toBe(31);
    expect(r.weather.summary?.totalPrecipMm).toBe(31);
  });

  it('computes the configurable notice deadline in working days', () => {
    const r = buildReport({ ...base, weather: series(() => 0) });
    expect(r.notice.deadline).toBe('2026-07-22');
    expect(r.notice.passed).toBe(false);
    expect(r.notice.daysLeft).toBe(8);
    const late = buildReport({ ...base, weather: series(() => 0), today: '2026-09-01', noticeWorkingDays: 10 });
    expect(late.notice.deadline).toBe('2026-07-15');
    expect(late.warnings).toContain('notice-window-passed');
  });

  it('warns honestly when the evidence is weak', () => {
    const r = buildReport({ ...base, photos: [], entries: recs.entries.filter((e) => e.id !== 'demo-e3'), weather: series(() => 0), input: { ...input, justification: ' ', affectedHa: 9 } });
    expect(r.warnings).toEqual(expect.arrayContaining(['no-photos', 'weather-does-not-support', 'affected-exceeds-parcel', 'empty-justification']));
    expect(r.planned[0].source).toBe('report');
  });

  it('flags missing weather instead of inventing it', () => {
    const r = buildReport({ ...base, weather: null, weatherError: 'offline' });
    expect(r.weather.summary).toBeNull();
    expect(r.weather.verdict).toBe('no-data');
    expect(r.warnings).toContain('no-weather');
  });

  it('flags completed work inside the period', () => {
    const entries = [...recs.entries, { ...recs.entries[3], id: 'x', date: '2026-07-20' }];
    expect(buildReport({ ...base, entries, weather: null }).warnings).toContain('completed-work-in-period');
  });
});

describe('weatherVerdict', () => {
  const days = (rain: number[]) => rain.map((p, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, precipitationMm: p, tMaxC: 20, tMinC: 10, soilMoisture: null }));
  it('supports "too wet" with many wet and heavy days', () => {
    expect(weatherVerdict('too-wet', summarizeWeather(days([12, 5, 3, 15, 2, 0, 4, 1, 0, 11])))).toBe('supports');
  });
  it('does not support "too wet" in a dry month', () => {
    expect(weatherVerdict('too-wet', summarizeWeather(days(Array(20).fill(0))))).toBe('does-not-support');
  });
  it('supports drought with a long dry spell', () => {
    expect(weatherVerdict('drought', summarizeWeather(days(Array(20).fill(0))))).toBe('supports');
  });
  it('marks non-weather reasons', () => {
    expect(weatherVerdict('machinery', null)).toBe('not-weather');
  });
});
