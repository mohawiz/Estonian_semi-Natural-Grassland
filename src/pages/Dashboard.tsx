import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { Icon, MeadowPlants } from '../components/Icon';
import { ConfirmDialog, EmptyState, PageHeader, Skeleton, useConfirm } from '../components/ui';
import { useToast } from '../components/Toast';
import { Heatmap } from '../features/dashboard/Heatmap';
import { RealMap } from '../features/map/RealMap';
import { RiskGauge } from '../features/dashboard/RiskGauge';
import { SatelliteCompare } from '../features/dashboard/SatelliteCompare';
import { TodayCard } from '../features/dashboard/TodayCard';
import { useWeather } from '../features/weather/useWeather';
import { WeatherFacts, WeatherSourceNote } from '../features/weather/WeatherPanel';
import type { DateWindow } from '../features/weather/WeatherTimeline';
import { addDays, formatDate, formatDateTime, seasonFor, todayISO } from '../lib/dates';
import type { OnboardingTask } from '../lib/types';
import { formatArea } from '../lib/units';
import { weatherVerdict } from '../services/report';
import { computeRisk } from '../services/risk';
import { summarizeWeather } from '../services/weather';
import { noticeWindows } from './Deadlines';

const TASKS: { id: OnboardingTask; to?: string }[] = [{ id: 'openDemo' }, { id: 'logEntry', to: '/log/new' }, { id: 'buildReport', to: '/report' }, { id: 'askAssistant' }];

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
  const hide = useLocalFlag('ga-hide-onboarding');
  const [details, setDetails] = useState(false);

  const { state, retry } = useWeather(parcel?.lat, parcel?.lon, season.start, season.end, !!parcel, false);
  const series = state.status === 'ready' ? state.series : null;
  const defaultWindow: DateWindow = firstMissed ? { start: firstMissed.date, end: firstMissed.endDate ?? firstMissed.date } : { start: addDays(season.end, -29), end: season.end };
  const win = brush ?? defaultWindow;

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
  const updated = series ? t('dash.lastUpdated', { time: formatDate(series.fetchedAt, lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : '';

  return (
    <div>
      <ConfirmDialog open={confirm.open} title={t('settings.loadDemo')} body={t('settings.demoConfirm')} confirmLabel={t('actions.continue')} onConfirm={confirm.confirm} onCancel={confirm.cancel} />
      <PageHeader
        home
        title={t('dashboard.title')}
        subtitle={t('dash.subtitle')}
        actions={
          <>
            <Link className="btn" to={parcel ? `/report?parcel=${parcel.id}&start=${win.start}&end=${win.end}&step=evidence` : '/report'}>
              <Icon name="report" />
              {t('dashboard.quickReport')}
            </Link>
          </>
        }
      />

      {/* the one main action, big and first */}
      <Link className="btn btn-primary btn-hero" to="/log/new">
        <Icon name="plus" size={30} />
        <span>
          <span className="btn-hero-title">{t('today.bigLog')}</span>
          <span className="btn-hero-hint">{t('today.bigLogHint')}</span>
        </span>
      </Link>
      {parcel && <TodayCard parcel={parcel} season={season} today={today} />}

      {!hide.value && (
        <section className="panel tinted leaf" aria-labelledby="onboard-title" style={{ marginBottom: 26 }} data-tour="dashboard">
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
                        <path d="M9 15.5l4 4 8-9" stroke="var(--primary-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
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
        </section>
      )}

      {!parcel ? (
        <EmptyState
          title={t('dashboard.noFarmTitle')}
          body={t('dashboard.noFarmBody')}
          art={<MeadowPlants />}
          action={
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link className="btn btn-primary" to="/start">
                {t('setup.cta')}
              </Link>
              <button className="btn" onClick={() => runTask('openDemo')}>
                {t('dashboard.loadDemo')}
              </button>
              <Link className="btn" to="/meadows">
                {t('nav.meadows')}
              </Link>
            </div>
          }
        />
      ) : (
        <div className="dash-grid">
          {/* 1. Weather for a chosen period: the buttons drive the figures, the calendar and the report link */}
          <section className="panel leaf span-12" aria-labelledby="tl-title">
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
                <Skeleton height={120} />
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
          </section>

          {/* 2. Map: selecting a parcel updates every chart */}
          <section className="panel span-12" aria-labelledby="map-title">
            <div className="panel-title">
              <h2 id="map-title">{t('dash.mapTitle')}</h2>
            </div>
            <RealMap
              label={t('dash.mapTitle')}
              parcels={data.parcels}
              selected={parcel.id}
              onSelect={(id) => {
                setParcelId(id);
                setBrush(null);
              }}
            />
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              {t('dash.mapNote')}
            </p>
          </section>

          {/* two list cards: each row is a whole link with a status-coloured icon */}
          <section className="panel span-6 list-card">
            <div className="panel-title">
              <h2>{t('dashboard.recent')}</h2>
              <Link to="/log" className="btn btn-sm">
                {t('dashboard.viewAll')}
              </Link>
            </div>
            {recent.length ? (
              <ul className="list-rows">
                {recent.map((e) => (
                  <li key={e.id}>
                    <Link to={`/log/${e.id}`} className={`list-row ${e.kind === 'missed' ? 'status-late' : 'status-done'}`}>
                      <span className="list-icon" aria-hidden="true">
                        <Icon name={e.kind === 'missed' ? 'warn' : 'sprout'} size={20} />
                      </span>
                      <span className="grow">
                        <span className="list-title">{e.kind === 'missed' ? `${t('log.missedBadge')}: ${t(`method.${e.plannedAction ?? 'mowing'}`)}` : t(`method.${e.kind}`)}</span>
                        <span className="list-meta">
                          {parcelName(e.parcelId)} · {formatDate(e.date, lang)}
                          {e.endDate && e.endDate !== e.date ? ` – ${formatDate(e.endDate, lang)}` : ''}
                        </span>
                        <span className="list-meta list-stamp">{t('log.loggedAt', { when: formatDateTime(e.updatedAt ?? e.createdAt, lang) })}</span>
                      </span>
                      <Icon name="chevron" size={18} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="list-empty status-soon">
                <span className="list-icon" aria-hidden="true">
                  <Icon name="log" size={20} />
                </span>
                {t('dashboard.noRecent')}
              </p>
            )}
          </section>
          <section className="panel span-6 list-card">
            <div className="panel-title">
              <h2>{t('dashboard.upcoming')}</h2>
              <Link to="/deadlines" className="btn btn-sm">
                {t('dashboard.viewAll')}
              </Link>
            </div>
            {windows.length ? (
              <ul className="list-rows">
                {windows.map((w) => (
                  <li key={w.entry.id}>
                    <Link to="/deadlines" className={`list-row ${w.left <= 2 ? 'status-late' : 'status-soon'}`}>
                      <span className="list-icon" aria-hidden="true">
                        <Icon name="deadlines" size={20} />
                      </span>
                      <span className="grow">
                        <span className="list-title">{parcelName(w.entry.parcelId)}</span>
                        <span className="list-meta">{t('deadlines.due', { date: formatDate(w.deadline, lang) })}</span>
                      </span>
                      <span className={`badge ${w.left <= 2 ? 'badge-warn' : 'badge-soon'}`}>{t('deadlines.left', { n: w.left })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="list-empty status-done">
                <span className="list-icon" aria-hidden="true">
                  <Icon name="check" size={20} />
                </span>
                {t('dashboard.noUpcoming')}
              </p>
            )}
          </section>
          {/* on phones the detailed charts wait behind one button, so the first screen stays short */}
          <div className="span-12 details-toggle">
            <button type="button" className="btn" aria-expanded={details} aria-controls="dash-details" onClick={() => setDetails((d) => !d)}>
              <Icon name={details ? 'close' : 'gauge'} size={20} />
              {details ? t('today.hideDetails') : t('today.showDetails')}
            </button>
          </div>
          <div id="dash-details" className={`dash-details ${details ? 'open' : ''}`}>
          {/* 3. Management calendar */}
          <section className="panel span-12" aria-labelledby="heat-title">
            <div className="panel-title">
              <h2 id="heat-title">{t('dash.heatTitle')}</h2>
              <span className="small muted">{t('dash.heatHint')}</span>
            </div>
            <Heatmap entries={entries} season={season} window={win} hoverWeek={null} />
          </section>

          {/* 4. Risk gauge */}
          <section className="panel tinted span-4" aria-labelledby="risk-title">
            <div className="panel-title">
              <h2 id="risk-title">{t('dash.riskTitle')}</h2>
              <span className="badge badge-neutral">{t('dash.decisionSupport')}</span>
            </div>
            {risk && <RiskGauge risk={risk} />}
          </section>

          {/* 5. Records vs satellite (demo) */}
          <section className="panel span-8" aria-labelledby="sat-title">
            <div className="panel-title">
              <h2 id="sat-title">{t('dash.satTitle')}</h2>
            </div>
            <SatelliteCompare parcel={parcel} entries={data.entries} season={season} />
          </section>

          </div>
        </div>
      )}
    </div>
  );
}
