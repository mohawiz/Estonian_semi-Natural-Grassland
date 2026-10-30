import { useApp } from '../../app/store';
import { formatDate } from '../../lib/dates';
import { formatArea, formatNumber } from '../../lib/units';
import { getDocument } from '../../services/library';
import type { ProofReport } from '../../services/report';
import { useBlobUrl } from '../photos/PhotoThumb';
import { WeatherFacts, WeatherSourceNote } from '../weather/WeatherPanel';
import { WeatherTimeline } from '../weather/WeatherTimeline';
import type { PhotoMeta } from '../../lib/types';

function Photo({ p }: { p: PhotoMeta }) {
  const { t, lang } = useApp();
  const url = useBlobUrl(p.blob);
  return (
    <figure>
      {url && <img src={url} alt={p.caption ?? p.fileName} style={{ aspectRatio: '4/3', objectFit: 'cover', width: '100%', borderRadius: 3 }} />}
      <figcaption>
        {p.takenAt ? formatDate(p.takenAt, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} ({t(`log.photoDateFrom.${p.takenAtSource}`)})
        {p.lat !== undefined && p.lon !== undefined && ` · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`}
        {p.caption && <><br />{p.caption}</>}
        {p.isDemoIllustration && <><br /><strong>{t('log.demoIllustration')}</strong></>}
      </figcaption>
    </figure>
  );
}

export function ReportDocument({ report }: { report: ProofReport }) {
  const { t, lang } = useApp();
  const r = report;
  const f = (d: string) => formatDate(d, lang);
  const action = t(`method.${r.input.plannedAction}`);
  const view = r.weather.series ? r.weather.series.days : [];
  return (
    <article className="report-doc" data-tour="report-doc" aria-label={t('report.preview')} lang={lang}>
      {r.isDemo && <div className="watermark">{t('report.demoWatermark')}</div>}
      <header className="doc-head">
        <div>
          <div className="eyebrow" style={{ color: '#6a736b' }}>
            {t('app.name')}
          </div>
          <h1>{t('report.docTitle')}</h1>
        </div>
        <dl className="meta">
          <dt>{t('report.to')}</dt>
          <dd>{t('report.toBoard')}</dd>
          <dt>{t('report.from')}</dt>
          <dd>
            {r.input.farmerName || r.farm.owner || '—'}, {r.farm.name}
            {r.farm.registryCode ? ` (${r.farm.registryCode})` : ''}
          </dd>
          <dt>{t('report.date')}</dt>
          <dd>{f(r.generatedAt.slice(0, 10))}</dd>
        </dl>
      </header>

      <h2>{t('report.sectionParcel')}</h2>
      <p>
        <strong>{r.parcel.name}</strong>
        {r.parcel.code ? ` (${r.parcel.code})` : ''} — {t(`community.${r.parcel.communityType}`)}, {formatArea(r.parcel.areaHa, lang)}. {t('parcels.coords')}: {formatNumber(r.parcel.lat, lang, 4)}, {formatNumber(r.parcel.lon, lang, 4)}.
      </p>

      <h2>{t('report.sectionPlanned')}</h2>
      <table className="data">
        <tbody>
          {r.planned.map((p, i) => (
            <tr key={i}>
              <th scope="row">{t('report.plannedLabel')}</th>
              <td>
                {t(`method.${p.action}`)}, {f(p.start)} – {f(p.end)}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">{t('report.completedLabel')}</th>
            <td>
              {r.completed.length
                ? r.completed.map((e) => `${t(`method.${e.kind}`)} ${f(e.date)}${e.endDate && e.endDate !== e.date ? ` – ${f(e.endDate)}` : ''}`).join('; ')
                : t('report.nothingCompleted', { action: action.toLowerCase() })}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>{t('report.sectionReason')}</h2>
      <p>{t(`reason.${r.input.reason}`)}.</p>
      {r.missedEntries.map((e) => e.notes && <p key={e.id} className="small">“{e.notes}” ({t('report.missedEntry')}, {f(e.date)})</p>)}

      <h2>{t('report.sectionWeather')}</h2>
      {r.weather.series ? (
        <>
          <WeatherTimeline days={view} band={{ start: r.period.start, end: r.period.end }} staticMode height={220} />
          <WeatherFacts series={r.weather.series} baseline={r.weather.baseline ?? undefined} baselineStatus={r.weather.baseline ? 'ready' : 'error'} range={{ start: r.period.start, end: r.period.end }} />
          <WeatherSourceNote series={r.weather.series} />
        </>
      ) : (
        <p>{t('report.weatherVerdict.no-data')}</p>
      )}
      <div className={`verdict verdict-${r.weather.verdict}`}>{t(`report.weatherVerdict.${r.weather.verdict}`)}</div>
      <p className="small" style={{ color: '#6a736b', marginTop: 4 }}>
        {t('report.verdictNote')}
      </p>

      <h2>{t('report.sectionPhotos')}</h2>
      {r.photos.length ? (
        <div className="photo-grid">
          {r.photos.map((p) => (
            <Photo key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <p>{t('report.noPhotos')}</p>
      )}

      <h2>{t('report.sectionAssessment')}</h2>
      <dl className="meta" style={{ fontSize: '0.95rem' }}>
        <dt>{t('report.severity')}</dt>
        <dd>{t(`report.severityOptions.${r.severity}`)}</dd>
        <dt>{t('report.affected')}</dt>
        <dd>{t('report.extentValue', { area: formatArea(r.extent.affectedHa, lang), total: formatArea(r.extent.parcelHa, lang), pct: formatNumber(r.extent.percent, lang) })}</dd>
        <dt>{t('report.durationHelp').split(':')[0]}</dt>
        <dd>{t('report.durationValue', { days: r.duration.days, start: f(r.period.start), end: f(r.period.end) })}</dd>
      </dl>

      <h2>{t('report.sectionJustification')}</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{r.input.justification || '—'}</p>

      <h2>{t('report.sectionRules')}</h2>
      {r.rules.map((p) => {
        const d = getDocument(p.docId)!;
        return (
          <div className="rule" key={p.id}>
            <strong>
              {d.title[lang]}, {p.section}
            </strong>
            <blockquote lang={p.lang}>{p.text}</blockquote>
            <div className="small" style={{ color: '#48534b' }}>
              {p.summary[lang]}
            </div>
            <div className="small" style={{ color: '#6a736b' }}>
              {t('report.sources')}: <a href={d.url}>{d.url}</a> · {t('report.version')}: {d.version} · {t('report.retrieved')} {f(d.retrievedAt)}
              {d.status !== 'verified-current' && ` · ${t(`rules.status.${d.status}`)}`}
            </div>
          </div>
        );
      })}

      <h2>{t('report.sectionNotice')}</h2>
      <p>
        {t('report.noticeText', { n: r.notice.workingDays, date: f(r.notice.deadline) })} {r.notice.passed && <strong>{t('report.noticePassed')}</strong>}
      </p>
      <p className="small" style={{ color: '#6a736b' }}>
        {t('report.noticeLabel')} {t('report.priaNote')}
      </p>

      <hr style={{ border: 0, borderTop: '1px solid #d8d1bf', margin: '20px 0 10px' }} />
      <p className="small" style={{ color: '#6a736b' }}>
        {t('report.disclaimer')}
      </p>
    </article>
  );
}
