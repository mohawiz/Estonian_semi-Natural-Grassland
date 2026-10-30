import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { uid, useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { Area, ConfirmDialog, DemoBadge, EmptyState, HelpTip, PageHeader, useConfirm } from '../components/ui';
import { useToast } from '../components/Toast';
import { readPhoto } from '../features/photos/photos';
import { PhotoThumb } from '../features/photos/PhotoThumb';
import { daysInclusive, formatDate, todayISO } from '../lib/dates';
import type { EntryKind, LogEntry, MissedReason, PhotoMeta } from '../lib/types';

const REASONS: MissedReason[] = ['too-wet', 'drought', 'no-livestock', 'no-feed-demand', 'machinery', 'other'];

export function LogList() {
  const { t, lang, data, deleteEntry } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filter = params.get('parcel') ?? '';
  const entries = data.entries.filter((e) => !filter || e.parcelId === filter).sort((a, b) => b.date.localeCompare(a.date));
  const parcelName = (id: string) => data.parcels.find((p) => p.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader
        title={t('log.title')}
        subtitle={t('log.subtitle')}
        actions={
          <Link className="btn btn-primary" to={`/log/new${filter ? `?parcel=${filter}` : ''}`}>
            <Icon name="plus" />
            {t('log.add')}
          </Link>
        }
      />
      {data.parcels.length > 1 && (
        <div className="field" style={{ maxWidth: 320, marginBottom: 14 }}>
          <label htmlFor="log-filter">{t('log.filterParcel')}</label>
          <select id="log-filter" value={filter} onChange={(e) => setParams(e.target.value ? { parcel: e.target.value } : {})}>
            <option value="">{t('log.filterAll')}</option>
            {data.parcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!entries.length ? (
        <EmptyState icon="log" title={t('log.emptyTitle')} body={t('log.emptyBody')} action={<Link className="btn btn-primary" to="/log/new">{t('log.add')}</Link>} />
      ) : (
        <section className="panel">
          <ul className="ledger">
            {entries.map((e) => (
              <li key={e.id}>
                <Icon name={e.kind === 'missed' ? 'warn' : e.kind === 'grazing' ? 'sprout' : 'log'} />
                <span className="grow">
                  <strong>{e.kind === 'missed' ? `${t('log.missedBadge')}: ${t(`method.${e.plannedAction ?? 'mowing'}`)}` : t(`method.${e.kind}`)}</strong>{' '}
                  {e.kind === 'missed' && <span className="badge badge-warn">{t(`reason.${e.reason ?? 'other'}`)}</span>} {e.isDemo && <DemoBadge />}
                  <br />
                  <span className="muted small">
                    {parcelName(e.parcelId)} · {formatDate(e.date, lang)}
                    {e.endDate && e.endDate !== e.date && ` – ${formatDate(e.endDate, lang)} (${t('log.days', { n: daysInclusive(e.date, e.endDate) })})`}
                    {e.photoIds.length > 0 && ` · ${t('log.photos')}: ${e.photoIds.length}`}
                  </span>
                </span>
                <span className="row" style={{ gap: 4 }}>
                  {e.kind === 'missed' && (
                    <Link className="btn btn-sm hide-sm" to={`/report?parcel=${e.parcelId}&start=${e.date}&end=${e.endDate ?? e.date}&action=${e.plannedAction ?? 'mowing'}&reason=${e.reason ?? 'other'}`}>
                      {t('log.toReport')}
                    </Link>
                  )}
                  <Link className="btn btn-ghost btn-sm" to={`/log/${e.id}`} aria-label={t('actions.edit')}>
                    <Icon name="edit" size={16} />
                  </Link>
                  <button
                    className="btn btn-ghost btn-sm"
                    aria-label={t('actions.delete')}
                    onClick={async () => {
                      const undo = await deleteEntry(e.id);
                      toast(t('log.deleted'), { undo });
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function EntryForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t, data, saveEntry, savePhoto, deletePhoto, deleteEntry } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const existing = data.entries.find((e) => e.id === id);
  const [parcelId, setParcelId] = useState(existing?.parcelId ?? params.get('parcel') ?? data.parcels[0]?.id ?? '');
  const [kind, setKind] = useState<EntryKind>(existing?.kind ?? 'mowing');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [method, setMethod] = useState(existing?.method ?? '');
  const [animals, setAnimals] = useState(existing?.animals ?? '');
  const [planned, setPlanned] = useState<'mowing' | 'grazing'>(existing?.plannedAction ?? 'mowing');
  const [reason, setReason] = useState<MissedReason>(existing?.reason ?? 'too-wet');
  const parcel = data.parcels.find((p) => p.id === parcelId);
  const [affected, setAffected] = useState(existing?.areaHa !== undefined ? String(existing.areaHa) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [photos, setPhotos] = useState<PhotoMeta[]>(data.photos.filter((p) => existing?.photoIds.includes(p.id)));
  const [removed, setRemoved] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!data.parcels.length)
    return (
      <>
        <PageHeader title={t('log.newTitle')} crumbs={[{ label: t('log.title'), to: '/log' }]} />
        <EmptyState icon="parcels" title={t('parcels.emptyTitle')} body={t('parcels.emptyBody')} action={<Link className="btn btn-primary" to="/parcels/new">{t('parcels.add')}</Link>} />
      </>
    );

  const needsEnd = kind !== 'mowing';
  const endErr = needsEnd && endDate && endDate < date ? t('log.endBeforeStart') : '';
  const affectedHa = affected ? Number(affected.replace(',', '.')) : parcel?.areaHa;

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    for (const f of [...files]) {
      try {
        const p = await readPhoto(f, uid('photo-'));
        setPhotos((ps) => [...ps, p]);
      } catch {
        toast(t('log.photoError'), { kind: 'error' });
      }
    }
    setReading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const locate = (photoId: string) =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => setPhotos((ps) => ps.map((p) => (p.id === photoId ? { ...p, lat: pos.coords.latitude, lon: pos.coords.longitude, locationSource: 'browser' } : p))),
      () => toast(t('parcels.locationDenied'), { kind: 'error' }),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endErr || !parcelId) return;
    setSaving(true);
    const entryId = existing?.id ?? uid('entry-');
    for (const p of photos) await savePhoto({ ...p, entryId, parcelId });
    for (const r of removed) await deletePhoto(r);
    const entry: LogEntry = {
      id: entryId,
      parcelId,
      kind,
      date,
      endDate: needsEnd ? endDate || date : undefined,
      method: kind === 'mowing' ? method.trim() || undefined : undefined,
      animals: kind === 'grazing' ? animals.trim() || undefined : undefined,
      plannedAction: kind === 'missed' ? planned : undefined,
      reason: kind === 'missed' ? reason : undefined,
      areaHa: affectedHa && affectedHa > 0 ? affectedHa : undefined,
      notes: notes.trim() || undefined,
      photoIds: photos.map((p) => p.id),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      isDemo: existing?.isDemo,
    };
    await saveEntry(entry);
    setSaving(false);
    toast(t('log.saved'));
    navigate('/log');
  };

  return (
    <>
      <PageHeader title={existing ? t('log.editTitle') : t('log.newTitle')} crumbs={[{ label: t('log.title'), to: '/log' }]} badge={existing?.isDemo ? <DemoBadge /> : undefined} />
      <ConfirmDialog open={confirm.open} title={t('actions.delete')} confirmLabel={t('actions.delete')} danger onConfirm={confirm.confirm} onCancel={confirm.cancel} />
      <form className="panel form" onSubmit={submit} style={{ maxWidth: 760 }}>
        <fieldset className="field">
          <legend>{t('log.kind')}</legend>
          <div className="choice-row">
            {(
              [
                ['mowing', 'log.kindMowing'],
                ['grazing', 'log.kindGrazing'],
                ['missed', 'log.kindMissed'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="choice">
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                <span>{t(label)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="e-parcel">{t('log.parcel')}</label>
          <select id="e-parcel" value={parcelId} onChange={(e) => setParcelId(e.target.value)}>
            {data.parcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {parcel && (
            <span className="hint">
              <Area ha={parcel.areaHa} />
            </span>
          )}
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="e-date">{needsEnd ? t('log.startDate') : t('log.date')}</label>
            <input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {needsEnd && (
            <div className="field">
              <label htmlFor="e-end">{t('log.endDate')}</label>
              <input id="e-end" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} aria-invalid={!!endErr} aria-describedby="e-end-err" />
              {endErr && (
                <span id="e-end-err" className="error-text">
                  {endErr}
                </span>
              )}
            </div>
          )}
        </div>
        {kind === 'missed' && (
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="e-planned">{t('log.plannedAction')}</label>
              <select id="e-planned" value={planned} onChange={(e) => setPlanned(e.target.value as 'mowing' | 'grazing')}>
                <option value="mowing">{t('method.mowing')}</option>
                <option value="grazing">{t('method.grazing')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-reason">{t('log.reason')}</label>
              <select id="e-reason" value={reason} onChange={(e) => setReason(e.target.value as MissedReason)}>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`reason.${r}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {kind === 'mowing' && (
          <div className="field">
            <label htmlFor="e-method">{t('log.method')}</label>
            <input id="e-method" type="text" value={method} placeholder={t('log.methodPlaceholder')} onChange={(e) => setMethod(e.target.value)} />
          </div>
        )}
        {kind === 'grazing' && (
          <div className="field">
            <label htmlFor="e-animals">{t('log.animals')}</label>
            <input id="e-animals" type="text" value={animals} placeholder={t('log.animalsPlaceholder')} onChange={(e) => setAnimals(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="e-area">
            {t('log.affectedArea')} (ha) <HelpTip text={`${t('log.affectedHelp')} ${t('parcels.areaHelp')}`} />
          </label>
          <input id="e-area" type="text" inputMode="decimal" value={affected} placeholder={parcel ? String(parcel.areaHa) : ''} onChange={(e) => setAffected(e.target.value)} style={{ maxWidth: 200 }} />
          {affectedHa !== undefined && affectedHa > 0 && (
            <span className="hint">
              <Area ha={affectedHa} />
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="e-notes">{t('log.notes')}</label>
          <textarea id="e-notes" value={notes} placeholder={t('log.notesPlaceholder')} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 90 }} />
        </div>
        <div className="field">
          <span className="label">
            {t('log.photos')} <HelpTip text={t('log.photosHelp')} />
          </span>
          <div className="thumbs">
            {photos.map((p) => (
              <PhotoThumb
                key={p.id}
                photo={p}
                onLocate={() => locate(p.id)}
                onRemove={() => {
                  setPhotos((ps) => ps.filter((x) => x.id !== p.id));
                  if (existing?.photoIds.includes(p.id)) setRemoved((r) => [...r, p.id]);
                }}
              />
            ))}
          </div>
          <div>
            <input ref={fileRef} id="e-photos" type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            <label htmlFor="e-photos" className="btn btn-sm" role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}>
              <Icon name="camera" size={16} />
              {reading ? t('log.readingPhoto') : t('log.addPhotos')}
            </label>
          </div>
          <span className="hint">{t('log.photosHelp')}</span>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving || reading || !!endErr}>
            {saving ? t('actions.saving') : t('actions.save')}
          </button>
          <button className="btn" type="button" onClick={() => navigate(-1)}>
            {t('actions.cancel')}
          </button>
          {existing && (
            <button
              className="btn btn-danger"
              type="button"
              style={{ marginLeft: 'auto' }}
              onClick={() =>
                confirm.ask(async () => {
                  const undo = await deleteEntry(existing.id);
                  toast(t('log.deleted'), { undo });
                  navigate('/log');
                })
              }
            >
              <Icon name="trash" size={16} />
              {t('actions.delete')}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
