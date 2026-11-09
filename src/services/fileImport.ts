// Plot outlines from a file the farmer already has: GeoJSON, KML (Google Earth,
// many map apps) or a zipped shapefile (GIS software, consultants). Estonian
// files are often in L-EST97 metres; those are converted to WGS 84.
import { areaHa, centre, isBoundary, roundBoundary, toWgs84, type Boundary, type Ring } from '../lib/geo';
import { LandDataError, type MeadowCandidate } from './landData';

const MAX_FEATURES = 50;

type GeoFeature = { geometry: unknown; properties?: Record<string, unknown> | null };

function featuresOf(json: any): GeoFeature[] {
  if (!json || typeof json !== 'object') return [];
  if (json.type === 'FeatureCollection') return json.features ?? [];
  if (json.type === 'Feature') return [json];
  if (isBoundary(json)) return [{ geometry: json }];
  if (Array.isArray(json)) return json.flatMap(featuresOf); // shpjs returns one collection per layer
  return [];
}

const NAME_KEYS = ['name', 'nimi', 'Name', 'NIMI', 'title', 'label', 'tunnus', 'parandniidu_nr', 'id'];

function nameOf(p: Record<string, unknown> | null | undefined, fallback: string): string {
  for (const k of NAME_KEYS) {
    const v = p?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
    if (typeof v === 'number') return String(v);
  }
  return fallback;
}

export function candidatesFromGeoJSON(json: unknown, fileName: string): MeadowCandidate[] {
  const out: MeadowCandidate[] = [];
  featuresOf(json).forEach((f, i) => {
    if (!isBoundary(f.geometry) || out.length >= MAX_FEATURES) return;
    const boundary = roundBoundary(toWgs84(f.geometry as Boundary));
    const [lon, lat] = centre(boundary);
    const label = nameOf(f.properties, `${fileName} #${i + 1}`);
    out.push({ source: 'file', ref: `${fileName}#${i + 1}`, label, boundary, areaHa: Math.round(areaHa(boundary) * 100) / 100, lat, lon });
  });
  return out;
}

function kmlRing(el: Element | null): Ring | null {
  const text = el?.getElementsByTagName('coordinates')[0]?.textContent ?? '';
  const pts = text
    .trim()
    .split(/\s+/)
    .map((s) => s.split(',').map(Number))
    .filter((c) => c.length >= 2 && c.every((n) => Number.isFinite(n)))
    .map((c) => [c[0], c[1]] as [number, number]);
  return pts.length >= 3 ? pts : null;
}

export function candidatesFromKML(text: string, fileName: string): MeadowCandidate[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new LandDataError('invalid', 'fileUnreadable');
  const features: GeoFeature[] = [];
  for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
    const polys: Ring[][] = [];
    for (const poly of Array.from(pm.getElementsByTagName('Polygon'))) {
      const outer = kmlRing(poly.getElementsByTagName('outerBoundaryIs')[0] ?? null);
      if (!outer) continue;
      const holes = Array.from(poly.getElementsByTagName('innerBoundaryIs'))
        .map(kmlRing)
        .filter((r): r is Ring => !!r);
      polys.push([outer, ...holes]);
    }
    if (!polys.length) continue;
    const name = pm.getElementsByTagName('name')[0]?.textContent ?? '';
    features.push({ geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }, properties: { name } });
  }
  return candidatesFromGeoJSON({ type: 'FeatureCollection', features }, fileName);
}

/** Read a GeoJSON, KML or zipped-shapefile file into plot candidates. */
export async function candidatesFromFile(file: File): Promise<MeadowCandidate[]> {
  if (file.size > 20 * 1024 * 1024) throw new LandDataError('invalid', 'fileTooLarge');
  const name = file.name.replace(/\.[^.]+$/, '');
  const ext = file.name.toLowerCase().split('.').pop();
  let found: MeadowCandidate[];
  try {
    if (ext === 'zip') {
      const { default: shp } = await import('shpjs');
      found = candidatesFromGeoJSON(await shp(await file.arrayBuffer()), name);
    } else if (ext === 'kml') {
      found = candidatesFromKML(await file.text(), name);
    } else {
      found = candidatesFromGeoJSON(JSON.parse(await file.text()), name);
    }
  } catch (e) {
    if (e instanceof LandDataError) throw e;
    throw new LandDataError('invalid', 'fileUnreadable');
  }
  if (!found.length) throw new LandDataError('not-found', 'fileNoShapes');
  if (found.some((c) => c.lat < 57 || c.lat > 60.2 || c.lon < 21 || c.lon > 28.8)) throw new LandDataError('invalid', 'fileOutsideEstonia');
  return found;
}
