import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { uid, useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { Area, ConfirmDialog, DemoBadge, EmptyState, HelpTip, PageHeader, useConfirm } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDate } from '../lib/dates';
import type { CommunityType, Parcel } from '../lib/types';
import { acresToHa, formatNumber } from '../lib/units';
import { Checklist } from './Checklist';

const TYPES: CommunityType[] = ['coastal-meadow', 'alvar', 'floodplain-meadow', 'wooded-meadow', 'dry-meadow', 'fen-meadow', 'other'];

export function ParcelList() {
  const { t, data } = useApp();
  return (
    <>
      <PageHeader
        title={t('parcels.title')}
        subtitle={t('parcels.subtitle')}
        actions={
          <Link className="btn btn-primary" to="/parcels/new">
            <Icon name="plus" />
            {t('parcels.add')}
          </Link>
        }
      />
      {!data.parcels.length ? (
        <EmptyState icon="parcels" title={t('parcels.emptyTitle')} body={t('parcels.emptyBody')} action={<Link className="btn btn-primary" to="/parcels/new">{t('parcels.add')}</Link>} />
      ) : (
        <section className="panel">
          <ul className="ledger">
            {data.parcels.map((p) => (
              <li key={p.id}>
                <Icon name="parcels" />
                <span className="grow">
                  <Link to={`/parcels/${p.id}`}>
                    <strong>{p.name}</strong>
                  </Link>{' '}
                  {p.isDemo && <DemoBadge />}
                  <br />
                  <span className="muted small">
                    {t(`community.${p.communityType}`)} · {t(`method.${p.plannedMethod}`)}
                  </span>
                </span>
                <span className="small" style={{ textAlign: 'right' }}>
                  <Area ha={p.areaHa} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function ParcelForm() {
  const { id } = useParams();
  const { t, data, farm, saveParcel, saveFarm } = useApp();
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
    };
    await saveParcel(p);
    toast(t('parcels.saved'));
    navigate(`/parcels/${p.id}`);
  };

  const title = existing ? t('parcels.editTitle') : t('parcels.newTitle');
  return (
    <>
      <PageHeader title={title} crumbs={[{ label: t('parcels.title'), to: '/parcels' }]} />
      <form className="panel form" onSubmit={submit} noValidate style={{ maxWidth: 720 }}>
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
        badge={parcel.isDemo ? <DemoBadge /> : undefined}
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
            </dl>
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
