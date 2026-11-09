// Real Sentinel-2 NDVI for a plot with a stored outline: the season's curve,
// sharp drops marked as possible mowing, and how they line up with the log.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import { daysInclusive, formatDate, todayISO } from '../../lib/dates';
import type { LogEntry, Parcel } from '../../lib/types';
import { formatNumber } from '../../lib/units';
import { cacheKey, getNdviSeries, matchRecords, mowingSignals, readCache, SATELLITE_SOURCE, writeCache, type NdviSeries } from '../../services/satellite';
import type { DateWindow } from '../weather/WeatherTimeline';

type State = { status: 'loading'; done: number; total: number } | { status: 'error' } | { status: 'ready'; series: NdviSeries };

export function RealSatellite({ parcel, entries, season }: { parcel: Parcel & { boundary: NonNullable<Parcel['boundary']> }; entries: LogEntry[]; season: DateWindow }) {
  const { t, lang } = useApp();
  const today = todayISO();
  const start = season.start;
  const end = season.end > today ? today : season.end;
  const [state, setState] = useState<State>({ status: 'loading', done: 0, total: 0 });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (start > end) return setState({ status: 'error' });
    const key = cacheKey(parcel.id, parcel.boundary, start, end);
    const cached = nonce === 0 ? readCache(key) : null;
    if (cached) return setState({ status: 'ready', series: cached });
    const c = new AbortController();
    setState({ status: 'loading', done: 0, total: 0 });
    getNdviSeries(parcel.boundary, start, end, (done, total) => !c.signal.aborted && setState({ status: 'loading', done, total }), c.signal)
      .then((series) => {
        if (c.signal.aborted) return;
        writeCache(key, series);
        setState({ status: 'ready', series });
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setState({ status: 'error' });
      });
    return () => c.abort();
  }, [parcel.id, parcel.boundary, start, end, nonce]);

  const own = useMemo(() => entries.filter((e) => e.parcelId === parcel.id), [entries, parcel.id]);

  if (state.status === 'loading')
    return (
      <div className="notice notice-info" role="status">
        <Icon name="satellite" size={20} />
        <div className="grow">
          {t('sat.loading')}
          {state.total > 0 && <> {t('sat.progress', { done: state.done, total: state.total })}</>}
          <div className="sat-progress" aria-hidden>
            <span style={{ width: `${state.total ? (state.done / state.total) * 100 : 5}%` }} />
          </div>
        </div>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="notice notice-warn" role="alert">
        <Icon name="warn" size={20} />
        <div className="grow">
          {t('sat.error')}{' '}
          <button className="btn btn-sm" onClick={() => setNonce((n) => n + 1)}>
            {t('actions.retry')}
          </button>
        </div>
      </div>
    );

  const { points, scenesChecked } = state.series;
  const signals = mowingSignals(points);
  const matches = matchRecords(own, signals, points);
  const W = 640;
  const H = 170;
  const padL = 34;
  const padB = 22;
  const total = daysInclusive(start, end);
  const x = (d: string) => padL + ((daysInclusive(start, d) - 1) / Math.max(1, total - 1)) * (W - padL - 6);
  const y = (v: number) => 6 + (1 - Math.max(0, Math.min(1, v))) * (H - padB - 6);
  const months = Array.from({ length: 12 }, (_, m) => `${start.slice(0, 4)}-${String(m + 1).padStart(2, '0')}-01`).filter((d) => d >= start && d <= end);

  return (
    <div>
      {points.length < 2 ? (
        <p className="muted">{t('sat.tooFew', { n: scenesChecked })}</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('sat.chartLabel', { n: points.length })} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - 6} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth="1" />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="sat-axis">
                {formatNumber(v, lang, 2)}
              </text>
            </g>
          ))}
          {months.map((d) => (
            <text key={d} x={x(d)} y={H - 6} className="sat-axis">
              {new Intl.DateTimeFormat(lang === 'et' ? 'et-EE' : 'en-GB', { month: 'short' }).format(new Date(d))}
            </text>
          ))}
          {own
            .filter((e) => e.kind !== 'missed' && (e.endDate ?? e.date) >= start && e.date <= end)
            .map((e) => (
              <rect key={e.id} x={x(e.date < start ? start : e.date) - 1.5} width={Math.max(3, x((e.endDate ?? e.date) > end ? end : (e.endDate ?? e.date)) - x(e.date < start ? start : e.date) + 3)} y={H - padB - 8} height={6} rx={2} fill={e.kind === 'mowing' ? 'var(--peat)' : 'var(--seaglass)'}>
                <title>{`${t(`method.${e.kind}`)} ${formatDate(e.date, lang)}`}</title>
              </rect>
            ))}
          {signals.map((s) => (
            <rect key={s.date} x={x(s.from)} width={Math.max(4, x(s.date) - x(s.from))} y={6} height={H - padB - 6} fill="var(--hay)" opacity={0.28}>
              <title>{t('sat.signalTip', { from: formatDate(s.from, lang), to: formatDate(s.date, lang) })}</title>
            </rect>
          ))}
          <path d={'M' + points.map((p) => `${x(p.date).toFixed(1)} ${y(p.ndvi).toFixed(1)}`).join('L')} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
          {points.map((p) => (
            <circle key={p.date} cx={x(p.date)} cy={y(p.ndvi)} r={3.2} fill="var(--surface)" stroke="var(--primary)" strokeWidth="2">
              <title>{`${formatDate(p.date, lang)}: NDVI ${formatNumber(p.ndvi, lang, 2)} (${Math.round(p.clear * 100)}% ${t('sat.clear')})`}</title>
            </circle>
          ))}
        </svg>
      )}
      <div className="legend small" style={{ marginTop: 6 }}>
        <span>
          <i style={{ background: 'var(--primary)' }} /> NDVI
        </span>
        <span>
          <i style={{ background: 'var(--hay)', opacity: 0.6 }} /> {t('sat.possibleMowing')}
        </span>
        <span>
          <i style={{ background: 'var(--peat)' }} /> {t('sat.yourMowing')}
        </span>
        <span>
          <i style={{ background: 'var(--seaglass)' }} /> {t('sat.yourGrazing')}
        </span>
      </div>
      <ul className="ledger small" style={{ marginTop: 10 }}>
        {matches.length === 0 && <li className="muted">{t('sat.nothing')}</li>}
        {matches.map((m) => (
          <li key={m.kind + (m.kind === 'seen-not-recorded' ? m.signal.date : m.entry.id)} style={{ padding: '8px 0' }}>
            <span className={`badge ${m.kind === 'matched' ? 'badge-ok' : m.kind === 'recorded-not-seen' && !m.checkable ? 'badge-neutral' : 'badge-warn'}`}>{t(`sat.status.${m.kind === 'recorded-not-seen' && !m.checkable ? 'unclear' : m.kind}`)}</span>
            <span className="grow">
              {m.kind === 'seen-not-recorded'
                ? t('sat.explain.seen', { from: formatDate(m.signal.from, lang), to: formatDate(m.signal.date, lang), a: formatNumber(m.signal.before, lang, 2), b: formatNumber(m.signal.after, lang, 2) })
                : m.kind === 'matched'
                  ? t('sat.explain.matched', { date: formatDate(m.entry.date, lang), from: formatDate(m.signal.from, lang), to: formatDate(m.signal.date, lang) })
                  : t(m.checkable ? 'sat.explain.notSeen' : 'sat.explain.unclear', { date: formatDate(m.entry.date, lang) })}
            </span>
          </li>
        ))}
      </ul>
      <details style={{ marginTop: 8 }}>
        <summary className="small">{t('sat.table')}</summary>
        <table className="data small">
          <thead>
            <tr>
              <th scope="col">{t('log.date')}</th>
              <th scope="col">NDVI</th>
              <th scope="col">{t('sat.clear')}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{formatDate(p.date, lang)}</td>
                <td>{formatNumber(p.ndvi, lang, 2)}</td>
                <td>{Math.round(p.clear * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        {t('sat.note', { checked: scenesChecked, clear: points.length })} {SATELLITE_SOURCE.licence}.
      </p>
    </div>
  );
}
