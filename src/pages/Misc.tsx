import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/store';
import { Icon } from '../components/Icon';
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
  useEffect(() => {
    document.title = `${t('errors.notFound')} · ${t('app.name')}`;
  }, [t]);
  return <EmptyState icon="parcels" title={t('errors.notFound')} body={t('errors.notFoundBody')} action={<Link className="btn btn-primary" to="/">{t('nav.dashboard')}</Link>} />;
}

