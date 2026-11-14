import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { Celebration } from '../features/celebrate/Celebration';
import { ShortcutsDialog } from '../features/help/ShortcutsDialog';
import { Icon } from './Icon';
import { BrandMark, GrassLoader } from './motion';

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
  // dock: the four main tabs on phones; the rest live under "More"
  { to: '/', key: 'nav.dashboard', icon: 'home', dock: true },
  { to: '/log', key: 'nav.log', icon: 'log', tour: 'nav-log', dock: true },
  { to: '/report', key: 'nav.report', icon: 'report', tour: 'nav-report', dock: true },
  { to: '/meadows', key: 'nav.meadows', icon: 'map', dock: true },
  { to: '/parcels', key: 'nav.parcels', icon: 'parcels' },
  { to: '/weather', key: 'nav.weather', icon: 'rain', tour: 'nav-weather' },
  { to: '/deadlines', key: 'nav.deadlines', icon: 'deadlines' },
  { to: '/rules', key: 'nav.rules', icon: 'book' },
  { to: '/help', key: 'nav.help', icon: 'help', tour: 'nav-help' },
  { to: '/settings', key: 'nav.settings', icon: 'settings' },
  { to: '/privacy', key: 'nav.privacy', icon: 'shield' },
  { to: '/about', key: 'nav.about', icon: 'about' },
];

function NavItems({ items }: { items: NavItem[] }) {
  const { t } = useApp();
  const { pathname } = useLocation();
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  return (
    <>
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.to === '/'} data-tour={i.tour} className={i.dock ? '' : 'rail-extra'}>
          {active(i.to) && <span className="nav-pill" />}
          <Icon name={i.icon} size={24} />
          <span>{t(i.key)}</span>
        </NavLink>
      ))}
    </>
  );
}

/** Pages appear at once: no transitions, so nothing moves while people read. */
function PageOutlet() {
  const outlet = useOutlet();
  return (
    <div>
      <Suspense
        fallback={
          <div style={{ padding: '60px 0', display: 'grid', placeItems: 'center' }}>
            <GrassLoader />
          </div>
        }
      >
        {outlet}
      </Suspense>
    </div>
  );
}

export function Layout() {
  const { t, farm, settings, updateSettings } = useApp();
  const ui = useUI();
  const location = useLocation();
  const navigate = useNavigate();
  const first = useRef(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [assistantLoaded, setAssistantLoaded] = useState(false);
  useEffect(() => {
    if (ui.assistantOpen) setAssistantLoaded(true);
  }, [ui.assistantOpen]);

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

  return (
    <div className={`shell ${ui.assistantOpen ? 'assistant-open' : ''}`}>
      <a href="#main" className="skip-link">
        {t('app.skipToContent')}
      </a>

      <aside className="rail glass" aria-label={t('app.menu')} data-tour="nav">
        <NavLink to="/" className="brand" aria-label={t('app.name')}>
          <BrandMark size={44} />
        </NavLink>
        <nav className="nav">
          <NavItems items={NAV} />
          <button type="button" className="btn btn-ghost menu-btn" data-tour="nav-more" aria-expanded={moreOpen} aria-label={t('nav.more')} onClick={() => setMoreOpen((o) => !o)} style={{ flex: 1, flexDirection: 'column', gap: 2, fontSize: '0.64rem', borderRadius: 16, minHeight: 0, padding: '8px 2px 7px' }}>
            <Icon name="more" size={24} />
            <span>{t('nav.more')}</span>
          </button>
        </nav>
      </aside>

      {moreOpen && (
        <>
          <div className="scrim" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <nav className="drawer glass" aria-label={t('nav.more')}>
              {NAV.filter((n) => !n.dock).map((i) => (
                <NavLink key={i.to} to={i.to}>
                  <Icon name={i.icon} size={24} />
                  {t(i.key)}
                </NavLink>
              ))}
          </nav>
        </>
      )}

      <div className="main">
        <header className="topbar glass">
          <span className="farm">{farm ? farm.name : t('app.name')}</span>
          <span className="spacer" />
          {/* every control shows its name as text, not only an icon */}
          <label className="top-control">
            <span className="top-label hide-sm">{t('lang.label')}</span>
            <select id="lang-switch" className="select-pill" value={settings.lang} onChange={(e) => updateSettings({ lang: e.target.value as 'et' | 'en' })}>
              <option value="et">Eesti</option>
              <option value="en">English</option>
            </select>
          </label>
          <button className="btn btn-ghost top-btn" title={t('theme.label')} onClick={() => updateSettings({ theme: settings.theme === 'system' ? 'dark' : settings.theme === 'dark' ? 'light' : 'system' })}>
            <Icon name={settings.theme === 'dark' ? 'moon' : settings.theme === 'light' ? 'sun' : 'globe'} size={20} />
            <span>
              <span className="sr-only">{t('theme.label')}: </span>
              {t(settings.theme === 'system' ? 'theme.auto' : `theme.${settings.theme}`)}
            </span>
          </button>
          <button className="btn btn-primary hide-sm" onClick={() => ui.setAssistantOpen(!ui.assistantOpen)} aria-expanded={ui.assistantOpen} aria-controls="assistant-panel" data-tour="assistant-btn">
            <Icon name="assistant" />
            {t('assistant.open')}
          </button>
        </header>

        <div className="meadow-window" ref={ui.setHeroSlot} />

        <main id="main" className="sheet">
          <div className="content">
            {farm?.isDemo && (
              <div className="notice notice-demo no-print" style={{ marginBottom: 22, alignItems: 'center', flexWrap: 'wrap' }}>
                <Icon name="sprout" size={20} />
                <div className="grow">
                  <strong>{t('app.demoBadge')}.</strong> {t('app.demoBanner')}
                </div>
                <Link className="btn btn-sm btn-primary" to="/start">
                  {t('setup.cta')}
                </Link>
              </div>
            )}
            <PageOutlet />
            <p className="muted small" style={{ marginTop: 48, maxWidth: '70ch' }}>
              {t('app.decisionSupport')}
            </p>
          </div>
        </main>
      </div>

      {/* on phones the assistant sits by the thumb, above the bottom menu */}
      {!ui.assistantOpen && (
        <button className="btn btn-primary ask-fab" onClick={() => ui.setAssistantOpen(true)} aria-controls="assistant-panel" aria-expanded={false} data-tour="assistant-btn">
          <Icon name="assistant" size={22} />
          {t('assistant.fab')}
        </button>
      )}

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
  );
}
