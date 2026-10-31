// The first proof report deserves a moment: a burst of hay seeds and yarrow
// petals over the meadow, then a short note. With effects off it is just the note.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import { useMeadow } from '../meadow/conditions';

export function Celebration() {
  const { t, settings } = useApp();
  const { reduced } = useMeadow();
  const [show, setShow] = useState(false);
  const prev = useRef(settings.onboarding.buildReport);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!prev.current && settings.onboarding.buildReport) {
      setShow(true);
      setTimeout(() => setShow(false), 4200);
    }
    prev.current = settings.onboarding.buildReport;
  }, [settings.onboarding.buildReport]);

  useEffect(() => {
    if (!show || reduced || !canvas.current) return;
    const c = canvas.current;
    const ctx = c.getContext('2d')!;
    const w = (c.width = window.innerWidth);
    const h = (c.height = window.innerHeight);
    const colors = ['#d4a03a', '#eef1ec', '#5e9c94', '#d4a03a', '#b3313d'];
    const n = window.innerWidth < 760 ? 70 : 140;
    const parts = Array.from({ length: n }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const v = 6 + Math.random() * 9;
      return { x: w / 2, y: h * 0.72, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 3, rot: Math.random() * 6, c: colors[(Math.random() * colors.length) | 0], seed: Math.random() < 0.6 };
    });
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.22;
        p.vx *= 0.99;
        p.x += p.vx + Math.sin((now - start) / 300 + p.rot) * 0.6;
        p.y += p.vy;
        p.rot += 0.08;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        if (p.seed) ctx.ellipse(0, 0, p.r * 0.6, p.r * 1.6, 0, 0, Math.PI * 2);
        else ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (now - start < 3400) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show, reduced]);

  return (
    <AnimatePresence>
      {show && (
        <>
          {!reduced && <canvas ref={canvas} className="celebrate" aria-hidden="true" />}
          <motion.div
            role="status"
            className="glass"
            style={{ position: 'fixed', zIndex: 141, left: '50%', top: '18%', x: '-50%', borderRadius: '28px 28px 28px 8px', padding: '18px 22px', display: 'flex', gap: 14, alignItems: 'center', maxWidth: 'calc(100vw - 32px)', background: 'var(--glass-strong)' }}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          >
            <span style={{ color: 'var(--hay)' }}>
              <Icon name="report" size={36} />
            </span>
            <span>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', display: 'block' }}>{t('celebrate.title')}</strong>
              <span className="small muted">{t('celebrate.body')}</span>
            </span>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
