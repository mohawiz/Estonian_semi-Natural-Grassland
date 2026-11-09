// Builds public/data/meadow-points.json: one point per registered heritage
// meadow area in PRIA's public register (centre, numbers, area, maintenance
// choice, start date). The national map draws these as dots: the full outlines
// are ~17 MB, the points ~100 KB. Run before each build; if PRIA cannot be
// reached the last committed file is kept, so builds never fail because of it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'public/data/meadow-points.json';
const WFS = 'https://kls.pria.ee/geoserver/pria_avalik/ows';
const PAGE = 1000;

function centre(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let ax = 0, ay = 0, aw = 0;
  for (const ring of polys.map((p) => p[0])) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      const c = x1 * y2 - x2 * y1;
      ax += (x1 + x2) * c;
      ay += (y1 + y2) * c;
      aw += c;
    }
  }
  if (aw) return [ax / (3 * aw), ay / (3 * aw)];
  const r = polys[0][0];
  return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
}

// PRIA's area label is free text and sometimes holds a person's name: keep short codes only
const safeLabel = (v) => {
  const s = String(v ?? '').trim().toUpperCase();
  return /^[0-9]{1,3}[A-Z]{0,2}$/.test(s) ? s : null;
};

const tallinnDate = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date(iso)) : null);

async function fetchAll() {
  const rows = [];
  for (let start = 0; ; start += PAGE) {
    const q = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'pria_avalik:pria_plk_alad',
      outputFormat: 'application/json', srsName: 'EPSG:4326', count: String(PAGE), startIndex: String(start), sortBy: 'parandniidu_ala_id',
    });
    const res = await fetch(`${WFS}?${q}`, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    for (const f of json.features ?? []) {
      if (!f.geometry) continue;
      const p = f.properties;
      const [lon, lat] = centre(f.geometry);
      rows.push([
        Math.round(lon * 1e5) / 1e5,
        Math.round(lat * 1e5) / 1e5,
        String(p.parandniidu_nr ?? '').replace(/\.0+$/, ''),
        p.parandniidu_ala_id,
        safeLabel(p.ala_nr),
        typeof p.pindala_ha === 'number' ? p.pindala_ha : null,
        p.hooldamise_vote ?? null,
        tallinnDate(p.niitmise_karjatamise_algus_kp),
      ]);
    }
    if ((json.features ?? []).length < PAGE) break;
  }
  return rows;
}

try {
  const t0 = Date.now();
  const points = await fetchAll();
  if (points.length < 1000) throw new Error(`only ${points.length} meadows returned`);
  mkdirSync('public/data', { recursive: true });
  const fields = ['lon', 'lat', 'meadowNo', 'areaId', 'areaNo', 'areaHa', 'maintenance', 'startDate'];
  writeFileSync(OUT, JSON.stringify({ source: "PRIA public heritage meadow register (pria_avalik:pria_plk_alad)", fetchedAt: new Date().toISOString(), fields, points }));
  console.log(`meadow-points: ${points.length} meadow areas in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${OUT}`);
} catch (e) {
  try {
    const old = JSON.parse(readFileSync(OUT, 'utf8'));
    console.warn(`meadow-points: PRIA not reachable (${e.message}); keeping the file from ${old.fetchedAt}`);
  } catch {
    console.warn(`meadow-points: PRIA not reachable (${e.message}) and no earlier file; the map will show outlines only when zoomed in`);
  }
}
