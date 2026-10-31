import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/motion';

/** First-run welcome: choose language, then tour or skip. */
export function Welcome() {
  const { t, settings, updateSettings } = useApp();
  const ui = useUI();
  const finish = async (tour: boolean) => {
    try {
      localStorage.setItem('ga-lang-chosen', '1');
    } catch {
      /* ignore */
    }
    await updateSettings({ welcomeDone: true });
    if (tour) ui.startTour('main');
  };
  return (
    <main className="welcome" id="main">
      <div className="welcome-card glass tilt" role="dialog" aria-labelledby="welcome-title" aria-modal="false">
        <div className="row" style={{ gap: 12, marginBottom: 6 }}>
          <BrandMark size={52} />
          <span className="eyebrow">{t('app.tagline')}</span>
        </div>
        <h1 id="welcome-title">{t('welcome.title')}</h1>
        <p>{t('welcome.intro')}</p>
        <h2 style={{ fontSize: '1rem', marginTop: 16 }}>{t('welcome.chooseLang')}</h2>
        <div className="lang-pick" role="group" aria-label={t('welcome.chooseLang')}>
          {(['et', 'en'] as const).map((l) => (
            <button key={l} className="btn" aria-pressed={settings.lang === l} lang={l} onClick={() => updateSettings({ lang: l })}>
              {l === 'et' ? 'Eesti keel' : 'English'}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => finish(true)} autoFocus>
            <Icon name="play" size={16} />
            {t('welcome.tour')}
          </button>
          <button className="btn" onClick={() => finish(false)}>
            {t('welcome.skip')}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 16, marginBottom: 0 }}>
          <Icon name="shield" size={14} /> {t('welcome.privacy')} {t('app.decisionSupport')}
        </p>
      </div>
    </main>
  );
}
