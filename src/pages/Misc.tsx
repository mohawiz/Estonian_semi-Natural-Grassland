import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { aiAssistantEnabled } from '../services';

const PRIVACY_ITEMS = [
  ['p1', 'shield'],
  ['p2', 'rain'],
  ...(aiAssistantEnabled ? [['pAi', 'assistant']] : []),
  ['p3', 'pin'],
  ['p4', 'download'],
  ['p5', 'warn'],
] as const;

export function PrivacyPage() {
  const { t } = useApp();
  return (
    <>
      <PageHeader title={t('privacy.title')} subtitle={t('privacy.intro')} />
      <section className="panel" style={{ maxWidth: 760 }}>
        <ul className="ledger">
          {PRIVACY_ITEMS.map(([k, icon]) => (
            <li key={k}>
              <Icon name={icon} />
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
  useEffect(() => {
    document.title = `${t('errors.notFound')} · ${t('app.name')}`;
  }, [t]);
  return <EmptyState icon="parcels" title={t('errors.notFound')} body={t('errors.notFoundBody')} action={<Link className="btn btn-primary" to="/">{t('nav.dashboard')}</Link>} />;
}

