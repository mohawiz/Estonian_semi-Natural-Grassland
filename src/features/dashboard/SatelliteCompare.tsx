import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import { DemoBadge } from '../../components/ui';
import { daysInclusive, formatDate } from '../../lib/dates';
import type { LogEntry, Parcel } from '../../lib/types';
import { compareRecords, demoDetections } from '../../services/satelliteDemo';
import type { DateWindow } from '../weather/WeatherTimeline';

export function SatelliteCompare({ parcel, entries, season }: { parcel: Parcel; entries: LogEntry[]; season: DateWindow }) {
  const { t, lang } = useApp();
  const detections = demoDetections(parcel);
  if (!detections)
    return (
      <div className="notice notice-info">
        <Icon name="satellite" size={20} />
        <div>{t('dash.satUnavailable')}</div>
      </div>
    );
  const own = entries.filter((e) => e.parcelId === parcel.id);
  const rows = compareRecords(own, detections);
  const total = daysInclusive(season.start, season.end);
  const pos = (d: string) => `${Math.max(0, Math.min(100, ((daysInclusive(season.start, d) - 1) / total) * 100))}%`;
  const span = (a: string, b: string) => `${Math.max(0.8, (daysInclusive(a < season.start ? season.start : a, b > season.end ? season.end : b) / total) * 100)}%`;
  const lane = { position: 'relative' as const, height: 30, background: 'var(--sheet-2)', borderRadius: 10 };
  const mismatchDates = new Set(rows.filter((r) => r.status !== 'matched').map((r) => r.date));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, auto) 1fr', gap: '8px 12px', alignItems: 'center' }}>
        <span className="small" style={{ fontWeight: 650 }}>
          {t('dash.satRecords')}
        </span>
        <div style={lane}>
          {own.map((e) =>
            e.kind === 'mowing' ? (
              <span key={e.id} title={`${t('method.mowing')} ${formatDate(e.date, lang)}`} style={{ position: 'absolute', left: pos(e.date), top: 5, width: 4, height: 20, marginLeft: -2, borderRadius: 2, background: 'var(--primary)', boxShadow: mismatchDates.has(e.date) ? '0 0 0 3px var(--lingon)' : undefined }} />
            ) : (
              <span key={e.id} title={`${t(e.kind === 'grazing' ? 'method.grazing' : 'log.missedBadge')} ${formatDate(e.date, lang)}`} style={{ position: 'absolute', left: pos(e.date), width: span(e.date, e.endDate ?? e.date), top: e.kind === 'missed' ? 22 : 11, height: e.kind === 'missed' ? 4 : 8, borderRadius: 4, background: e.kind === 'grazing' ? 'var(--seaglass)' : 'var(--lingon)', opacity: 0.75 }} />
            ),
          )}
        </div>
        <span className="small" style={{ fontWeight: 650 }}>
          {t('dash.satDetections')} <DemoBadge />
        </span>
        <div style={{ ...lane, background: 'repeating-linear-gradient(90deg, var(--sheet-2), var(--sheet-2) 8px, transparent 8px, transparent 10px)' }}>
          {detections.map((d) => (
            <span key={d.date} title={`${t('dash.satDetected')} ${formatDate(d.date, lang)}`} style={{ position: 'absolute', left: pos(d.date), top: 8, width: 14, height: 14, marginLeft: -7, transform: 'rotate(45deg)', borderRadius: 3, background: 'var(--hay)', boxShadow: mismatchDates.has(d.date) ? '0 0 0 3px var(--lingon)' : undefined }} />
          ))}
        </div>
      </div>
      <ul className="ledger small" style={{ marginTop: 12 }}>
        {rows.length === 0 && <li className="muted">{t('dash.satNothing')}</li>}
        {rows.map((r) => (
          <li key={r.date + r.status} style={{ padding: '8px 0' }}>
            <span className={`badge ${r.status === 'matched' ? 'badge-ok' : 'badge-warn'}`}>{t(`dash.satStatus.${r.status}`)}</span>
            <span className="grow">
              {formatDate(r.date, lang)} — {t(`dash.satExplain.${r.status}`)}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        {t('dash.satNote')}
      </p>
    </div>
  );
}
