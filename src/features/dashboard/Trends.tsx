// Seasonal trends: weekly aggregates with metric filters, zoom presets, and
// cross-highlighting with the management calendar (hovering a week lights it up there).
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { addDays, formatDate } from '../../lib/dates';
import { formatNumber } from '../../lib/units';
import type { WeatherSeries } from '../../services/weather';
import type { DateWindow } from '../weather/WeatherTimeline';
import { weekStart } from './Heatmap';

type Metric = 'rain' | 'temp' | 'soil' | 'wind';
type Zoom = 'season' | 'summer' | 'window';

const METRIC: Record<Metric, { color: string; unit: string; agg: 'sum' | 'mean'; pick: (d: WeatherSeries['days'][number]) => number | null | undefined }> = {
  rain: { color: 'var(--rain)', unit: 'mm', agg: 'sum', pick: (d) => d.precipitationMm },
  temp: { color: 'var(--heat)', unit: '°C', agg: 'mean', pick: (d) => d.tMaxC },
  soil: { color: 'var(--soil)', unit: 'm³/m³', agg: 'mean', pick: (d) => (d.soilMoisture && d.soilMoisture > 0 ? d.soilMoisture : null) },
  wind: { color: 'var(--seaglass)', unit: 'km/h', agg: 'mean', pick: (d) => d.windMaxKmh },
};

export function Trends({ series, window, hoverWeek, onHoverWeek }: { series: WeatherSeries; window: DateWindow | null; hoverWeek: string | null; onHoverWeek: (w: string | null) => void }) {
  const { t, lang } = useApp();
  const [metric, setMetric] = useState<Metric>('rain');
  const [zoom, setZoom] = useState<Zoom>('season');
  const cfg = METRIC[metric];

  const weeks = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const d of series.days) {
      const v = cfg.pick(d);
      if (v == null) continue;
      const k = weekStart(d.date);
      (map.get(k) ?? map.set(k, []).get(k)!).push(v);
    }
    let rows = [...map.entries()].map(([week, vs]) => ({ week, value: cfg.agg === 'sum' ? vs.reduce((s, x) => s + x, 0) : vs.reduce((s, x) => s + x, 0) / vs.length }));
    const year = series.start.slice(0, 4);
    if (zoom === 'summer') rows = rows.filter((r) => r.week >= weekStart(`${year}-06-01`) && r.week <= `${year}-08-31`);
    if (zoom === 'window' && window) rows = rows.filter((r) => addDays(r.week, 6) >= window.start && r.week <= window.end);
    return rows.sort((a, b) => a.week.localeCompare(b.week));
  }, [series, cfg, zoom, window]);

  const max = Math.max(...weeks.map((w) => w.value), metric === 'soil' ? 0.5 : 1);
  const inWindow = (w: string) => !window || (addDays(w, 6) >= window.start && w <= window.end);
  const fmt = (v: number) => (metric === 'soil' ? formatNumber(v, lang, 3) : formatNumber(v, lang, 1));
  const hovered = weeks.find((w) => w.week === hoverWeek);

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="seg-tabs" role="group" aria-label={t('dash.metric')}>
          {(['rain', 'temp', 'soil', 'wind'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}>
              {t(`dash.metrics.${m}`)}
            </button>
          ))}
        </div>
        <div className="seg-tabs" role="group" aria-label={t('dash.zoom')}>
          {(['season', 'summer', 'window'] as const).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)} disabled={z === 'window' && !window}>
              {t(`dash.zooms.${z}`)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 22, fontSize: '0.84rem' }} aria-live="polite">
        {hovered ? (
          <span>
            <strong>
              {formatDate(hovered.week, lang, { day: 'numeric', month: 'short' })} – {formatDate(addDays(hovered.week, 6), lang, { day: 'numeric', month: 'short' })}
            </strong>
            : {fmt(hovered.value)} {cfg.unit} {cfg.agg === 'sum' ? t('dash.weekTotal') : t('dash.weekMean')}
          </span>
        ) : (
          <span className="muted">{t('dash.trendHint')}</span>
        )}
      </div>
      <div role="list" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 170, borderBottom: '1px solid var(--rule)', marginTop: 4 }} onPointerLeave={() => onHoverWeek(null)}>
        {weeks.map((w) => (
          <button
            key={w.week}
            role="listitem"
            type="button"
            aria-label={`${formatDate(w.week, lang)}: ${fmt(w.value)} ${cfg.unit}`}
            onPointerEnter={() => onHoverWeek(w.week)}
            onFocus={() => onHoverWeek(w.week)}
            onBlur={() => onHoverWeek(null)}
            style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', minWidth: 0 }}
          >
            <motion.span
              layout
              initial={false}
              animate={{ height: `${Math.max(2, (w.value / max) * 100)}%`, opacity: hoverWeek && hoverWeek !== w.week ? 0.35 : inWindow(w.week) ? 1 : 0.45 }}
              transition={{ type: 'spring', stiffness: 160, damping: 22 }}
              style={{ display: 'block', width: '100%', background: cfg.color, borderRadius: '6px 6px 2px 2px', outline: hoverWeek === w.week ? '2px solid var(--hay)' : undefined, outlineOffset: 2 }}
            />
          </button>
        ))}
      </div>
      <div className="row small muted" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <span>{weeks[0] && formatDate(weeks[0].week, lang, { day: 'numeric', month: 'short' })}</span>
        <span>{weeks.length > 1 && formatDate(weeks[weeks.length - 1].week, lang, { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  );
}
