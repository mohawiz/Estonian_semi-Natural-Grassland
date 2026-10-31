// The living meadow at the Estonian coast, drawn on one 2D canvas.
//   wind     → how far and how fast the grass sways
//   humidity → how thick the mist bands are
//   rain     → falling streaks, slanted by the wind
//   clock    → sky colour, sun or moon position
// Budget: ≤ 300 blades and ≤ 140 rain streaks on desktop, about half on phones,
// DPR capped, paused when the tab is hidden, one still frame when effects are off.
import { useEffect, useRef } from 'react';
import { useMeadow, type MeadowConditions } from './conditions';

interface Blade {
  x: number; // 0..1 of width
  base: number; // 0..1 of the grass depth band
  len: number;
  phase: number;
  hue: number; // 0 = hay, 1 = bog
  layer: number;
  flower: 0 | 1 | 2; // 0 none, 1 yarrow, 2 hay seed head
}

const isSmall = () => window.innerWidth < 760;

function makeBlades(n: number): Blade[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: n }, () => {
    const layer = rnd() < 0.45 ? 0 : rnd() < 0.6 ? 1 : 2;
    const f = rnd();
    return {
      x: rnd(),
      base: rnd(),
      len: 0.6 + rnd() * 0.7,
      phase: rnd() * Math.PI * 2,
      hue: rnd(),
      layer,
      flower: (f < 0.05 ? 1 : f < 0.11 ? 2 : 0) as Blade['flower'],
    };
  }).sort((a, b) => a.layer - b.layer || a.base - b.base);
}

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}
const rgb = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Sky stops through the day; dark theme pulls toward night. */
function skyAt(hour: number, dark: boolean) {
  const night = [[12, 22, 26], [30, 46, 46]];
  const dawn = [[94, 120, 132], [226, 196, 150]];
  const day = [[124, 170, 168], [214, 228, 220]];
  const dusk = [[70, 92, 104], [222, 160, 92]];
  const pick = hour < 5 || hour >= 22 ? night : hour < 8 ? dawn : hour < 17 ? day : hour < 21 ? dusk : night;
  const k = dark ? 0.62 : 0;
  return pick.map((c, i) => mix(c, night[i], k));
}

export function MeadowCanvas() {
  const { conditions, reduced } = useMeadow();
  const ref = useRef<HTMLCanvasElement>(null);
  const cond = useRef<MeadowConditions>(conditions);
  const live = useRef({ wind: conditions.windKmh, mist: 0, rain: 0 });
  const pointer = useRef<{ x: number; y: number } | null>(null);

  cond.current = conditions;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let w = 0;
    let h = 0;
    let blades: Blade[] = [];
    let drops: { x: number; y: number; v: number; l: number }[] = [];
    let raf = 0;
    let running = false;
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => {
      const t = document.documentElement.getAttribute('data-theme');
      return t === 'dark' || (t !== 'light' && darkMq.matches);
    };

    const resize = () => {
      // Soft grass doesn't need full resolution; phones render at 0.75× and upscale.
      const dpr = isSmall() ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.25);
      w = window.innerWidth;
      h = Math.max(window.innerHeight, 480);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      blades = makeBlades(isSmall() ? 150 : 300);
      const nDrops = isSmall() ? 70 : 140;
      drops = Array.from({ length: nDrops }, () => ({ x: Math.random() * w, y: Math.random() * h, v: 0.7 + Math.random() * 0.6, l: 10 + Math.random() * 12 }));
    };

    /** Where the meadow can be seen: above the opaque sheet, and in the gutter beside it. */
    const visible = () => {
      const sheet = document.querySelector('.sheet');
      if (!sheet) return { top: h, gutter: w };
      const r = sheet.getBoundingClientRect();
      return { top: Math.max(0, Math.min(h, r.top + 16)), gutter: Math.max(0, r.left) };
    };

    const draw = (time: number) => {
      const t = time / 1000;
      const c = cond.current;
      const L = live.current;
      const vis = visible();
      // nothing to paint when the sheet covers everything (scrolled down on a phone)
      if (vis.top <= 0 && vis.gutter < 4) return;
      ctx.save();
      const clip = new Path2D();
      clip.rect(0, 0, w, vis.top);
      if (vis.gutter >= 4) clip.rect(0, 0, vis.gutter, h);
      ctx.clip(clip);
      // ease toward the target so changes in the brushed window glide in
      const ease = reduced ? 1 : 0.03;
      L.wind += (c.windKmh - L.wind) * ease;
      const mistTarget = Math.max(0, Math.min(1, (c.humidity - 60) / 35));
      L.mist += (mistTarget - L.mist) * ease;
      const rainTarget = c.wetShare >= 0.35 || c.rainMm >= 2.5 ? Math.min(1, 0.35 + c.rainMm / 6) : 0;
      L.rain += (rainTarget - L.rain) * ease;

      const dark = isDark();
      const hour = new Date().getHours() + new Date().getMinutes() / 60;
      const [skyTop, skyLow] = skyAt(hour, dark);
      // sits just under the floating top bar so the sea shows in every page window
      const horizon = isSmall() ? 100 : 132;

      // sky (rain greys it)
      const g = ctx.createLinearGradient(0, 0, 0, horizon);
      const grey = [120, 132, 132];
      g.addColorStop(0, rgb(mix(skyTop, grey, L.rain * 0.55)));
      g.addColorStop(1, rgb(mix(skyLow, grey, L.rain * 0.45)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, horizon + 2);

      // sun or moon on an arc across the day
      const dayFrac = Math.min(1, Math.max(0, (hour - 5) / 17));
      const sx = w * (0.12 + dayFrac * 0.76);
      const sy = horizon - Math.sin(dayFrac * Math.PI) * horizon * 0.62;
      const isNight = hour < 5 || hour >= 22 || dark;
      ctx.fillStyle = isNight ? 'rgba(238,241,236,0.85)' : `rgba(255,236,190,${0.9 - L.rain * 0.6})`;
      ctx.beginPath();
      ctx.arc(isNight ? w * 0.78 : sx, isNight ? horizon * 0.42 : sy, isNight ? 11 : 18, 0, Math.PI * 2);
      ctx.fill();

      // the sea: a sea-glass strip with shimmer
      const seaH = 12;
      ctx.fillStyle = dark ? '#1f3f3c' : '#5e9c94';
      ctx.fillRect(0, horizon - seaH, w, seaH);
      ctx.strokeStyle = dark ? 'rgba(200,230,225,0.18)' : 'rgba(238,241,236,0.55)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const yy = horizon - seaH + 3 + (i % 3) * 3;
        const off = ((t * (8 + L.wind * 0.6) + i * 140) % (w + 200)) - 100;
        ctx.beginPath();
        ctx.moveTo(off, yy);
        ctx.lineTo(off + 40 + i * 6, yy);
        ctx.stroke();
      }

      // far shore: junipers and birches as peat-dark silhouettes
      ctx.fillStyle = dark ? '#0f1d16' : '#2b4a39';
      ctx.beginPath();
      ctx.moveTo(0, horizon + 4);
      for (let x = 0; x <= w + 20; x += 20) {
        const bump = Math.sin(x * 0.013) * 5 + Math.sin(x * 0.051 + 1) * 3 + (Math.sin(x * 0.21) > 0.86 ? -14 : 0);
        ctx.lineTo(x, horizon - 2 + bump * 0.6);
      }
      ctx.lineTo(w, horizon + 6);
      ctx.closePath();
      ctx.fill();

      // meadow ground
      const gg = ctx.createLinearGradient(0, horizon, 0, h);
      gg.addColorStop(0, dark ? '#1a3024' : '#5d8452');
      gg.addColorStop(0.35, dark ? '#132219' : '#3b6343');
      gg.addColorStop(1, dark ? '#0b140f' : '#1e3a2c');
      ctx.fillStyle = gg;
      ctx.fillRect(0, horizon, w, h - horizon);

      // grass blades
      const windN = Math.min(1, L.wind / 45); // 45 km/h max gusts = strong
      const speed = 0.8 + windN * 2.4;
      const amp = 0.05 + windN * 0.35;
      const lean = windN * 0.32;
      const p = pointer.current;
      const band = h - horizon;
      // Batch blades into 3 layers × 4 hues = 12 strokes per frame (not one per blade).
      const buckets: Path2D[] = Array.from({ length: 12 }, () => new Path2D());
      const yarrow = new Path2D();
      const seeds = new Path2D();
      for (const b of blades) {
        const depth = (b.layer + b.base) / 3; // 0 far .. 1 near
        const baseY = horizon + 6 + Math.pow(depth, 1.6) * band;
        const x = b.x * w;
        const len = (10 + depth * 70) * b.len;
        if (baseY - len > vis.top && x > vis.gutter + 30) continue; // hidden under the sheet
        let ang = lean + Math.sin(t * speed + b.phase + x * 0.004) * amp * (0.6 + depth * 0.6);
        if (p) {
          const dx = x - p.x;
          const dy = baseY - len - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 110) ang += (dx > 0 ? 1 : -1) * (1 - dist / 110) * 0.5;
        }
        const tipX = x + Math.sin(ang) * len;
        const tipY = baseY - Math.cos(ang) * len;
        const path = buckets[b.layer * 4 + Math.min(3, Math.floor(b.hue * 4))];
        path.moveTo(x, baseY);
        path.quadraticCurveTo(x + Math.sin(ang * 0.5) * len * 0.5, baseY - len * 0.55, tipX, tipY);
        if (b.flower && depth > 0.3) {
          if (b.flower === 1) {
            // yarrow: a small birch-white umbel
            for (let k = 0; k < 4; k++) {
              const cx = tipX + (k - 1.5) * 2.2;
              const cy = tipY + (k % 2) * 1.6;
              yarrow.moveTo(cx + 1.5 + depth, cy);
              yarrow.arc(cx, cy, 1.5 + depth, 0, Math.PI * 2);
            }
          } else {
            // hay seed head
            seeds.moveTo(tipX + 1.4 + depth, tipY);
            seeds.ellipse(tipX, tipY, 1.4 + depth, 3.5 + depth * 2, ang, 0, Math.PI * 2);
          }
        }
      }
      buckets.forEach((path, i) => {
        const layer = Math.floor(i / 4);
        const hue = ((i % 4) + 0.5) / 4;
        const depth = (layer + 0.5) / 3;
        const col = dark ? mix([70, 96, 64], [24, 52, 38], hue) : mix([206, 170, 86], [52, 98, 62], hue * 0.85);
        ctx.strokeStyle = rgb(mix(col, dark ? [10, 18, 14] : [188, 204, 190], (1 - depth) * 0.45));
        ctx.lineWidth = 0.7 + depth * 1.9;
        ctx.stroke(path);
      });
      ctx.fillStyle = dark ? 'rgba(220,226,218,0.55)' : 'rgba(246,248,244,0.95)';
      ctx.fill(yarrow);
      ctx.fillStyle = dark ? 'rgba(231,189,98,0.55)' : 'rgba(212,160,58,0.95)';
      ctx.fill(seeds);

      // mist: soft drifting bands near the horizon
      if (L.mist > 0.02) {
        for (let i = 0; i < 3; i++) {
          const yy = horizon - 10 + i * 34;
          const off = Math.sin(t * 0.07 + i) * 60;
          const mg = ctx.createLinearGradient(0, yy - 30, 0, yy + 40);
          const a = L.mist * (0.42 - i * 0.1);
          const mc = dark ? '190,205,200' : '238,241,236';
          mg.addColorStop(0, `rgba(${mc},0)`);
          mg.addColorStop(0.5, `rgba(${mc},${a})`);
          mg.addColorStop(1, `rgba(${mc},0)`);
          ctx.fillStyle = mg;
          ctx.fillRect(-80 + off, yy - 30, w + 160, 70);
        }
      }

      // rain
      if (L.rain > 0.03) {
        const n = Math.floor(drops.length * L.rain);
        const slant = 0.15 + windN * 0.7;
        ctx.strokeStyle = dark ? 'rgba(170,210,205,0.35)' : 'rgba(234,242,240,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const d = drops[i];
          if (!reduced) {
            d.y += d.v * 14;
            d.x += d.v * 14 * slant;
            if (d.y > h) {
              d.y = -20;
              d.x = Math.random() * (w + 200) - 200;
            }
          }
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.l * slant, d.y - d.l);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    // Phones draw at ~30 fps to leave headroom for the UI.
    const minFrame = isSmall() ? 32 : 0;
    let last = 0;
    const loop = (time: number) => {
      if (time - last >= minFrame) {
        last = time;
        draw(time);
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const still = () => {
      if (w) draw(performance.now());
    };
    // Nothing is drawn until the page has settled; then the meadow fades in and starts moving.
    let idle = 0;
    const wake = () => {
      resize();
      still();
      canvas.classList.add('awake');
      start();
    };
    const startWhenIdle = () => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(wake, { timeout: 2500 });
      else idle = window.setTimeout(wake, 1200);
    };
    if (canvas.classList.contains('awake')) wake();
    else if (document.readyState === 'complete') startWhenIdle();
    else window.addEventListener('load', startWhenIdle, { once: true });

    const onResize = () => {
      resize();
      still();
    };
    const onVis = () => (document.hidden ? stop() : (start(), still()));
    const onMove = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    const onLeave = () => (pointer.current = null);
    // theme changes need a redraw in the still mode
    const mo = new MutationObserver(still);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    if (!reduced) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave);
    }
    darkMq.addEventListener('change', still);
    // in still mode, repaint when the data changes (the effect re-runs on `conditions`)
    return () => {
      stop();
      window.removeEventListener('load', startWhenIdle);
      (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idle);
      clearTimeout(idle);
      mo.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      darkMq.removeEventListener('change', still);
    };
  }, [reduced, reduced ? conditions : null]);

  return <canvas ref={ref} className="meadow-canvas" aria-hidden="true" />;
}
