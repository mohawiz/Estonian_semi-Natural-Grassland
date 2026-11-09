// Browsing PRIA's public heritage meadow register for all of Estonia: national
// totals, the meadow areas inside the visible map area, and details for one.
import { findAtPoint, fromPria, PRIA_WFS, wfs, withHabitat, type MeadowCandidate } from './landData';

export interface RegisterSummary {
  year: number;
  count: number;
  areaHa: number;
  mowing: number;
  grazing: number;
  other: number;
  wooded: number;
  withStartDate: number;
  fetchedAt: string;
}

const SUMMARY_KEY = 'pria-register-summary:v1';
const SUMMARY_TTL_MS = 24 * 3600_000;

/** Totals over every registered heritage meadow area (about 6,000 rows, ~70 KB). */
export async function registerSummary(signal?: AbortSignal): Promise<RegisterSummary> {
  try {
    const cached = JSON.parse(localStorage.getItem(SUMMARY_KEY) ?? 'null') as RegisterSummary | null;
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < SUMMARY_TTL_MS) return cached;
  } catch {
    /* no cache */
  }
  const q = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'pria_avalik:pria_plk_alad',
    outputFormat: 'application/json',
    propertyName: 'taotlusaasta,pindala_ha,hooldamise_vote,parandniidu_tyyp,niitmise_karjatamise_algus_kp',
    count: '50000',
  });
  const res = await fetch(`${PRIA_WFS}?${q}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const rows: Record<string, any>[] = (json.features ?? []).map((f: any) => f.properties ?? {});
  const s: RegisterSummary = {
    year: Math.max(...rows.map((r) => Number(r.taotlusaasta) || 0), new Date().getFullYear() - 1),
    count: rows.length,
    areaHa: Math.round(rows.reduce((a, r) => a + (Number(r.pindala_ha) || 0), 0)),
    mowing: rows.filter((r) => r.hooldamise_vote === 'N').length,
    grazing: rows.filter((r) => r.hooldamise_vote === 'K').length,
    other: rows.filter((r) => r.hooldamise_vote !== 'N' && r.hooldamise_vote !== 'K').length,
    wooded: rows.filter((r) => String(r.parandniidu_tyyp ?? '').startsWith('PN')).length,
    withStartDate: rows.filter((r) => r.niitmise_karjatamise_algus_kp).length,
    fetchedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(s));
  } catch {
    /* fine without a cache */
  }
  return s;
}

/** The view is too large to list meadows below this zoom (Leaflet zoom levels). */
export const LIST_MIN_ZOOM = 11;
export const LIST_MAX = 400;

/** Heritage meadow areas whose shape touches the box. */
export async function meadowsInBox(b: { west: number; south: number; east: number; north: number }, signal?: AbortSignal): Promise<{ items: MeadowCandidate[]; truncated: boolean }> {
  const filter = `BBOX(geom,${b.west},${b.south},${b.east},${b.north},'EPSG:4326')`;
  const items = (await wfs(PRIA_WFS, 'pria_avalik:pria_plk_alad', filter, signal, LIST_MAX + 1)).map(fromPria);
  return { items: items.slice(0, LIST_MAX).sort((x, y) => y.areaHa - x.areaHa), truncated: items.length > LIST_MAX };
}

export interface MeadowDetails extends MeadowCandidate {
  cadastralLabel?: string;
}

/** Extra facts for one meadow: habitat type (Environmental Register) and the cadastral unit at its centre. */
export async function meadowDetails(c: MeadowCandidate, signal?: AbortSignal): Promise<MeadowDetails> {
  const [withHab, here] = await Promise.all([withHabitat({ ...c, communityType: c.pria?.meadowType === 'PN' ? 'wooded-meadow' : undefined }, signal), findAtPoint(c.lon, c.lat, signal).catch(() => [] as MeadowCandidate[])]);
  const unit = here.find((x) => x.source === 'cadastre');
  return { ...withHab, cadastralId: unit?.cadastralId, address: unit?.address, cadastralLabel: unit?.label };
}

/** One point per registered meadow area, from public/data/meadow-points.json (built by scripts/meadow-points.mjs). */
export interface MeadowPoint {
  lon: number;
  lat: number;
  meadowNo: string;
  areaId: number;
  /** Short area code only; free-text labels are dropped when the file is built. */
  areaNo: string | null;
  areaHa: number | null;
  maintenance: string | null;
  startDate: string | null;
}

let pointsPromise: Promise<{ points: MeadowPoint[]; fetchedAt: string }> | null = null;

export function meadowPoints(): Promise<{ points: MeadowPoint[]; fetchedAt: string }> {
  pointsPromise ??= fetch(`${import.meta.env.BASE_URL}data/meadow-points.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((j: { fetchedAt: string; points: [number, number, string, number, string | null, number | null, string | null, string | null][] }) => ({
      fetchedAt: j.fetchedAt,
      points: j.points.map(([lon, lat, meadowNo, areaId, areaNo, areaHa, maintenance, startDate]) => ({ lon, lat, meadowNo, areaId, areaNo, areaHa, maintenance, startDate })),
    }))
    .catch((e) => {
      pointsPromise = null; // try again next time
      throw e;
    });
  return pointsPromise;
}
