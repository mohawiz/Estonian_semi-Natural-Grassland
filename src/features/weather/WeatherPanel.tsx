import { useState } from 'react';
import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import { Skeleton } from '../../components/ui';
import { formatDate } from '../../lib/dates';
import { formatNumber } from '../../lib/units';
import { summarizeWeather, type WeatherBaseline, type WeatherSeries } from '../../services/weather';
import type { WeatherState } from './useWeather';
import { WeatherTimeline } from './WeatherTimeline';

export function WeatherFacts({ series, baseline, baselineStatus, range }: { series: WeatherSeries; baseline?: WeatherBaseline; baselineStatus?: string; range?: { start: string; end: string } }) {
  const { t, lang } = useApp();
  const days = range ? series.days.filter((d) => d.date >= range.start && d.date <= range.end) : series.days;
  const s = summarizeWeather(days, baseline);
  const n = (v: number, d = 1) => formatNumber(v, lang, d);
  return (
    <dl className="facts">
      <div>
        <dt>{t('weather.total')}</dt>
        <dd>{n(s.totalPrecipMm)} mm</dd>
      </div>
      <div>
        <dt>{t('weather.wetDays')}</dt>
        <dd>
          {s.wetDays} / {s.daysWithData}
        </dd>
      </div>
      <div>
        <dt>{t('weather.heavyDays')}</dt>
        <dd>{s.heavyRainDays}</dd>
      </div>
      <div>
        <dt>{t('weather.maxDay')}</dt>
        <dd>
          {n(s.maxDailyMm)} mm{s.maxDailyDate && <span className="muted small"> · {formatDate(s.maxDailyDate, lang, { day: 'numeric', month: 'short' })}</span>}
        </dd>
      </div>
      <div>
        <dt>{t('weather.longestWet')}</dt>
        <dd>{t('weather.daysUnit', { n: s.longestWetSpell })}</dd>
      </div>
      <div>
        <dt>{t('weather.longestDry')}</dt>
        <dd>{t('weather.daysUnit', { n: s.longestDrySpell })}</dd>
      </div>
      <div>
        <dt>{t('weather.meanSoil')}</dt>
        <dd>{s.meanSoilMoisture !== null ? `${n(s.meanSoilMoisture, 3)} m³/m³` : '—'}</dd>
      </div>
      <div>
        <dt>{t('weather.vsNormal')}</dt>
        <dd>
          {s.baselineRatio !== null ? (
            t('weather.vsNormalValue', { pct: Math.round(s.baselineRatio * 100) })
          ) : baselineStatus === 'loading' ? (
            <Skeleton height={18} width={120} />
          ) : (
            <span className="muted small">{baselineStatus === 'error' ? t('weather.baselineFailed') : '—'}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

export function WeatherSourceNote({ series }: { series: WeatherSeries }) {
  const { t, lang } = useApp();
  return (
    <p className="muted small" style={{ marginTop: 10 }}>
      {t('weather.modelNote', { lat: formatNumber(series.gridLat, lang, 3), lon: formatNumber(series.gridLon, lang, 3) })}{' '}
      <a href={series.source.url} target="_blank" rel="noreferrer">
        {t('weather.attribution')}
      </a>
      . {t('weather.futureNote')}
    </p>
  );
}

export function WeatherPanel({ state, baseline, retry, band, range }: { state: WeatherState; baseline: { status: string; data?: WeatherBaseline }; retry: () => void; band?: { start: string; end: string } | null; range?: { start: string; end: string } }) {
  const { t, lang } = useApp();
  const [table, setTable] = useState(false);
  if (state.status === 'idle') return null;
  if (state.status === 'loading')
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">{t('weather.loading')}</span>
        <Skeleton height={220} />
        <div className="row" style={{ marginTop: 14 }}>
          {[1, 2, 3, 4].map((k) => (
            <Skeleton key={k} height={44} width={150} />
          ))}
        </div>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="notice notice-warn" role="alert">
        <Icon name="warn" size={18} />
        <div>
          <strong>{t('weather.errorTitle')}</strong>
          <p style={{ margin: '4px 0 8px' }}>
            {t('weather.errorBody')} <span className="muted small">({state.message})</span>
          </p>
          <button className="btn btn-sm" onClick={retry}>
            {t('actions.retry')}
          </button>
        </div>
      </div>
    );
  const { series } = state;
  const soilMissing = series.days.every((d) => !d.soilMoisture);
  return (
    <div>
      <WeatherTimeline days={series.days} band={band} />
      {soilMissing && <p className="muted small">{t('weather.noSoil')}</p>}
      <WeatherFacts series={series} baseline={baseline.data} baselineStatus={baseline.status} range={range} />
      <WeatherSourceNote series={series} />
      <details style={{ marginTop: 8 }} open={table} onToggle={(e) => setTable((e.target as HTMLDetailsElement).open)}>
        <summary>{t('weather.tableToggle')}</summary>
        {table && (
          <div className="table-wrap" style={{ maxHeight: 320, marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t('weather.date')}</th>
                  <th className="num">{t('weather.rain')}</th>
                  <th className="num">{t('weather.tmax')}</th>
                  <th className="num">{t('weather.soil')}</th>
                </tr>
              </thead>
              <tbody>
                {series.days.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDate(d.date, lang)}</td>
                    <td className="num">{d.precipitationMm ?? '—'}</td>
                    <td className="num">{d.tMaxC ?? '—'}</td>
                    <td className="num">{d.soilMoisture ? d.soilMoisture.toFixed(3) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
