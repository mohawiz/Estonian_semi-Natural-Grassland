import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/store';
import { formatArea } from '../lib/units';
import { Icon } from './Icon';

export function PageHeader({ title, subtitle, crumbs = [], actions, badge, home }: { title: string; subtitle?: string; crumbs?: { label: string; to?: string }[]; actions?: ReactNode; badge?: ReactNode; home?: boolean }) {
  const { t } = useApp();
  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`;
  }, [title, t]);
  return (
    <>
      {!home && (
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/">{t('nav.home')}</Link>
          </li>
          {crumbs.map((c) => (
            <li key={c.label}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>
          ))}
          <li aria-current="page">{title}</li>
        </ol>
      </nav>
      )}
      <header className="page-head">
        <div>
          <h1 tabIndex={-1} id="page-title" className="row" style={{ gap: 12 }}>
            {title} {badge}
          </h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </header>
    </>
  );
}

export function HelpTip({ text, label }: { text: string; label?: string }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);
  return (
    <span className="tip" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="tip-btn" aria-label={label ?? t('labels.help')} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className="tip-bubble">
          {text}
        </span>
      )}
    </span>
  );
}

export function EmptyState({ icon = 'sprout', title, body, action }: { icon?: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />;
}

export function DemoBadge() {
  const { t } = useApp();
  return <span className="badge badge-demo">{t('app.demoBadge')}</span>;
}

export function Notice({ kind = 'info', children, icon }: { kind?: 'info' | 'warn' | 'demo' | 'plain'; children: ReactNode; icon?: string }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'warn' ? 'alert' : undefined}>
      <Icon name={icon ?? (kind === 'warn' ? 'warn' : kind === 'demo' ? 'sprout' : 'info')} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Area({ ha }: { ha: number }) {
  const { lang } = useApp();
  return <span className="area">{formatArea(ha, lang)}</span>;
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onCancel }: { open: boolean; title: string; body?: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab') trapFocus(e, ref.current);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h2 id={titleId}>{title}</h2>
        {body && <p>{body}</p>}
        <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>
            {t('actions.cancel')}
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function trapFocus(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Confirm-dialog state helper: `ask(fn)` opens the dialog and runs fn on confirm. */
export function useConfirm() {
  const [pending, setPending] = useState<null | (() => void)>(null);
  return {
    open: pending !== null,
    ask: (fn: () => void) => setPending(() => fn),
    confirm: () => {
      pending?.();
      setPending(null);
    },
    cancel: () => setPending(null),
  };
}
