import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { uid, useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { Area, EmptyState, HelpTip, Notice, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { draftJustification } from '../features/report/draft';
import { ReportDocument } from '../features/report/ReportDocument';
import { PhotoThumb } from '../features/photos/PhotoThumb';
import { useMeadowWindow } from '../features/meadow/conditions';
import { useWeather } from '../features/weather/useWeather';
import { WeatherPanel } from '../features/weather/WeatherPanel';
import { addDays, daysInclusive, formatDate, todayISO } from '../lib/dates';
import type { MissedReason, ReportInput } from '../lib/types';
import { formatNumber } from '../lib/units';
import { retrieval } from '../services';
import { isConfident } from '../services/retrieval';
import { buildReport, ruleQueryFor } from '../services/report';
import { summarizeWeather } from '../services/weather';

type Step = 'setup' | 'evidence' | 'review';
const STEPS: Step[] = ['setup', 'evidence', 'review'];
const REASONS: MissedReason[] = ['too-wet', 'drought', 'no-livestock', 'no-feed-demand', 'machinery', 'other'];

export function ReportPage() {
  const { t, lang, data, farm, settings, saveReport, deleteReport, completeTask } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const step = (STEPS.includes(params.get('step') as Step) ? params.get('step') : 'setup') as Step;
  const parcelId = params.get('parcel') ?? data.parcels[0]?.id ?? '';
  const parcel = data.parcels.find((p) => p.id === parcelId);
  const missed = data.entries.find((e) => e.parcelId === parcelId && e.kind === 'missed');
  const start = params.get('start') ?? missed?.date ?? addDays(today, -30);
  const end = params.get('end') ?? missed?.endDate ?? addDays(today, -1);
  const plannedAction = (params.get('action') ?? missed?.plannedAction ?? 'mowing') as 'mowing' | 'grazing';
  const reason = (params.get('reason') ?? missed?.reason ?? 'too-wet') as MissedReason;

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => next.set(k, v));
    if (!next.get('parcel') && parcelId) next.set('parcel', parcelId);
    setParams(next, { replace: true });
  };

  const [affected, setAffected] = useState('');
  const [severity, setSeverity] = useState<ReportInput['severity']>('moderate');
  const [farmerName, setFarmerName] = useState(farm?.owner ?? '');
  const [justification, setJustification] = useState('');
  const [edited, setEdited] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Weather for the period with two weeks of context on each side.
  const wStart = addDays(start, -14);
  const wEndRaw = addDays(end, 14);
  const wEnd = wEndRaw >= today ? addDays(today, -1) : wEndRaw;
  const periodOk = start <= end && start < today;
  const { state, baseline, retry } = useWeather(parcel?.lat, parcel?.lon, wStart, wEnd, !!parcel && periodOk && step !== 'setup', { start, end });
  const series = state.status === 'ready' ? state.series : null;
  // the meadow behind the page shows the report period's weather
  useMeadowWindow(useMemo(() => series?.days.filter((d) => d.date >= start && d.date <= end) ?? null, [series, start, end]));

  const affectedHa = affected ? Number(affected.replace(',', '.')) : (missed?.areaHa ?? parcel?.areaHa ?? 0);
  const rules = useMemo(() => retrieval.searchSync(ruleQueryFor(reason, plannedAction), 6).filter((h, i) => i === 0 || isConfident(h)).slice(0, 3).map((h) => h.passage), [reason, plannedAction]);

  const input: ReportInput = { parcelId, start, end, plannedAction, reason, affectedHa, severity, justification, farmerName };
  const report = useMemo(
    () =>
      parcel && farm
        ? buildReport({
            input,
            farm,
            parcel,
            entries: data.entries,
            photos: data.photos,
            weather: series,
            weatherError: state.status === 'error' ? state.message : undefined,
            baseline: baseline.data ?? null,
            rules,
            noticeWorkingDays: settings.noticeWorkingDays,
            today,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parcel, farm, data.entries, data.photos, series, state, baseline.data, rules, settings.noticeWorkingDays, start, end, plannedAction, reason, affectedHa, severity, justification, farmerName],
  );

  // Keep a data-based draft until the farmer edits it.
  useEffect(() => {
    if (edited || !parcel || !report) return;
    const days = series?.days.filter((d) => d.date >= start && d.date <= end) ?? [];
    const summary = days.length ? summarizeWeather(days, baseline.data) : null;
    const later = data.entries.filter((e) => e.parcelId === parcel.id && e.kind === plannedAction && e.date > end).sort((a, b) => a.date.localeCompare(b.date))[0];
    setJustification(draftJustification(lang, input, parcel, summary, report.photos.length, later));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, baseline.data, lang, parcelId, start, end, plannedAction, reason, affectedHa, edited, report?.photos.length]);

  useEffect(() => {
    if (step === 'review') completeTask('buildReport');
  }, [step, completeTask]);

  if (!parcel || !farm)
    return (
      <>
        <PageHeader title={t('report.title')} subtitle={t('report.subtitle')} />
        <EmptyState icon="report" title={t('report.emptyTitle')} body={t('report.emptyBody')} action={<Link className="btn btn-primary" to="/parcels/new">{t('parcels.add')}</Link>} />
      </>
    );

  const downloadPdf = async () => {
    if (!report) return;
    setPdfBusy(true);
    try {
      const { buildPdf } = await import('../features/report/pdf');
      const blob = await buildPdf(report, lang);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${lang === 'et' ? 'selgitus' : 'explanation'}-${parcel.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${start}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(t('report.pdfToast'));
    } catch (e) {
      console.error(e);
      toast(t('report.pdfError'), { kind: 'error' });
    } finally {
      setPdfBusy(false);
    }
  };

  const goto = (s: Step) => setParam({ step: s });
  const periodDays = periodOk ? daysInclusive(start, end) : 0;

  return (
    <>
      <PageHeader title={t('report.title')} subtitle={t('report.subtitle')} />
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button aria-current={s === step ? 'step' : undefined} onClick={() => goto(s)} disabled={i > 0 && !periodOk}>
              {t(`report.steps.${s}`)}
            </button>
          </li>
        ))}
      </ol>

      {step === 'setup' && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <section className="panel form">
            <div className="field" data-tour="report-parcel">
              <label htmlFor="r-parcel">{t('report.parcel')}</label>
              <select id="r-parcel" value={parcelId} onChange={(e) => setParam({ parcel: e.target.value })}>
                {data.parcels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                {t(`community.${parcel.communityType}`)} · <Area ha={parcel.areaHa} />
              </span>
            </div>
            <fieldset className="field" data-tour="report-period">
              <legend>{t('report.period')}</legend>
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="r-start" className="small">
                    {t('weather.from')}
                  </label>
                  <input id="r-start" type="date" value={start} max={today} onChange={(e) => setParam({ start: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="r-end" className="small">
                    {t('weather.to')}
                  </label>
                  <input id="r-end" type="date" value={end} min={start} onChange={(e) => setParam({ end: e.target.value })} aria-invalid={!periodOk} />
                </div>
              </div>
              {!periodOk ? <span className="error-text">{t('log.endBeforeStart')}</span> : <span className="hint">{t('log.days', { n: periodDays })}</span>}
              <div className="grid grid-2" style={{ marginTop: 6 }}>
                <div className="field">
                  <label htmlFor="r-action">{t('report.plannedAction')}</label>
                  <select id="r-action" value={plannedAction} onChange={(e) => setParam({ action: e.target.value })}>
                    <option value="mowing">{t('method.mowing')}</option>
                    <option value="grazing">{t('method.grazing')}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="r-reason">{t('report.reason')}</label>
                  <select id="r-reason" value={reason} onChange={(e) => setParam({ reason: e.target.value })}>
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`reason.${r}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={!periodOk} onClick={() => goto('evidence')}>
                {t('actions.next')}
                <Icon name="chevron" size={16} />
              </button>
            </div>
          </section>
          <SavedReports
            onOpen={(r) => {
              setSeverity(r.input.severity);
              setAffected(String(r.input.affectedHa));
              setFarmerName(r.input.farmerName);
              setJustification(r.input.justification);
              setEdited(true);
              setParams({ parcel: r.parcelId, start: r.input.start, end: r.input.end, action: r.input.plannedAction, reason: r.input.reason, step: 'review' });
            }} onDelete={async (id) => toast(t('actions.delete'), { undo: await deleteReport(id) })} />
        </div>
      )}

      {step === 'evidence' && report && (
        <div className="stack">
          <section className="panel">
            <div className="panel-title">
              <h2>{t('report.sectionWeather')}</h2>
              <span className="badge badge-ok">{t('labels.real')}</span>
            </div>
            <WeatherPanel state={state} baseline={baseline} retry={retry} band={{ start, end }} range={{ start, end }} />
          </section>
          <section className="panel" data-tour="report-evidence">
            <h2>{t('report.sectionPhotos')}</h2>
            {report.missedEntries.map((e) => (
              <p key={e.id} className="small">
                <Icon name="log" size={16} /> {t('report.missedEntry')}: {formatDate(e.date, lang)} – {formatDate(e.endDate ?? e.date, lang)} · {t(`reason.${e.reason ?? 'other'}`)} · <Link to={`/log/${e.id}`}>{t('actions.edit')}</Link>
              </p>
            ))}
            {report.photos.length ? (
              <div className="thumbs">
                {report.photos.map((p) => (
                  <PhotoThumb key={p.id} photo={p} />
                ))}
              </div>
            ) : (
              <Notice kind="info">
                {t('report.noPhotos')}{' '}
                <Link to={`/log/new?parcel=${parcel.id}`}>{t('assistant.suggestPhotos')}</Link>
              </Notice>
            )}
          </section>
          <section className="panel form">
            <h2>{t('report.sectionAssessment')}</h2>
            <div className="grid grid-3">
              <div className="field">
                <label htmlFor="r-sev">
                  {t('report.severity')} <HelpTip text={t('report.severityHelp')} />
                </label>
                <select id="r-sev" value={severity} onChange={(e) => setSeverity(e.target.value as ReportInput['severity'])}>
                  {(['minor', 'moderate', 'major'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`report.severityOptions.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="r-aff">
                  {t('report.affected')} (ha) <HelpTip text={`${t('report.extentHelp')} ${t('parcels.areaHelp')}`} />
                </label>
                <input id="r-aff" type="text" inputMode="decimal" value={affected} placeholder={String(missed?.areaHa ?? parcel.areaHa)} onChange={(e) => setAffected(e.target.value)} />
                <span className="hint">
                  <Area ha={affectedHa} /> · {formatNumber(report.extent.percent, lang)}%
                </span>
              </div>
              <div className="field">
                <span className="label">
                  {t('report.durationHelp').split(':')[0]} <HelpTip text={t('report.durationHelp')} />
                </span>
                <span style={{ paddingTop: 8 }}>{t('log.days', { n: periodDays })}</span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="r-name">{t('report.farmer')}</label>
              <input id="r-name" type="text" value={farmerName} onChange={(e) => setFarmerName(e.target.value)} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="r-just">
                {t('report.justification')} <HelpTip text={t('report.justificationHelp')} />
              </label>
              <textarea
                id="r-just"
                value={justification}
                onChange={(e) => {
                  setEdited(true);
                  setJustification(e.target.value);
                }}
                style={{ minHeight: 160 }}
              />
              <div className="row">
                <span className="hint">{t('report.justificationHelp')}</span>
                {edited && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdited(false)}>
                    <Icon name="undo" size={16} />
                    {t('report.regenerate')}
                  </button>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn" onClick={() => goto('setup')}>
                <Icon name="back" size={16} />
                {t('actions.back')}
              </button>
              <button className="btn btn-primary" onClick={() => goto('review')}>
                {t('report.generate')}
                <Icon name="chevron" size={16} />
              </button>
            </div>
          </section>
        </div>
      )}

      {step === 'review' && report && (
        <div className="stack">
          {report.warnings.length > 0 && (
            <div className="notice notice-warn no-print">
              <Icon name="warn" size={18} />
              <div>
                <strong>{t('report.warningsTitle')}</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {report.warnings.map((w) => (
                    <li key={w}>{t(`report.warnings.${w}`)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="row no-print">
            <button className="btn" onClick={() => goto('evidence')}>
              <Icon name="back" size={16} />
              {t('actions.back')}
            </button>
            <span className="spacer" style={{ flex: 1 }} />
            <button
              className="btn"
              onClick={async () => {
                await saveReport({ id: uid('report-'), parcelId, createdAt: new Date().toISOString(), input, isDemo: report.isDemo });
                toast(t('report.savedToast'));
              }}
            >
              {t('report.save')}
            </button>
            <button className="btn" onClick={() => window.print()}>
              <Icon name="print" size={16} />
              {t('report.print')}
            </button>
            <button className="btn btn-primary" onClick={downloadPdf} disabled={pdfBusy || state.status === 'loading'} data-tour="report-pdf">
              <Icon name="download" size={16} />
              {pdfBusy ? t('report.downloading') : t('report.download')}
            </button>
          </div>
          {state.status === 'loading' && <Notice kind="info">{t('weather.loading')}</Notice>}
          {state.status === 'error' && <WeatherPanel state={state} baseline={baseline} retry={retry} />}
          <ReportDocument report={report} />
        </div>
      )}
    </>
  );
}

function SavedReports({ onOpen, onDelete }: { onOpen: (r: import('../lib/types').SavedReport) => void; onDelete: (id: string) => void }) {
  const { t, lang, data } = useApp();
  const list = [...data.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="panel">
      <h2>{t('report.savedReports')}</h2>
      {list.length ? (
        <ul className="ledger">
          {list.map((r) => (
            <li key={r.id}>
              <Icon name="report" />
              <span className="grow">
                <button className="btn btn-ghost btn-sm" style={{ padding: 0, minHeight: 0 }} onClick={() => onOpen(r)}>
                  {data.parcels.find((p) => p.id === r.parcelId)?.name ?? '—'}: {formatDate(r.input.start, lang)} – {formatDate(r.input.end, lang)}
                </button>
                <br />
                <span className="muted small">{formatDate(r.createdAt, lang)}</span>
              </span>
              <button className="btn btn-ghost btn-sm" aria-label={t('actions.delete')} onClick={() => onDelete(r.id)}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('report.noSaved')}</p>
      )}
    </section>
  );
}
