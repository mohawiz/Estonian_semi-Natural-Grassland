import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../lib/types';
import { matchRecords, mowingSignals, ndviExpression, type NdviPoint } from './satellite';

// Real 2026 NDVI for a PRIA meadow registered for mowing (start date 25 June), Sentinel-2 clear dates only.
const REAL = '04-18:0.41 05-08:0.69 05-23:0.90 06-07:0.85 06-20:0.91 06-22:0.89 06-30:0.58 07-17:0.71 08-04:0.90 08-24:0.82 09-07:0.91 10-20:0.79 10-27:0.58';
const points: NdviPoint[] = REAL.split(' ').map((s) => {
  const [md, v] = s.split(':');
  return { date: `2026-${md}`, ndvi: Number(v), clear: 1, sceneId: md };
});
const mow = (date: string, endDate?: string): LogEntry => ({ id: date, parcelId: 'p', kind: 'mowing', date, endDate, photoIds: [], createdAt: '' });

describe('mowingSignals', () => {
  it('finds the June cut and ignores autumn fading', () => {
    expect(mowingSignals(points)).toEqual([{ from: '2026-06-22', date: '2026-06-30', before: 0.89, after: 0.58 }]);
  });
  it('ignores small dips', () => {
    expect(mowingSignals(points.map((p) => ({ ...p, ndvi: 0.8 + (p.ndvi > 0.8 ? 0.05 : 0) })))).toEqual([]);
  });
});

describe('matchRecords', () => {
  const signals = mowingSignals(points);
  it('matches a mowing record inside the drop window', () => {
    const [m] = matchRecords([mow('2026-06-26', '2026-06-27')], signals, points);
    expect(m.kind).toBe('matched');
  });
  it('flags a record with no drop, and a drop with no record', () => {
    const r = matchRecords([mow('2026-08-15')], signals, points);
    expect(r.map((x) => x.kind)).toEqual(['seen-not-recorded', 'recorded-not-seen']);
    expect(r[1]).toMatchObject({ checkable: true });
  });
});

it('uses the offset-corrected NDVI for current processing baselines', () => {
  expect(ndviExpression('05.12')).toBe('(B08-B04)/(B08+B04-2000)');
  expect(ndviExpression('02.14')).toBe('(B08-B04)/(B08+B04)');
});
