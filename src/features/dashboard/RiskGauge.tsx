import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { RollingNumber } from '../../components/RollingNumber';
import type { RiskResult } from '../../services/risk';

const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const p = (a: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
};

export function RiskGauge({ risk }: { risk: RiskResult }) {
  const { t } = useApp();
  const cx = 110;
  const cy = 104;
  const r = 82;
  // start at zero, then swing to the score (CSS transition, origin in SVG units)
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(risk.score));
    return () => cancelAnimationFrame(id);
  }, [risk.score]);
  const color = risk.level === 'low' ? 'var(--ok)' : risk.level === 'medium' ? 'var(--hay)' : 'var(--lingon)';
  return (
    <div>
      <svg viewBox="0 0 220 124" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }} role="img" aria-label={`${t('dash.riskTitle')}: ${t(`dash.risk.${risk.level}`)} (${risk.score}/100)`}>
        <path d={arc(cx, cy, r, Math.PI, Math.PI * 1.25)} stroke="var(--ok)" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.85" />
        <path d={arc(cx, cy, r, Math.PI * 1.27, Math.PI * 1.53)} stroke="var(--hay)" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.85" />
        <path d={arc(cx, cy, r, Math.PI * 1.55, Math.PI * 2)} stroke="var(--lingon)" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.85" />
        <g style={{ transformBox: 'view-box', transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${shown * 1.8}deg)`, transition: 'transform 1.4s var(--spring)' }}>
          <path d={`M${cx + 4} ${cy - 2} L${cx - r + 18} ${cy} L${cx + 4} ${cy + 2} Z`} fill="var(--ink)" />
        </g>
        <circle cx={cx} cy={cy} r="8" fill="var(--ink)" />
        <circle cx={cx} cy={cy} r="3" fill={color} />
      </svg>
      <div style={{ textAlign: 'center', marginTop: -6 }}>
        <div className="num" style={{ fontSize: '2.2rem', lineHeight: 1, color }}>
          <RollingNumber value={risk.score} format={(n) => String(Math.round(n))} />
          <span className="small muted" style={{ fontFamily: 'var(--font-text)' }}>
            {' '}
            / 100
          </span>
        </div>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>{t(`dash.risk.${risk.level}`)}</strong>
      </div>
      <ul className="ledger small" style={{ marginTop: 10 }}>
        {risk.factors.map((f) => (
          <li key={f.key} style={{ padding: '7px 0' }}>
            <span style={{ color: 'var(--lingon-ink)', fontWeight: 700, minWidth: 34 }}>+{f.points}</span>
            <span className="grow">{t(`dash.riskFactor.${f.key}`, { n: f.count ?? 1 })}</span>
          </li>
        ))}
        {risk.helps.map((h) => (
          <li key={h} style={{ padding: '7px 0' }}>
            <span style={{ color: 'var(--ok)', fontWeight: 700, minWidth: 34 }}>✓</span>
            <span className="grow">{t(`dash.riskHelp.${h}`)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        {t('dash.riskNote')}
      </p>
    </div>
  );
}
