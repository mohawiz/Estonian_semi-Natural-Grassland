import { describe, expect, it } from 'vitest';
import { demoRecords } from './demo';
import { computeRisk } from './risk';
import { compareRecords, demoDetections } from './satelliteDemo';

const recs = demoRecords('2026-08-20T00:00:00Z');
const parcelB = recs.parcels.find((p) => p.id === 'demo-parcel-b')!;
const season = { start: '2026-04-01', end: '2026-10-31' };
const base = { parcel: parcelB, entries: recs.entries, reports: [], noticeWorkingDays: 15, today: '2026-10-30', season };

describe('computeRisk', () => {
  it('rates a documented parcel low-to-medium and lists what helps', () => {
    const r = computeRisk({ ...base, checklist: recs.checklists[0] });
    expect(r.helps).toEqual(expect.arrayContaining(['maintenance-logged', 'missed-documented']));
    expect(r.factors.map((f) => f.key)).toContain('notice-passed-no-report');
    expect(r.factors.map((f) => f.key)).toContain('checklist-unsure');
    expect(r.level).toBe('low');
  });
  it('a saved report for the window removes the late-notice factor', () => {
    const report = { id: 'r', parcelId: parcelB.id, createdAt: '', input: { parcelId: parcelB.id, start: '2026-07-01', end: '2026-07-31', plannedAction: 'mowing' as const, reason: 'too-wet' as const, affectedHa: 6.8, severity: 'moderate' as const, justification: 'x', farmerName: 'y' } };
    const r = computeRisk({ ...base, checklist: recs.checklists[0], reports: [report] });
    expect(r.factors.map((f) => f.key)).not.toContain('notice-passed-no-report');
    expect(r.helps).toContain('report-saved');
  });
  it('rates an undocumented parcel high', () => {
    const entries = [{ ...recs.entries[2], photoIds: [] }];
    const r = computeRisk({ ...base, entries, verdicts: { 'demo-e3': 'does-not-support' }, checklist: { parcelId: parcelB.id, updatedAt: '', answers: { records: 'no', photos: 'no' } } });
    expect(r.level).toBe('high');
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('demo satellite comparison', () => {
  it('only exists for demo parcels', () => {
    expect(demoDetections({ ...parcelB, isDemo: false })).toBeNull();
  });
  it('matches the August mowing and flags a detection without a record', () => {
    const b = compareRecords(recs.entries.filter((e) => e.parcelId === 'demo-parcel-b'), demoDetections(parcelB)!);
    expect(b).toEqual([{ date: '2026-08-14', status: 'matched', entryId: 'demo-e4' }]);
    const a = recs.parcels.find((p) => p.id === 'demo-parcel-a')!;
    const rows = compareRecords(recs.entries.filter((e) => e.parcelId === a.id), demoDetections(a)!);
    expect(rows).toEqual([{ date: '2026-07-18', status: 'detected-not-recorded' }]);
  });
  it('flags a mowing record the satellite missed', () => {
    expect(compareRecords([recs.entries[3]], [])[0].status).toBe('recorded-not-detected');
  });
});
