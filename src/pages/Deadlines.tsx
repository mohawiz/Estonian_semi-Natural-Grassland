import { useState } from 'react';
import { useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { EmptyState, HelpTip, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { addWorkingDays, formatDate, todayISO, workingDaysBetween } from '../lib/dates';
import type { LogEntry } from '../lib/types';

export interface NoticeWindow {
  entry: LogEntry;
  deadline: string;
  left: number;
  passed: boolean;
}

export function noticeWindows(entries: LogEntry[], workingDays: number, today = todayISO()): NoticeWindow[] {
  return entries
    .filter((e) => e.kind === 'missed')
    .map((entry) => {
      const deadline = addWorkingDays(entry.date, workingDays);
      const passed = today > deadline;
      return { entry, deadline, passed, left: passed ? 0 : workingDaysBetween(today, deadline) };
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

export function Deadlines() {
  const { t, lang, data, settings, updateSettings } = useApp();
  const toast = useToast();
  const [days, setDays] = useState(String(settings.noticeWorkingDays));
  const windows = noticeWindows(data.entries, settings.noticeWorkingDays);
  const parcelName = (id: string) => data.parcels.find((p) => p.id === id)?.name ?? '—';
  const valid = /^\d+$/.test(days) && +days >= 1 && +days <= 120;

  return (
    <>
      <PageHeader title={t('deadlines.title')} subtitle={t('deadlines.subtitle')} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="panel">
          {windows.length ? (
            <ul className="ledger">
              {windows.map((w) => (
                <li key={w.entry.id}>
                  <Icon name="deadlines" />
                  <span className="grow">
                    <strong>{parcelName(w.entry.parcelId)}</strong>
                    <span className="muted small"> · {t(`reason.${w.entry.reason ?? 'other'}`)}</span>
                    <br />
                    <span className="small">
                      {formatDate(w.entry.date, lang)} – {formatDate(w.entry.endDate ?? w.entry.date, lang)}
                    </span>
                    <br />
                    <span className="small">{w.passed ? t('deadlines.passed', { date: formatDate(w.deadline, lang) }) : t('deadlines.due', { date: formatDate(w.deadline, lang) })}</span>
                  </span>
                  <span className={`badge ${w.passed ? 'badge-neutral' : w.left <= 3 ? 'badge-warn' : 'badge-rain'}`}>{w.passed ? '—' : w.left === 0 ? t('deadlines.today') : t('deadlines.left', { n: w.left })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="deadlines" title={t('deadlines.title')} body={t('deadlines.empty')} />
          )}
          <p className="muted small" style={{ marginTop: 10 }}>
            {t('deadlines.calendarNote')}
          </p>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>{t('deadlines.configTitle')}</h2>
            <span className="badge badge-warn">{t('deadlines.unverifiedBadge')}</span>
          </div>
          <p className="small">{t('deadlines.configHelp')}</p>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!valid) return;
              await updateSettings({ noticeWorkingDays: +days });
              toast(t('deadlines.saved'));
            }}
          >
            <div className="field">
              <label htmlFor="notice-days">
                {t('deadlines.configLabel')} <HelpTip text={t('help.terms.workingDay.def')} />
              </label>
              <input id="notice-days" type="number" min={1} max={120} inputMode="numeric" value={days} aria-invalid={!valid} onChange={(e) => setDays(e.target.value)} style={{ maxWidth: 140 }} />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={!valid}>
                {t('actions.save')}
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
