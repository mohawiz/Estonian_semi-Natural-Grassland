// Real Sentinel-2 vegetation index (NDVI) for a plot's outline.
//
// Scenes are found in Microsoft Planetary Computer's open STAC catalogue, and
// its open data API computes statistics over the plot polygon on the server, so
// each date costs one small request instead of megabytes of imagery. No key or
// account is needed. Per date we get the share of the field that is clear
// (scene classification: vegetation or bare soil, not cloud, shadow or snow)
// and the NDVI over the field; only clear dates are kept.
//
// A sharp NDVI drop between two clear dates is shown as a *possible* mowing.
// Grazing, drought, flooding or a misclassified cloud can cause drops too, so
// this is an indication to check, never proof — the UI says so.
import { daysInclusive } from '../lib/dates';
import type { Boundary } from '../lib/geo';
import type { LogEntry } from '../lib/types';

export const STAC_SEARCH = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
export const STATS_API = 'https://planetarycomputer.microsoft.com/api/data/v1/item/statistics';

export const SATELLITE_SOURCE = {
  name: 'Copernicus Sentinel-2 L2A via Microsoft Planetary Computer',
  url: 'https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a',
  licence: 'Contains modified Copernicus Sentinel data (free and open)',
};

/** Minimum share of the field that must be clear for a date to count. */
export const MIN_CLEAR = 0.8;
/** Scene-level cloud filter applied before asking for field statistics. */
const MAX_SCENE_CLOUD = 70;
/** NDVI drop that counts as a possible mowing, and the NDVI it must start from. */
export const DROP = 0.15;
const DROP_FROM = 0.55;
const MAX_GAP_DAYS = 25;
/** Grass fades naturally in autumn; drops after this day of the year are not marked. */
const LAST_SIGNAL_MMDD = '09-30';
const CONCURRENCY = 6;

export interface Scene {
  id: string;
  date: string;
  cloud: number;
  baseline: string;
}

export interface NdviPoint {
  date: string;
  ndvi: number;
  clear: number;
  sceneId: string;
}

export interface NdviSeries {
  points: NdviPoint[];
  scenesChecked: number;
  start: string;
  end: string;
  fetchedAt: string;
}

export interface MowingSignal {
  /** Last clear date before the drop. */
  from: string;
  /** First clear date after the drop. */
  date: string;
  before: number;
  after: number;
}

export class SatelliteError extends Error {
  constructor(
    public code: 'network' | 'no-scenes',
    message: string,
  ) {
    super(message);
  }
}

async function post(url: string, body: unknown, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new SatelliteError('network', 'network');
  }
  if (!res.ok) throw new SatelliteError('network', `HTTP ${res.status}`);
  return res.json();
}

/** All Sentinel-2 scenes over the plot, one per date (the least cloudy where tiles overlap). */
export async function searchScenes(boundary: Boundary, start: string, end: string, signal?: AbortSignal): Promise<Scene[]> {
  const byDate = new Map<string, Scene>();
  let body: any = {
    collections: ['sentinel-2-l2a'],
    intersects: boundary,
    datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
    query: { 'eo:cloud_cover': { lt: MAX_SCENE_CLOUD } },
    limit: 250,
  };
  for (let page = 0; page < 8 && body; page++) {
    const json = await post(STAC_SEARCH, body, signal);
    for (const f of json.features ?? []) {
      const p = f.properties ?? {};
      const s: Scene = { id: f.id, date: String(p.datetime).slice(0, 10), cloud: Number(p['eo:cloud_cover'] ?? 100), baseline: String(p['s2:processing_baseline'] ?? '05.00') };
      const prev = byDate.get(s.date);
      if (!prev || s.cloud < prev.cloud) byDate.set(s.date, s);
    }
    const next = (json.links ?? []).find((l: any) => l.rel === 'next');
    body = next?.body ? { ...body, ...next.body } : null;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** NDVI expression for a scene: from processing baseline 04.00 (2022) the data carry a +1000 offset. */
export function ndviExpression(baseline: string): string {
  return baseline >= '04.00' ? '(B08-B04)/(B08+B04-2000)' : '(B08-B04)/(B08+B04)';
}
const CLEAR_EXPR = '((SCL==4)|(SCL==5))*1.0';

/** Clear share and mean NDVI of the field on one date. */
export async function fieldStats(scene: Scene, boundary: Boundary, signal?: AbortSignal): Promise<{ clear: number; ndvi: number } | null> {
  const ndviExpr = ndviExpression(scene.baseline);
  const q = new URLSearchParams({ collection: 'sentinel-2-l2a', item: scene.id, expression: `${CLEAR_EXPR};${ndviExpr}`, asset_as_band: 'true' });
  const json = await post(`${STATS_API}?${q}`, { type: 'Feature', properties: {}, geometry: boundary }, signal);
  const stats = json?.properties?.statistics ?? {};
  const clear = stats[CLEAR_EXPR]?.mean;
  const ndvi = stats[ndviExpr]?.median ?? stats[ndviExpr]?.mean;
  if (typeof clear !== 'number' || typeof ndvi !== 'number' || !Number.isFinite(ndvi)) return null;
  return { clear, ndvi };
}

/** The plot's NDVI over a period: every clear date, with progress reports. */
export async function getNdviSeries(boundary: Boundary, start: string, end: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<NdviSeries> {
  const scenes = await searchScenes(boundary, start, end, signal);
  if (!scenes.length) throw new SatelliteError('no-scenes', 'no-scenes');
  const points: NdviPoint[] = [];
  let done = 0;
  let failures = 0;
  const queue = [...scenes];
  onProgress?.(0, scenes.length);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        try {
          const r = await fieldStats(s, boundary, signal);
          if (r && r.clear >= MIN_CLEAR) points.push({ date: s.date, ndvi: Math.round(r.ndvi * 1000) / 1000, clear: Math.round(r.clear * 100) / 100, sceneId: s.id });
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          failures++; // one failed date should not hide the rest
        }
        onProgress?.(++done, scenes.length);
      }
    }),
  );
  if (failures === scenes.length) throw new SatelliteError('network', 'network');
  return { points: points.sort((a, b) => a.date.localeCompare(b.date)), scenesChecked: scenes.length, start, end, fetchedAt: new Date().toISOString() };
}

/** Sharp drops between consecutive clear dates: possible mowing (or grazing, flooding...). */
export function mowingSignals(points: NdviPoint[]): MowingSignal[] {
  const out: MowingSignal[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.ndvi >= DROP_FROM && a.ndvi - b.ndvi >= DROP && daysInclusive(a.date, b.date) - 1 <= MAX_GAP_DAYS && b.date.slice(5) <= LAST_SIGNAL_MMDD) out.push({ from: a.date, date: b.date, before: a.ndvi, after: b.ndvi });
  }
  return out;
}

export type SignalMatch = { kind: 'matched'; entry: LogEntry; signal: MowingSignal } | { kind: 'recorded-not-seen'; entry: LogEntry; checkable: boolean } | { kind: 'seen-not-recorded'; signal: MowingSignal };

/**
 * Pair mowing records with drops. A record matches a drop when its mowing
 * falls between the last clear date before the drop and the first one after
 * (± 2 days). A record is only "not seen" when clear dates exist around it.
 */
export function matchRecords(entries: LogEntry[], signals: MowingSignal[], points: NdviPoint[]): SignalMatch[] {
  const used = new Set<MowingSignal>();
  const out: SignalMatch[] = [];
  const near = (d: string, from: string, to: string) => daysInclusive(from, d) >= -1 && daysInclusive(d, to) >= -1;
  for (const e of entries.filter((x) => x.kind === 'mowing')) {
    const end = e.endDate ?? e.date;
    const s = signals.find((x) => !used.has(x) && (near(e.date, x.from, x.date) || near(end, x.from, x.date)));
    if (s) {
      used.add(s);
      out.push({ kind: 'matched', entry: e, signal: s });
    } else {
      const before = points.some((p) => p.date <= e.date && daysInclusive(p.date, e.date) <= MAX_GAP_DAYS);
      const after = points.some((p) => p.date >= end && daysInclusive(end, p.date) <= MAX_GAP_DAYS);
      out.push({ kind: 'recorded-not-seen', entry: e, checkable: before && after });
    }
  }
  for (const s of signals) if (!used.has(s)) out.push({ kind: 'seen-not-recorded', signal: s });
  const key = (m: SignalMatch) => (m.kind === 'seen-not-recorded' ? m.signal.date : m.entry.date);
  return out.sort((a, b) => key(a).localeCompare(key(b)));
}

// ---- small per-browser cache (series are a few KB) -------------------------
const CACHE_PREFIX = 'ndvi:v1:';
const CACHE_TTL_MS = 12 * 3600_000;

export function cacheKey(parcelId: string, boundary: Boundary, start: string, end: string): string {
  const s = JSON.stringify(boundary);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return `${CACHE_PREFIX}${parcelId}:${h}:${start}:${end}`;
}

export function readCache(key: string): NdviSeries | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v && Date.now() - Date.parse(v.fetchedAt) < CACHE_TTL_MS ? (v as NdviSeries) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, series: NdviSeries): void {
  try {
    localStorage.setItem(key, JSON.stringify(series));
  } catch {
    /* storage full or blocked: the series simply reloads next time */
  }
}
