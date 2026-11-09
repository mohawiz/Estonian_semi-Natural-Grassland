// Real plot data from open Estonian map services (WFS, no key, CORS open):
// - PRIA's public heritage meadow register (pria_avalik:pria_plk_alad): outline,
//   area, meadow type, maintenance choice and the mowing/grazing start date.
// - The Land Board cadastre (kataster:ky_kehtiv): cadastral unit outline and address.
// - The Environmental Register (eelis:kr_plk): semi-natural habitat type, used to
//   suggest the community type.
// None of these return owner names. X-tee services need a member organisation
// and are not used.
import { areaHa, bbox, centre, contains, isBoundary, roundBoundary, toWgs84, type Boundary } from '../lib/geo';
import type { CommunityType, Parcel, PriaMeadowInfo } from '../lib/types';

export const PRIA_WFS = 'https://kls.pria.ee/geoserver/pria_avalik/ows';
export const PRIA_WMS = 'https://kls.pria.ee/geoserver/pria_avalik/wms';
export const CADASTRE_WFS = 'https://gsavalik.envir.ee/geoserver/kataster/ows';
export const EELIS_WFS = 'https://gsavalik.envir.ee/geoserver/eelis/ows';

export interface MeadowCandidate {
  source: 'pria' | 'cadastre' | 'file';
  /** Stable reference: PRIA meadow + area number, cadastral id, or file name. */
  ref: string;
  label: string;
  boundary: Boundary;
  areaHa: number;
  lat: number;
  lon: number;
  communityType?: CommunityType;
  plannedMethod?: Parcel['plannedMethod'];
  pria?: PriaMeadowInfo;
  cadastralId?: string;
  address?: string;
  habitatCode?: string;
}

export class LandDataError extends Error {
  constructor(
    public code: 'network' | 'not-found' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/** Plain-language habitat for an EU habitat code from the Environmental Register. */
export function communityFromHabitat(code?: string | null): CommunityType | undefined {
  if (!code) return undefined;
  const c = code.replace('*', '');
  if (c === '1630' || c === '1620') return 'coastal-meadow';
  if (c === '6280') return 'alvar';
  if (c === '6450') return 'floodplain-meadow';
  if (c === '6530' || c === '9070') return 'wooded-meadow';
  if (['6210', '6270', '6510', '5130', '4030'].includes(c)) return 'dry-meadow';
  if (['7230', '6410', '6430', '7140', '7210'].includes(c)) return 'fen-meadow';
  return 'other';
}

/** PRIA stores dates as UTC midnight of the Estonian date (e.g. 2026-05-30T21:00:00Z = 31 May). */
export function estonianDate(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(d);
}

/** PRIA's area label is free text, and some applicants typed a person's name in it. Only short codes are shown. */
export function safeAreaLabel(v: unknown): string | undefined {
  const s = String(v ?? '').trim().toUpperCase();
  return /^[0-9]{1,3}[A-Z]{0,2}$/.test(s) ? s : undefined;
}

type T = (key: string, vars?: Record<string, string | number>) => string;

/** "Heritage meadow 48250239357, area 1", or with the area's size when it has no safe label. */
export function meadowTitle(c: Pick<MeadowCandidate, 'pria' | 'areaHa'>, t: T): string {
  const p = c.pria!;
  return p.areaNo ? t('find.priaArea', { no: p.meadowNo, area: p.areaNo }) : t('find.priaAreaSized', { no: p.meadowNo, ha: c.areaHa });
}

export function methodFromPria(code?: string | null): Parcel['plannedMethod'] | undefined {
  if (code === 'N') return 'mowing';
  if (code === 'K') return 'grazing';
  return undefined;
}

export type Feature = { geometry: unknown; properties: Record<string, any> };

export async function wfs(base: string, typeName: string, filter: string, signal?: AbortSignal, count = 50): Promise<Feature[]> {
  const q = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count: String(count),
    cql_filter: filter,
  });
  let res: Response;
  try {
    res = await fetch(`${base}?${q}`, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new LandDataError('network', 'Could not reach the map service. Check your internet connection and try again.');
  }
  if (!res.ok) throw new LandDataError('network', `The map service answered with an error (HTTP ${res.status}). Try again later.`);
  const json = await res.json().catch(() => null);
  if (!json || !Array.isArray(json.features)) throw new LandDataError('network', 'The map service sent an unexpected answer. Try again later.');
  return json.features.filter((f: Feature) => isBoundary(f.geometry));
}

const point = (lon: number, lat: number) => `SRID=4326;POINT(${lon} ${lat})`;
const bboxFilter = (geomField: string, b: Boundary) => {
  const [x0, y0, x1, y1] = bbox(b);
  // GeoServer's CQL reads 'EPSG:4326' as longitude-first (checked against the live service)
  return `BBOX(${geomField},${x0},${y0},${x1},${y1},'EPSG:4326')`;
};

export function fromPria(f: Feature): MeadowCandidate {
  const p = f.properties;
  const boundary = roundBoundary(toWgs84(f.geometry as Boundary));
  const [lon, lat] = centre(boundary);
  const meadowType = String(p.parandniidu_tyyp ?? '').split('-')[0] || 'MN';
  const meadowNo = String(p.parandniidu_nr ?? '').replace(/\.0+$/, '');
  const pria: PriaMeadowInfo = {
    meadowNo,
    areaNo: safeAreaLabel(p.ala_nr),
    areaId: typeof p.parandniidu_ala_id === 'number' ? p.parandniidu_ala_id : undefined,
    year: Number(p.taotlusaasta) || new Date().getFullYear(),
    meadowType,
    maintenance: p.hooldamise_vote ?? undefined,
    startDate: estonianDate(p.niitmise_karjatamise_algus_kp),
    coastalExtra: String(p.rannaalade_lisanoue) === 'true',
    officialAreaHa: typeof p.pindala_ha === 'number' ? p.pindala_ha : undefined,
  };
  return {
    source: 'pria',
    ref: pria.areaId !== undefined ? `${meadowNo}/${pria.areaId}` : meadowNo,
    label: meadowNo,
    boundary,
    areaHa: pria.officialAreaHa ?? Math.round(areaHa(boundary) * 100) / 100,
    lat,
    lon,
    communityType: meadowType === 'PN' ? 'wooded-meadow' : pria.coastalExtra ? 'coastal-meadow' : undefined,
    plannedMethod: methodFromPria(pria.maintenance),
    pria,
  };
}

function fromCadastre(f: Feature): MeadowCandidate {
  const p = f.properties;
  const boundary = roundBoundary(toWgs84(f.geometry as Boundary));
  const [lon, lat] = centre(boundary);
  const id = String(p.tunnus);
  const official = typeof p.pindala === 'number' ? p.pindala / 10000 : undefined;
  return {
    source: 'cadastre',
    ref: id,
    label: p.l_aadress ? `${id} · ${p.l_aadress}` : id,
    boundary,
    areaHa: Math.round((official ?? areaHa(boundary)) * 100) / 100,
    lat,
    lon,
    cadastralId: id,
    address: [p.l_aadress, p.ay_nimi, p.ov_nimi].filter(Boolean).join(', ') || undefined,
  };
}

/** Normalize what a farmer types: spaces, dashes and a missing colon are common. */
export function normalizeCadastralId(s: string): string | null {
  const digits = s.replace(/\D/g, '');
  if (digits.length !== 12) return null;
  return `${digits.slice(0, 5)}:${digits.slice(5, 8)}:${digits.slice(8)}`;
}

export function normalizeMeadowNo(s: string): string | null {
  const digits = s.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 14 ? digits : null;
}

/** Suggest the community type from the Environmental Register's habitat at the plot's centre. */
export async function withHabitat(c: MeadowCandidate, signal?: AbortSignal): Promise<MeadowCandidate> {
  if (c.communityType) return c;
  try {
    const [h] = await wfs(EELIS_WFS, 'eelis:kr_plk', `INTERSECTS(shape,${point(c.lon, c.lat)})`, signal, 1);
    const code = h?.properties?.pohityyp as string | undefined;
    const coastal = h?.properties?.rannaala === 'Jah';
    return { ...c, habitatCode: code, communityType: coastal ? 'coastal-meadow' : communityFromHabitat(code) };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return c; // the suggestion is optional
  }
}

const byArea = (a: MeadowCandidate, b: MeadowCandidate) => (a.pria?.areaId ?? 0) - (b.pria?.areaId ?? 0);

export async function findByMeadowNo(input: string, signal?: AbortSignal): Promise<MeadowCandidate[]> {
  const no = normalizeMeadowNo(input);
  if (!no) throw new LandDataError('invalid', 'invalidMeadowNo');
  const found = (await wfs(PRIA_WFS, 'pria_avalik:pria_plk_alad', `parandniidu_nr=${no}`, signal)).map(fromPria).sort(byArea);
  if (!found.length) throw new LandDataError('not-found', 'meadowNotFound');
  return Promise.all(found.map((c) => withHabitat(c, signal)));
}

/** The cadastral unit, plus any registered heritage meadow areas inside it. */
export async function findByCadastralId(input: string, signal?: AbortSignal): Promise<MeadowCandidate[]> {
  const id = normalizeCadastralId(input);
  if (!id) throw new LandDataError('invalid', 'invalidCadastralId');
  const [unit] = await wfs(CADASTRE_WFS, 'kataster:ky_kehtiv', `tunnus='${id}'`, signal, 1);
  if (!unit) throw new LandDataError('not-found', 'cadastreNotFound');
  const ky = fromCadastre(unit);
  const meadows = (await wfs(PRIA_WFS, 'pria_avalik:pria_plk_alad', bboxFilter('geom', ky.boundary), signal, 100).catch(() => []))
    .map(fromPria)
    .filter((m) => containsPoint(ky.boundary, m))
    .map((m) => ({ ...m, cadastralId: id, address: ky.address }))
    .sort(byArea);
  return Promise.all([...meadows, ky].map((c) => withHabitat(c, signal)));
}

/** What is at a clicked point: registered heritage meadow areas first, else the cadastral unit. */
export async function findAtPoint(lon: number, lat: number, signal?: AbortSignal): Promise<MeadowCandidate[]> {
  const meadows = (await wfs(PRIA_WFS, 'pria_avalik:pria_plk_alad', `INTERSECTS(geom,${point(lon, lat)})`, signal)).map(fromPria);
  const units = (await wfs(CADASTRE_WFS, 'kataster:ky_kehtiv', `INTERSECTS(geom,${point(lon, lat)})`, signal, 1).catch(() => [])).map(fromCadastre);
  const found = [...meadows.map((m) => ({ ...m, cadastralId: units[0]?.cadastralId, address: units[0]?.address })), ...units];
  if (!found.length) throw new LandDataError('not-found', 'nothingHere');
  return Promise.all(found.map((c) => withHabitat(c, signal)));
}

/** A meadow belongs to a cadastral unit when its interior point lies inside the unit. */
function containsPoint(b: Boundary, c: { lon: number; lat: number }) {
  return contains(b, [c.lon, c.lat]);
}

/** Turn a candidate into the fields a Parcel stores. */
export function candidateToParcelFields(c: MeadowCandidate, fetchedAt = new Date().toISOString()): Pick<Parcel, 'boundary' | 'source' | 'pria' | 'cadastralId' | 'areaHa' | 'lat' | 'lon'> & Partial<Pick<Parcel, 'communityType' | 'plannedMethod' | 'code'>> {
  return {
    boundary: c.boundary,
    source: { kind: c.source, ref: c.ref, fetchedAt },
    pria: c.pria,
    cadastralId: c.cadastralId,
    areaHa: c.areaHa,
    lat: Math.round(c.lat * 1e5) / 1e5,
    lon: Math.round(c.lon * 1e5) / 1e5,
    communityType: c.communityType,
    plannedMethod: c.plannedMethod,
    code: c.pria?.meadowNo ?? c.cadastralId,
  };
}
