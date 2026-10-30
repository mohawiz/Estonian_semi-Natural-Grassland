import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { Icon } from '../components/Icon';
import { ConfirmDialog, PageHeader, useConfirm } from '../components/ui';
import { ShortcutList } from '../features/help/ShortcutsDialog';

const GUIDES = ['start', 'log', 'report', 'weather', 'share', 'ask'] as const;
const TERMS = ['plk', 'board', 'pria', 'forceMajeure', 'severity', 'ha', 'soil', 'workingDay'] as const;

export function HelpPage() {
  const { t, farm, data, loadDemo } = useApp();
  const ui = useUI();
  const confirm = useConfirm();

  const runDemo = async () => {
    const go = async () => {
      if (!farm?.isDemo) await loadDemo();
      ui.startTour('demo');
    };
    if (data.farms.length && !farm?.isDemo) confirm.ask(go);
    else await go();
  };

  return (
    <>
      <PageHeader
        title={t('help.title')}
        subtitle={t('help.subtitle')}
        actions={
          <>
            <button className="btn" onClick={() => ui.startTour('main')}>
              <Icon name="play" />
              {t('help.replayTour')}
            </button>
            <button className="btn btn-primary" onClick={runDemo}>
              <Icon name="report" />
              {t('help.runDemo')}
            </button>
          </>
        }
      />
      <ConfirmDialog open={confirm.open} title={t('settings.loadDemo')} body={t('settings.demoConfirm')} confirmLabel={t('actions.continue')} onConfirm={confirm.confirm} onCancel={confirm.cancel} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <h2>{t('help.guides')}</h2>
          {GUIDES.map((g) => (
            <details key={g} className="passage">
              <summary>{t(`help.guide.${g}Title`)}</summary>
              <p style={{ marginTop: 8 }}>{t(`help.guide.${g}Body`)}</p>
            </details>
          ))}
        </section>
        <div className="stack">
          <section className="panel">
            <h2>{t('help.glossary')}</h2>
            <dl style={{ margin: 0 }}>
              {TERMS.map((k) => (
                <div key={k} className="passage">
                  <dt style={{ fontWeight: 600 }}>{t(`help.terms.${k}.term`)}</dt>
                  <dd style={{ margin: '4px 0 0' }}>{t(`help.terms.${k}.def`)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel">
            <h2>{t('help.shortcuts')}</h2>
            <ShortcutList />
          </section>
          <p className="muted small">{t('help.contact')}</p>
        </div>
      </div>
    </>
  );
}
