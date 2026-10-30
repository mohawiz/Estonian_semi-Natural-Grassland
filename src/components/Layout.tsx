import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { AssistantPanel } from '../features/assistant/AssistantPanel';
import { ShortcutsDialog } from '../features/help/ShortcutsDialog';
import { Tour } from '../features/tour/Tour';
import { BrandMark, Icon } from './Icon';
import { DemoBadge } from './ui';

const NAV: { section: string; items: { to: string; key: string; icon: string; tour?: string }[] }[] = [
  {
    section: 'nav.sectionWork',
    items: [
      { to: '/', key: 'nav.dashboard', icon: 'home' },
      { to: '/parcels', key: 'nav.parcels', icon: 'parcels' },
      { to: '/log', key: 'nav.log', icon: 'log', tour: 'nav-log' },
    ],
  },
  {
    section: 'nav.sectionEvidence',
    items: [
      { to: '/weather', key: 'nav.weather', icon: 'rain', tour: 'nav-weather' },
      { to: '/report', key: 'nav.report', icon: 'report', tour: 'nav-report' },
      { to: '/deadlines', key: 'nav.deadlines', icon: 'deadlines' },
    ],
  },
  {
    section: 'nav.sectionKnow',
    items: [
      { to: '/rules', key: 'nav.rules', icon: 'book' },
      { to: '/help', key: 'nav.help', icon: 'help', tour: 'nav-help' },
      { to: '/settings', key: 'nav.settings', icon: 'settings' },
      { to: '/privacy', key: 'nav.privacy', icon: 'shield' },
    ],
  },
];

export function Layout() {
  const { t, farm, settings, updateSettings } = useApp();
  const ui = useUI();
  const location = useLocation();
  const navigate = useNavigate();
  const first = useRef(true);

  // Move focus to the page title on navigation, for screen-reader and keyboard users.
  useEffect(() => {
    ui.setSidebarOpen(false);
    if (first.current) {
      first.current = false;
      return;
    }
    // During a tour the popover owns focus; don't steal it.
    if (document.querySelector('.tour-pop')) return;
    requestAnimationFrame(() => document.getElementById('page-title')?.focus({ preventScroll: false }));
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Global keyboard shortcuts: "?" help, "/" assistant, "g x" go-to, "n" new entry.
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
      } else if (e.key === 'n') {
        navigate('/log/new');
      } else if (e.key === 'g') {
        pendingG = Date.now();
      } else if (Date.now() - pendingG < 1200) {
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
      {ui.sidebarOpen && <div className="scrim" onClick={() => ui.setSidebarOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar ${ui.sidebarOpen ? 'open' : ''}`} aria-label={t('app.menu')} data-tour="nav">
        <NavLink to="/" className="brand">
          <BrandMark />
          <span>
            <span className="brand-name">{t('app.name')}</span>
            <span className="brand-sub">Keskkonnaamet · PRIA</span>
          </span>
        </NavLink>
        <nav className="nav">
          {NAV.map((s) => (
            <div key={s.section}>
              <div className="nav-section">{t(s.section)}</div>
              {s.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/'} data-tour={i.tour}>
                  <Icon name={i.icon} />
                  {t(i.key)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {farm?.isDemo && (
            <p>
              <DemoBadge />
            </p>
          )}
          <p style={{ margin: 0 }}>{t('app.decisionSupport')}</p>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn menu-btn" aria-label={t('app.menu')} aria-expanded={ui.sidebarOpen} onClick={() => ui.setSidebarOpen(true)}>
            <Icon name="menu" />
          </button>
          <span className="hide-sm muted small">{farm ? farm.name : ''}</span>
          <span className="spacer" />
          <label className="sr-only" htmlFor="lang-switch">
            {t('lang.label')}
          </label>
          <select id="lang-switch" value={settings.lang} onChange={(e) => updateSettings({ lang: e.target.value as 'et' | 'en' })} style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }}>
            <option value="et">ET · Eesti</option>
            <option value="en">EN · English</option>
          </select>
          <button
            className="btn btn-ghost icon-btn"
            aria-label={`${t('theme.label')}: ${t(`theme.${settings.theme}`)}`}
            title={`${t('theme.label')}: ${t(`theme.${settings.theme}`)}`}
            onClick={() => updateSettings({ theme: settings.theme === 'system' ? 'dark' : settings.theme === 'dark' ? 'light' : 'system' })}
          >
            <Icon name={settings.theme === 'dark' ? 'moon' : settings.theme === 'light' ? 'sun' : 'globe'} />
          </button>
          <button className="btn btn-ghost icon-btn hide-sm" aria-label={t('help.shortcuts')} title={`${t('help.shortcuts')} (?)`} onClick={() => ui.setShortcutsOpen(true)}>
            <Icon name="keyboard" />
          </button>
          <button className="btn btn-primary" onClick={() => ui.setAssistantOpen(!ui.assistantOpen)} aria-expanded={ui.assistantOpen} aria-controls="assistant-panel" data-tour="assistant-btn">
            <Icon name="assistant" />
            <span className="hide-sm">{t('assistant.title')}</span>
          </button>
        </header>
        <main id="main" className="content">
          {farm?.isDemo && (
            <div className="notice notice-demo no-print" style={{ marginBottom: 16 }}>
              <Icon name="sprout" size={18} />
              <div>
                <strong>{t('app.demoBadge')}.</strong> {t('app.demoBanner')}
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      <AssistantPanel />
      <ShortcutsDialog />
      {ui.tour && <Tour id={ui.tour} />}
    </div>
  );
}
