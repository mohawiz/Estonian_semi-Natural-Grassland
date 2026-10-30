// A small, dependency-free guided tour. Steps point at real elements via
// data-tour attributes; a step may navigate first, so the demo walkthrough can
// "drive the clicks" by moving the report wizard through its URL state.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useUI, type TourId } from '../../app/ui';
import { trapFocus } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { DEMO_SCENARIO } from '../../services/demo';

export interface TourStep {
  target?: string;
  route?: string;
  title: string;
  body: string;
  /** Optional element to click when the step opens (used by the demo walkthrough). */
  click?: string;
}

const demoReport = (step: string) =>
  `/report?parcel=${DEMO_SCENARIO.parcelId}&start=${DEMO_SCENARIO.start}&end=${DEMO_SCENARIO.end}&action=${DEMO_SCENARIO.plannedAction}&reason=${DEMO_SCENARIO.reason}&step=${step}&tour=1`;

export const TOURS: Record<TourId, TourStep[]> = {
  main: [
    { route: '/', target: 'dashboard', title: 'tour.dashboardTitle', body: 'tour.dashboardBody' },
    { target: 'nav', title: 'tour.navTitle', body: 'tour.navBody' },
    { target: 'nav-log', title: 'tour.logTitle', body: 'tour.logBody' },
    { target: 'nav-weather', title: 'tour.weatherTitle', body: 'tour.weatherBody' },
    { target: 'nav-report', title: 'tour.reportTitle', body: 'tour.reportBody' },
    { target: 'assistant-btn', title: 'tour.assistantTitle', body: 'tour.assistantBody' },
    { target: 'nav-help', title: 'tour.helpTitle', body: 'tour.helpBody' },
  ],
  demo: [
    { route: demoReport('setup'), title: 'demoTour.introTitle', body: 'demoTour.introBody' },
    { route: demoReport('setup'), target: 'report-parcel', title: 'demoTour.parcelTitle', body: 'demoTour.parcelBody' },
    { route: demoReport('setup'), target: 'report-period', title: 'demoTour.periodTitle', body: 'demoTour.periodBody' },
    { route: demoReport('evidence'), target: 'weather-timeline', title: 'demoTour.weatherTitle', body: 'demoTour.weatherBody' },
    { route: demoReport('evidence'), target: 'report-evidence', title: 'demoTour.evidenceTitle', body: 'demoTour.evidenceBody' },
    { route: demoReport('review'), target: 'report-doc', title: 'demoTour.reportTitle', body: 'demoTour.reportBody' },
    { route: demoReport('review'), target: 'report-pdf', title: 'demoTour.pdfTitle', body: 'demoTour.pdfBody' },
  ],
};

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)];
  return all.find((el) => el.getClientRects().length > 0) ?? null;
}

export function Tour({ id }: { id: TourId }) {
  const { t, updateSettings } = useApp();
  const { endTour, setSidebarOpen } = useUI();
  const toast = useToast();
  const navigate = useNavigate();
  const steps = TOURS[id];
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const step = steps[i];

  const finish = useCallback(
    (completed: boolean) => {
      endTour();
      setSidebarOpen(false);
      if (id === 'main') void updateSettings({ tourDone: true });
      if (completed) toast(t(id === 'main' ? 'tour.doneToast' : 'demoTour.doneToast'));
    },
    [endTour, id, setSidebarOpen, t, toast, updateSettings],
  );

  // Navigate if needed, then wait for the target to render and measure it.
  useEffect(() => {
    let cancelled = false;
    if (step.route && window.location.pathname + window.location.search !== step.route) navigate(step.route);
    // On small screens nav targets live in the off-canvas sidebar.
    const inNav = step.target?.startsWith('nav');
    setSidebarOpen(!!inNav && window.matchMedia('(max-width: 900px)').matches);
    setRect(null);
    const started = performance.now();
    const poll = () => {
      if (cancelled) return;
      const el = findTarget(step.target);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        setTimeout(() => {
          if (cancelled) return;
          setRect(el.getBoundingClientRect());
          popRef.current?.querySelector<HTMLElement>('[data-primary]')?.focus();
        }, 320);
      } else if (step.target && performance.now() - started < 20000) {
        // Targets may appear late (e.g. the weather chart waits for the API).
        setTimeout(poll, 150);
      }
    };
    setTimeout(() => {
      popRef.current?.querySelector<HTMLElement>('[data-primary]')?.focus();
      poll();
    }, 60);
    return () => {
      cancelled = true;
    };
  }, [i, step, navigate, setSidebarOpen]);

  useEffect(() => {
    const onResize = () => {
      const el = findTarget(step.target);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    popRef.current?.querySelector<HTMLElement>('[data-primary]')?.focus();
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
      else if (e.key === 'Tab') trapFocus(e, popRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish, steps.length]);

  const pad = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const popW = Math.min(360, vw - 32);
  let pos: React.CSSProperties = { left: (vw - popW) / 2, top: Math.max(16, vh / 2 - 120) };
  if (rect) {
    const below = rect.bottom + 12;
    const fitsBelow = below + 230 < vh;
    const fitsRight = rect.right + 16 + popW < vw && rect.width < vw / 2;
    if (fitsRight && rect.height > 200) pos = { left: rect.right + 16, top: Math.min(Math.max(16, rect.top), vh - 260) };
    else if (fitsBelow) pos = { left: Math.min(Math.max(16, rect.left), vw - popW - 16), top: below };
    else pos = { left: Math.min(Math.max(16, rect.left), vw - popW - 16), top: Math.max(16, rect.top - 250) };
  }

  const last = i === steps.length - 1;
  return (
    <>
      <div className="tour-shade" aria-hidden="true" style={{ background: rect ? 'transparent' : 'rgba(15,22,17,.55)' }} />
      {rect && <div className="tour-hole" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      <div className="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" ref={popRef} style={{ ...pos, width: popW }}>
        <div className="eyebrow">
          {t(id === 'main' ? 'tour.label' : 'demoTour.label')} · {t('tour.progress', { n: i + 1, total: steps.length })}
        </div>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, k) => (
            <span key={k} className={k <= i ? 'on' : ''} />
          ))}
        </div>
        <h2 id="tour-title">{t(step.title)}</h2>
        <p id="tour-body">{t(step.body)}</p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => finish(false)}>
            {t('actions.skip')}
          </button>
          <div className="row">
            {i > 0 && (
              <button className="btn btn-sm" onClick={() => setI(i - 1)}>
                {t('actions.back')}
              </button>
            )}
            <button className="btn btn-primary btn-sm" data-primary onClick={() => (last ? finish(true) : setI(i + 1))}>
              {last ? t('actions.finish') : t('actions.next')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
