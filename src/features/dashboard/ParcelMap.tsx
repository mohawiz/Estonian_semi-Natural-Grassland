// A schematic map of the West-Estonian coast. Coastlines are hand-simplified
// (not survey data) and parcel shapes are illustrative: the app stores a point
// per parcel, not its boundary. Both are labelled on screen.
import { useMemo } from 'react';
import { useApp } from '../../app/store';
import { MorphPath } from '../../components/motion';
import type { Parcel } from '../../lib/types';
import { formatArea } from '../../lib/units';

type LL = [number, number]; // [lon, lat]
const MAINLAND: LL[] = [
  [24.9, 59.25], [23.7, 59.25], [23.42, 59.05], [23.52, 58.95], [23.44, 58.84], [23.62, 58.79], [23.92, 58.775], [23.66, 58.72], [23.54, 58.69],
  [23.62, 58.55], [23.74, 58.42], [24.02, 58.3], [24.28, 58.33], [24.46, 58.37], [24.9, 58.3],
];
const MUHU: LL[] = [[23.04, 58.62], [23.2, 58.68], [23.4, 58.63], [23.36, 58.55], [23.12, 58.55]];
const SAAREMAA: LL[] = [[21.86, 58.5], [22.3, 58.6], [22.8, 58.62], [23.0, 58.55], [22.88, 58.36], [22.5, 58.25], [22.22, 58.14], [22.06, 58.0], [21.96, 58.28]];
const HIIUMAA: LL[] = [[22.05, 58.9], [22.42, 59.08], [22.95, 58.96], [22.76, 58.76], [22.3, 58.75]];

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
}

/** An illustrative field outline, stable per parcel, sized by area. */
function outline(id: string, cx: number, cy: number, r: number) {
  const rnd = hash(id);
  const n = 6 + Math.floor(rnd() * 3);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const rr = r * (0.75 + rnd() * 0.45);
    return [cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr];
  });
  return 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';
}
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

export function ParcelMap({ parcels, selected, onSelect }: { parcels: Parcel[]; selected: string; onSelect: (id: string) => void }) {
  const { t, lang } = useApp();
  const W = 420;
  const H = 300;
  const proj = useMemo(() => {
    let [x0, x1, y0, y1] = [21.8, 24.7, 57.95, 59.2];
    for (const p of parcels) {
      x0 = Math.min(x0, p.lon - 0.15);
      x1 = Math.max(x1, p.lon + 0.15);
      y0 = Math.min(y0, p.lat - 0.1);
      y1 = Math.max(y1, p.lat + 0.1);
    }
    const k = Math.cos((58.6 * Math.PI) / 180);
    const sx = W / ((x1 - x0) * k);
    const sy = H / (y1 - y0);
    const s = Math.min(sx, sy);
    const ox = (W - (x1 - x0) * k * s) / 2;
    const oy = (H - (y1 - y0) * s) / 2;
    return (lon: number, lat: number): [number, number] => [ox + (lon - x0) * k * s, oy + (y1 - lat) * s];
  }, [parcels]);
  const poly = (pts: LL[]) => 'M' + pts.map(([lo, la]) => proj(lo, la).map((v) => v.toFixed(1)).join(' ')).join('L') + 'Z';

  return (
    <div className="map">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t('dash.mapTitle')} style={{ width: '100%', height: 'auto', borderRadius: 16, display: 'block' }}>
        <defs>
          <pattern id="waves" width="14" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 6c3.5-3 7-3 10.5 0" stroke="var(--seaglass)" strokeWidth="0.8" fill="none" opacity="0.45" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="var(--teal-tint)" />
        <rect width={W} height={H} fill="url(#waves)" />
        {[MAINLAND, MUHU, SAAREMAA, HIIUMAA].map((p, i) => (
          <path key={i} d={poly(p)} fill="var(--sheet)" stroke="var(--rule-strong)" strokeWidth="1" />
        ))}
        {(
          [
            ['Saaremaa', 22.45, 58.4],
            ['Hiiumaa', 22.55, 58.88],
            ['Muhu', 23.22, 58.6],
            ['Matsalu', 23.78, 58.8],
          ] as const
        ).map(([name, lo, la]) => {
          const [x, y] = proj(lo, la);
          return (
            <text key={name} x={x} y={y} textAnchor="middle" style={{ font: 'italic 400 12px var(--font-display)', fill: 'var(--ink-3)' }}>
              {name}
            </text>
          );
        })}
        {(() => {
          // place labels above markers, or below when they would collide
          const placed: { x: number; y: number }[] = [];
          return parcels.map((p) => {
          const [x, y] = proj(p.lon, p.lat);
          const r0 = Math.max(9, Math.min(20, 6 + Math.sqrt(p.areaHa) * 3));
          const clash = placed.some((q) => Math.abs(q.x - x) < 80 && Math.abs(q.y - (y - r0 - 6)) < 16);
          const ly = clash ? y + r0 + 16 : y - r0 - 6;
          placed.push({ x, y: ly });
          const on = p.id === selected;
          const r = Math.max(9, Math.min(20, 6 + Math.sqrt(p.areaHa) * 3));
          return (
            <g
              key={p.id}
              className="parcel"
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${p.name}, ${formatArea(p.areaHa, lang)}`}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(p.id))}
            >
              <MorphPath d={on ? outline(p.id, x, y, r * 1.3) : circle(x, y, r * 0.55)} fill={on ? 'var(--hay)' : 'var(--primary)'} stroke={on ? 'var(--peat)' : 'var(--surface)'} strokeWidth={on ? 1.5 : 2} fillOpacity={on ? 0.9 : 1} />
              <text x={x} y={ly} textAnchor="middle" style={{ font: `${on ? 700 : 600} 11.5px var(--font-text)`, fill: 'var(--ink)', paintOrder: 'stroke', stroke: 'var(--sheet)', strokeWidth: 3 }}>
                {p.name}
              </text>
            </g>
          );
          });
        })()}
      </svg>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        {t('dash.mapNote')}
      </p>
    </div>
  );
}
