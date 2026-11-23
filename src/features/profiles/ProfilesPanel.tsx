// Settings: the farmer profile in use, its PIN, switching farmer and deleting a profile.
import { useState } from 'react';
import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import { ConfirmDialog, useConfirm } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { closeDb } from '../../services/db';
import { activeProfileId, deleteProfile, isValidPin, listProfiles, renameProfile, setPin, switchProfile } from '../../services/profiles';
import { profileLabel } from './ProfilePicker';

export function ProfilesPanel() {
  const { t } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [version, setVersion] = useState(0);
  const profiles = listProfiles();
  const id = activeProfileId();
  const index = profiles.findIndex((p) => p.id === id);
  const me = profiles[index];
  const [name, setName] = useState(me.name);
  const [pin, setPinValue] = useState('');
  const [err, setErr] = useState('');
  void version;

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    renameProfile(id, name);
    setVersion((v) => v + 1);
    toast(t('profiles.saved'));
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPin(pin)) return setErr(t('profiles.pinRule'));
    setErr('');
    await setPin(id, pin);
    setPinValue('');
    setVersion((v) => v + 1);
    toast(t('profiles.pinSaved'));
  };

  return (
    <section className="panel form" id="profiles">
      <ConfirmDialog open={confirm.open} title={t('profiles.deleteTitle')} body={t('profiles.deleteBody')} danger confirmLabel={t('actions.delete')} onConfirm={confirm.confirm} onCancel={confirm.cancel} />
      <h2>{t('profiles.title')}</h2>
      <p className="small" style={{ marginTop: 0 }}>
        {t('profiles.panelIntro')}
      </p>
      <p className="profile-current">
        <span className="profile-avatar" aria-hidden="true">
          {(me.name || '?').charAt(0).toUpperCase()}
        </span>
        <span>
          {t('profiles.using')} <strong>{profileLabel(me, index, t)}</strong>
          <br />
          <span className="muted small">{t('profiles.count', { n: profiles.length })}</span>
        </span>
      </p>

      <form onSubmit={saveName}>
        <div className="field">
          <label htmlFor="pf-rename">{t('profiles.name')}</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="pf-rename" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('profiles.namePlaceholder')} />
            <button className="btn" type="submit" disabled={!name.trim() || name.trim() === me.name}>
              {t('actions.save')}
            </button>
          </div>
        </div>
      </form>

      <form onSubmit={savePin}>
        <div className="field">
          <label htmlFor="pf-setpin">{me.pinHash ? t('profiles.changePin') : t('profiles.setPin')}</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="pf-setpin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} aria-invalid={!!err} aria-describedby="pf-setpin-hint" />
            <button className="btn" type="submit" disabled={pin.length < 4}>
              <Icon name="lock" size={16} />
              {t('actions.save')}
            </button>
          </div>
          <span id="pf-setpin-hint" className={err ? 'error-text' : 'hint'}>
            {err || t('profiles.pinHint')}
          </span>
        </div>
      </form>
      {me.pinHash && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await setPin(id, '');
            setVersion((v) => v + 1);
            toast(t('profiles.pinRemoved'));
          }}
        >
          {t('profiles.removePin')}
        </button>
      )}

      <div className="form-actions" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={switchProfile}>
          <Icon name="user" size={18} />
          {t('profiles.switch')}
        </button>
        {profiles.length > 1 && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() =>
              confirm.ask(async () => {
                await closeDb();
                await deleteProfile(id);
                switchProfile();
              })
            }
          >
            <Icon name="trash" size={16} />
            {t('profiles.delete')}
          </button>
        )}
      </div>
    </section>
  );
}
