import { createPortal } from 'react-dom';
import { useApp } from '../../app/store';
import { useUI } from '../../app/ui';
import { MorphPath } from '../../components/motion';
import { RollingNumber } from '../../components/RollingNumber';
import { formatDate } from '../../lib/dates';
import { formatNumber } from '../../lib/units';
import { useMeadow } from '../meadow/conditions';
import type { DateWindow } from '../weather/WeatherTimeline';

const DROP = 'M20 4C26 13 31 19 31 25A11 11 0 0 1 9 25C9 19 14 13 20 4Z';
const SUN = (() => {
  // an 8-ray sun as one closed outline, so it can morph from the drop
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 9 : 15;
    pts.push(`${(20 + Math.cos(a) * r).toFixed(2)} ${(21 + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

/** A drop that morphs into a sun as the selected window turns from wet to dry. */
export function WetDryGlyph({ wet, size = 44 }: { wet: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <MorphPath d={wet ? DROP : SUN} fill={wet ? 'var(--seaglass)' : 'var(--hay)'} stroke="var(--peat)" strokeWidth="1.2" style={{ transition: 'fill .6s' }} />
    </svg>
  );
}

export function DashHero({ title, eyebrow, window }: { title: string; eyebrow: string; window: DateWindow | null }) {
  const { t, lang } = useApp();
  const { heroSlot } = useUI();
  const { conditions } = useMeadow();
  if (!heroSlot) return null;
  const wet = conditions.wetShare >= 0.35 || conditions.rainMm >= 2.5;
  return createPortal(
    <div className="dash-hero">
      <div className="hero-title">
        <div className="eyebrow">{eyebrow}</div>
        <p className="hero-h">{title}</p>
      </div>
      <div className="readout glass tilt" role="group" aria-label={t('dash.meadowReadout')}>
        <WetDryGlyph wet={conditions.fromData && wet} />
        {conditions.fromData ? (
          <>
            <div>
              <div className="figure">
                <RollingNumber value={conditions.windKmh} format={(n) => `${Math.round(n)}`} />
                <span className="small"> km/h</span>
              </div>
              <div className="lbl">{t('weather.wind')}</div>
            </div>
            <div>
              <div className="figure">
                <RollingNumber value={conditions.humidity} format={(n) => `${Math.round(n)}`} />
                <span className="small"> %</span>
              </div>
              <div className="lbl">{t('weather.humidity')}</div>
            </div>
            <div>
              <div className="figure">
                <RollingNumber value={conditions.wetShare * 100} format={(n) => `${Math.round(n)}`} />
                <span className="small"> %</span>
              </div>
              <div className="lbl">{t('dash.wetDaysShare')}</div>
            </div>
            {window && (
              <div className="small" style={{ maxWidth: 150, lineHeight: 1.3 }}>
                {t('dash.meadowShows', { start: formatDate(window.start, lang, { day: 'numeric', month: 'short' }), end: formatDate(window.end, lang, { day: 'numeric', month: 'short' }) })}
              </div>
            )}
          </>
        ) : (
          <div className="small" style={{ maxWidth: 220 }}>
            {t('dash.meadowCalm')}
            <span className="sr-only">{formatNumber(0, lang)}</span>
          </div>
        )}
      </div>
    </div>,
    heroSlot,
  );
}
