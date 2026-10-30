// Proof-report assembly. Pure functions: given the farmer's records, weather and
// rule passages, build a structured report. Rendering (screen, PDF) lives elsewhere,
// and a backend can produce the same ProofReport shape later.
import { addWorkingDays, daysInclusive, todayISO, workingDaysBetween } from '../lib/dates';
import type { Farm, LogEntry, MissedReason, Parcel, PhotoMeta, ReportInput } from '../lib/types';
import type { Passage } from './library';
import { summarizeWeather, type WeatherBaseline, type WeatherSeries, type WeatherSummary } from './weather';

export type EvidenceVerdict = 'supports' | 'mixed' | 'does-not-support' | 'no-data' | 'not-weather';

export type ReportWarning =
  | 'no-photos'
  | 'no-weather'
  | 'weather-does-not-support'
  | 'period-in-future'
  | 'notice-window-passed'
  | 'completed-work-in-period'
  | 'affected-exceeds-parcel'
  | 'empty-justification';

export interface ProofReport {
  generatedAt: string;
  input: ReportInput;
  farm: Pick<Farm, 'name' | 'owner' | 'registryCode' | 'isDemo'>;
  parcel: Parcel;
  period: { start: string; end: string; days: number };
  planned: { action: 'mowing' | 'grazing'; start: string; end: string; source: 'entry' | 'report' }[];
  completed: LogEntry[];
  missedEntries: LogEntry[];
  weather: { series: WeatherSeries | null; summary: WeatherSummary | null; baseline: WeatherBaseline | null; verdict: EvidenceVerdict; error?: string };
  photos: PhotoMeta[];
  extent: { affectedHa: number; parcelHa: number; percent: number };
  duration: { days: number };
  severity: ReportInput['severity'];
  rules: Passage[];
  notice: { workingDays: number; deadline: string; daysLeft: number; passed: boolean };
  warnings: ReportWarning[];
  isDemo: boolean;
}

export interface BuildReportArgs {
  input: ReportInput;
  farm: Farm;
  parcel: Parcel;
  entries: LogEntry[];
  photos: PhotoMeta[];
  weather: WeatherSeries | null;
  weatherError?: string;
  baseline: WeatherBaseline | null;
  rules: Passage[];
  noticeWorkingDays: number;
  today?: string;
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && bStart <= aEnd;

/**
 * Heuristic check of whether the weather record is consistent with the stated reason.
 * These thresholds are the tool's own, NOT official criteria, and are labelled as such in the UI.
 */
export function weatherVerdict(reason: MissedReason, s: WeatherSummary | null): EvidenceVerdict {
  if (reason !== 'too-wet' && reason !== 'drought') return 'not-weather';
  if (!s || s.daysWithData === 0) return 'no-data';
  const wetShare = s.wetDays / s.daysWithData;
  if (reason === 'too-wet') {
    const signals = [wetShare >= 0.4, s.heavyRainDays >= 2, s.longestWetSpell >= 4, (s.baselineRatio ?? 0) >= 1.25].filter(Boolean).length;
    return signals >= 2 ? 'supports' : signals === 1 ? 'mixed' : 'does-not-support';
  }
  const signals = [s.longestDrySpell >= 14, wetShare <= 0.15, s.baselineRatio !== null && s.baselineRatio <= 0.5].filter(Boolean).length;
  return signals >= 2 ? 'supports' : signals === 1 ? 'mixed' : 'does-not-support';
}

export function buildReport(a: BuildReportArgs): ProofReport {
  const { input, parcel } = a;
  const today = a.today ?? todayISO();
  const inPeriod = (e: LogEntry) => overlaps(e.date, e.endDate ?? e.date, input.start, input.end);
  const parcelEntries = a.entries.filter((e) => e.parcelId === parcel.id);
  const completed = parcelEntries.filter((e) => e.kind !== 'missed' && inPeriod(e)).sort((x, y) => x.date.localeCompare(y.date));
  const missedEntries = parcelEntries.filter((e) => e.kind === 'missed' && inPeriod(e));

  const planned: ProofReport['planned'] = missedEntries.length
    ? missedEntries.map((e) => ({ action: e.plannedAction ?? input.plannedAction, start: e.date, end: e.endDate ?? e.date, source: 'entry' as const }))
    : [{ action: input.plannedAction, start: input.start, end: input.end, source: 'report' as const }];

  const photoIds = new Set(missedEntries.flatMap((e) => e.photoIds));
  const photos = a.photos
    .filter((p) => photoIds.has(p.id) || (p.parcelId === parcel.id && p.takenAt && p.takenAt.slice(0, 10) >= input.start && p.takenAt.slice(0, 10) <= input.end))
    .sort((x, y) => (x.takenAt ?? '').localeCompare(y.takenAt ?? ''));

  const days = a.weather?.days.filter((d) => d.date >= input.start && d.date <= input.end) ?? [];
  const summary = days.length ? summarizeWeather(days, a.baseline) : null;
  const verdict = weatherVerdict(input.reason, summary);

  const affectedHa = Math.max(0, input.affectedHa);
  const percent = parcel.areaHa > 0 ? Math.min(100, (affectedHa / parcel.areaHa) * 100) : 0;

  // The notice window runs from the start of the circumstance (configurable; PRIA's figure by default).
  const deadline = addWorkingDays(input.start, a.noticeWorkingDays);
  const passed = today > deadline;
  const daysLeft = passed ? 0 : workingDaysBetween(today, deadline);

  const warnings: ReportWarning[] = [];
  if (!photos.length) warnings.push('no-photos');
  if (!summary) warnings.push('no-weather');
  if (verdict === 'does-not-support') warnings.push('weather-does-not-support');
  if (input.end > today) warnings.push('period-in-future');
  if (passed) warnings.push('notice-window-passed');
  if (completed.some((e) => e.kind === input.plannedAction)) warnings.push('completed-work-in-period');
  if (affectedHa > parcel.areaHa + 1e-9) warnings.push('affected-exceeds-parcel');
  if (!input.justification.trim()) warnings.push('empty-justification');

  return {
    generatedAt: new Date().toISOString(),
    input,
    farm: { name: a.farm.name, owner: a.farm.owner, registryCode: a.farm.registryCode, isDemo: a.farm.isDemo },
    parcel,
    period: { start: input.start, end: input.end, days: daysInclusive(input.start, input.end) },
    planned,
    completed,
    missedEntries,
    weather: { series: a.weather, summary, baseline: a.baseline, verdict, error: a.weatherError },
    photos,
    extent: { affectedHa, parcelHa: parcel.areaHa, percent: Math.round(percent * 10) / 10 },
    duration: { days: daysInclusive(input.start, input.end) },
    severity: input.severity,
    rules: a.rules,
    notice: { workingDays: a.noticeWorkingDays, deadline, daysLeft, passed },
    warnings,
    isDemo: a.farm.isDemo || !!parcel.isDemo,
  };
}

/** Retrieval queries used to pick rule passages for the report, per reason. */
export function ruleQueryFor(reason: MissedReason, action: 'mowing' | 'grazing'): string {
  const base = action === 'mowing' ? 'niitmine niite koristamine mowing requirement' : 'karjatamine grazing requirement';
  const weather = reason === 'too-wet' || reason === 'drought' ? ' vääramatu jõud erandlikud asjaolud force majeure exceptional circumstances' : '';
  return base + weather;
}
