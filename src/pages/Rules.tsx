import { useMemo, useState } from 'react';
import { useApp } from '../app/store';
import { useUI } from '../app/ui';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';
import { formatDate } from '../lib/dates';
import { retrieval } from '../services';
import { library, type DocStatus, type LibraryDocument, type Passage } from '../services/library';

const statusBadge: Record<DocStatus, string> = { 'verified-current': 'badge-ok', 'older-version': 'badge-warn', unverified: 'badge-warn' };

export function RulesPage() {
  const { t, lang } = useApp();
  const ui = useUI();
  const [q, setQ] = useState('');
  const hits = useMemo(() => (q.trim().length > 1 ? retrieval.searchSync(q, 12) : null), [q]);

  return (
    <>
      <PageHeader
        title={t('rules.title')}
        subtitle={t('rules.subtitle')}
        actions={
          <button className="btn" onClick={() => ui.setAssistantOpen(true)}>
            <Icon name="assistant" />
            {t('assistant.open')}
          </button>
        }
      />
      <div className="field" style={{ marginBottom: 16, maxWidth: 560 }}>
        <label htmlFor="rules-q">{t('rules.search')}</label>
        <input id="rules-q" type="search" value={q} placeholder={t('rules.searchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
        {hits && (
          <span className="hint" role="status">
            {hits.length ? t('rules.results', { n: hits.length }) : t('rules.noResults')}
          </span>
        )}
      </div>

      {hits ? (
        <section className="panel">
          {hits.map((h) => (
            <PassageView key={h.passage.id} passage={h.passage} doc={library.documents.find((d) => d.id === h.passage.docId)!} showDoc />
          ))}
        </section>
      ) : (
        <div className="stack">
          {library.documents.map((d) => (
            <details key={d.id} className="panel doc-card">
              <summary>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem' }}>{d.title[lang]}</span>{' '}
                <span className={`badge ${statusBadge[d.status]}`}>{t(`rules.status.${d.status}`)}</span>
                <div className="muted small" style={{ fontWeight: 400, marginTop: 4 }}>
                  {d.publisher} · {t('rules.version', { v: d.version })} · {t('rules.retrieved', { date: formatDate(d.retrievedAt, lang) })} · {t('rules.passages', { n: d.passages.length })}
                </div>
              </summary>
              <p className="small" style={{ marginTop: 10 }}>
                {d.statusNote[lang]}{' '}
                <a href={d.url} target="_blank" rel="noreferrer">
                  {t('rules.openOriginal')} <Icon name="external" size={14} />
                </a>
              </p>
              {d.passages.map((p) => (
                <PassageView key={p.id} passage={p} doc={d} />
              ))}
            </details>
          ))}
          {library.unverified.length > 0 && (
            <section className="panel">
              <h2>{t('rules.unverifiedTitle')}</h2>
              <ul className="ledger">
                {library.unverified.map((u) => (
                  <li key={u.topic} style={{ display: 'block' }}>
                    <span className="badge badge-warn">{t('labels.unverified')}</span> <strong lang="et">{u.topic}</strong>
                    <p className="small" lang="et" style={{ margin: '4px 0' }}>
                      {u.finding}
                    </p>
                    <div className="small">
                      {u.sources.map((s) => (
                        <a key={s} href={s} target="_blank" rel="noreferrer" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                          {s}
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function PassageView({ passage, doc, showDoc }: { passage: Passage; doc: LibraryDocument; showDoc?: boolean }) {
  const { t, lang } = useApp();
  return (
    <div className="passage">
      <div className="row" style={{ gap: 8 }}>
        <strong>{passage.section}</strong>
        {showDoc && <span className="muted small">{doc.title[lang]}</span>}
        {showDoc && doc.status !== 'verified-current' && <span className="badge badge-warn">{t(`rules.status.${doc.status}`)}</span>}
      </div>
      <blockquote lang={passage.lang}>{passage.text}</blockquote>
      <p className="small" style={{ margin: 0 }}>
        <span className="eyebrow">{t('rules.summary')}: </span>
        {passage.summary[lang]}
      </p>
      {showDoc && (
        <a className="small" href={doc.url} target="_blank" rel="noreferrer">
          {t('rules.openOriginal')} <Icon name="external" size={14} />
        </a>
      )}
    </div>
  );
}
