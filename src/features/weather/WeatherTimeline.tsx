// The weather timeline: daily rain bars, max-temperature and soil-moisture lines,
// the missed-work band in lingonberry, and (optionally) a brush that selects a
// window. One component serves the dashboard (brush), the weather and report
// pages (interactive), and the report document (static).
import { motion } from 'motion/react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { formatDate } from '../../lib/dates';
import { formatNumber } from '../../lib/units';
import { HEAVY_DAY_MM, type WeatherDay } from '../../services/weather';

export interface DateWindow {
  start: string;
  end: string;
}

interface Props {
  days: WeatherDay[];
  band?: DateWindow | null;
  height?: number;
  staticMode?: boolean;
  brush?: DateWindow | null;
  onBrush?: (w: DateWindow) => void;
  onDayClick?: (day: WeatherDay) => void;
  selectedDay?: string | null;
  highlight?: DateWindow | null;
}

type Series = 'rain' | 'temp' | 'soil';

export function WeatherTimeline({ days, band, height = 260, staticMode, brush, onBrush, onDayClick, selectedDay, highlight }: Props) {
  const { t, lang } = useApp();
  const [hover, setHover] = useState<number | null>(null);
  const [show, setShow] = useState<Record<Series, boolean>>({ rain: true, temp: true, soil: true });
  const svgRef = useRef<SVGSVGElement>(null);
  const figRef = useRef<HTMLElement>(null);
  const drag = useRef<{ mode: 'new' | 'move' | 'l' | 'r'; anchor: number; s: number; e: number; moved: boolean } | null>(null);
  const [W, setW] = useState(760);
  useLayoutEffect(() => {
    const el = figRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.min(1200, Math.round(e.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const m = { top: 22, right: 40, bottom: 30, left: 36 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const n = days.length;
  const step = iw / Math.max(1, n);
  const idxOf = (date: string) => days.findIndex((d) => d.date >= date);

  const g = useMemo(() => {
    const maxRain = Math.max(10, ...days.map((d) => d.precipitationMm ?? 0));
    const rainTop = Math.ceil(maxRain / 5) * 5;
    const temps = days.flatMap((d) => (d.tMaxC === null ? [] : [d.tMaxC]));
    const tMin = Math.floor(Math.min(0, ...temps) / 5) * 5;
    const tMax = Math.ceil(Math.max(20, ...temps) / 5) * 5;
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
    const maxTicks = Math.max(3, Math.floor(iw / 72));
    const tickEvery = [1, 2, 7, 14, 30, 61, 91].find((k) => n / k <= maxTicks) ?? 182;
    return {
      x,
      yRain,
      rainTop,
      tMin,
      tMax,
      yT,
      tPath: path(days.map((d) => d.tMaxC), yT),
      sPath: days.some((d) => d.soilMoisture && d.soilMoisture > 0) ? path(days.map((d) => (d.soilMoisture && d.soilMoisture > 0 ? d.soilMoisture : null)), ySoil) : '',
      ticks: days.map((d, i) => ({ i, d })).filter(({ i }) => i % tickEvery === 0),
      total: days.reduce((s, d) => s + (d.precipitationMm ?? 0), 0),
    };
  }, [days, iw, ih, n, step, m.left, m.top]);

  const rangeRect = (w: DateWindow | null | undefined) => {
    if (!w || !n) return null;
    const s = w.start <= days[0].date ? 0 : idxOf(w.start);
    let e = n - 1;
    while (e >= 0 && days[e].date > w.end) e--;
    return s >= 0 && e >= s ? { x: m.left + s * step, w: (e - s + 1) * step, s, e } : null;
  };
  const bandRect = rangeRect(band);
  const brushRect = rangeRect(brush);
  const hlRect = rangeRect(highlight);

  const indexAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, Math.floor((px - m.left) / step)));
  };
  const emit = (s: number, e: number) => onBrush?.({ start: days[Math.min(s, e)].date, end: days[Math.max(s, e)].date });

  const onDown = (e: React.PointerEvent) => {
    if (staticMode || !n) return;
    const i = indexAt(e.clientX);
    const target = (e.target as Element).getAttribute('data-h');
    if (onBrush && brushRect) {
      if (target === 'l' || target === 'r') drag.current = { mode: target, anchor: i, s: brushRect.s, e: brushRect.e, moved: false };
      else if (i >= brushRect.s && i <= brushRect.e) drag.current = { mode: 'move', anchor: i, s: brushRect.s, e: brushRect.e, moved: false };
      else drag.current = { mode: 'new', anchor: i, s: i, e: i, moved: false };
    } else drag.current = { mode: 'new', anchor: i, s: i, e: i, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (staticMode || !n) return;
    const i = indexAt(e.clientX);
    setHover(i);
    const d = drag.current;
    if (!d || !onBrush) return;
    if (i !== d.anchor) d.moved = true;
    if (!d.moved) return;
    if (d.mode === 'new') emit(d.anchor, i);
    else if (d.mode === 'l') emit(Math.min(i, d.e), d.e);
    else if (d.mode === 'r') emit(d.s, Math.max(i, d.s));
    else {
      const len = d.e - d.s;
      const s = Math.max(0, Math.min(n - 1 - len, d.s + (i - d.anchor)));
      emit(s, s + len);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && onDayClick) onDayClick(days[indexAt(e.clientX)]);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!onBrush || !brushRect) return;
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (e.shiftKey) emit(brushRect.s, Math.max(brushRect.s, Math.min(n - 1, brushRect.e + dir)));
    else {
      const len = brushRect.e - brushRect.s;
      const s = Math.max(0, Math.min(n - 1 - len, brushRect.s + dir * (e.altKey ? 7 : 1)));
      emit(s, s + len);
    }
  };

  const barW = Math.max(1.5, step * 0.68);
  const hd = hover !== null ? days[hover] : null;
  const label = t('weather.chartSummary', {
    start: days[0] ? formatDate(days[0].date, lang) : '',
    end: n ? formatDate(days[n - 1].date, lang) : '',
    total: formatNumber(g.total, lang),
  });
  const interactive = !staticMode;
  const toggle = (s: Series) => setShow((v) => ({ ...v, [s]: !v[s] }));

  return (
    <figure className="chart" style={{ margin: 0 }} data-tour="weather-timeline" ref={figRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role={onBrush ? 'slider' : 'img'}
        aria-label={onBrush ? `${label} ${t('dash.brushHint')}` : label}
        aria-valuetext={brush ? `${formatDate(brush.start, lang)} – ${formatDate(brush.end, lang)}` : undefined}
        tabIndex={onBrush ? 0 : undefined}
        onKeyDown={onKey}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: onBrush ? 'pan-y' : undefined, cursor: interactive ? 'crosshair' : undefined }}
      >
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
          {show.temp &&
            [g.tMin, (g.tMin + g.tMax) / 2, g.tMax].map((v) => (
              <text key={v} x={W - m.right + 6} y={g.yT(v) + 4}>
                {v}°
              </text>
            ))}
          {g.ticks.map(({ i, d }) => (
            <text key={d.date} x={g.x(i)} y={H - 9} textAnchor="middle">
              {formatDate(d.date, lang, { day: 'numeric', month: 'short' })}
            </text>
          ))}
        </g>
        {hlRect && <rect x={hlRect.x} y={m.top} width={hlRect.w} height={ih} fill="var(--hay-band)" opacity={0.6} />}
        {bandRect && (
          <g>
            <rect className="band" x={bandRect.x} y={m.top} width={bandRect.w} height={ih} />
            <line className="band-edge" x1={bandRect.x} x2={bandRect.x} y1={m.top - 4} y2={m.top + ih} />
            <line className="band-edge" x1={bandRect.x + bandRect.w} x2={bandRect.x + bandRect.w} y1={m.top - 4} y2={m.top + ih} />
            <text className="band-label" x={bandRect.x + 6} y={m.top + 12}>
              {t('weather.missedBand')}
            </text>
          </g>
        )}
        {show.rain &&
          days.map((d, i) =>
            d.precipitationMm ? (
              <motion.rect
                key={d.date}
                className={`bar ${d.precipitationMm >= HEAVY_DAY_MM ? 'heavy' : ''} ${brushRect && (i < brushRect.s || i > brushRect.e) ? 'dim' : ''}`}
                x={g.x(i) - barW / 2}
                width={barW}
                rx={Math.min(2, barW / 2)}
                initial={staticMode ? false : { y: g.yRain(0), height: 0 }}
                animate={{ y: g.yRain(d.precipitationMm), height: g.yRain(0) - g.yRain(d.precipitationMm) }}
                transition={{ duration: 0.6, delay: staticMode ? 0 : Math.min(0.6, i * 0.004), ease: [0.22, 0.8, 0.2, 1] }}
              />
            ) : null,
          )}
        {show.soil && g.sPath && <path className="sline" d={g.sPath} />}
        {show.temp && <motion.path className="tline" d={g.tPath} initial={staticMode ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeInOut' }} />}
        {brushRect && (
          <g>
            <rect className="brush" x={brushRect.x} y={m.top - 6} width={brushRect.w} height={ih + 6} rx={6} />
            <rect className="brush-handle" data-h="l" x={brushRect.x - 5} y={m.top + ih / 2 - 16} width={10} height={32} rx={5} />
            <rect className="brush-handle" data-h="r" x={brushRect.x + brushRect.w - 5} y={m.top + ih / 2 - 16} width={10} height={32} rx={5} />
          </g>
        )}
        {selectedDay && idxOf(selectedDay) >= 0 && <rect className="sel-day" x={g.x(idxOf(selectedDay)) - step / 2} y={m.top} width={step} height={ih} rx={3} />}
        {interactive && hover !== null && <line className="hover-line" x1={g.x(hover)} x2={g.x(hover)} y1={m.top} y2={m.top + ih} />}
      </svg>
      {interactive && hd && hover !== null && (
        <div className="chart-tip" style={{ left: `${(g.x(hover) / W) * 100}%`, top: 10 }}>
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
          {hd.windMaxKmh != null && (
            <>
              <br />
              {t('weather.wind')}: {Math.round(hd.windMaxKmh)} km/h
            </>
          )}
        </div>
      )}
      <figcaption className="legend">
        {(
          [
            ['rain', 'weather.rain', { background: 'var(--rain)' }],
            ['temp', 'weather.tmax', { background: 'var(--heat)', height: 3 }],
            ['soil', 'weather.soil', { borderTop: '2px dashed var(--soil)', height: 0, background: 'none' }],
          ] as const
        ).map(([k, key, style]) =>
          staticMode ? (
            <span key={k}>
              <i style={style} />
              {t(key)}
            </span>
          ) : (
            <button key={k} type="button" aria-pressed={show[k]} onClick={() => toggle(k)}>
              <i style={style} />
              {t(key)}
            </button>
          ),
        )}
        {bandRect && (
          <span>
            <i style={{ background: 'var(--hay-band)', outline: '1px dashed var(--lingon)' }} />
            {t('weather.missedBand')}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
