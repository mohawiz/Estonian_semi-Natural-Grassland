import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { Icon, MeadowPlants } from '../components/Icon';
import { ConfirmDialog, EmptyState, PageHeader, Skeleton, useConfirm } from '../components/ui';
import { useToast } from '../components/Toast';
import { DashHero } from '../features/dashboard/DashHero';
import { Heatmap } from '../features/dashboard/Heatmap';
import { ParcelMap } from '../features/dashboard/ParcelMap';
import { RiskGauge } from '../features/dashboard/RiskGauge';
import { SatelliteCompare } from '../features/dashboard/SatelliteCompare';
import { Trends } from '../features/dashboard/Trends';
import { useMeadowWindow } from '../features/meadow/conditions';
import { useWeather } from '../features/weather/useWeather';
import { WeatherFacts, WeatherSourceNote } from '../features/weather/WeatherPanel';
import { WeatherTimeline, type DateWindow } from '../features/weather/WeatherTimeline';
import { addDays, formatDate, todayISO } from '../lib/dates';
import type { OnboardingTask } from '../lib/types';
import { formatArea } from '../lib/units';
import { weatherVerdict } from '../services/report';
import { computeRisk } from '../services/risk';
import { summarizeWeather, type WeatherDay } from '../services/weather';
import { noticeWindows } from './Deadlines';

const TASKS: { id: OnboardingTask; to?: string }[] = [{ id: 'openDemo' }, { id: 'logEntry', to: '/log/new' }, { id: 'buildReport', to: '/report' }, { id: 'askAssistant' }];

function seasonFor(today: string): DateWindow {
  const y = today >= `${today.slice(0, 4)}-05-01` ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const end = `${y}-10-31`;
  const yesterday = addDays(today, -1);
  return { start: `${y}-04-01`, end: end < yesterday ? end : yesterday };
}

function useLocalFlag(key: string) {
  const read = () => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  };
  const [value, setValue] = useState(read);
  return {
    value,
    set: (v: boolean) => {
      setValue(v);
      try {
        if (v) localStorage.setItem(key, '1');
        else localStorage.removeItem(key);
      } catch {
        /* storage blocked: lasts for this visit */
      }
    },
  };
}

export function Dashboard() {
  const { t, lang, data, farm, settings, loadDemo, updateSettings } = useApp();
  const ui = useUI();
  const toast = useToast();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const today = todayISO();
  const season = useMemo(() => seasonFor(today), [today]);
  const [parcelId, setParcelId] = useState(() => data.parcels.find((p) => p.id === 'demo-parcel-b')?.id ?? data.parcels[0]?.id ?? '');
  const parcel = data.parcels.find((p) => p.id === parcelId) ?? data.parcels[0];
  const entries = useMemo(() => data.entries.filter((e) => e.parcelId === parcel?.id), [data.entries, parcel?.id]);
  const firstMissed = entries.find((e) => e.kind === 'missed' && e.date >= season.start);
  const [brush, setBrush] = useState<DateWindow | null>(null);
  const [hoverWeek, setHoverWeek] = useState<string | null>(null);
  const [day, setDay] = useState<WeatherDay | null>(null);
  const hide = useLocalFlag('ga-hide-onboarding');

  const { state, retry } = useWeather(parcel?.lat, parcel?.lon, season.start, season.end, !!parcel, false);
  const series = state.status === 'ready' ? state.series : null;
  const defaultWindow: DateWindow = firstMissed ? { start: firstMissed.date, end: firstMissed.endDate ?? firstMissed.date } : { start: addDays(season.end, -29), end: season.end };
  const win = brush ?? defaultWindow;
  const windowDays = useMemo(() => series?.days.filter((d) => d.date >= win.start && d.date <= win.end) ?? null, [series, win.start, win.end]);
  useMeadowWindow(windowDays);

  const verdicts = useMemo(() => {
    const out: Record<string, ReturnType<typeof weatherVerdict>> = {};
    if (!series) return out;
    for (const e of entries.filter((x) => x.kind === 'missed' && x.reason)) {
      const days = series.days.filter((d) => d.date >= e.date && d.date <= (e.endDate ?? e.date));
      out[e.id] = weatherVerdict(e.reason!, days.length ? summarizeWeather(days) : null);
    }
    return out;
  }, [series, entries]);
  const risk = parcel ? computeRisk({ parcel, entries: data.entries, checklist: data.checklists.find((c) => c.parcelId === parcel.id), reports: data.reports, verdicts, noticeWorkingDays: settings.noticeWorkingDays, today, season }) : null;
  const windows = noticeWindows(data.entries, settings.noticeWorkingDays).filter((w) => !w.passed).slice(0, 3);
  const doneCount = TASKS.filter((x) => settings.onboarding[x.id]).length;
  const parcelName = (id: string) => data.parcels.find((p) => p.id === id)?.name ?? '—';
  const recent = [...data.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const runTask = async (id: OnboardingTask, to?: string) => {
    if (id === 'openDemo') {
      const go = async () => {
        await loadDemo();
        toast(t('settings.demoLoaded'));
      };
      if (data.farms.length && !farm?.isDemo) confirm.ask(go);
      else await go();
    } else if (id === 'askAssistant') ui.setAssistantOpen(true);
    else if (to) navigate(to);
  };

  const presets: { key: string; w: DateWindow | null }[] = [
    { key: 'dash.presetMissed', w: firstMissed ? { start: firstMissed.date, end: firstMissed.endDate ?? firstMissed.date } : null },
    { key: 'dash.preset30', w: { start: addDays(season.end, -29), end: season.end } },
    { key: 'dash.presetSeason', w: season },
  ];
  const stagger = (i: number) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 * i, duration: 0.6, ease: [0.22, 0.8, 0.2, 1] as const } });
  const updated = series ? t('dash.lastUpdated', { time: formatDate(series.fetchedAt, lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : '';

  return (
    <div>
      <DashHero
        eyebrow={parcel ? `${parcel.name} · ${formatDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' })}` : formatDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={farm?.owner ? t('dashboard.greetingNamed', { name: farm.owner.replace(/\s*\(demo\)$/, '') }) : t('dashboard.greeting')}
        window={series ? win : null}
      />
      <ConfirmDialog open={confirm.open} title={t('settings.loadDemo')} body={t('settings.demoConfirm')} confirmLabel={t('actions.continue')} onConfirm={confirm.confirm} onCancel={confirm.cancel} />
      <PageHeader
        home
        title={t('dashboard.title')}
        subtitle={t('dash.subtitle')}
        actions={
          <>
            <Link className="btn" to="/log/new">
              <Icon name="plus" />
              {t('dashboard.quickLog')}
            </Link>
            <Link className="btn btn-primary" to={parcel ? `/report?parcel=${parcel.id}&start=${win.start}&end=${win.end}&step=evidence` : '/report'}>
              <Icon name="report" />
              {t('dashboard.quickReport')}
            </Link>
          </>
        }
      />

      {!hide.value && (
        <motion.section className="panel tinted leaf" aria-labelledby="onboard-title" style={{ marginBottom: 26 }} data-tour="dashboard" {...stagger(0)}>
          <div className="panel-title">
            <div>
              <h2 id="onboard-title">{t('onboarding.title')}</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {doneCount === TASKS.length ? t('onboarding.allDone') : t('onboarding.subtitle')}
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => hide.set(true)}>
              {t('onboarding.hide')}
            </button>
          </div>
          <div className="progress" aria-hidden="true">
            <div style={{ width: `${(doneCount / TASKS.length) * 100}%` }} />
          </div>
          <ol className="ledger onboard" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0 18px' }}>
            {TASKS.map((task, i) => {
              const done = settings.onboarding[task.id];
              return (
                <li key={task.id} className={done ? 'done' : ''} style={{ borderBottom: 0 }}>
                  <span className="tick" aria-hidden="true">
                    <svg width="30" height="30" viewBox="0 0 30 30">
                      <circle cx="15" cy="15" r="13" fill={done ? 'var(--primary)' : 'none'} stroke={done ? 'var(--primary)' : 'var(--rule-strong)'} strokeWidth="2" />
                      {done ? (
                        <motion.path d="M9 15.5l4 4 8-9" stroke="var(--primary-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45 }} />
                      ) : (
                        <text x="15" y="19.5" textAnchor="middle" style={{ font: '600 13px var(--font-display)', fill: 'var(--ink-3)' }}>
                          {i + 1}
                        </text>
                      )}
                    </svg>
                  </span>
                  <span className="label grow">
                    {t(`onboarding.${task.id}`)}
                    <span className="sr-only">{done ? ' ✓' : ''}</span>
                  </span>
                  {!done && (
                    <button className="btn btn-sm" onClick={() => runTask(task.id, task.to)}>
                      {t('actions.open')}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {!settings.tourDone && (
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn btn-sm" onClick={() => ui.startTour('main')}>
                <Icon name="play" size={18} />
                {t('help.replayTour')}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => updateSettings({ tourDone: true })}>
                {t('actions.skip')}
              </button>
            </div>
          )}
        </motion.section>
      )}

      {!parcel ? (
        <EmptyState
          title={t('dashboard.noFarmTitle')}
          body={t('dashboard.noFarmBody')}
          art={<MeadowPlants />}
          action={
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => runTask('openDemo')}>
                {t('dashboard.loadDemo')}
              </button>
              <Link className="btn" to="/parcels/new">
                {t('dashboard.addParcel')}
              </Link>
            </div>
          }
        />
      ) : (
        <div className="dash-grid">
          {/* 1. The hero timeline: brushing drives the stats, the report link and the meadow */}
          <motion.section className="panel leaf span-12" aria-labelledby="tl-title" {...stagger(1)}>
            <div className="panel-title">
              <div>
                <div className="eyebrow">
                  {parcel.name} · {formatArea(parcel.areaHa, lang)}
                </div>
                <h2 id="tl-title">{t('dash.timelineTitle')}</h2>
              </div>
              <div className="seg-tabs" role="group" aria-label={t('dash.window')}>
                {presets.map((p) => (
                  <button key={p.key} type="button" disabled={!p.w} aria-pressed={!!p.w && p.w.start === win.start && p.w.end === win.end} onClick={() => p.w && setBrush(p.w)}>
                    {t(p.key)}
                  </button>
                ))}
              </div>
            </div>
            {state.status === 'loading' || state.status === 'idle' ? (
              <div aria-busy="true">
                <Skeleton height={240} />
              </div>
            ) : state.status === 'error' ? (
              <div className="notice notice-warn" role="alert">
                <Icon name="warn" size={20} />
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
            ) : (
              series && (
                <>
                  <p className="small muted" style={{ margin: '0 0 6px' }}>
                    {t('dash.brushHint')}
                  </p>
                  <WeatherTimeline days={series.days} band={firstMissed ? { start: firstMissed.date, end: firstMissed.endDate ?? firstMissed.date } : null} brush={win} onBrush={setBrush} onDayClick={setDay} selectedDay={day?.date} height={280} />
                  {day && (
                    <div className="notice" style={{ marginTop: 10, alignItems: 'center' }}>
                      <Icon name="calendar" size={20} />
                      <div style={{ flex: 1 }}>
                        <strong>{formatDate(day.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
                        <div className="small">
                          {t('weather.rain')}: {day.precipitationMm ?? '—'} · {t('weather.tmax')}: {day.tMaxC ?? '—'} · {t('weather.soil')}: {day.soilMoisture ? day.soilMoisture.toFixed(3) : '—'} · {t('weather.wind')}: {day.windMaxKmh != null ? `${Math.round(day.windMaxKmh)} km/h` : '—'} · {t('weather.humidity')}: {day.humidityPct != null ? `${Math.round(day.humidityPct)} %` : '—'}
                        </div>
                        {entries
                          .filter((e) => e.date <= day.date && (e.endDate ?? e.date) >= day.date)
                          .map((e) => (
                            <Link key={e.id} to={`/log/${e.id}`} className="small" style={{ marginRight: 10 }}>
                              {e.kind === 'missed' ? t('log.missedBadge') : t(`method.${e.kind}`)}
                            </Link>
                          ))}
                      </div>
                      <button className="btn btn-ghost icon-btn" aria-label={t('actions.close')} onClick={() => setDay(null)}>
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                  )}
                  <WeatherFacts series={series} range={win} />
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                    <span className="updated">{updated}</span>
                    <Link className="btn btn-primary btn-sm" to={`/report?parcel=${parcel.id}&start=${win.start}&end=${win.end}&step=evidence`}>
                      <Icon name="report" size={18} />
                      {t('dash.reportForWindow')}
                    </Link>
                  </div>
                  <WeatherSourceNote series={series} />
                </>
              )
            )}
          </motion.section>

          {/* 2. Map: selecting a parcel updates every chart */}
          <motion.section className="panel span-5" aria-labelledby="map-title" {...stagger(2)}>
            <div className="panel-title">
              <h2 id="map-title">{t('dash.mapTitle')}</h2>
            </div>
            <ParcelMap
              parcels={data.parcels}
              selected={parcel.id}
              onSelect={(id) => {
                setParcelId(id);
                setBrush(null);
                setDay(null);
              }}
            />
          </motion.section>

          {/* 3. Management calendar */}
          <motion.section className="panel span-7" aria-labelledby="heat-title" {...stagger(3)}>
            <div className="panel-title">
              <h2 id="heat-title">{t('dash.heatTitle')}</h2>
              <span className="small muted">{t('dash.heatHint')}</span>
            </div>
            <Heatmap entries={entries} season={season} window={win} hoverWeek={hoverWeek} />
          </motion.section>

          {/* 4. Risk gauge */}
          <motion.section className="panel tinted span-4" aria-labelledby="risk-title" {...stagger(4)}>
            <div className="panel-title">
              <h2 id="risk-title">{t('dash.riskTitle')}</h2>
              <span className="badge badge-neutral">{t('dash.decisionSupport')}</span>
            </div>
            {risk && <RiskGauge risk={risk} />}
          </motion.section>

          {/* 5. Records vs satellite (demo) */}
          <motion.section className="panel span-8" aria-labelledby="sat-title" {...stagger(5)}>
            <div className="panel-title">
              <h2 id="sat-title">{t('dash.satTitle')}</h2>
            </div>
            <SatelliteCompare parcel={parcel} entries={data.entries} season={season} />
          </motion.section>

          {/* 6. Seasonal trends */}
          <motion.section className="panel span-12" aria-labelledby="trend-title" {...stagger(6)}>
            <div className="panel-title">
              <h2 id="trend-title">{t('dash.trendsTitle')}</h2>
              {series && <span className="updated">{updated}</span>}
            </div>
            {series ? <Trends series={series} window={win} hoverWeek={hoverWeek} onHoverWeek={setHoverWeek} /> : <Skeleton height={190} />}
          </motion.section>

          <section className="panel flat span-6">
            <div className="panel-title">
              <h2>{t('dashboard.recent')}</h2>
              <Link to="/log" className="small">
                {t('dashboard.viewAll')}
              </Link>
            </div>
            {recent.length ? (
              <ul className="ledger">
                {recent.map((e) => (
                  <li key={e.id}>
                    <Icon name={e.kind === 'missed' ? 'warn' : 'sprout'} />
                    <span className="grow">
                      <Link to={`/log/${e.id}`}>{e.kind === 'missed' ? `${t('log.missedBadge')}: ${t(`method.${e.plannedAction ?? 'mowing'}`)}` : t(`method.${e.kind}`)}</Link>
                      <span className="muted small"> · {parcelName(e.parcelId)}</span>
                      <br />
                      <span className="muted small">
                        {formatDate(e.date, lang)}
                        {e.endDate && e.endDate !== e.date ? ` – ${formatDate(e.endDate, lang)}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('dashboard.noRecent')}</p>
            )}
          </section>
          <section className="panel flat span-6">
            <div className="panel-title">
              <h2>{t('dashboard.upcoming')}</h2>
              <Link to="/deadlines" className="small">
                {t('dashboard.viewAll')}
              </Link>
            </div>
            {windows.length ? (
              <ul className="ledger">
                {windows.map((w) => (
                  <li key={w.entry.id}>
                    <Icon name="deadlines" />
                    <span className="grow">
                      {parcelName(w.entry.parcelId)}
                      <br />
                      <span className="muted small">{t('deadlines.due', { date: formatDate(w.deadline, lang) })}</span>
                    </span>
                    <span className="badge badge-rain">{t('deadlines.left', { n: w.left })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('dashboard.noUpcoming')}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
