// Small motion building blocks: SVG path morphing (no extra library), rolling
// numbers, the morphing logo and the grass-growing loader.
import { useEffect, useRef, useState } from 'react';
import { useMeadow } from '../features/meadow/conditions';

type Pt = [number, number];

let probe: SVGPathElement | null = null;
/** Sample a path into n evenly spaced points (uses the browser's geometry engine). */
export function samplePath(d: string, n = 64): Pt[] {
  if (typeof document === 'undefined') return [];
  if (!probe) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.appendChild(probe);
    document.body.appendChild(svg);
  }
  probe.setAttribute('d', d);
  const len = probe.getTotalLength();
  return Array.from({ length: n }, (_, i) => {
    const p = probe!.getPointAtLength((i / n) * len);
    return [p.x, p.y];
  });
}

export function lerpPath(a: Pt[], b: Pt[], t: number): string {
  return (
    a
      .map(([x, y], i) => {
        const [bx, by] = b[i] ?? [x, y];
        return `${i ? 'L' : 'M'}${(x + (bx - x) * t).toFixed(2)} ${(y + (by - y) * t).toFixed(2)}`;
      })
      .join('') + 'Z'
  );
}

/** A closed path that morphs to `d` whenever `d` changes. */
export function MorphPath({ d, duration = 0.7, ...rest }: { d: string; duration?: number } & React.SVGProps<SVGPathElement>) {
  const { reduced } = useMeadow();
  const [shown, setShown] = useState(d);
  const from = useRef(d);
  useEffect(() => {
    if (from.current === d) return;
    if (reduced) {
      from.current = d;
      setShown(d);
      return;
    }
    const a = samplePath(from.current);
    const b = samplePath(d);
    from.current = d;
    // a tiny ease-out tween, so the logo can morph before any animation library loads
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / (duration * 1000));
      setShown(lerpPath(a, b, 1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setShown(d);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [d, duration, reduced]);
  return <path d={shown} {...rest} />;
}

const LOGO_FINAL = 'M20 37C11 33 6 25 7 15 15 13 23 16 27 24 27 15 30 8 36 4 38 15 35 27 26 34 24 36 22 37 20 37Z';
const LOGO_BLOB = 'M20 36C10.6 36 4 29.4 4 20S10.6 4 20 4 36 10.6 36 20 29.4 36 20 36Z';

/** The logo: a seed (blob) that morphs into two meadow leaves on load. */
export function BrandMark({ size = 40 }: { size?: number }) {
  const [d, setD] = useState(LOGO_BLOB);
  useEffect(() => {
    const id = setTimeout(() => setD(LOGO_FINAL), 350);
    return () => clearTimeout(id);
  }, []);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <MorphPath d={d} duration={1.1} fill="var(--primary)" />
      <path d="M20 37c0-7 1-13 5-19" stroke="var(--hay)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="31" cy="9" r="2.2" fill="var(--hay)" />
    </svg>
  );
}

/** Brand loading state: grass growing. */
export function GrassLoader({ label }: { label?: string }) {
  return (
    <div className="grass-loader" role="status" aria-live="polite">
      <svg width="88" height="56" viewBox="0 0 88 56" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path className="blade" d="M14 54 C14 40 12 30 8 20" />
        <path className="blade" d="M28 54 C28 36 30 22 34 10" />
        <path className="blade" d="M44 54 C44 34 42 18 44 4" />
        <path className="blade" d="M60 54 C60 38 62 26 68 16" />
        <path className="blade" d="M74 54 C74 44 76 36 80 30" />
        <path d="M4 54h80" stroke="var(--rule-strong)" />
      </svg>
      {label && <span className="small">{label}</span>}
    </div>
  );
}

/** Glass specular + gentle tilt: moves highlights toward the pointer on .glass/.tilt elements. */
export function useSpecular(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!last) return;
      const { clientX: x, clientY: y } = last;
      document.querySelectorAll<HTMLElement>('.glass, .tilt').forEach((el) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${x - r.left}px`);
        el.style.setProperty('--my', `${y - r.top}px`);
        if (el.classList.contains('tilt')) {
          const cx = (x - (r.left + r.width / 2)) / Math.max(r.width, 200);
          const cy = (y - (r.top + r.height / 2)) / Math.max(r.height, 200);
          const near = Math.abs(cx) < 1.4 && Math.abs(cy) < 1.4;
          el.style.transform = near ? `perspective(800px) rotateX(${(-cy * 4).toFixed(2)}deg) rotateY(${(cx * 5).toFixed(2)}deg)` : '';
        }
      });
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    // device tilt where the browser allows it without a prompt (Android Chrome)
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      document.querySelectorAll<HTMLElement>('.tilt').forEach((el) => {
        el.style.transform = `perspective(800px) rotateX(${Math.max(-4, Math.min(4, (e.beta! - 45) / 8)).toFixed(2)}deg) rotateY(${Math.max(-5, Math.min(5, e.gamma! / 6)).toFixed(2)}deg)`;
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onTilt);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);
}
