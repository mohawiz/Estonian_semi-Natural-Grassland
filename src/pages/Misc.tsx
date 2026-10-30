import { Link } from 'react-router-dom';
import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { BrandMark, Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';

export function PrivacyPage() {
  const { t } = useApp();
  return (
    <>
      <PageHeader title={t('privacy.title')} subtitle={t('privacy.intro')} />
      <section className="panel" style={{ maxWidth: 760 }}>
        <ul className="ledger">
          {(['p1', 'p2', 'p3', 'p4', 'p5'] as const).map((k, i) => (
            <li key={k}>
              <Icon name={['shield', 'rain', 'pin', 'download', 'warn'][i]} />
              <span className="grow">{t(`privacy.${k}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function NotFound() {
  const { t } = useApp();
  return <EmptyState icon="parcels" title={t('errors.notFound')} body={t('errors.notFoundBody')} action={<Link className="btn btn-primary" to="/">{t('nav.dashboard')}</Link>} />;
}

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
      <div className="welcome-card panel" role="dialog" aria-labelledby="welcome-title" aria-modal="false">
        <svg className="welcome-art" viewBox="0 0 600 150" aria-hidden="true">
          <rect width="600" height="150" fill="var(--paper-2)" />
          <path d="M0 95 Q150 70 300 92 T600 88 V150 H0Z" fill="var(--meadow-tint)" />
          <path d="M0 115 Q150 100 300 116 T600 110 V150 H0Z" fill="var(--meadow)" opacity=".85" />
          {Array.from({ length: 40 }, (_, i) => (
            <path key={i} d={`M${i * 15 + 4} 112 l3 -${10 + (i % 4) * 3} l2 ${10 + (i % 4) * 3}`} stroke="var(--hay)" strokeWidth="2" fill="none" />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <path key={`r${i}`} d={`M${40 + i * 40} ${20 + (i % 3) * 8} l-4 10`} stroke="var(--rain)" strokeWidth="2" strokeLinecap="round" />
          ))}
          <rect x="360" y="0" width="160" height="150" fill="var(--hay-band)" />
          <line x1="360" x2="360" y1="0" y2="150" stroke="var(--hay)" strokeDasharray="4 4" />
          <line x1="520" x2="520" y1="0" y2="150" stroke="var(--hay)" strokeDasharray="4 4" />
        </svg>
        <div className="row" style={{ gap: 12, marginBottom: 6 }}>
          <BrandMark />
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
