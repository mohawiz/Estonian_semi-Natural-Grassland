import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { Celebration } from '../features/celebrate/Celebration';
import { ShortcutsDialog } from '../features/help/ShortcutsDialog';
import { useMeadow } from '../features/meadow/conditions';
import { Icon } from './Icon';
import { BrandMark, GrassLoader, useSpecular } from './motion';
import { DemoBadge } from './ui';

// Loaded on first use: the assistant pulls in the document index, the tour its step logic.
const AssistantPanel = lazy(() => import('../features/assistant/AssistantPanel').then((m) => ({ default: m.AssistantPanel })));
const Tour = lazy(() => import('../features/tour/Tour').then((m) => ({ default: m.Tour })));

interface NavItem {
  to: string;
  key: string;
  icon: string;
  tour?: string;
  dock?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/', key: 'nav.dashboard', icon: 'home', dock: true },
  { to: '/log', key: 'nav.log', icon: 'log', tour: 'nav-log', dock: true },
  { to: '/weather', key: 'nav.weather', icon: 'rain', tour: 'nav-weather', dock: true },
  { to: '/report', key: 'nav.report', icon: 'report', tour: 'nav-report', dock: true },
  { to: '/parcels', key: 'nav.parcels', icon: 'parcels' },
  { to: '/deadlines', key: 'nav.deadlines', icon: 'deadlines' },
  { to: '/rules', key: 'nav.rules', icon: 'book' },
  { to: '/help', key: 'nav.help', icon: 'help', tour: 'nav-help' },
  { to: '/settings', key: 'nav.settings', icon: 'settings' },
  { to: '/privacy', key: 'nav.privacy', icon: 'shield' },
  { to: '/about', key: 'nav.about', icon: 'about' },
];

function NavItems({ items, pillId }: { items: NavItem[]; pillId: string }) {
  const { t } = useApp();
  const { pathname } = useLocation();
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  return (
    <>
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.to === '/'} data-tour={i.tour} className={i.dock ? '' : 'rail-extra'}>
          {active(i.to) && <motion.span layoutId={pillId} className="nav-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
          <Icon name={i.icon} size={24} />
          <span>{t(i.key)}</span>
        </NavLink>
      ))}
    </>
  );
}

/**
 * Route transitions are enter-only: the old page leaves at once and the new one
 * rises in. Content never waits on an exit animation (background tabs pause them).
 */
function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const { reduced } = useMeadow();
  return (
    <motion.div
      key={location.pathname}
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 0.8, 0.2, 1] }}
    >
      <Suspense
        fallback={
          <div style={{ padding: '60px 0', display: 'grid', placeItems: 'center' }}>
            <GrassLoader />
          </div>
        }
      >
        {outlet}
      </Suspense>
    </motion.div>
  );
}

export function Layout() {
  const { t, farm, settings, updateSettings } = useApp();
  const ui = useUI();
  const { reduced } = useMeadow();
  const location = useLocation();
  const navigate = useNavigate();
  const first = useRef(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const isHome = location.pathname === '/';
  const [assistantLoaded, setAssistantLoaded] = useState(false);
  useEffect(() => {
    if (ui.assistantOpen) setAssistantLoaded(true);
  }, [ui.assistantOpen]);
  useSpecular(!reduced);

  // Move focus to the page title on navigation, for screen-reader and keyboard users.
  useEffect(() => {
    setMoreOpen(false);
    ui.setSidebarOpen(false);
    if (first.current) {
      first.current = false;
      return;
    }
    if (document.querySelector('.tour-pop')) return; // the tour owns focus
    window.scrollTo(0, 0);
    setTimeout(() => {
      if (!document.querySelector('.tour-pop')) document.getElementById('page-title')?.focus({ preventScroll: true });
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Global shortcuts: "?" help, "/" assistant, "g x" go-to, "n" new entry.
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || ui.tour) return;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === '?') {
        e.preventDefault();
        ui.setShortcutsOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        ui.setAssistantOpen(true);
      } else if (e.key === 'n') navigate('/log/new');
      else if (e.key === 'g') pendingG = Date.now();
      else if (Date.now() - pendingG < 1200) {
        const map: Record<string, string> = { d: '/', l: '/log', r: '/report', w: '/weather', b: '/rules', p: '/parcels' };
        if (map[e.key]) navigate(map[e.key]);
        pendingG = 0;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate, ui]);

  // Orchestrated page-load: rail, then top bar, then the sheet rises.
  const enter = (delay: number, from: object) => (reduced ? {} : { initial: { opacity: 0, ...from }, animate: { opacity: 1, x: 0, y: 0 }, transition: { delay, duration: 0.7, ease: [0.22, 0.8, 0.2, 1] as const } });

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
    <div className={`shell ${ui.assistantOpen ? 'assistant-open' : ''}`}>
      <a href="#main" className="skip-link">
        {t('app.skipToContent')}
      </a>

      <motion.aside className="rail glass" aria-label={t('app.menu')} data-tour="nav" {...enter(0.15, { x: -30 })}>
        <NavLink to="/" className="brand" aria-label={t('app.name')}>
          <BrandMark size={44} />
        </NavLink>
        <nav className="nav">
          <NavItems items={NAV} pillId="rail-pill" />
          <button type="button" className="btn btn-ghost menu-btn" data-tour="nav-more" aria-expanded={moreOpen} aria-label={t('nav.more')} onClick={() => setMoreOpen((o) => !o)} style={{ flex: 1, flexDirection: 'column', gap: 2, fontSize: '0.64rem', borderRadius: 16, minHeight: 0, padding: '8px 2px 7px' }}>
            <Icon name="more" size={24} />
            <span>{t('nav.more')}</span>
          </button>
        </nav>
        <div className="rail-foot">{farm?.isDemo && <DemoBadge />}</div>
      </motion.aside>

      <AnimatePresence>
        {moreOpen && (
          <>
            <div key="scrim" className="scrim" onClick={() => setMoreOpen(false)} aria-hidden="true" />
            <motion.nav key="drawer" className="drawer glass" aria-label={t('nav.more')} initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ type: 'spring', stiffness: 360, damping: 30 }}>
              {NAV.filter((n) => !n.dock).map((i) => (
                <NavLink key={i.to} to={i.to}>
                  <Icon name={i.icon} size={24} />
                  {t(i.key)}
                </NavLink>
              ))}
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      <div className="main">
        <motion.header className="topbar glass" {...enter(0.3, { y: -20 })}>
          <span className="farm">{farm ? farm.name : t('app.name')}</span>
          <span className="spacer" />
          <label className="sr-only" htmlFor="lang-switch">
            {t('lang.label')}
          </label>
          <select id="lang-switch" className="select-pill" value={settings.lang} onChange={(e) => updateSettings({ lang: e.target.value as 'et' | 'en' })}>
            <option value="et">ET</option>
            <option value="en">EN</option>
          </select>
          <button
            className="btn btn-ghost icon-btn"
            aria-label={`${t('theme.label')}: ${t(`theme.${settings.theme}`)}`}
            title={`${t('theme.label')}: ${t(`theme.${settings.theme}`)}`}
            onClick={() => updateSettings({ theme: settings.theme === 'system' ? 'dark' : settings.theme === 'dark' ? 'light' : 'system' })}
          >
            <Icon name={settings.theme === 'dark' ? 'moon' : settings.theme === 'light' ? 'sun' : 'globe'} />
          </button>
          <button className="btn btn-ghost icon-btn" aria-pressed={settings.effects === 'reduced'} aria-label={t('settings.effectsReduce')} title={t('settings.effectsReduce')} onClick={() => updateSettings({ effects: settings.effects === 'full' ? 'reduced' : 'full' })}>
            <Icon name={settings.effects === 'full' ? 'sparkle' : 'wind'} />
          </button>
          <button className="btn btn-ghost icon-btn hide-sm" aria-label={t('help.shortcuts')} title={`${t('help.shortcuts')} (?)`} onClick={() => ui.setShortcutsOpen(true)}>
            <Icon name="keyboard" />
          </button>
          <button className="btn btn-primary" onClick={() => ui.setAssistantOpen(!ui.assistantOpen)} aria-expanded={ui.assistantOpen} aria-controls="assistant-panel" data-tour="assistant-btn">
            <Icon name="assistant" />
            <span className="hide-sm">{t('assistant.title')}</span>
          </button>
        </motion.header>

        <div className={`meadow-window ${isHome ? 'tall' : ''}`} ref={ui.setHeroSlot} />

        <motion.main id="main" className="sheet" {...enter(0.45, { y: 50 })}>
          <div className="content">
            {farm?.isDemo && (
              <div className="notice notice-demo no-print" style={{ marginBottom: 22 }}>
                <Icon name="sprout" size={20} />
                <div>
                  <strong>{t('app.demoBadge')}.</strong> {t('app.demoBanner')}
                </div>
              </div>
            )}
            <AnimatedOutlet />
            <p className="muted small" style={{ marginTop: 48, maxWidth: '70ch' }}>
              {t('app.decisionSupport')}
            </p>
          </div>
        </motion.main>
      </div>

      {assistantLoaded && (
        <Suspense fallback={null}>
          <AssistantPanel />
        </Suspense>
      )}
      <ShortcutsDialog />
      <Celebration />
      {ui.tour && (
        <Suspense fallback={null}>
          <Tour id={ui.tour} />
        </Suspense>
      )}
    </div>
    </MotionConfig>
  );
}
