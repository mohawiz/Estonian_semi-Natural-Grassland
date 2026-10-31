import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/store';
import { EmptyState, PageHeader } from '../components/ui';
import { useMeadowWindow } from '../features/meadow/conditions';
import { useWeather } from '../features/weather/useWeather';
import { WeatherPanel } from '../features/weather/WeatherPanel';
import { addDays, todayISO } from '../lib/dates';

export function WeatherPage() {
  const { t, data } = useApp();
  const [params] = useSearchParams();
  const today = todayISO();
  const [parcelId, setParcelId] = useState(params.get('parcel') ?? data.parcels[0]?.id ?? '');
  const missed = data.entries.find((e) => e.parcelId === parcelId && e.kind === 'missed');
  const [start, setStart] = useState(params.get('start') ?? (missed ? addDays(missed.date, -14) : addDays(today, -60)));
  const [end, setEnd] = useState(params.get('end') ?? (missed ? addDays(missed.endDate ?? missed.date, 14) : addDays(today, -1)));
  const [query, setQuery] = useState<{ id: string; start: string; end: string } | null>(parcelId ? { id: parcelId, start, end } : null);
  const parcel = data.parcels.find((p) => p.id === query?.id);
  const { state, baseline, retry } = useWeather(parcel?.lat, parcel?.lon, query?.start ?? '', query?.end ?? '', !!parcel);
  useMeadowWindow(state.status === 'ready' ? state.series.days : null);
  const band = missed && query?.id === missed.parcelId ? { start: missed.date, end: missed.endDate ?? missed.date } : null;

  if (!data.parcels.length)
    return (
      <>
        <PageHeader title={t('weather.title')} subtitle={t('weather.subtitle')} />
        <EmptyState icon="rain" title={t('weather.noParcel')} body={t('parcels.emptyBody')} action={<Link className="btn btn-primary" to="/parcels/new">{t('parcels.add')}</Link>} />
      </>
    );

  return (
    <>
      <PageHeader title={t('weather.title')} subtitle={t('weather.subtitle')} />
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ id: parcelId, start, end: end > addDays(today, -1) ? addDays(today, -1) : end });
        }}
        style={{ marginBottom: 16 }}
      >
        <div className="grid grid-3" style={{ alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="w-parcel">{t('weather.parcel')}</label>
            <select id="w-parcel" value={parcelId} onChange={(e) => setParcelId(e.target.value)}>
              {data.parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="w-start">{t('weather.from')}</label>
            <input id="w-start" type="date" value={start} max={end} min="1950-01-01" onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="w-end">{t('weather.to')}</label>
            <input id="w-end" type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={!parcelId || end < start}>
            {t('weather.show')}
          </button>
        </div>
      </form>
      {query && (
        <section className="panel" aria-labelledby="w-title">
          <h2 id="w-title">
            {t('weather.chartTitle')} · {parcel?.name}
          </h2>
          <WeatherPanel state={state} baseline={baseline} retry={retry} band={band} />
        </section>
      )}
    </>
  );
}
