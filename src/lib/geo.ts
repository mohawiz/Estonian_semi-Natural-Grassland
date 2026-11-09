// Small geometry helpers for plot boundaries. Coordinates are GeoJSON order:
// [longitude, latitude] in WGS 84, unless a function says otherwise.

export type Ring = [number, number][];
export type Boundary = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

export function polygons(b: Boundary): Ring[][] {
  return b.type === 'Polygon' ? [b.coordinates] : b.coordinates;
}

/** Area of a ring on the sphere, m² (always positive). Accurate to well under 1% for field-sized shapes. */
function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
  }
  return Math.abs((s * R * R) / 2);
}

/** Area in hectares; holes are subtracted. */
export function areaHa(b: Boundary): number {
  let m2 = 0;
  for (const poly of polygons(b)) poly.forEach((ring, i) => (m2 += i === 0 ? ringArea(ring) : -ringArea(ring)));
  return m2 / 10000;
}

export function bbox(b: Boundary): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polygons(b))
    for (const [x, y] of poly[0]) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1];
}

function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function contains(b: Boundary, p: [number, number]): boolean {
  return polygons(b).some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((hole) => inRing(p, hole)));
}

/** A point for weather lookups: the area-weighted centroid, moved inside the shape if it falls outside (e.g. a C-shaped field). */
export function centre(b: Boundary): [number, number] {
  let ax = 0;
  let ay = 0;
  let aw = 0;
  for (const poly of polygons(b)) {
    const ring = poly[0];
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      const c = x1 * y2 - x2 * y1;
      ax += (x1 + x2) * c;
      ay += (y1 + y2) * c;
      aw += c;
    }
  }
  const c: [number, number] = aw ? [ax / (3 * aw), ay / (3 * aw)] : polygons(b)[0][0][0];
  if (contains(b, c)) return c;
  // fall back to the vertex nearest the centroid, nudged towards the centre of its own polygon
  const ring = polygons(b)[0][0];
  const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const my = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return contains(b, [mx, my]) ? [mx, my] : ring[0];
}

/** Total vertex count, to keep stored boundaries small. */
export function vertexCount(b: Boundary): number {
  return polygons(b).reduce((s, poly) => s + poly.reduce((t, r) => t + r.length, 0), 0);
}

export function isBoundary(v: unknown): v is Boundary {
  const g = v as Boundary;
  return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates) && g.coordinates.length > 0;
}

// ---- L-EST97 (EPSG:3301) → WGS 84 -------------------------------------------
// Lambert conformal conic on GRS80, the Estonian national grid used by the
// Land Board, the cadastre and most Estonian GIS files.
const A = 6378137;
const F = 1 / 298.257222101;
const E = Math.sqrt(2 * F - F * F);
const LAT1 = rad(59 + 20 / 60);
const LAT2 = rad(58);
const LAT0 = rad(57.51755393055556);
const LON0 = rad(24);
const X0 = 500000;
const Y0 = 6375000;
const m = (p: number) => Math.cos(p) / Math.sqrt(1 - E * E * Math.sin(p) ** 2);
const t = (p: number) => Math.tan(Math.PI / 4 - p / 2) / ((1 - E * Math.sin(p)) / (1 + E * Math.sin(p))) ** (E / 2);
const N_ = (Math.log(m(LAT1)) - Math.log(m(LAT2))) / (Math.log(t(LAT1)) - Math.log(t(LAT2)));
const F_ = m(LAT1) / (N_ * t(LAT1) ** N_);
const RHO0 = A * F_ * t(LAT0) ** N_;

/** Convert an L-EST97 easting/northing (metres) to [lon, lat]. */
export function lest97ToWgs84(x: number, y: number): [number, number] {
  const dx = x - X0;
  const dy = RHO0 - (y - Y0);
  const rho = Math.sign(N_) * Math.sqrt(dx * dx + dy * dy);
  const tt = (rho / (A * F_)) ** (1 / N_);
  const theta = Math.atan2(dx, dy);
  let lat = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 8; i++) {
    const es = E * Math.sin(lat);
    lat = Math.PI / 2 - 2 * Math.atan(tt * ((1 - es) / (1 + es)) ** (E / 2));
  }
  const lon = theta / N_ + LON0;
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** Do these coordinates look like L-EST97 metres rather than degrees? */
export function looksLikeLest97([x, y]: [number, number]): boolean {
  return x > 300000 && x < 800000 && y > 6300000 && y < 6700000;
}

/** Return the boundary in WGS 84, converting from L-EST97 when needed. */
export function toWgs84(b: Boundary): Boundary {
  const first = polygons(b)[0]?.[0]?.[0];
  if (!first || !looksLikeLest97(first)) return b;
  const conv = (r: Ring): Ring => r.map(([x, y]) => lest97ToWgs84(x, y));
  return b.type === 'Polygon' ? { type: 'Polygon', coordinates: b.coordinates.map(conv) } : { type: 'MultiPolygon', coordinates: b.coordinates.map((p) => p.map(conv)) };
}

/** Is a [lon, lat] point within Estonia's rough bounds (incl. islands)? */
export function inEstonia([lon, lat]: [number, number]): boolean {
  return lat >= 57.5 && lat <= 59.8 && lon >= 21.5 && lon <= 28.3;
}

/** Round coordinates to ~1 cm to keep storage and exports small. */
export function roundBoundary(b: Boundary, digits = 7): Boundary {
  const k = 10 ** digits;
  const r = (ring: Ring): Ring => ring.map(([x, y]) => [Math.round(x * k) / k, Math.round(y * k) / k]);
  return b.type === 'Polygon' ? { type: 'Polygon', coordinates: b.coordinates.map(r) } : { type: 'MultiPolygon', coordinates: b.coordinates.map((p) => p.map(r)) };
}
