// A plain-language "where could questions come up?" gauge for one parcel.
// Decision support only: the weights below are this tool's own rule of thumb,
// not PRIA's or the Environmental Board's assessment, and the UI says so.
import { addWorkingDays } from '../lib/dates';
import type { ChecklistState, LogEntry, Parcel, SavedReport } from '../lib/types';
import type { EvidenceVerdict } from './report';

export type RiskFactorKey =
  | 'no-maintenance-logged'
  | 'missed-without-photos'
  | 'missed-weather-unsupported'
  | 'notice-passed-no-report'
  | 'checklist-no'
  | 'checklist-unsure'
  | 'checklist-empty';

export type RiskHelpKey = 'maintenance-logged' | 'missed-documented' | 'report-saved' | 'checklist-complete';

export interface RiskResult {
  score: number; // 0..100
  level: 'low' | 'medium' | 'high';
  factors: { key: RiskFactorKey; points: number; count?: number }[];
  helps: RiskHelpKey[];
}

export interface RiskInput {
  parcel: Parcel;
  entries: LogEntry[];
  checklist?: ChecklistState;
  reports: SavedReport[];
  /** Weather verdict per missed-entry id, when weather has been loaded. */
  verdicts?: Record<string, EvidenceVerdict>;
  noticeWorkingDays: number;
  today: string;
  season: { start: string; end: string };
}

export function computeRisk(i: RiskInput): RiskResult {
  const own = i.entries.filter((e) => e.parcelId === i.parcel.id);
  const inSeason = (e: LogEntry) => e.date <= i.season.end && (e.endDate ?? e.date) >= i.season.start;
  const done = own.filter((e) => e.kind !== 'missed' && inSeason(e));
  const missed = own.filter((e) => e.kind === 'missed' && inSeason(e));
  const factors: RiskResult['factors'] = [];
  const helps: RiskHelpKey[] = [];

  if (!done.length) factors.push({ key: 'no-maintenance-logged', points: 30 });
  else helps.push('maintenance-logged');

  const noPhotos = missed.filter((e) => !e.photoIds.length);
  if (noPhotos.length) factors.push({ key: 'missed-without-photos', points: Math.min(30, 15 * noPhotos.length), count: noPhotos.length });
  else if (missed.length) helps.push('missed-documented');

  const unsupported = missed.filter((e) => i.verdicts?.[e.id] === 'does-not-support');
  if (unsupported.length) factors.push({ key: 'missed-weather-unsupported', points: 20, count: unsupported.length });

  const reported = (e: LogEntry) => i.reports.some((r) => r.parcelId === i.parcel.id && r.input.start <= (e.endDate ?? e.date) && r.input.end >= e.date);
  const late = missed.filter((e) => i.today > addWorkingDays(e.date, i.noticeWorkingDays) && !reported(e));
  if (late.length) factors.push({ key: 'notice-passed-no-report', points: 15, count: late.length });
  if (missed.some(reported)) helps.push('report-saved');

  const answers = Object.values(i.checklist?.answers ?? {});
  const no = answers.filter((a) => a === 'no').length;
  const unsure = answers.filter((a) => a === 'unsure').length;
  if (!answers.length) factors.push({ key: 'checklist-empty', points: 5 });
  if (no) factors.push({ key: 'checklist-no', points: Math.min(24, no * 8), count: no });
  if (unsure) factors.push({ key: 'checklist-unsure', points: Math.min(9, unsure * 3), count: unsure });
  if (answers.length >= 8 && !no) helps.push('checklist-complete');

  const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  return { score, level: score < 25 ? 'low' : score < 55 ? 'medium' : 'high', factors, helps };
}
