import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uid, useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { ConfirmDialog, PageHeader, useConfirm } from '../components/ui';
import { useToast } from '../components/Toast';
import { todayISO } from '../lib/dates';
import { fromExportFile, toExportFile } from '../services/transfer';

export function SettingsPage() {
  const { t, settings, updateSettings, data, farm, saveFarm, replaceAll, loadDemo, resetAll } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [confirmText, setConfirmText] = useState({ title: '', body: '', danger: false });
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(farm?.name ?? '');
  const [owner, setOwner] = useState(farm?.owner ?? '');
  const [registry, setRegistry] = useState(farm?.registryCode ?? '');

  const ask = (title: string, body: string, danger: boolean, fn: () => void) => {
    setConfirmText({ title, body, danger });
    confirm.ask(fn);
  };

  const exportData = async () => {
    const file = await toExportFile(data);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
    a.download = `grassland-assistant-${farm?.isDemo ? 'demo-' : ''}${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(t('settings.exported'));
  };

  const importData = async (f: File | undefined) => {
    if (!f) return;
    try {
      const snap = fromExportFile(JSON.parse(await f.text()));
      ask(t('settings.importData'), t('settings.importConfirm'), false, async () => {
        await replaceAll(snap);
        toast(t('settings.imported'));
      });
    } catch {
      toast(t('settings.importError'), { kind: 'error' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <ConfirmDialog open={confirm.open} title={confirmText.title} body={confirmText.body} danger={confirmText.danger} confirmLabel={confirmText.danger ? t('actions.delete') : t('actions.continue')} onConfirm={confirm.confirm} onCancel={confirm.cancel} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <section className="panel form">
            <h2>{t('settings.appearance')}</h2>
            <fieldset className="field">
              <legend>{t('lang.label')}</legend>
              <div className="choice-row">
                {(['et', 'en'] as const).map((l) => (
                  <label key={l} className="choice">
                    <input type="radio" name="lang" checked={settings.lang === l} onChange={() => updateSettings({ lang: l })} />
                    <span lang={l}>{t(`lang.${l}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend>{t('theme.label')}</legend>
              <div className="choice-row">
                {(['system', 'light', 'dark'] as const).map((th) => (
                  <label key={th} className="choice">
                    <input type="radio" name="theme" checked={settings.theme === th} onChange={() => updateSettings({ theme: th })} />
                    <span>{t(`theme.${th}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          <form
            className="panel form"
            onSubmit={async (e) => {
              e.preventDefault();
              await saveFarm({ id: farm?.id ?? uid('farm-'), isDemo: farm?.isDemo ?? false, createdAt: farm?.createdAt ?? new Date().toISOString(), name: name.trim(), owner: owner.trim(), registryCode: registry.trim() || undefined });
              toast(t('settings.profileSaved'));
            }}
          >
            <h2>{t('settings.profile')}</h2>
            <div className="field">
              <label htmlFor="s-farm">{t('settings.farmName')}</label>
              <input id="s-farm" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-owner">{t('settings.owner')}</label>
              <input id="s-owner" type="text" value={owner} autoComplete="name" onChange={(e) => setOwner(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-reg">{t('settings.registry')}</label>
              <input id="s-reg" type="text" value={registry} onChange={(e) => setRegistry(e.target.value)} />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary">{t('actions.save')}</button>
            </div>
          </form>
        </div>
        <div className="stack">
          <section className="panel">
            <h2>{t('settings.data')}</h2>
            <p className="small">
              {t('settings.dataBody')} <Link to="/privacy">{t('nav.privacy')}</Link>
            </p>
            <div className="grid" style={{ gap: 8 }}>
              <button className="btn" onClick={exportData} disabled={!data.farms.length && !data.parcels.length}>
                <Icon name="download" size={16} />
                {t('settings.exportData')}
              </button>
              <input ref={fileRef} id="s-import" type="file" accept="application/json,.json" className="sr-only" onChange={(e) => importData(e.target.files?.[0])} />
              <button className="btn" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={16} />
                {t('settings.importData')}
              </button>
              <button
                className="btn"
                onClick={() =>
                  ask(t('settings.loadDemo'), t('settings.demoConfirm'), false, async () => {
                    await loadDemo();
                    toast(t('settings.demoLoaded'));
                  })
                }
              >
                <Icon name="sprout" size={16} />
                {t('settings.loadDemo')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() =>
                  ask(t('settings.reset'), t('settings.resetConfirm'), true, async () => {
                    await resetAll();
                    toast(t('settings.resetDone'));
                  })
                }
              >
                <Icon name="trash" size={16} />
                {t('settings.reset')}
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>{t('settings.tutorials')}</h2>
            <button
              className="btn"
              onClick={async () => {
                await updateSettings({ welcomeDone: false, tourDone: false, onboarding: { openDemo: false, logEntry: false, buildReport: false, askAssistant: false } });
                try {
                  localStorage.removeItem('ga-hide-onboarding');
                } catch {
                  /* ignore */
                }
                toast(t('settings.tutorialsReset'));
              }}
            >
              {t('settings.resetTutorials')}
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
