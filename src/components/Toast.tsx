// Toasts animate with CSS (enter) and a short leaving class (exit), so they don't
// pull the animation library into the first bundle.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/store';
import { Icon } from './Icon';

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
  undo?: () => void | Promise<void>;
  leaving?: boolean;
}

const Ctx = createContext<(text: string, opts?: { kind?: 'ok' | 'error'; undo?: () => void | Promise<void> }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const { t } = useApp();

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 220);
  }, []);
  const push = useCallback(
    (text: string, opts: { kind?: 'ok' | 'error'; undo?: () => void | Promise<void> } = {}) => {
      const id = next.current++;
      setToasts((ts) => [...ts.slice(-2), { id, text, kind: opts.kind ?? 'ok', undo: opts.undo }]);
      setTimeout(() => dismiss(id), opts.undo ? 8000 : 4200);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast glass ${x.kind === 'error' ? 'toast-error' : ''} ${x.leaving ? 'leaving' : ''}`}>
            <span className="toast-mark">
              <Icon name={x.kind === 'error' ? 'warn' : 'check'} size={16} />
            </span>
            <span className="grow">{x.text}</span>
            {x.undo && (
              <button
                onClick={async () => {
                  await x.undo?.();
                  dismiss(x.id);
                }}
              >
                {t('actions.undo')}
              </button>
            )}
            <button aria-label={t('actions.close')} onClick={() => dismiss(x.id)} style={{ border: 0, background: 'transparent', padding: 6 }}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
