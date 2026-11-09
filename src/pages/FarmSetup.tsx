// "Create my farm": a farmer's own profile and meadows in three short steps.
// Everything stays in this browser, like the rest of the app; there is no
// account. One browser holds one farm (the demo farm or the farmer's own).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { uid, useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { Area, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDate } from '../lib/dates';
import type { Farm } from '../lib/types';
import { addCandidatesAsPlots, defaultPlotName, ownFarm } from '../features/parcels/addPlots';
import { candidatesFromFile } from '../services/fileImport';
import { findByCadastralId, findByMeadowNo, LandDataError, meadowTitle, normalizeCadastralId, type MeadowCandidate } from '../services/landData';

type Step = 'farm' | 'meadows';

export function FarmSetupPage() {
  const { t, lang, data, farm, saveFarm, saveParcel, resetAll } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const existing = ownFarm(data.farms);
  const demoLoaded = !!farm?.isDemo;
  const [step, setStep] = useState<Step>(existing ? 'meadows' : 'farm');
  const [name, setName] = useState(existing?.name ?? '');
  const [owner, setOwner] = useState(existing?.owner ?? '');
  const [registry, setRegistry] = useState(existing?.registryCode ?? '');
  const [tried, setTried] = useState(false);
  const [numbers, setNumbers] = useState(() => (params.get('meadows') ?? '').split(',').map((r) => r.split('/')[0]).filter(Boolean).join(', '));
  const [found, setFound] = useState<MeadowCandidate[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const owned = useMemo(() => new Set(data.parcels.map((p) => p.source?.ref).filter(Boolean)), [data.parcels]);
  // exact areas chosen on the Meadow map ("meadowNo/areaId")
  const linked = useMemo(() => new Set((params.get('meadows') ?? '').split(',').filter((r) => r.includes('/'))), [params]);
  const [shared, setShared] = useState(false);

  const addFound = (list: MeadowCandidate[]) => {
    setFound((prev) => {
      const seen = new Set(prev.map((c) => c.ref));
      return [...prev, ...list.filter((c) => !seen.has(c.ref))];
    });
    // Pre-tick only what is clearly the farmer's: the area they picked on the map, a meadow
    // with a single area, file shapes, or a cadastral unit with no meadow in it. A meadow
    // number can cover areas of several applicants, so its areas are left for the farmer to tick.
    setChosen((prev) => {
      const next = new Set(prev);
      const meadows = list.filter((c) => c.source === 'pria');
      for (const c of list) {
        if (owned.has(c.ref)) continue;
        const tick = linked.has(c.ref) || (linked.size === 0 && (c.source === 'file' || (c.source === 'pria' && meadows.length === 1) || (c.source === 'cadastre' && meadows.length === 0)));
        if (tick) next.add(c.ref);
      }
      return next;
    });
    if (list.filter((c) => c.source === 'pria').length > 1) setShared(true);
  };

  const lookUp = async () => {
    const tokens = numbers.split(/[,;\n]+|\s{2,}/).map((s) => s.trim()).filter(Boolean);
    // allow plain spaces between numbers too, unless the token is a spaced cadastral number
    const queries = tokens.flatMap((tok) => (normalizeCadastralId(tok) ? [tok] : tok.split(/\s+/)));
    if (!queries.length) return;
    setBusy(true);
    setErrors([]);
    const errs: string[] = [];
    for (const q of queries) {
      try {
        addFound(normalizeCadastralId(q) ? await findByCadastralId(q) : await findByMeadowNo(q));
      } catch (e) {
        errs.push(`${q}: ${e instanceof LandDataError && e.code !== 'network' ? t(`find.err.${e.message}`) : t('find.err.network')}`);
      }
    }
    setErrors(errs);
    setBusy(false);
  };

  // numbers passed from the Meadow map are looked up at once
  useEffect(() => {
    if (params.get('meadows') && step === 'meadows' && !found.length) void lookUp();
  }, [step]);

  const saveFarmStep = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!name.trim()) return document.getElementById('fs-name')?.focus();
    setStep('meadows');
  };

  const finish = async () => {
    setSaving(true);
    let target: Farm | undefined = existing;
    if (!target) {
      if (demoLoaded) await resetAll(); // the farmer's own farm replaces the demo in this browser
      target = { id: uid('farm-'), name: name.trim(), owner: owner.trim(), registryCode: registry.trim() || undefined, isDemo: false, createdAt: new Date().toISOString() };
      await saveFarm(target);
    }
    const picks = found.filter((c) => chosen.has(c.ref) && !owned.has(c.ref));
    await addCandidatesAsPlots(picks, target.id, saveParcel, t);
    setSaving(false);
    toast(t('setup.done', { n: picks.length }));
    navigate(picks.length ? '/' : '/parcels');
  };

  const toggle = (ref: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  const picked = found.filter((c) => chosen.has(c.ref) && !owned.has(c.ref));
  const pickedHa = picked.reduce((s, c) => s + c.areaHa, 0);

  return (
    <>
      <PageHeader title={existing ? t('setup.addTitle') : t('setup.title')} subtitle={existing ? t('setup.addSubtitle', { farm: existing.name }) : t('setup.subtitle')} />
      <ol className="setup-steps" aria-label={t('setup.stepsLabel')}>
        {(['farm', 'meadows'] as const).map((s, i) => (
          <li key={s} aria-current={step === s ? 'step' : undefined} className={step === s ? 'is-on' : ''}>
            <span className="setup-num">{i + 1}</span> {t(`setup.step.${s}`)}
          </li>
        ))}
        <li>
          <span className="setup-num">3</span> {t('setup.step.done')}
        </li>
      </ol>

      {step === 'farm' && (
        <form className="panel form setup-panel" onSubmit={saveFarmStep} noValidate>
          {demoLoaded && (
            <div className="notice notice-demo" role="note" style={{ marginBottom: 16 }}>
              <Icon name="sprout" size={20} />
              <span>
                {t('setup.replacesDemo')} <Link to="/settings">{t('setup.exportFirst')}</Link>
              </span>
            </div>
          )}
          <div className="field">
            <label htmlFor="fs-name">{t('settings.farmName')}</label>
            <input id="fs-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('setup.farmPlaceholder')} aria-invalid={tried && !name.trim()} autoComplete="organization" />
            {tried && !name.trim() && <span className="error-text">{t('parcels.required')}</span>}
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="fs-owner">{t('setup.ownerName')}</label>
              <input id="fs-owner" type="text" value={owner} onChange={(e) => setOwner(e.target.value)} autoComplete="name" />
              <span className="hint">{t('setup.ownerHint')}</span>
            </div>
            <div className="field">
              <label htmlFor="fs-reg">{t('setup.registry')}</label>
              <input id="fs-reg" type="text" inputMode="numeric" value={registry} onChange={(e) => setRegistry(e.target.value)} />
              <span className="hint">{t('setup.registryHint')}</span>
            </div>
          </div>
          <p className="small muted">{t('setup.privacy')}</p>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              {t('setup.next')}
            </button>
            <Link className="btn" to="/">
              {t('actions.cancel')}
            </Link>
          </div>
        </form>
      )}

      {step === 'meadows' && (
        <section className="panel setup-panel">
          <h2 style={{ marginTop: 0 }}>{t('setup.meadowsTitle')}</h2>
          <p className="muted">{t('setup.meadowsIntro')}</p>
          <div className="field">
            <label htmlFor="fs-numbers">{t('setup.numbersLabel')}</label>
            <textarea id="fs-numbers" rows={3} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="48250239357, 48250350578&#10;41101:003:0700" aria-describedby="fs-numbers-hint" />
            <span id="fs-numbers-hint" className="hint">
              {t('setup.numbersHint')}
            </span>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={lookUp} disabled={busy || !numbers.trim()}>
              <Icon name="search" />
              {busy ? t('find.searching') : t('setup.findAll')}
            </button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              <Icon name="upload" />
              {t('setup.fromFile')}
              <input
                type="file"
                accept=".geojson,.json,.kml,.zip"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    addFound(await candidatesFromFile(f));
                  } catch (err) {
                    setErrors([`${f.name}: ${err instanceof LandDataError ? t(`find.err.${err.message}`) : t('find.err.fileUnreadable')}`]);
                  }
                  e.target.value = '';
                }}
              />
            </label>
            <Link className="btn" to="/meadows">
              <Icon name="map" />
              {t('setup.onMap')}
            </Link>
          </div>
          {errors.length > 0 && (
            <ul className="error-text small" role="alert" style={{ marginTop: 10 }}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {found.length > 0 && (
            <>
              <h3 style={{ marginBottom: 4 }}>{t('setup.foundTitle', { n: found.length })}</h3>
              {shared && (
                <div className="notice notice-info small" role="note" style={{ margin: '6px 0 8px' }}>
                  <Icon name="info" size={18} />
                  <span>{t('setup.sharedNote')}</span>
                </div>
              )}
              <ul className="ledger">
                {found.map((c) => (
                  <li key={c.ref}>
                    <label className="choice grow" style={{ alignItems: 'flex-start' }}>
                      <input type="checkbox" checked={owned.has(c.ref) || chosen.has(c.ref)} disabled={owned.has(c.ref)} onChange={() => toggle(c.ref)} />
                      <span>
                        <strong>{c.source === 'pria' ? meadowTitle(c, t) : c.source === 'cadastre' ? t('find.cadastreUnit', { id: c.ref }) : c.label}</strong>
                        {owned.has(c.ref) && <span className="badge badge-ok"> {t('explore.yours')}</span>}
                        <br />
                        <span className="muted small">
                          <Area ha={c.areaHa} />
                          {c.pria?.maintenance === 'N' ? ` · ${t('method.mowing')}` : c.pria?.maintenance === 'K' ? ` · ${t('method.grazing')}` : ''}
                          {c.pria?.startDate ? ` · ${t('find.startDate')} ${formatDate(c.pria.startDate, lang)}` : ''}
                          {c.address ? ` · ${c.address}` : ''}
                          {' · '}
                          {t('setup.willBeNamed', { name: defaultPlotName(c, t) })}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={finish} disabled={saving}>
              <Icon name="check" />
              {picked.length ? t(picked.length === 1 ? 'setup.finishWithOne' : 'setup.finishWith', { n: picked.length, ha: (Math.round(pickedHa * 100) / 100).toString() }) : existing ? t('actions.cancel') : t('setup.finishEmpty')}
            </button>
            {!existing && (
              <button type="button" className="btn" onClick={() => setStep('farm')}>
                {t('setup.back')}
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
