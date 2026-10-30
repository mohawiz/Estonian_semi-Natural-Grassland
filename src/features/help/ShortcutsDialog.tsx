import { useEffect, useRef } from 'react';
import { useApp } from '../../app/store';
import { useUI } from '../../app/ui';
import { Icon } from '../../components/Icon';
import { trapFocus } from '../../components/ui';

export const SHORTCUTS: { keys: string[]; key: string }[] = [
  { keys: ['?'], key: 'help.keys.help' },
  { keys: ['/'], key: 'help.keys.assistant' },
  { keys: ['n'], key: 'help.keys.newEntry' },
  { keys: ['g', 'd'], key: 'help.keys.dashboard' },
  { keys: ['g', 'l'], key: 'help.keys.log' },
  { keys: ['g', 'r'], key: 'help.keys.report' },
  { keys: ['g', 'w'], key: 'help.keys.weather' },
  { keys: ['g', 'b'], key: 'help.keys.rules' },
  { keys: ['Esc'], key: 'help.keys.escape' },
];

export function ShortcutList() {
  const { t } = useApp();
  return (
    <table className="data">
      <tbody>
        {SHORTCUTS.map((s) => (
          <tr key={s.key}>
            <td style={{ whiteSpace: 'nowrap' }}>
              {s.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 && <span className="muted small"> {t('help.keys.then')} </span>}
                  <kbd className="kbd">{k}</kbd>
                </span>
              ))}
            </td>
            <td>{t(s.key)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ShortcutsDialog() {
  const { t } = useApp();
  const { shortcutsOpen, setShortcutsOpen } = useUI();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shortcutsOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShortcutsOpen(false);
      if (e.key === 'Tab') trapFocus(e, ref.current);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [shortcutsOpen, setShortcutsOpen]);
  if (!shortcutsOpen) return null;
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && setShortcutsOpen(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" ref={ref}>
        <div className="panel-title">
          <h2 id="shortcuts-title">{t('help.shortcuts')}</h2>
          <button className="btn btn-ghost icon-btn" aria-label={t('actions.close')} onClick={() => setShortcutsOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <ShortcutList />
      </div>
    </div>
  );
}
