// A real map: Estonian Land Board base map or aerial photo, PRIA's public
// heritage meadow layer (all of Estonia, at every zoom), and the farm's plots.
// Plots with a stored boundary are drawn as their real outline; plots entered
// as a point (and the demo farm) are drawn as a dot and labelled as such.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import type { Boundary } from '../../lib/geo';
import type { Parcel } from '../../lib/types';
import { formatArea } from '../../lib/units';
import { PRIA_WMS } from '../../services/landData';
import { meadowPoints, type MeadowPoint } from '../../services/meadowRegister';

/** Up to this zoom every registered meadow is a dot; closer in, PRIA's outlines are big enough to see. */
const DOTS_MAX_ZOOM = 12;

const TILES = {
  map: 'https://tiles.maaamet.ee/tm/tms/1.0.0/kaart@GMC/{z}/{x}/{y}.png',
  photo: 'https://tiles.maaamet.ee/tm/tms/1.0.0/foto@GMC/{z}/{x}/{y}.jpg',
  labels: 'https://tiles.maaamet.ee/tm/tms/1.0.0/hybriid@GMC/{z}/{x}/{y}.png',
};
const ESTONIA: L.LatLngBoundsExpression = [
  [57.5, 21.6],
  [59.75, 28.2],
];

export interface MapHighlight {
  key: string;
  boundary: Boundary;
  label: string;
  active?: boolean;
}

export interface MapView {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}

const toLatLngs = (b: Boundary) =>
  b.type === 'Polygon' ? b.coordinates.map((r) => r.map(([x, y]) => [y, x] as L.LatLngTuple)) : b.coordinates.map((p) => p.map((r) => r.map(([x, y]) => [y, x] as L.LatLngTuple)));

export function RealMap({
  parcels = [],
  selected,
  onSelect,
  onPick,
  highlights = [],
  onHighlight,
  fitHighlights = true,
  fitPlots = true,
  onMeadowDot,
  onView,
  height = 'var(--map-h)',
  label,
}: {
  parcels?: Parcel[];
  selected?: string;
  onSelect?: (id: string) => void;
  /** Called with [lon, lat] when the map is clicked away from a plot. */
  onPick?: (lonLat: [number, number]) => void;
  /** Shapes to show on top (search results, meadows in view). */
  highlights?: MapHighlight[];
  onHighlight?: (key: string) => void;
  /** Zoom to the highlights whenever they change (search results). Off for browsing, where only the active one is zoomed to. */
  fitHighlights?: boolean;
  /** Zoom to the farm's plots when they change (off on the national meadow map). */
  fitPlots?: boolean;
  /** Called when a meadow dot is clicked; without it the click is treated like a map click there. */
  onMeadowDot?: (p: MeadowPoint) => void;
  /** Called when the visible area changes. */
  onView?: (v: MapView) => void;
  /** CSS height of the map, e.g. 420 or 'min(70vh, 640px)'. */
  height?: number | string;
  label: string;
}) {
  const { t, lang } = useApp();
  const wrap = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const base = useRef<{ map: L.TileLayer; photo: L.TileLayer; labels: L.TileLayer } | null>(null);
  const plotLayer = useRef<L.LayerGroup | null>(null);
  const hlLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef('');
  const target = useRef<{ bounds: L.LatLngBounds; maxZoom: number } | null>(null);
  const fit = (bounds: L.LatLngBounds, maxZoom: number) => {
    target.current = { bounds, maxZoom };
    map.current?.fitBounds(bounds, { maxZoom });
  };
  const [view, setView] = useState<'map' | 'photo'>('map');
  const [showPria, setShowPria] = useState(true);
  const showPriaRef = useRef(true);
  const showDotsRef = useRef<() => void>(() => {});
  const [full, setFull] = useState(false);
  const pria = useRef<L.TileLayer.WMS | null>(null);
  const dots = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onSelect, onPick, onHighlight, onView, onMeadowDot });
  cb.current = { onSelect, onPick, onHighlight, onView, onMeadowDot };

  // create once
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, maxBounds: [[56.5, 20], [60.5, 29.5]], minZoom: 6 }).fitBounds(ESTONIA);
    const attribution = 'Map © Maa- ja Ruumiamet';
    base.current = {
      map: L.tileLayer(TILES.map, { tms: true, maxZoom: 19, maxNativeZoom: 18, attribution }),
      photo: L.tileLayer(TILES.photo, { tms: true, maxZoom: 19, maxNativeZoom: 18, attribution }),
      labels: L.tileLayer(TILES.labels, { tms: true, maxZoom: 19, maxNativeZoom: 18 }),
    };
    base.current.map.addTo(m);
    // PRIA renders all ~6,000 registered meadow areas itself, so they show at every zoom
    pria.current = L.tileLayer.wms(PRIA_WMS, { layers: 'pria_avalik:pria_plk_alad', format: 'image/png', transparent: true, opacity: 0.6, attribution: 'Heritage meadows © PRIA' } as L.WMSOptions);
    pria.current.addTo(m);
    // every registered meadow as a dot (canvas: thousands of markers stay fast)
    const renderer = L.canvas({ padding: 0.3 });
    const dotGroup = L.layerGroup();
    dots.current = dotGroup;
    const showDots = () => {
      const g = dotGroup;
      if (map.current !== m) return;
      const z = m.getZoom();
      const want = z <= DOTS_MAX_ZOOM && showPriaRef.current;
      if (want && !m.hasLayer(g)) g.addTo(m);
      if (!want && m.hasLayer(g)) m.removeLayer(g);
      const r = z <= 8 ? 2.5 : z <= 10 ? 3.5 : 5;
      g.eachLayer((l) => (l as L.CircleMarker).setRadius(r));
    };
    showDotsRef.current = showDots;
    meadowPoints()
      .then(({ points }) => {
        if (map.current !== m) return; // this map was closed before the points arrived
        for (const p of points) {
          const dot = L.circleMarker([p.lat, p.lon], { renderer, radius: 3, className: 'lf-dot', color: '#3a2a1f', weight: 0.6, fillColor: p.maintenance === 'N' ? '#d4a03a' : p.maintenance === 'K' ? '#5e9c94' : '#8a8f7a', fillOpacity: 0.9 });
          dot.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (cb.current.onMeadowDot) cb.current.onMeadowDot(p);
            else cb.current.onPick?.([p.lon, p.lat]);
          });
          dot.bindTooltip(`${p.meadowNo}${p.areaNo ? ` · ${p.areaNo}` : ''}${p.areaHa ? ` · ${p.areaHa} ha` : ''}`, { direction: 'top', className: 'lf-tip' });
          dot.addTo(dotGroup);
        }
        showDots();
      })
      .catch(() => {}); // without the file, outlines still show when zoomed in
    m.on('zoomend', showDots);
    plotLayer.current = L.layerGroup().addTo(m);
    hlLayer.current = L.layerGroup().addTo(m);
    const report = () => {
      const b = m.getBounds();
      cb.current.onView?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: m.getZoom() });
    };
    m.on('moveend', report);
    m.on('click', (e: L.LeafletMouseEvent) => cb.current.onPick?.([e.latlng.lng, e.latlng.lat]));
    m.on('dragstart', () => (target.current = null));
    el.current.addEventListener('wheel', () => (target.current = null), { passive: true });
    map.current = m;
    // the container may be laid out after mount (lazy routes, enter animations):
    // re-apply the last requested view until the user moves the map themselves
    const ro = new ResizeObserver(() => {
      if (map.current !== m) return;
      m.invalidateSize();
      if (target.current) m.fitBounds(target.current.bounds, { maxZoom: target.current.maxZoom });
    });
    ro.observe(el.current);
    report();
    return () => {
      ro.disconnect();
      map.current = null;
      m.off();
      // take the thousands of dots off first, so Leaflet does not tear down a renderer that is already gone
      if (dots.current && m.hasLayer(dots.current)) m.removeLayer(dots.current);
      dots.current = null;
      try {
        m.remove();
      } catch {
        /* the map's DOM is already gone (fast route changes) */
      }
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const b = base.current;
    if (!m || !b) return;
    if (view === 'photo') {
      m.removeLayer(b.map);
      b.photo.addTo(m);
      b.labels.addTo(m);
    } else {
      m.removeLayer(b.photo);
      m.removeLayer(b.labels);
      b.map.addTo(m);
    }
    b.map.bringToBack();
    b.photo.bringToBack();
  }, [view]);

  useEffect(() => {
    const m = map.current;
    if (!m || !pria.current) return;
    if (showPria) pria.current.addTo(m);
    else m.removeLayer(pria.current);
    showPriaRef.current = showPria;
    showDotsRef.current();
  }, [showPria]);

  // full screen: Escape leaves it, and the page behind does not scroll
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('map-full-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('map-full-open');
    };
  }, [full]);

  // plots
  useEffect(() => {
    const g = plotLayer.current;
    const m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    const bounds = L.latLngBounds([]);
    for (const p of parcels) {
      const on = p.id === selected;
      const tip = `${p.name} · ${formatArea(p.areaHa, lang)}${p.boundary ? '' : ` · ${t('map.pointOnly')}`}`;
      const layer = p.boundary
        ? L.polygon(toLatLngs(p.boundary), { className: `lf-plot${on ? ' is-on' : ''}`, weight: on ? 3 : 2 })
        : L.circleMarker([p.lat, p.lon], { className: `lf-plot lf-point${on ? ' is-on' : ''}`, radius: on ? 10 : 7, weight: 2 });
      layer.bindTooltip(tip, { direction: 'top', permanent: on, className: 'lf-tip' });
      layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        cb.current.onSelect?.(p.id);
      });
      layer.addTo(g);
      if (p.boundary) bounds.extend((layer as L.Polygon).getBounds());
      else bounds.extend([p.lat, p.lon]);
    }
    // fit when the set of plots changes, not on every selection
    const key = parcels.map((p) => p.id).join(',');
    if (fitPlots && key && key !== fitted.current && bounds.isValid()) {
      fitted.current = key;
      fit(bounds.pad(0.25), 15);
    }
  }, [parcels, selected, lang, t, fitPlots]);

  // highlighted shapes
  const activeKey = highlights.find((h) => h.active)?.key;
  useEffect(() => {
    const g = hlLayer.current;
    const m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    if (!highlights.length) return;
    const bounds = L.latLngBounds([]);
    for (const h of highlights) {
      const poly = L.polygon(toLatLngs(h.boundary), { className: `lf-hl${h.active ? ' is-on' : ''}`, weight: h.active ? 3 : 2 });
      poly.bindTooltip(h.label, { direction: 'top', className: 'lf-tip' });
      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        cb.current.onHighlight?.(h.key);
      });
      poly.addTo(g);
      bounds.extend(poly.getBounds());
    }
    if (fitHighlights) {
      const active = highlights.find((h) => h.active);
      fit((active ? L.polygon(toLatLngs(active.boundary)).getBounds() : bounds).pad(0.3), 16);
    }
  }, [highlights, fitHighlights]);

  // when browsing, bring the chosen shape into view without moving on every refresh
  useEffect(() => {
    const m = map.current;
    const h = highlights.find((x) => x.key === activeKey);
    if (fitHighlights || !m || !h) return;
    const b = L.polygon(toLatLngs(h.boundary)).getBounds();
    // zoom to it when it is out of view, or too small to see at the current zoom
    if (!m.getBounds().contains(b) || m.getZoom() < 13) m.fitBounds(b.pad(1.2), { maxZoom: 15 });
  }, [activeKey, fitHighlights]);

  // keep the selected plot in view
  useEffect(() => {
    const m = map.current;
    const p = parcels.find((x) => x.id === selected);
    if (!m || !p) return;
    const want = p.boundary ? L.polygon(toLatLngs(p.boundary)).getBounds() : L.latLngBounds([[p.lat, p.lon]]);
    if (!m.getBounds().contains(want)) fit(want.pad(0.6), 15);
  }, [selected, parcels]);

  return (
    <div ref={wrap} className={`realmap${full ? ' is-full' : ''}`} role={full ? 'dialog' : undefined} aria-modal={full || undefined} aria-label={full ? label : undefined}>
      <div className="realmap-stage">
        <div ref={el} className="realmap-canvas" style={{ height: full ? undefined : height }} role="region" aria-label={label} />
        <button type="button" className="realmap-full btn btn-sm" onClick={() => setFull((f) => !f)} aria-pressed={full}>
          <Icon name={full ? 'close' : 'map'} size={16} />
          {full ? t('map.exitFull') : t('map.full')}
        </button>
      </div>
      <div className="realmap-tools">
        <div className="seg-tabs" role="group" aria-label={t('map.view')}>
          <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
            {t('map.basemap')}
          </button>
          <button type="button" aria-pressed={view === 'photo'} onClick={() => setView('photo')}>
            {t('map.photo')}
          </button>
        </div>
        <label className="check small">
          <input type="checkbox" checked={showPria} onChange={(e) => setShowPria(e.target.checked)} /> {t('map.priaLayer')}
        </label>
        {showPria && (
          <div className="legend small" style={{ marginTop: 0 }}>
            <span>
              <i style={{ background: '#d4a03a', borderRadius: '50%', width: 10 }} />
              {t('method.mowing')}
            </span>
            <span>
              <i style={{ background: '#5e9c94', borderRadius: '50%', width: 10 }} />
              {t('method.grazing')}
            </span>
            <span>
              <i style={{ background: '#8a8f7a', borderRadius: '50%', width: 10 }} />
              {t('map.otherMaintenance')}
            </span>
          </div>
        )}
      </div>
      {onSelect && parcels.length > 0 && (
        <div className="chip-row" role="group" aria-label={t('map.choosePlot')}>
          {parcels.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={p.id === selected} onClick={() => onSelect(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
