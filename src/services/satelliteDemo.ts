// SIMULATED satellite mowing detections for the demo farm only.
// PRIA's area-monitoring results (SATIKAS) are not, as far as we found, open to
// third parties, so nothing here is real satellite data. The UI labels it "Demo".
import { parseISO } from '../lib/dates';
import type { LogEntry, Parcel } from '../lib/types';

export interface Detection {
  date: string;
  kind: 'mowing-detected';
}

export type MatchStatus = 'matched' | 'recorded-not-detected' | 'detected-not-recorded';

export interface ComparisonRow {
  date: string;
  status: MatchStatus;
  entryId?: string;
}

const DEMO_DETECTIONS: Record<string, Detection[]> = {
  // Floodplain meadow: the August mowing is seen two days after the log date.
  'demo-parcel-b': [{ date: '2026-08-16', kind: 'mowing-detected' }],
  // Coastal meadow: a grazing-driven biomass drop read as "mowing" — the kind of
  // false signal farmers describe disputing.
  'demo-parcel-a': [{ date: '2026-07-18', kind: 'mowing-detected' }],
  'demo-parcel-c': [],
};

export function demoDetections(parcel: Parcel): Detection[] | null {
  return parcel.isDemo ? (DEMO_DETECTIONS[parcel.id] ?? []) : null;
}

const daysApart = (a: string, b: string) => Math.abs(parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000;

/** Pair mowing records with detections (±5 days) and flag what doesn't match. */
export function compareRecords(entries: LogEntry[], detections: Detection[], toleranceDays = 5): ComparisonRow[] {
  const mowings = entries.filter((e) => e.kind === 'mowing');
  const used = new Set<number>();
  const rows: ComparisonRow[] = mowings.map((e) => {
    const k = detections.findIndex((d, i) => !used.has(i) && daysApart(d.date, e.date) <= toleranceDays);
    if (k >= 0) used.add(k);
    return { date: e.date, status: k >= 0 ? 'matched' : 'recorded-not-detected', entryId: e.id };
  });
  detections.forEach((d, i) => {
    if (!used.has(i)) rows.push({ date: d.date, status: 'detected-not-recorded' });
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
