import { useApp } from '../app/store';
import { useToast } from '../components/Toast';
import { Link } from 'react-router-dom';

export const CHECKLIST_ITEMS = ['registered', 'maintainedThisYear', 'hayRemoved', 'noFertiliser', 'shrubControl', 'records', 'photos', 'missedLogged', 'boardConsent'] as const;

export function Checklist({ parcelId }: { parcelId: string }) {
  const { t, data, saveChecklist } = useApp();
  const toast = useToast();
  const state = data.checklists.find((c) => c.parcelId === parcelId) ?? { parcelId, answers: {}, updatedAt: '' };
  const answered = CHECKLIST_ITEMS.filter((k) => state.answers[k]).length;

  const set = async (key: string, v: 'yes' | 'no' | 'unsure') => {
    await saveChecklist({ ...state, answers: { ...state.answers, [key]: v }, updatedAt: new Date().toISOString() });
    if (answered + 1 === CHECKLIST_ITEMS.length && !state.answers[key]) toast(t('checklist.saved'));
  };

  return (
    <section className="panel" aria-labelledby="cl-title">
      <h2 id="cl-title">{t('checklist.title')}</h2>
      <p className="muted small">{t('checklist.subtitle')}</p>
      <div className="row small" style={{ justifyContent: 'space-between' }}>
        <span>{t('checklist.progress', { n: answered, total: CHECKLIST_ITEMS.length })}</span>
      </div>
      <div className="progress" aria-hidden="true" style={{ margin: '6px 0 8px' }}>
        <div style={{ width: `${(answered / CHECKLIST_ITEMS.length) * 100}%` }} />
      </div>
      {CHECKLIST_ITEMS.map((k) => (
        <div className="check-item" key={k} role="radiogroup" aria-labelledby={`cl-${k}`}>
          <span id={`cl-${k}`}>{t(`checklist.items.${k}`)}</span>
          <span className="seg">
            {(['yes', 'no', 'unsure'] as const).map((v) => (
              <label key={v}>
                <input type="radio" name={`cl-${parcelId}-${k}`} checked={state.answers[k] === v} onChange={() => set(k, v)} />
                <span>{t(`checklist.${v}`)}</span>
              </label>
            ))}
          </span>
        </div>
      ))}
      <p className="muted small" style={{ marginTop: 12 }}>
        {t('checklist.sourceNote')} <Link to="/rules">{t('nav.rules')}</Link>
      </p>
    </section>
  );
}
