import { motion } from 'motion/react';
import { useApp } from '../app/store';
import { Icon, MeadowPlants } from '../components/Icon';
import { PageHeader } from '../components/ui';

const PALETTE = [
  { name: 'Bog green', et: 'Rabaroheline', hex: '#1E3A2C' },
  { name: 'Sea-glass teal', et: 'Mereklaasi türkiis', hex: '#5E9C94' },
  { name: 'Birch white', et: 'Kasevalge', hex: '#EEF1EC' },
  { name: 'Hay amber', et: 'Heinamerevaik', hex: '#D4A03A' },
  { name: 'Peat brown', et: 'Turbapruun', hex: '#3A2A1F' },
  { name: 'Lingonberry', et: 'Pohl', hex: '#B3313D' },
];

const STACK = [
  ['React 19 + TypeScript', 'about.stack.ui'],
  ['Vite 8', 'about.stack.build'],
  ['Motion (Framer Motion)', 'about.stack.motion'],
  ['Canvas 2D', 'about.stack.meadow'],
  ['IndexedDB (idb)', 'about.stack.storage'],
  ['Open-Meteo Historical API', 'about.stack.weather'],
  ['BM25 retrieval, in browser', 'about.stack.retrieval'],
  ['jsPDF + embedded fonts', 'about.stack.pdf'],
  ['Newsreader · Atkinson Hyperlegible Next', 'about.stack.type'],
  ['Vitest', 'about.stack.tests'],
] as const;

/** Animated architecture: what runs in the browser today, and where a backend plugs in. */
function Architecture() {
  const { t } = useApp();
  const node = (x: number, y: number, w: number, label: string, sub: string, kind = '') => (
    <g className={`node ${kind}`}>
      <rect x={x} y={y} width={w} height={50} rx={14} />
      <text x={x + 14} y={y + 22}>
        {label}
      </text>
      <text className="sub" x={x + 14} y={y + 39}>
        {sub}
      </text>
    </g>
  );
  return (
    <figure className="arch" style={{ margin: 0 }}>
      <svg viewBox="0 0 760 330" role="img" aria-label={t('about.archAlt')}>
        <rect x="6" y="6" width="500" height="318" rx="22" fill="none" stroke="var(--rule-strong)" />
        <text x="24" y="32" className="sub" style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {t('about.archBrowser')}
        </text>
        <path className="flow" d="M124 98 V132" />
        <path className="flow" d="M200 98 C200 115 255 115 255 132" />
        <path className="flow" d="M214 98 C300 110 418 110 418 132" />
        <path className="flow" d="M94 182 V216" />
        <path className="flow" d="M255 182 V216" />
        <path className="flow" d="M94 182 C150 200 380 196 418 216" />
        <path className="flow" d="M164 156 C350 120 450 150 560 156" />
        <path className="flow future" d="M490 157 C520 200 530 240 560 252" />
        {node(24, 48, 200, 'UI · React', t('about.archUi'))}
        {node(24, 132, 140, 'WeatherService', 'Open-Meteo', 'local')}
        {node(180, 132, 150, 'RetrievalService', 'BM25 · 47 passages', 'local')}
        {node(346, 132, 144, 'AssistantService', t('about.archExtractive'), 'local')}
        {node(24, 216, 140, 'buildReport()', t('about.archPure'), 'local')}
        {node(180, 216, 150, 'IndexedDB', t('about.archLocal'), 'local')}
        {node(346, 216, 144, 'Living meadow', 'Canvas 2D', 'local')}
        {node(560, 132, 186, 'Open-Meteo API', t('about.archOpenMeteo'))}
        {node(560, 228, 186, 'FastAPI · RAG', t('about.archFuture'), 'future')}
      </svg>
      <figcaption className="small muted">{t('about.archCaption')}</figcaption>
    </figure>
  );
}

export function AboutPage() {
  const { t, lang } = useApp();
  const rise = (i: number) => ({ initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' }, transition: { delay: i * 0.06, duration: 0.6 } });
  return (
    <>
      <PageHeader title={t('about.title')} subtitle={t('about.subtitle')} />
      <div className="dash-grid">
        <motion.section className="panel leaf span-7" {...rise(0)}>
          <div className="eyebrow">{t('about.authorLabel')}</div>
          <h2 style={{ fontSize: '2rem', margin: '6px 0 4px' }}>Mohawiz Hamid</h2>
          <p className="muted">{t('about.authorRole')}</p>
          <div className="row">
            <a className="btn" href="https://github.com/mohawiz" target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={18} />
              github.com/mohawiz
            </a>
            <a className="btn" href="https://mohawiz.github.io/MyPortFolio" target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={18} />
              mohawiz.github.io/MyPortFolio
            </a>
          </div>
          <h3 style={{ marginTop: 24 }}>{t('about.teamTitle')}</h3>
          <ul className="ledger">
            {['Valmar', 'Jay', 'Glenn'].map((n) => (
              <li key={n}>
                <span className="grow">
                  <strong>{n}</strong> <span className="muted small">— {t('about.rolePlaceholder')}</span>
                </span>
                <span className="badge badge-neutral">{t('about.placeholder')}</span>
              </li>
            ))}
          </ul>
          <p className="small muted">{t('about.course')}</p>
        </motion.section>

        <motion.section className="panel tinted span-5" {...rise(1)}>
          <h2>{t('about.whyTitle')}</h2>
          <p>{t('about.why1')}</p>
          <p>{t('about.why2')}</p>
          <MeadowPlants width={200} />
        </motion.section>

        <motion.section className="panel span-12" {...rise(2)}>
          <div className="panel-title">
            <h2>{t('about.archTitle')}</h2>
          </div>
          <Architecture />
        </motion.section>

        <motion.section className="panel span-7" {...rise(3)}>
          <h2>{t('about.designTitle')}</h2>
          <p>{t('about.design1')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, margin: '14px 0' }}>
            {PALETTE.map((c, i) => (
              <div key={c.hex} style={{ borderRadius: i % 2 ? '14px 4px 14px 4px' : '4px 14px 4px 14px', overflow: 'hidden', border: '1px solid var(--rule)' }}>
                <div style={{ background: c.hex, height: 56 }} />
                <div style={{ padding: '8px 10px', background: 'var(--surface)' }}>
                  <strong className="small">{lang === 'et' ? c.et : c.name}</strong>
                  <div className="small muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {c.hex}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', lineHeight: 1.1, margin: '18px 0 4px' }}>Pärandniit · 120,4 mm</p>
          <p className="small muted">Newsreader — {t('about.typeDisplay')}</p>
          <p style={{ fontSize: '1.1rem', margin: '12px 0 4px' }}>Õõtsuv rohi, märg juuli, kuupäevaga fotod.</p>
          <p className="small muted">Atkinson Hyperlegible Next — {t('about.typeText')}</p>
          <p>{t('about.design2')}</p>
        </motion.section>

        <motion.section className="panel span-5" {...rise(4)}>
          <h2>{t('about.stackTitle')}</h2>
          <ul className="ledger small">
            {STACK.map(([name, key]) => (
              <li key={name}>
                <span className="grow">
                  <strong>{name}</strong>
                  <br />
                  <span className="muted">{t(key)}</span>
                </span>
              </li>
            ))}
          </ul>
        </motion.section>

        <motion.section className="panel flat span-12" {...rise(5)}>
          <h2>{t('about.honestyTitle')}</h2>
          <p>{t('about.honesty')}</p>
        </motion.section>
      </div>
    </>
  );
}
