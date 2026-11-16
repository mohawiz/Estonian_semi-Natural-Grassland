// Every registered heritage meadow in Estonia: national totals, a big map with
// PRIA's register, the meadow areas in view as a list, and details for one.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { Area, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDate } from '../lib/dates';
import { formatNumber } from '../lib/units';
import { RealMap, type MapView } from '../features/map/RealMap';
import { addCandidatesAsPlots, ownFarm } from '../features/parcels/addPlots';
import { findAtPoint, findByCadastralId, findByMeadowNo, LandDataError, meadowTitle, normalizeCadastralId, type MeadowCandidate } from '../services/landData';
import { LIST_MAX, LIST_MIN_ZOOM, meadowDetails, meadowsInBox, registerSummary, type MeadowDetails, type RegisterSummary } from '../services/meadowRegister';

export function MeadowMapPage() {
  const { t, lang, data } = useApp();
  const fromSetup = useSearchParams()[0].get('from') === 'start';
  const [summary, setSummary] = useState<RegisterSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [view, setView] = useState<MapView | null>(null);
  const [items, setItems] = useState<MeadowCandidate[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [listState, setListState] = useState<'zoom' | 'loading' | 'ready' | 'error'>('zoom');
  const [active, setActive] = useState<MeadowCandidate | null>(null);
  const [q, setQ] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const c = new AbortController();
    registerSummary(c.signal)
      .then(setSummary)
      .catch((e) => (e as Error).name !== 'AbortError' && setSummaryFailed(true));
    return () => c.abort();
  }, []);

  // list the meadow areas in view once the map is zoomed in far enough
  useEffect(() => {
    if (!view) return;
    if (view.zoom < LIST_MIN_ZOOM) {
      setListState('zoom');
      setItems([]);
      return;
    }
    const c = new AbortController();
    const timer = setTimeout(() => {
      setListState('loading');
      meadowsInBox(view, c.signal)
        .then((r) => {
          setItems(r.items);
          setTruncated(r.truncated);
          setListState('ready');
        })
        .catch((e) => (e as Error).name !== 'AbortError' && setListState('error'));
    }, 350);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [view]);

  const mine = useMemo(() => new Set(data.parcels.map((p) => p.source?.ref).filter(Boolean)), [data.parcels]);
  const inViewHa = items.reduce((s, m) => s + m.areaHa, 0);

  const highlights = useMemo(() => {
    const shown = active && !items.some((i) => i.ref === active.ref) ? [...items, active] : items;
    return shown.map((m) => ({ key: m.ref, boundary: m.boundary, label: `${m.pria?.meadowNo ?? m.label} · ${formatNumber(m.areaHa, lang, 2)} ha`, active: m.ref === active?.ref }));
  }, [items, active, lang]);

  const pick = (m: MeadowCandidate | undefined) => {
    setActive(m ?? null);
    if (m) requestAnimationFrame(() => document.getElementById('meadow-details')?.focus());
  };

  const runSearch = async (task: (s: AbortSignal) => Promise<MeadowCandidate[]>) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setSearching(true);
    setSearchError('');
    try {
      const found = (await task(c.signal)).filter((x) => x.source === 'pria');
      if (!found.length) throw new LandDataError('not-found', 'nothingHere');
      pick(found[0]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setSearchError(e instanceof LandDataError && e.code !== 'network' ? t(`find.err.${e.message}`) : t('find.err.network'));
    } finally {
      if (!c.signal.aborted) setSearching(false);
    }
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    void runSearch((s) => (normalizeCadastralId(q) ? findByCadastralId(q, s) : findByMeadowNo(q, s)));
  };

  return (
    <>
      <PageHeader title={t('explore.title')} subtitle={t('explore.subtitle')} />
      {fromSetup && (
        <div className="notice notice-info" role="note" style={{ marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="info" size={20} />
          <span className="grow">{t('explore.fromSetup')}</span>
          <Link className="btn btn-sm" to="/start">
            <Icon name="back" size={16} />
            {t('explore.backToSetup')}
          </Link>
        </div>
      )}

      <section className="stat-strip" aria-label={t('explore.totals')}>
        {summary ? (
          <>
            <div className="stat">
              <span className="stat-value">{formatNumber(summary.count, lang, 0)}</span>
              <span className="stat-label">{t('explore.areas', { year: summary.year })}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatNumber(summary.areaHa, lang, 0)} ha</span>
              <span className="stat-label">{t('explore.totalArea')}</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {formatNumber(summary.mowing, lang, 0)} / {formatNumber(summary.grazing, lang, 0)}
              </span>
              <span className="stat-label">{t('explore.mowGraze')}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatNumber(summary.wooded, lang, 0)}</span>
              <span className="stat-label">{t('explore.wooded')}</span>
            </div>
          </>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            {summaryFailed ? t('explore.summaryFailed') : t('explore.summaryLoading')}
          </p>
        )}
      </section>
      {summary && (
        <p className="muted small" style={{ margin: '6px 0 16px' }}>
          {t('explore.summarySource', { date: formatDate(summary.fetchedAt.slice(0, 10), lang), other: summary.other })}
        </p>
      )}

      <form className="find-row explore-search" onSubmit={search} role="search">
        <div className="field grow">
          <label htmlFor="explore-q">{t('explore.searchLabel')}</label>
          <input id="explore-q" type="text" inputMode="numeric" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="48250239357 · 41101:003:0700" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={searching || !q.trim()}>
          <Icon name="search" />
          {searching ? t('find.searching') : t('find.search')}
        </button>
      </form>
      {searchError && (
        <p className="error-text" role="alert">
          {searchError}
        </p>
      )}

      <div className="explore">
        <div className="explore-map">
          <RealMap
            label={t('explore.mapLabel')}
            height="clamp(420px, 72vh, 820px)"
            parcels={data.parcels}
            highlights={highlights}
            fitHighlights={false}
            fitPlots={false}
            onHighlight={(key) => pick(highlights.length ? [...items, ...(active ? [active] : [])].find((m) => m.ref === key) : undefined)}
            onView={setView}
            onPick={([lon, lat]) => void runSearch((s) => findAtPoint(lon, lat, s))}
            onMeadowDot={(p) =>
              void runSearch(async (s) => {
                // the clicked area first; the meadow's other areas follow
                const all = await findByMeadowNo(p.meadowNo, s);
                return [...all.filter((x) => x.pria?.areaId === p.areaId), ...all.filter((x) => x.pria?.areaId !== p.areaId)];
              })
            }
          />
        </div>
        <aside className="panel explore-side" aria-live="polite">
          {active ? (
            <MeadowCard meadow={active} owned={mine.has(active.ref)} onClose={() => setActive(null)} />
          ) : listState === 'zoom' ? (
            <div className="muted">
              <Icon name="map" size={22} />
              <p>{t('explore.zoomIn')}</p>
            </div>
          ) : listState === 'loading' && !items.length ? (
            <p className="muted">{t('explore.loadingList')}</p>
          ) : listState === 'error' ? (
            <p className="error-text">{t('find.err.network')}</p>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>{t('explore.inView', { n: items.length })}</h2>
              <p className="muted small" style={{ marginTop: -6 }}>
                {formatNumber(inViewHa, lang, 1)} ha{truncated ? ` · ${t('explore.truncated', { n: LIST_MAX })}` : ''}
              </p>
              {items.length === 0 ? (
                <p className="muted">{t('explore.noneInView')}</p>
              ) : (
                <ul className="ledger explore-list">
                  {items.map((m) => (
                    <li key={m.ref}>
                      <button type="button" className="explore-item" onClick={() => pick(m)}>
                        <strong>
                          {m.pria?.meadowNo}
                          {m.pria?.areaNo ? ` · ${t('explore.area', { area: m.pria.areaNo })}` : ''}
                        </strong>
                        <span className="muted small">
                          {formatNumber(m.areaHa, lang, 2)} ha · {maintenance(m, t)}
                          {m.pria?.startDate ? ` · ${formatDate(m.pria.startDate, lang)}` : ''}
                        </span>
                        {mine.has(m.ref) && <span className="badge badge-ok">{t('explore.yours')}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  );
}

function maintenance(m: MeadowCandidate, t: (k: string, v?: Record<string, string | number>) => string) {
  const code = m.pria?.maintenance;
  return code === 'N' ? t('method.mowing') : code === 'K' ? t('method.grazing') : code ? t('find.maintCode', { code }) : t('explore.noMaintenance');
}

function MeadowCard({ meadow, owned, onClose }: { meadow: MeadowCandidate; owned: boolean; onClose: () => void }) {
  const { t, lang, data, saveParcel, deleteParcel } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [details, setDetails] = useState<MeadowDetails | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setDetails(null);
    const c = new AbortController();
    meadowDetails(meadow, c.signal).then((d) => !c.signal.aborted && setDetails(d)).catch(() => {});
    return () => c.abort();
  }, [meadow]);

  const m = details ?? meadow;
  const p = m.pria;
  const farm = ownFarm(data.farms);
  // opened from "Create my farm": the chosen meadow goes straight back to the setup
  const fromSetup = useSearchParams()[0].get('from') === 'start';

  const add = async () => {
    if (!farm || fromSetup) return navigate(`/start?meadows=${encodeURIComponent(meadow.ref)}`);
    setAdding(true);
    const [plot] = await addCandidatesAsPlots([m], farm.id, saveParcel, t);
    setAdding(false);
    toast(t('explore.added'), { undo: async () => void (await deleteParcel(plot.id)) });
  };

  return (
    <div id="meadow-details" tabIndex={-1} className="meadow-card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 style={{ margin: 0 }}>{meadowTitle(m, t)}</h2>
        <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('explore.backToList')}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <dl className="facts" style={{ marginTop: 12 }}>
        <div>
          <dt>{t('parcels.area')}</dt>
          <dd>
            <Area ha={m.areaHa} />
          </dd>
        </div>
        <div>
          <dt>{t('plotFacts.priaMaintenance')}</dt>
          <dd>{maintenance(m, t)}</dd>
        </div>
        <div>
          <dt>{t('plotFacts.startDate', { year: p?.year ?? '' })}</dt>
          <dd>{p?.startDate ? formatDate(p.startDate, lang) : t('plotFacts.noStartDate')}</dd>
        </div>
        <div>
          <dt>{t('explore.meadowType')}</dt>
          <dd>{p?.meadowType === 'PN' ? t('community.wooded-meadow') : t('explore.otherMeadow')}</dd>
        </div>
        <div>
          <dt>{t('explore.coastalExtra')}</dt>
          <dd>{p?.coastalExtra ? t('explore.yes') : t('explore.no')}</dd>
        </div>
        <div>
          <dt>{t('explore.habitat')}</dt>
          <dd>{details ? (details.communityType ? `${t(`community.${details.communityType}`)}${details.habitatCode ? ` (${details.habitatCode})` : ''}` : '—') : t('explore.loadingShort')}</dd>
        </div>
        <div>
          <dt>{t('find.mode.cadastre')}</dt>
          <dd>{details ? (details.cadastralId ? `${details.cadastralId}${details.address ? `, ${details.address}` : ''}` : '—') : t('explore.loadingShort')}</dd>
        </div>
      </dl>
      <div className="row" style={{ marginTop: 14 }}>
        {owned ? (
          <Link className="btn btn-primary" to={`/parcels/${data.parcels.find((x) => x.source?.ref === meadow.ref)?.id ?? ''}`}>
            <Icon name="check" />
            {t('explore.openPlot')}
          </Link>
        ) : (
          <button type="button" className="btn btn-primary" onClick={add} disabled={adding}>
            <Icon name="plus" />
            {fromSetup ? t('explore.addToSetup') : farm ? t('explore.addToPlots') : t('explore.createAndAdd')}
          </button>
        )}
        <Link className="btn" to="/parcels">
          {t('parcels.title')}
        </Link>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        {t('find.sourceNote')}
      </p>
    </div>
  );
}
