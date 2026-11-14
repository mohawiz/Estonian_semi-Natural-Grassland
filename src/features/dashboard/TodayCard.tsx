// The first thing on the dashboard: three plain facts for today, each with a
// status colour that means the same on every page (green done, amber coming up,
// red needs action now).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import { formatDate } from '../../lib/dates';
import type { Parcel } from '../../lib/types';
import { getTodayWeather, type TodayWeather } from '../../services/weather';
import { noticeWindows } from '../../pages/Deadlines';
import type { DateWindow } from '../weather/WeatherTimeline';

export type Status = 'done' | 'soon' | 'late';

const deg = (v: number | null) => (v === null ? '—' : `${Math.round(v)}°`);

function useTodayWeather(parcel: Parcel | undefined) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data?: TodayWeather }>({ status: 'loading' });
  useEffect(() => {
    if (!parcel) return;
    const ctl = new AbortController();
    setState({ status: 'loading' });
    getTodayWeather(parcel.lat, parcel.lon, ctl.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setState({ status: 'error' });
      });
    return () => ctl.abort();
  }, [parcel?.lat, parcel?.lon]);
  return state;
}

export function TodayCard({ parcel, season, today }: { parcel: Parcel | undefined; season: DateWindow; today: string }) {
  const { t, lang, data, settings } = useApp();
  const weather = useTodayWeather(parcel);
  const plotName = (id: string) => data.parcels.find((p) => p.id === id)?.name ?? '—';
  const short = (d: string) => formatDate(d, lang, { day: 'numeric', month: 'long' });

  // Next deadline: the earliest of "report missed work by" and PRIA's "allowed from" dates still ahead
  const upcoming: { date: string; status: Status; text: string; to: string }[] = [];
  for (const w of noticeWindows(data.entries, settings.noticeWorkingDays, today).filter((x) => !x.passed))
    upcoming.push({ date: w.deadline, status: w.left <= 2 ? 'late' : 'soon', text: t('today.reportBy', { plot: plotName(w.entry.parcelId), date: short(w.deadline), n: w.left }), to: '/deadlines' });
  for (const p of data.parcels)
    if (p.pria?.startDate && p.pria.startDate >= today)
      upcoming.push({ date: p.pria.startDate, status: 'soon', text: t(p.pria.maintenance === 'K' ? 'today.grazeFrom' : 'today.mowFrom', { plot: p.name, date: short(p.pria.startDate) }), to: '/deadlines' });
  const next = upcoming.sort((a, b) => a.date.localeCompare(b.date))[0];

  // Still to do: missed work without a proof report, then plots with no work logged this season
  const unreported = data.entries.filter((e) => e.kind === 'missed' && e.date >= season.start && !data.reports.some((r) => r.parcelId === e.parcelId && r.input.start <= e.date && r.input.end >= e.date));
  const idle = data.parcels.filter((p) => !data.entries.some((e) => e.parcelId === p.id && e.kind !== 'missed' && e.date >= season.start));
  const todo: { status: Status; text: string; to: string; action: string } = unreported.length
    ? { status: 'late', text: t('today.unreported', { n: unreported.length }), to: `/report?parcel=${unreported[0].parcelId}&start=${unreported[0].date}&end=${unreported[0].endDate ?? unreported[0].date}`, action: t('today.makeReport') }
    : idle.length
      ? { status: 'soon', text: t('today.idlePlots', { n: idle.length, plots: idle.slice(0, 3).map((p) => p.name).join(', ') }), to: '/log/new', action: t('today.logWork') }
      : { status: 'done', text: t('today.allLogged'), to: '/log', action: t('today.openLog') };

  const w = weather.data;
  return (
    <section className="today" aria-labelledby="today-title">
      <h2 id="today-title" className="today-title">
        {t('today.title')} · {formatDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' })}
      </h2>
      <div className="today-grid">
        <article className="today-tile">
          <div className="today-head">
            <Icon name="weather" size={22} />
            {t('today.weather')}
            {parcel && <span className="muted small"> · {parcel.name}</span>}
          </div>
          {weather.status === 'loading' ? (
            <p className="muted">{t('today.loading')}</p>
          ) : weather.status === 'error' || !w ? (
            <p className="muted">{t('today.weatherError')}</p>
          ) : (
            <>
              <div className="today-big">{deg(w.tempNowC ?? w.tMaxC)}</div>
              <p className="today-line">
                {t('today.highLow', { max: deg(w.tMaxC), min: deg(w.tMinC) })}
                <br />
                {t('today.rain', { mm: w.rainMm ?? 0 })}
                {w.rainChancePct !== null && ` (${t('today.chance', { pct: w.rainChancePct })})`}
                {w.windKmh !== null && (
                  <>
                    <br />
                    {t('today.wind', { kmh: Math.round(w.windKmh) })}
                  </>
                )}
              </p>
            </>
          )}
        </article>

        <article className={`today-tile status-${next ? next.status : 'done'}`}>
          <div className="today-head">
            <Icon name="deadlines" size={22} />
            {t('today.nextDeadline')}
          </div>
          <p className="today-text">{next ? next.text : t('today.noDeadlines')}</p>
          <Link className="btn btn-sm" to={next?.to ?? '/deadlines'}>
            {t('today.seeDeadlines')}
          </Link>
        </article>

        <article className={`today-tile status-${todo.status}`}>
          <div className="today-head">
            <Icon name={todo.status === 'done' ? 'check' : 'warn'} size={22} />
            {t('today.todo')}
          </div>
          <p className="today-text">{todo.text}</p>
          <Link className={`btn btn-sm ${todo.status === 'done' ? '' : 'btn-primary'}`} to={todo.to}>
            {todo.action}
          </Link>
        </article>
      </div>
    </section>
  );
}
