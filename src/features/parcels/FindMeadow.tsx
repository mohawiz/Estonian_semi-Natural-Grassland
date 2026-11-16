// "Find your meadow": bring a real outline and PRIA's facts into a new plot by
// PRIA heritage meadow number, cadastral number, a click on the map, or a file.
import { useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import { Area } from '../../components/ui';
import { formatDate } from '../../lib/dates';
import { candidatesFromFile } from '../../services/fileImport';
import { findAtPoint, findByCadastralId, findByMeadowNo, LandDataError, meadowTitle, type MeadowCandidate } from '../../services/landData';
import { RealMap } from '../map/RealMap';
import type { MeadowPoint } from '../../services/meadowRegister';

type Mode = 'pria' | 'cadastre' | 'map' | 'file';

export function FindMeadow({ onUse, onAddAll }: { onUse: (c: MeadowCandidate) => void; /** Save every PRIA/file result as its own plot. */ onAddAll?: (cs: MeadowCandidate[]) => void }) {
  const { t, lang } = useApp();
  const [mode, setMode] = useState<Mode>('pria');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<MeadowCandidate[]>([]);
  const [active, setActive] = useState<string>('');
  const ctrl = useRef<AbortController | null>(null);

  const run = async (task: (signal: AbortSignal) => Promise<MeadowCandidate[]>) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setError('');
    try {
      const found = await task(c.signal);
      if (c.signal.aborted) return;
      setResults(found);
      setActive(found[0]?.ref ?? '');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setResults([]);
      setError(e instanceof LandDataError && e.code !== 'network' ? t(`find.err.${e.message}`) : t('find.err.network'));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    void run((s) => (mode === 'pria' ? findByMeadowNo(query, s) : findByCadastralId(query, s)));
  };

  const switchMode = (m: Mode) => {
    ctrl.current?.abort();
    setBusy(false);
    setMode(m);
    setError('');
    setQuery('');
    setResults([]);
  };

  // In the number modes a click on the map fills the search box with that meadow's
  // (or cadastral unit's) number and looks it up, so nobody has to copy numbers by hand.
  const fillFromMap = async (lon: number, lat: number, s: AbortSignal) => {
    const here = await findAtPoint(lon, lat, s);
    const meadow = here.find((c) => c.source === 'pria');
    const unit = here.find((c) => c.source === 'cadastre');
    if (mode === 'pria' && meadow?.pria) {
      setQuery(meadow.pria.meadowNo);
      const all = await findByMeadowNo(meadow.pria.meadowNo, s);
      return [...all.filter((c) => c.ref === meadow.ref), ...all.filter((c) => c.ref !== meadow.ref)];
    }
    if (mode === 'cadastre' && unit) {
      setQuery(unit.ref);
      return findByCadastralId(unit.ref, s);
    }
    return here;
  };
  const onMapPick = ([lon, lat]: [number, number]) => void run((s) => (mode === 'map' ? findAtPoint(lon, lat, s) : fillFromMap(lon, lat, s)));
  const onMapDot = (p: MeadowPoint) => {
    if (mode === 'pria') {
      setQuery(p.meadowNo);
      void run(async (s) => {
        const all = await findByMeadowNo(p.meadowNo, s);
        return [...all.filter((c) => c.pria?.areaId === p.areaId), ...all.filter((c) => c.pria?.areaId !== p.areaId)];
      });
    } else onMapPick([p.lon, p.lat]);
  };

  const chosen = results.find((r) => r.ref === active);
  // a cadastral unit is offered alone; its meadow areas are what gets added in bulk
  const addable = results.filter((r) => r.source !== 'cadastre');

  return (
    <section className="panel find-meadow" aria-labelledby="find-title">
      <h2 id="find-title" style={{ marginTop: 0 }}>
        {t('find.title')}
      </h2>
      <p className="muted">{t('find.intro')}</p>
      <div className="seg-tabs" role="group" aria-label={t('find.how')}>
        {(['pria', 'cadastre', 'map', 'file'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)}>
            {t(`find.mode.${m}`)}
          </button>
        ))}
      </div>

      {(mode === 'pria' || mode === 'cadastre') && (
        <form className="find-row" onSubmit={search} role="search">
          <div className="field grow">
            <label htmlFor="find-q">{t(`find.label.${mode}`)}</label>
            <input id="find-q" type="text" inputMode="numeric" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === 'pria' ? '48250239357' : '41101:003:0700'} aria-describedby="find-hint" />
            <span id="find-hint" className="hint">
              {t(`find.hint.${mode}`)}
            </span>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !query.trim()}>
            <Icon name="search" />
            {busy ? t('find.searching') : t('find.search')}
          </button>
        </form>
      )}
      {mode === 'map' && <p className="hint">{busy ? t('find.searching') : t('find.hint.map')}</p>}
      {(mode === 'pria' || mode === 'cadastre') && <p className="hint">{t('find.hint.mapFills')}</p>}
      {mode === 'file' && (
        <div className="field">
          <label htmlFor="find-file">{t('find.label.file')}</label>
          <input
            id="find-file"
            type="file"
            accept=".geojson,.json,.kml,.zip,application/geo+json,application/vnd.google-earth.kml+xml,application/zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(() => candidatesFromFile(f));
            }}
            aria-describedby="find-file-hint"
          />
          <span id="find-file-hint" className="hint">
            {t('find.hint.file')}
          </span>
        </div>
      )}

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        <RealMap
          label={t('find.mapLabel')}
          onPick={mode === 'file' ? undefined : onMapPick}
          onMeadowDot={mode === 'file' ? undefined : onMapDot}
          highlights={results.map((r) => ({ key: r.ref, boundary: r.boundary, label: r.label, active: r.ref === active }))}
          onHighlight={setActive}
        />
      </div>

      {results.length > 0 && (
        <div className="find-results" aria-live="polite">
          <h3>{t('find.found', { n: results.length })}</h3>
          <ul className="pick-list">
            {results.map((r) => (
              <li key={r.ref}>
                <label className="pick-card">
                  <input type="radio" name="find-pick" checked={r.ref === active} onChange={() => setActive(r.ref)} />
                  <span className="pick-body">
                    <strong>{r.source === 'pria' ? meadowTitle(r, t) : r.source === 'cadastre' ? t('find.cadastreUnit', { id: r.ref }) : r.label}</strong>
                    <br />
                    <span className="muted small">
                      <Area ha={r.areaHa} />
                      {r.pria?.maintenance && ` · ${r.pria.maintenance === 'N' ? t('method.mowing') : r.pria.maintenance === 'K' ? t('method.grazing') : t('find.maintCode', { code: r.pria.maintenance })}`}
                      {r.pria?.startDate && ` · ${t('find.startDate')} ${formatDate(r.pria.startDate, lang)}`}
                      {r.communityType && ` · ${t(`community.${r.communityType}`)}`}
                      {r.address && ` · ${r.address}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="pick-actions">
            {onAddAll && addable.length > 1 && (
              <button type="button" className="btn" onClick={() => onAddAll(addable)}>
                <Icon name="plus" />
                {t('find.addAll', { n: addable.length })}
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={!chosen} onClick={() => chosen && onUse(chosen)}>
              <Icon name="check" />
              {t('find.use')}
            </button>
          </div>
          <p className="muted small">{t('find.sourceNote')}</p>
        </div>
      )}
    </section>
  );
}
