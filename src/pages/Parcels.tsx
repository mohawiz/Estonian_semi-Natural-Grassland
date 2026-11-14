import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { uid, useApp } from '../app/store';
import { Icon, MeadowPlants } from '../components/Icon';
import { Area, ConfirmDialog, EmptyState, HelpTip, PageHeader, useConfirm } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDate, seasonFor, todayISO } from '../lib/dates';
import type { CommunityType, LogEntry, Parcel, PhotoMeta } from '../lib/types';
import { acresToHa, formatNumber } from '../lib/units';
import { FindMeadow } from '../features/parcels/FindMeadow';
import { addCandidatesAsPlots, defaultPlotName, ownFarm } from '../features/parcels/addPlots';
import { RealMap } from '../features/map/RealMap';
import { candidateToParcelFields, type MeadowCandidate } from '../services/landData';
import { Checklist } from './Checklist';
import { useBlobUrl } from '../features/photos/PhotoThumb';

type ImportedFields = Required<Pick<Parcel, 'boundary' | 'source'>> & Pick<Parcel, 'pria' | 'cadastralId'>;

const TYPES: CommunityType[] = ['coastal-meadow', 'alvar', 'floodplain-meadow', 'wooded-meadow', 'dry-meadow', 'fen-meadow', 'other'];

/** The farmer's own latest photo of the plot, or a drawn meadow when there is none yet. */
function PlotPhoto({ photo, name }: { photo: PhotoMeta | undefined; name: string }) {
  const url = useBlobUrl(photo?.blob);
  return (
    <div className="plot-photo">
      {url ? <img src={url} alt={photo?.caption ?? name} /> : <MeadowPlants width={150} />}
    </div>
  );
}

function latestPhoto(parcelId: string, entries: LogEntry[], photos: PhotoMeta[]): PhotoMeta | undefined {
  const withPhotos = entries.filter((e) => e.parcelId === parcelId && e.photoIds.length).sort((a, b) => b.date.localeCompare(a.date));
  for (const e of withPhotos) {
    const hit = photos.find((ph) => e.photoIds.includes(ph.id));
    if (hit) return hit;
  }
  return undefined;
}

export function ParcelList() {
  const { t, lang, data } = useApp();
  return (
    <>
      <PageHeader
        title={t('parcels.title')}
        subtitle={t('parcels.subtitle')}
        actions={
          <>
            <Link className="btn" to="/start">
              <Icon name="map" />
              {t('setup.addTitle')}
            </Link>
            <Link className="btn btn-primary" to="/parcels/new">
              <Icon name="plus" />
              {t('parcels.add')}
            </Link>
          </>
        }
      />
      {!data.parcels.length ? (
        <EmptyState icon="parcels" title={t('parcels.emptyTitle')} body={t('parcels.emptyBody')} action={<Link className="btn btn-primary" to="/start">{t('setup.cta')}</Link>} />
      ) : (
        <ul className="plot-cards">
          {data.parcels.map((p) => {
            const season = seasonFor(todayISO());
            const last = data.entries
              .filter((e) => e.parcelId === p.id && e.kind !== 'missed' && e.date >= season.start)
              .sort((a, b) => b.date.localeCompare(a.date))[0];
            return (
              <li key={p.id} className={`plot-card ${last ? 'status-done' : 'status-soon'}`}>
                <Link to={`/parcels/${p.id}`} className="plot-card-link">
                  <PlotPhoto photo={latestPhoto(p.id, data.entries, data.photos)} name={p.name} />
                  <span className="plot-card-body">
                    <strong className="plot-card-name">{p.name}</strong>
                    <span className="muted small">
                      {t(`community.${p.communityType}`)} · {t(`method.${p.plannedMethod}`)} · <Area ha={p.areaHa} />
                    </span>
                    <span className={`badge ${last ? 'badge-ok' : 'badge-soon'}`}>
                      <Icon name={last ? 'check' : 'calendar'} size={16} />
                      {last ? t('parcels.lastWork', { work: t(`method.${last.kind}`), date: formatDate(last.endDate ?? last.date, lang) }) : t('parcels.noWorkYet')}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function ParcelForm() {
  const { id } = useParams();
  const { t, lang, data, farm, saveParcel, saveFarm } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const existing = data.parcels.find((p) => p.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [type, setType] = useState<CommunityType>(existing?.communityType ?? 'coastal-meadow');
  const [area, setArea] = useState(existing ? String(existing.areaHa) : '');
  const [unit, setUnit] = useState<'ha' | 'ac'>('ha');
  const [lat, setLat] = useState(existing ? String(existing.lat) : '');
  const [lon, setLon] = useState(existing ? String(existing.lon) : '');
  const [method, setMethod] = useState<Parcel['plannedMethod']>(existing?.plannedMethod ?? 'mowing');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [locating, setLocating] = useState(false);
  const [tried, setTried] = useState(false);
  const [imported, setImported] = useState<ImportedFields | null>(existing?.boundary && existing.source ? { boundary: existing.boundary, source: existing.source, pria: existing.pria, cadastralId: existing.cadastralId } : null);

  const addAll = async (cs: MeadowCandidate[]) => {
    const own = ownFarm(data.farms);
    if (!own) return navigate(`/start?meadows=${encodeURIComponent(cs.map((c) => c.ref).join(','))}`);
    const added = await addCandidatesAsPlots(cs, own.id, saveParcel, t);
    toast(t('setup.done', { n: added.length }));
    navigate('/parcels');
  };

  const applyCandidate = (c: MeadowCandidate) => {
    const f = candidateToParcelFields(c);
    setImported({ boundary: f.boundary!, source: f.source!, pria: f.pria, cadastralId: f.cadastralId });
    if (!name.trim()) setName(defaultPlotName(c, t));
    setArea(String(f.areaHa));
    setUnit('ha');
    setLat(String(f.lat));
    setLon(String(f.lon));
    if (f.communityType) setType(f.communityType);
    if (f.plannedMethod) setMethod(f.plannedMethod);
    if (f.code) setCode(f.code);
    toast(t('find.applied'));
    requestAnimationFrame(() => document.getElementById('p-name')?.focus());
  };

  const num = (s: string) => Number(s.replace(',', '.'));
  const areaVal = num(area);
  const areaHa = unit === 'ha' ? areaVal : acresToHa(areaVal);
  const errors = {
    name: !name.trim() ? t('parcels.required') : '',
    area: !(areaVal > 0) ? t('parcels.invalidArea') : '',
    coords: !(num(lat) >= 57.5 && num(lat) <= 59.8 && num(lon) >= 21.5 && num(lon) <= 28.3) ? t('parcels.invalidCoords') : '',
  };
  const ok = !errors.name && !errors.area && !errors.coords;

  const locate = () => {
    if (!navigator.geolocation) return toast(t('parcels.locationDenied'), { kind: 'error' });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLon(pos.coords.longitude.toFixed(5));
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast(t('parcels.locationDenied'), { kind: 'error' });
      },
      { timeout: 15000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!ok) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    let farmId = farm?.id;
    if (!farmId) {
      farmId = uid('farm-');
      await saveFarm({ id: farmId, name: t('settings.profile'), owner: '', isDemo: false, createdAt: new Date().toISOString() });
    }
    const p: Parcel = {
      ...existing,
      id: existing?.id ?? uid('parcel-'),
      farmId,
      name: name.trim(),
      code: code.trim() || undefined,
      communityType: type,
      areaHa: Math.round(areaHa * 10000) / 10000,
      lat: num(lat),
      lon: num(lon),
      plannedMethod: method,
      notes: notes.trim() || undefined,
      boundary: imported?.boundary,
      source: imported?.source,
      pria: imported?.pria,
      cadastralId: imported?.cadastralId,
    };
    await saveParcel(p);
    toast(t('parcels.saved'));
    navigate(`/parcels/${p.id}`);
  };

  const title = existing ? t('parcels.editTitle') : t('parcels.newTitle');
  return (
    <>
      <PageHeader title={title} crumbs={[{ label: t('parcels.title'), to: '/parcels' }]} />
      {!existing?.isDemo && <FindMeadow onUse={applyCandidate} onAddAll={addAll} />}
      <form className="panel form" onSubmit={submit} noValidate style={{ maxWidth: 720 }}>
        {imported && (
          <div className="notice notice-info" role="status" style={{ alignItems: 'center', marginBottom: 16 }}>
            <Icon name="map" />
            <div className="grow">
              <strong>{t(`find.importedFrom.${imported.source.kind}`, { ref: imported.source.ref })}</strong>
              <br />
              <span className="small muted">{t('find.importedNote', { date: formatDate(imported.source.fetchedAt.slice(0, 10), lang) })}</span>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => setImported(null)}>
              {t('find.removeOutline')}
            </button>
          </div>
        )}
        <div className="field">
          <label htmlFor="p-name">{t('parcels.name')}</label>
          <input id="p-name" type="text" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!errors.name} aria-describedby="p-name-err" required />
          {tried && errors.name && <span id="p-name-err" className="error-text">{errors.name}</span>}
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="p-type">{t('parcels.type')}</label>
            <select id="p-type" value={type} onChange={(e) => setType(e.target.value as CommunityType)}>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`community.${x}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-code">
              {t('parcels.code')} <HelpTip text={t('parcels.codeHelp')} />
            </label>
            <input id="p-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-area">
            {t('parcels.area')} <HelpTip text={t('parcels.areaHelp')} />
          </label>
          <div className="inline-unit">
            <input id="p-area" type="text" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} aria-invalid={tried && !!errors.area} aria-describedby="p-area-hint" />
            <select aria-label={t('parcels.areaUnit')} value={unit} onChange={(e) => setUnit(e.target.value as 'ha' | 'ac')} style={{ width: 'auto' }}>
              <option value="ha">{t('parcels.hectares')}</option>
              <option value="ac">{t('parcels.acres')}</option>
            </select>
          </div>
          <span id="p-area-hint" className="hint">
            {areaVal > 0 ? <Area ha={areaHa} /> : t('parcels.areaHelp')}
          </span>
          {tried && errors.area && <span className="error-text">{errors.area}</span>}
        </div>
        <fieldset className="field">
          <legend>
            {t('parcels.coords')} <HelpTip text={t('parcels.coordsHelp')} />
          </legend>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="p-lat" className="small">
                {t('parcels.lat')}
              </label>
              <input id="p-lat" type="text" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-invalid={tried && !!errors.coords} placeholder="58.73" />
            </div>
            <div className="field">
              <label htmlFor="p-lon" className="small">
                {t('parcels.lon')}
              </label>
              <input id="p-lon" type="text" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} aria-invalid={tried && !!errors.coords} placeholder="23.85" />
            </div>
          </div>
          <div>
            <button type="button" className="btn btn-sm" onClick={locate} disabled={locating}>
              <Icon name="pin" size={16} />
              {locating ? t('parcels.locating') : t('parcels.useLocation')}
            </button>
          </div>
          {tried && errors.coords && <span className="error-text">{errors.coords}</span>}
        </fieldset>
        <fieldset className="field">
          <legend>{t('parcels.plannedMethod')}</legend>
          <div className="choice-row">
            {(['mowing', 'grazing', 'mowing-and-grazing'] as const).map((m) => (
              <label key={m} className="choice">
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                <span>{t(`method.${m}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="p-notes">{t('parcels.notes')}</label>
          <textarea id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 80 }} />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {t('actions.save')}
          </button>
          <button className="btn" type="button" onClick={() => navigate(-1)}>
            {t('actions.cancel')}
          </button>
        </div>
      </form>
    </>
  );
}

export function ParcelDetail() {
  const { id } = useParams();
  const { t, lang, data, deleteParcel } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'overview' | 'checklist' | 'entries'>('overview');
  const parcel = data.parcels.find((p) => p.id === id);
  if (!parcel) return <EmptyState title={t('errors.notFound')} body={t('errors.notFoundBody')} action={<Link className="btn" to="/parcels">{t('parcels.title')}</Link>} />;
  const entries = data.entries.filter((e) => e.parcelId === parcel.id).sort((a, b) => b.date.localeCompare(a.date));
  const tabs = ['overview', 'checklist', 'entries'] as const;

  return (
    <>
      <PageHeader
        title={parcel.name}
        subtitle={`${t(`community.${parcel.communityType}`)} · ${t(`method.${parcel.plannedMethod}`)}`}
        crumbs={[{ label: t('parcels.title'), to: '/parcels' }]}
        actions={
          <>
            <Link className="btn" to={`/parcels/${parcel.id}/edit`}>
              <Icon name="edit" />
              {t('actions.edit')}
            </Link>
            <button className="btn btn-danger" onClick={() => confirm.ask(async () => {
              const undo = await deleteParcel(parcel.id);
              toast(t('parcels.deleted'), { undo });
              navigate('/parcels');
            })}>
              <Icon name="trash" />
              {t('actions.delete')}
            </button>
          </>
        }
      />
      <ConfirmDialog open={confirm.open} title={t('parcels.deleteConfirm')} confirmLabel={t('actions.delete')} danger onConfirm={confirm.confirm} onCancel={confirm.cancel} />
      <div role="tablist" className="stepper" aria-label={parcel.name}>
        {tabs.map((x) => (
          <div key={x} role="presentation" style={{ flex: 1 }}>
            <button role="tab" id={`tab-${x}`} aria-selected={tab === x} aria-controls={`panel-${x}`} aria-current={tab === x ? 'step' : undefined} onClick={() => setTab(x)}>
              {t(`parcels.${x === 'checklist' ? 'checklist' : x}`)}
            </button>
          </div>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <section className="panel">
            <dl className="facts">
              <div>
                <dt>{t('parcels.area')}</dt>
                <dd>
                  <Area ha={parcel.areaHa} />
                </dd>
              </div>
              <div>
                <dt>{t('parcels.coords')}</dt>
                <dd>
                  {formatNumber(parcel.lat, lang, 4)}, {formatNumber(parcel.lon, lang, 4)}
                </dd>
              </div>
              {parcel.code && (
                <div>
                  <dt>{t('parcels.code')}</dt>
                  <dd>{parcel.code}</dd>
                </div>
              )}
              {parcel.cadastralId && (
                <div>
                  <dt>{t('find.mode.cadastre')}</dt>
                  <dd>{parcel.cadastralId}</dd>
                </div>
              )}
              {parcel.pria?.maintenance && (
                <div>
                  <dt>{t('plotFacts.priaMaintenance')}</dt>
                  <dd>{parcel.pria.maintenance === 'N' ? t('method.mowing') : parcel.pria.maintenance === 'K' ? t('method.grazing') : t('find.maintCode', { code: parcel.pria.maintenance })}</dd>
                </div>
              )}
              {parcel.pria && (
                <div>
                  <dt>{t('plotFacts.startDate', { year: parcel.pria.year })}</dt>
                  <dd>{parcel.pria.startDate ? formatDate(parcel.pria.startDate, lang) : t('plotFacts.noStartDate')}</dd>
                </div>
              )}
            </dl>
            {parcel.pria && (
              <p className="small muted" style={{ marginTop: 10 }}>
                {parcel.pria.maintenance === 'N' || (!parcel.pria.maintenance && parcel.plannedMethod !== 'grazing')
                  ? parcel.pria.startDate
                    ? t('plotFacts.mowingStartNote')
                    : t('plotFacts.mowingNoDateNote')
                  : t('plotFacts.grazingStartNote')}{' '}
                <Link to="/rules">{t('plotFacts.seeRules')}</Link>
              </p>
            )}
            {parcel.boundary && (
              <div style={{ marginTop: 14 }}>
                <RealMap label={parcel.name} parcels={[parcel]} selected={parcel.id} />
              </div>
            )}
            {parcel.source && (
              <p className="small muted" style={{ marginTop: 8 }}>
                {t(`find.importedFrom.${parcel.source.kind}`, { ref: parcel.source.ref })} · {t('plotFacts.fetched', { date: formatDate(parcel.source.fetchedAt.slice(0, 10), lang) })}
              </p>
            )}
            {parcel.notes && <p style={{ marginTop: 12 }}>{parcel.notes}</p>}
            <div className="row" style={{ marginTop: 12 }}>
              <Link className="btn" to={`/log/new?parcel=${parcel.id}`}>
                <Icon name="plus" />
                {t('log.add')}
              </Link>
              <Link className="btn" to={`/weather?parcel=${parcel.id}`}>
                <Icon name="rain" />
                {t('dashboard.quickWeather')}
              </Link>
              <Link className="btn btn-primary" to={`/report?parcel=${parcel.id}`}>
                <Icon name="report" />
                {t('dashboard.quickReport')}
              </Link>
            </div>
          </section>
        )}
        {tab === 'checklist' && <Checklist parcelId={parcel.id} />}
        {tab === 'entries' && (
          <section className="panel">
            {entries.length ? (
              <ul className="ledger">
                {entries.map((e) => (
                  <li key={e.id}>
                    <Icon name={e.kind === 'missed' ? 'warn' : 'sprout'} />
                    <span className="grow">
                      <Link to={`/log/${e.id}`}>{e.kind === 'missed' ? `${t('log.missedBadge')}: ${t(`method.${e.plannedAction ?? 'mowing'}`)}` : t(`method.${e.kind}`)}</Link>
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
        )}
      </div>
    </>
  );
}
