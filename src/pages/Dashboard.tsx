import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { Icon } from '../components/Icon';
import { Area, ConfirmDialog, EmptyState, PageHeader, useConfirm } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDate, todayISO } from '../lib/dates';
import type { OnboardingTask } from '../lib/types';
import { noticeWindows } from './Deadlines';

const TASKS: { id: OnboardingTask; to?: string }[] = [
  { id: 'openDemo' },
  { id: 'logEntry', to: '/log/new' },
  { id: 'buildReport', to: '/report' },
  { id: 'askAssistant' },
];

export function Dashboard() {
  const { t, lang, data, farm, settings, loadDemo, updateSettings } = useApp();
  const ui = useUI();
  const toast = useToast();
  const navigate = useNavigate();
  const year = todayISO().slice(0, 4);
  const totalHa = data.parcels.reduce((s, p) => s + p.areaHa, 0);
  const recent = [...data.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const windows = noticeWindows(data.entries, settings.noticeWorkingDays).filter((w) => !w.passed).slice(0, 3);
  const parcelName = (id: string) => data.parcels.find((p) => p.id === id)?.name ?? '—';
  const doneCount = TASKS.filter((x) => settings.onboarding[x.id]).length;
  const hideChecklist = useLocalFlag('ga-hide-onboarding');
  const confirm = useConfirm();

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

  return (
    <div>
      <ConfirmDialog open={confirm.open} title={t('settings.loadDemo')} body={t('settings.demoConfirm')} confirmLabel={t('actions.continue')} onConfirm={confirm.confirm} onCancel={confirm.cancel} />
      <PageHeader
        home
        title={t('dashboard.title')}
        subtitle={farm?.owner ? t('dashboard.greetingNamed', { name: farm.owner }) : t('dashboard.greeting')}
        actions={
          <>
            <Link className="btn" to="/log/new">
              <Icon name="plus" />
              {t('dashboard.quickLog')}
            </Link>
            <Link className="btn btn-primary" to="/report">
              <Icon name="report" />
              {t('dashboard.quickReport')}
            </Link>
          </>
        }
      />

      {!hideChecklist.value && (
        <section className="panel" aria-labelledby="onboard-title" style={{ marginBottom: 16 }} data-tour="dashboard">
          <div className="panel-title">
            <div>
              <h2 id="onboard-title">{t('onboarding.title')}</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {doneCount === TASKS.length ? t('onboarding.allDone') : t('onboarding.subtitle')}
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => hideChecklist.set(true)}>
              {t('onboarding.hide')}
            </button>
          </div>
          <div className="progress" aria-hidden="true">
            <div style={{ width: `${(doneCount / TASKS.length) * 100}%` }} />
          </div>
          <ul className="ledger onboard">
            {TASKS.map((task) => {
              const done = settings.onboarding[task.id];
              return (
                <li key={task.id} className={done ? 'done' : ''}>
                  <span className="tick" aria-hidden="true">
                    {done && <Icon name="check" size={14} />}
                  </span>
                  <span className="label grow">
                    {t(`onboarding.${task.id}`)}
                    <span className="sr-only">{done ? ' ✓' : ''}</span>
                  </span>
                  {!done && (
                    <button className="btn btn-sm" onClick={() => runTask(task.id, task.to)}>
                      {t('actions.open')}
                      <Icon name="chevron" size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!settings.tourDone && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => ui.startTour('main')}>
                <Icon name="play" size={16} />
                {t('help.replayTour')}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => updateSettings({ tourDone: true })}>
                {t('actions.skip')}
              </button>
            </div>
          )}
        </section>
      )}

      {!data.parcels.length ? (
        <EmptyState
          title={t('dashboard.noFarmTitle')}
          body={t('dashboard.noFarmBody')}
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
        <>
          <div className="tally" style={{ marginBottom: 16 }} data-tour="dashboard">
            <div>
              <div className="num">{data.parcels.length}</div>
              <div className="lbl">{t('dashboard.statParcels')}</div>
            </div>
            <div>
              <div className="num" style={{ fontSize: '1.15rem' }}>
                <Area ha={totalHa} />
              </div>
              <div className="lbl">{t('dashboard.statArea')}</div>
            </div>
            <div>
              <div className="num">{data.entries.filter((e) => e.date.startsWith(year)).length}</div>
              <div className="lbl">{t('dashboard.statEntries')}</div>
            </div>
            <div>
              <div className="num">{data.entries.filter((e) => e.kind === 'missed').length}</div>
              <div className="lbl">{t('dashboard.statMissed')}</div>
            </div>
          </div>
          <div className="grid grid-2">
            <section className="panel">
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
                        <strong>{e.kind === 'missed' ? `${t('log.missedBadge')}: ${t(`method.${e.plannedAction ?? 'mowing'}`)}` : t(`method.${e.kind}`)}</strong>
                        <span className="muted small"> · {parcelName(e.parcelId)}</span>
                        <br />
                        <span className="muted small">
                          {formatDate(e.date, lang)}
                          {e.endDate && e.endDate !== e.date ? ` – ${formatDate(e.endDate, lang)}` : ''}
                        </span>
                      </span>
                      <Link className="btn btn-ghost btn-sm" to={`/log/${e.id}`} aria-label={`${t('actions.edit')} ${formatDate(e.date, lang)}`}>
                        <Icon name="edit" size={16} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{t('dashboard.noRecent')}</p>
              )}
            </section>
            <div className="stack">
              <section className="panel">
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
              <section className="panel">
                <h2>{t('dashboard.quick')}</h2>
                <div className="grid grid-2" style={{ gap: 8 }}>
                  <Link className="btn" to="/log/new">
                    <Icon name="log" />
                    {t('dashboard.quickLog')}
                  </Link>
                  <Link className="btn" to="/weather">
                    <Icon name="rain" />
                    {t('dashboard.quickWeather')}
                  </Link>
                  <Link className="btn" to="/report">
                    <Icon name="report" />
                    {t('dashboard.quickReport')}
                  </Link>
                  <button className="btn" onClick={() => ui.setAssistantOpen(true)}>
                    <Icon name="assistant" />
                    {t('dashboard.quickAsk')}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
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
        /* storage blocked: preference lasts for this visit only */
      }
    },
  };
}
