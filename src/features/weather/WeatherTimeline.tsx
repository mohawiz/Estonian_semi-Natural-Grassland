// The signature element: daily rain bars, max-temperature line and soil-moisture
// line, with the missed-work window shaded like a hay field across the chart.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { formatDate } from '../../lib/dates';
import { formatNumber } from '../../lib/units';
import { HEAVY_DAY_MM, type WeatherDay } from '../../services/weather';

interface Props {
  days: WeatherDay[];
  band?: { start: string; end: string } | null;
  height?: number;
  /** Static rendering for the report/PDF (no hover). */
  staticMode?: boolean;
}

export function WeatherTimeline({ days, band, height = 260, staticMode }: Props) {
  const { t, lang } = useApp();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const figRef = useRef<HTMLElement>(null);
  // Draw at the container's real width so labels stay legible on phones.
  const [W, setW] = useState(760);
  useLayoutEffect(() => {
    const el = figRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.min(1000, Math.round(e.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const m = { top: 22, right: 44, bottom: 30, left: 40 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const g = useMemo(() => {
    const n = days.length;
    const maxRain = Math.max(10, ...days.map((d) => d.precipitationMm ?? 0));
    const rainTop = Math.ceil(maxRain / 5) * 5;
    const temps = days.flatMap((d) => (d.tMaxC === null ? [] : [d.tMaxC]));
    const tMin = Math.floor(Math.min(0, ...temps) / 5) * 5;
    const tMax = Math.ceil(Math.max(20, ...temps) / 5) * 5;
    const soil = days.flatMap((d) => (d.soilMoisture && d.soilMoisture > 0 ? [d.soilMoisture] : []));
    const step = iw / Math.max(1, n);
    const x = (i: number) => m.left + i * step + step / 2;
    const yRain = (v: number) => m.top + ih - (v / rainTop) * ih;
    const yT = (v: number) => m.top + ih - ((v - tMin) / (tMax - tMin)) * ih;
    const ySoil = (v: number) => m.top + ih - (v / 0.6) * ih;
    const path = (vals: (number | null)[], y: (v: number) => number) => {
      let d = '';
      let pen = false;
      vals.forEach((v, i) => {
        if (v === null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
        pen = true;
      });
      return d;
    };
    const idx = (date: string) => days.findIndex((d) => d.date === date);
    let bandRect: { x: number; w: number } | null = null;
    if (band && n) {
      const s = band.start <= days[0].date ? 0 : idx(band.start);
      const e = band.end >= days[n - 1].date ? n - 1 : idx(band.end);
      if (s >= 0 && e >= s) bandRect = { x: m.left + s * step, w: (e - s + 1) * step };
    }
    const maxTicks = Math.max(3, Math.floor(iw / 70));
    const tickEvery = [1, 2, 7, 14, 30, 61, 91].find((k) => n / k <= maxTicks) ?? 182;
    return {
      step,
      x,
      yRain,
      rainTop,
      tMin,
      tMax,
      yT,
      tPath: path(days.map((d) => d.tMaxC), yT),
      sPath: soil.length ? path(days.map((d) => (d.soilMoisture && d.soilMoisture > 0 ? d.soilMoisture : null)), ySoil) : '',
      bandRect,
      ticks: days.map((d, i) => ({ i, d })).filter(({ i }) => i % tickEvery === 0),
      total: days.reduce((s, d) => s + (d.precipitationMm ?? 0), 0),
    };
  }, [days, band, iw, ih, m.left, m.top]);

  const barW = Math.max(1.5, g.step * 0.7);
  const onMove = (e: React.PointerEvent) => {
    if (staticMode || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((px - m.left) / g.step);
    setHover(i >= 0 && i < days.length ? i : null);
  };
  const hd = hover !== null ? days[hover] : null;
  const label = t('weather.chartSummary', {
    start: days[0] ? formatDate(days[0].date, lang) : '',
    end: days.length ? formatDate(days[days.length - 1].date, lang) : '',
    total: formatNumber(g.total, lang),
  });

  return (
    <figure className="timeline" style={{ margin: 0 }} data-tour="weather-timeline" ref={figRef}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {/* gridlines + left axis (rain) */}
        <g className="axis">
          {[0, 0.5, 1].map((f) => {
            const v = g.rainTop * f;
            return (
              <g key={f}>
                <line className="grid-line" x1={m.left} x2={W - m.right} y1={g.yRain(v)} y2={g.yRain(v)} />
                <text x={m.left - 6} y={g.yRain(v) + 4} textAnchor="end">
                  {v}
                </text>
              </g>
            );
          })}
          <text x={m.left - 6} y={m.top - 8} textAnchor="end">
            mm
          </text>
          {[g.tMin, (g.tMin + g.tMax) / 2, g.tMax].map((v) => (
            <text key={v} x={W - m.right + 6} y={g.yT(v) + 4}>
              {v}°
            </text>
          ))}
          {g.ticks.map(({ i, d }) => (
            <text key={d.date} x={g.x(i)} y={H - 10} textAnchor="middle">
              {formatDate(d.date, lang, { day: 'numeric', month: 'short' })}
            </text>
          ))}
        </g>
        {g.bandRect && (
          <g>
            <rect className="band" x={g.bandRect.x} y={m.top} width={g.bandRect.w} height={ih} />
            <line className="band-edge" x1={g.bandRect.x} x2={g.bandRect.x} y1={m.top - 4} y2={m.top + ih} />
            <line className="band-edge" x1={g.bandRect.x + g.bandRect.w} x2={g.bandRect.x + g.bandRect.w} y1={m.top - 4} y2={m.top + ih} />
            <text className="band-label" x={g.bandRect.x + 6} y={m.top + 12}>
              {t('weather.missedBand')}
            </text>
          </g>
        )}
        {days.map((d, i) =>
          d.precipitationMm ? (
            <rect key={d.date} className={`bar ${d.precipitationMm >= HEAVY_DAY_MM ? 'heavy' : ''}`} x={g.x(i) - barW / 2} y={g.yRain(d.precipitationMm)} width={barW} height={g.yRain(0) - g.yRain(d.precipitationMm)} rx={1} />
          ) : null,
        )}
        {g.sPath && <path className="sline" d={g.sPath} />}
        <path className="tline" d={g.tPath} />
        {hover !== null && <line className="hover-line" x1={g.x(hover)} x2={g.x(hover)} y1={m.top} y2={m.top + ih} />}
      </svg>
      {hd && hover !== null && (
        <div className="timeline-tip" style={{ left: `${(g.x(hover) / W) * 100}%`, top: 8 }}>
          <strong>{formatDate(hd.date, lang)}</strong>
          <br />
          {t('weather.rain')}: {hd.precipitationMm ?? '—'}
          <br />
          {t('weather.tmax')}: {hd.tMaxC ?? '—'}
          {hd.soilMoisture ? (
            <>
              <br />
              {t('weather.soil')}: {hd.soilMoisture.toFixed(3)}
            </>
          ) : null}
        </div>
      )}
      <figcaption className="legend">
        <span>
          <i style={{ background: 'var(--rain)' }} />
          {t('weather.rain')}
        </span>
        <span>
          <i style={{ background: 'var(--heat)', height: 3 }} />
          {t('weather.tmax')}
        </span>
        {g.sPath && (
          <span>
            <i style={{ borderTop: '2px dashed var(--soil)', height: 0, background: 'none' }} />
            {t('weather.soil')}
          </span>
        )}
        {g.bandRect && (
          <span>
            <i style={{ background: 'var(--hay-band)', outline: '1px dashed var(--hay)' }} />
            {t('weather.missedBand')}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
