// Management calendar: one cell per day of the season, coloured by what the log
// says happened on that parcel. Click a cell to open its entry.
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { addDays, eachDay, formatDate, parseISO } from '../../lib/dates';
import type { LogEntry } from '../../lib/types';
import type { DateWindow } from '../weather/WeatherTimeline';

const PRIORITY = { mowing: 3, missed: 2, grazing: 1 } as const;

export function weekStart(iso: string) {
  const dow = (parseISO(iso).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

export function Heatmap({ entries, season, window, hoverWeek }: { entries: LogEntry[]; season: DateWindow; window?: DateWindow | null; hoverWeek?: string | null }) {
  const { t, lang } = useApp();
  const navigate = useNavigate();
  const first = weekStart(season.start);
  const days = eachDay(first, season.end);
  const byDay = new Map<string, LogEntry>();
  for (const e of entries) {
    for (const d of eachDay(e.date, e.endDate ?? e.date)) {
      const cur = byDay.get(d);
      if (!cur || PRIORITY[e.kind] > PRIORITY[cur.kind]) byDay.set(d, e);
    }
  }
  const weeks = Math.ceil(days.length / 7);
  const months = days.filter((d) => d.endsWith('-01') || d === first);

  return (
    <div>
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ minWidth: weeks * 14 + 30 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${weeks}, minmax(10px, 1fr))`, gap: 3, fontSize: '0.72rem', color: 'var(--ink-3)', marginBottom: 4 }}>
            <span />
            {Array.from({ length: weeks }, (_, w) => {
              const m = months.find((d) => Math.floor(days.indexOf(d) / 7) === w);
              return <span key={w}>{m && m >= season.start ? formatDate(m, lang, { month: 'short' }) : ''}</span>;
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 3 }}>
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: 3, fontSize: '0.68rem', color: 'var(--ink-3)' }}>
              {[0, 2, 4, 6].map((d) => (
                <span key={d} style={{ gridRow: d + 1 }}>
                  {formatDate(addDays('2026-06-01', d), lang, { weekday: 'short' })}
                </span>
              ))}
            </div>
            <div className="heat" style={{ gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gridTemplateColumns: `repeat(${weeks}, minmax(10px, 1fr))` }}>
              {days.map((d) => {
                const e = byDay.get(d);
                const out = d < season.start;
                const hl = (window && d >= window.start && d <= window.end) || (hoverWeek && weekStart(d) === hoverWeek);
                const cls = `${e ? `k-${e.kind}` : ''} ${hl ? 'k-hl' : ''}`;
                if (!e || out)
                  return <span key={d} className={`cell ${out ? '' : cls}`} style={out ? { visibility: 'hidden' } : undefined} aria-hidden="true" />;
                const label = `${formatDate(d, lang)}: ${e.kind === 'missed' ? `${t('log.missedBadge')} (${t(`reason.${e.reason ?? 'other'}`)})` : t(`method.${e.kind}`)}`;
                return <button key={d} type="button" className={cls} title={label} aria-label={label} onClick={() => navigate(`/log/${e.id}`)} />;
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--primary)' }} />
          {t('method.mowing')}
        </span>
        <span>
          <i style={{ background: 'var(--seaglass)' }} />
          {t('method.grazing')}
        </span>
        <span>
          <i style={{ background: 'repeating-linear-gradient(45deg, var(--lingon), var(--lingon) 2px, var(--lingon-tint) 2px, var(--lingon-tint) 4px)' }} />
          {t('log.missedBadge')}
        </span>
        <span>
          <i style={{ boxShadow: '0 0 0 2px var(--hay)', background: 'var(--sheet-2)' }} />
          {t('dash.selectedWindow')}
        </span>
      </div>
    </div>
  );
}
