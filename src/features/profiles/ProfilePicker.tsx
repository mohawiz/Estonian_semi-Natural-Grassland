// "Who is using the app?" — shown before any farm data is loaded when this device
// has more than one farmer profile, or the last one has a PIN.
import { useState, type ReactNode } from 'react';
import { translate, type Vars } from '../../i18n';
import { Icon } from '../../components/Icon';
import { BrandMark } from '../../components/motion';
import { checkPin, createProfile, isValidPin, listProfiles, needsPicker, openProfile, pickerLang, rememberLang, type Profile } from '../../services/profiles';

export function ProfileGate({ children }: { children: ReactNode }) {
  const [show] = useState(needsPicker);
  return show ? <ProfilePicker /> : <>{children}</>;
}

export function profileLabel(p: Profile, index: number, t: (k: string, v?: Vars) => string): string {
  return p.name || t('profiles.unnamed', { n: index + 1 });
}

function ProfilePicker() {
  const [lang, setLang] = useState(pickerLang);
  const t = (k: string, v?: Vars) => translate(lang, k, v);
  const profiles = listProfiles();
  const [unlocking, setUnlocking] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);

  document.documentElement.setAttribute('data-effects', 'calm');
  document.documentElement.lang = lang;

  const choose = (p: Profile) => {
    setErr('');
    setPin('');
    setAdding(false);
    if (p.pinHash) setUnlocking(p);
    else openProfile(p.id);
  };

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlocking) return;
    if (await checkPin(unlocking, pin)) openProfile(unlocking.id);
    else {
      setErr(t('profiles.wrongPin'));
      setPin('');
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr(t('profiles.nameNeeded'));
    if (newPin && !isValidPin(newPin)) return setErr(t('profiles.pinRule'));
    setBusy(true);
    const p = await createProfile(name, newPin || undefined);
    openProfile(p.id);
  };

  return (
    <main className="welcome" id="main">
      <div className="welcome-card glass profile-card" role="dialog" aria-labelledby="profiles-title" aria-modal="false">
        <div className="row" style={{ gap: 12, marginBottom: 6, justifyContent: 'space-between' }}>
          <BrandMark size={44} />
          <div className="profile-lang row" role="group" aria-label={t('welcome.chooseLang')}>
            {(['et', 'en'] as const).map((l) => (
              <button
                key={l}
                className="btn btn-sm"
                aria-pressed={lang === l}
                lang={l}
                onClick={() => {
                  setLang(l);
                  rememberLang(l);
                }}
              >
                {l === 'et' ? 'Eesti' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <h1 id="profiles-title">{t('profiles.whoTitle')}</h1>
        <p>{t('profiles.whoIntro')}</p>

        <ul className="profile-list">
          {profiles.map((p, i) => (
            <li key={p.id}>
              <button type="button" className={`profile-btn${unlocking?.id === p.id ? ' is-active' : ''}`} onClick={() => choose(p)}>
                <span className="profile-avatar" aria-hidden="true">
                  {(p.name || '?').trim().charAt(0).toUpperCase() || <Icon name="user" size={20} />}
                </span>
                <span className="grow">{profileLabel(p, i, t)}</span>
                {p.pinHash ? (
                  <span className="muted small row" style={{ gap: 4 }}>
                    <Icon name="lock" size={16} />
                    {t('profiles.pinLocked')}
                  </span>
                ) : (
                  <Icon name="chevron" size={18} />
                )}
              </button>
              {unlocking?.id === p.id && (
                <form className="profile-form" onSubmit={unlock}>
                  <div className="field">
                    <label htmlFor="pin-in">{t('profiles.enterPin', { name: profileLabel(p, i, t) })}</label>
                    <input id="pin-in" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus aria-invalid={!!err} aria-describedby="pin-err" />
                    {err && (
                      <span id="pin-err" className="error-text" role="alert">
                        {err}
                      </span>
                    )}
                  </div>
                  <div className="row">
                    <button className="btn btn-primary" type="submit" disabled={pin.length < 4}>
                      {t('profiles.open')}
                    </button>
                    <button className="btn" type="button" onClick={() => setUnlocking(null)}>
                      {t('actions.cancel')}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>

        {adding ? (
          <form className="profile-form" onSubmit={create}>
            <h2 style={{ fontSize: '1.1rem', margin: '0 0 8px' }}>{t('profiles.addTitle')}</h2>
            <div className="field">
              <label htmlFor="pf-name">{t('profiles.name')}</label>
              <input id="pf-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('profiles.namePlaceholder')} autoFocus required />
            </div>
            <div className="field">
              <label htmlFor="pf-pin">
                {t('profiles.pin')} <span className="muted small">({t('log.optional')})</span>
              </label>
              <input id="pf-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} aria-describedby="pf-pin-hint" />
              <span id="pf-pin-hint" className="hint">
                {t('profiles.pinHint')}
              </span>
            </div>
            {err && (
              <p className="error-text" role="alert">
                {err}
              </p>
            )}
            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                <Icon name="plus" size={16} />
                {t('profiles.create')}
              </button>
              <button className="btn" type="button" onClick={() => setAdding(false)}>
                {t('actions.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setUnlocking(null);
              setErr('');
              setAdding(true);
            }}
          >
            <Icon name="plus" size={16} />
            {t('profiles.add')}
          </button>
        )}

        <p className="muted small" style={{ marginTop: 16, marginBottom: 0 }}>
          <Icon name="shield" size={14} /> {t('profiles.privacyNote')}
        </p>
      </div>
    </main>
  );
}
