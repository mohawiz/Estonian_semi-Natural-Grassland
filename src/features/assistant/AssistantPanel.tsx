import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useUI } from '../../app/ui';
import { Icon } from '../../components/Icon';
import { BrandMark } from '../../components/motion';
import { formatDate } from '../../lib/dates';
import { assistant } from '../../services';
import type { AssistantAnswer, ChatTurn, Citation, SuggestionAction } from '../../services/assistant';

interface Msg {
  id: number;
  role: 'user' | 'bot';
  text: string;
  answer?: AssistantAnswer;
  streaming?: boolean;
}

const ROUTES: Record<SuggestionAction, { to: string; key: string; icon: string }> = {
  report: { to: '/report', key: 'assistant.suggestReport', icon: 'report' },
  photos: { to: '/log/new', key: 'assistant.suggestPhotos', icon: 'camera' },
  deadlines: { to: '/deadlines', key: 'assistant.suggestDeadlines', icon: 'deadlines' },
  library: { to: '/rules', key: 'assistant.suggestLibrary', icon: 'book' },
  weather: { to: '/weather', key: 'assistant.suggestWeather', icon: 'rain' },
};

export function AssistantPanel() {
  const { t, lang, completeTask } = useApp();
  const ui = useUI();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  const { assistantOpen, setAssistantOpen, tour } = ui;
  useEffect(() => {
    if (!assistantOpen) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !tour && setAssistantOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [assistantOpen, setAssistantOpen, tour]);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const q = ui.pendingQuestion;
    if (q) {
      ui.takePendingQuestion();
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.pendingQuestion]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    completeTask('askAssistant');
    const botId = nextId.current + 1;
    setMsgs((m) => [...m, { id: nextId.current, role: 'user', text: q }, { id: botId, role: 'bot', text: '', streaming: true }]);
    nextId.current += 2;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const history: ChatTurn[] = msgs
      .filter((m) => m.text && !m.streaming)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));
    try {
      for await (const ev of assistant.ask(q, lang, ctrl.signal, history)) {
        if (ev.type === 'token') setMsgs((m) => m.map((x) => (x.id === botId ? { ...x, text: x.text + ev.text } : x)));
        else setMsgs((m) => m.map((x) => (x.id === botId ? { ...x, text: ev.answer.text, answer: ev.answer, streaming: false } : x)));
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsgs((m) => m.map((x) => (x.id === botId ? { ...x, text: t('errors.generic'), streaming: false } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside id="assistant-panel" className="assistant glass" hidden={!assistantOpen} aria-label={t('assistant.title')} data-tour="assistant">
      <div className="assistant-head">
        <BrandMark size={34} />
        <h2>{t('assistant.title')}</h2>
        {msgs.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setMsgs([])}>
            {t('assistant.clear')}
          </button>
        )}
        <button className="btn btn-ghost icon-btn" aria-label={t('assistant.close')} onClick={() => ui.setAssistantOpen(false)}>
          <Icon name="close" />
        </button>
      </div>

      <div className="assistant-log" ref={logRef} aria-live="polite" aria-busy={busy}>
        <div className="msg msg-bot">
          <span className="avatar">
            <Icon name="assistant" size={16} />
          </span>
          <div>
            <p className="msg-text" style={{ margin: 0 }}>
              {t('assistant.intro')}
            </p>
            {msgs.length === 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  {t('assistant.examples')}
                </div>
                <div className="stack" style={{ display: 'grid', gap: 6 }}>
                  {(['assistant.example1', 'assistant.example2', 'assistant.example3'] as const).map((k) => (
                    <button key={k} className="btn btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => send(t(k))}>
                      {t(k)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {msgs.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg msg-user">
              <span className="sr-only">{t('assistant.you')}: </span>
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`msg msg-bot ${m.answer?.kind === 'unknown' ? 'msg-unknown' : ''}`}>
              <span className="avatar">
                <Icon name="assistant" size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                {m.streaming && !m.text ? (
                  <span className="muted small">
                    <span className="typing" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>{' '}
                    {t('assistant.thinking')}
                  </span>
                ) : (
                  <div className="msg-text">
                    {m.text}
                    {m.streaming && <span className="caret" aria-hidden="true" />}
                  </div>
                )}
                {m.answer?.kind === 'unknown' && <p className="muted small" style={{ marginTop: 6 }}>{t('assistant.unknownHint')}</p>}
                {m.answer && m.answer.citations.length > 0 && <Citations citations={m.answer.citations} />}
                {m.answer?.mode === 'ai' && m.answer.citations.length > 0 && <p className="muted small" style={{ marginTop: 6 }}>{t('assistant.aiCaveat')}</p>}
                {m.answer?.note && <p className="muted small" style={{ marginTop: 6 }}>{m.answer.note}</p>}
                {m.answer && m.answer.suggestions.length > 0 && (
                  <div className="suggest">
                    {m.answer.suggestions.map((s) => (
                      <button key={s} className="btn btn-sm" onClick={() => navigate(ROUTES[s].to)}>
                        <Icon name={ROUTES[s].icon} size={16} />
                        {t(ROUTES[s].key)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="row">
          <label htmlFor="assistant-input" className="sr-only">
            {t('assistant.placeholder')}
          </label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={1}
            value={input}
            placeholder={t('assistant.placeholder')}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <button className="btn btn-primary icon-btn" type="submit" aria-label={t('assistant.send')} disabled={busy || !input.trim()}>
            <Icon name="send" />
          </button>
        </div>
        <span className="muted small">{t('assistant.disclaimer')}</span>
      </form>
    </aside>
  );
}

function Citations({ citations }: { citations: Citation[] }) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState<number | null>(null);
  const current = citations.find((c) => c.n === open);
  return (
    <div style={{ marginTop: 10 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {t('assistant.sourcesLabel')}
      </div>
      <div className="row" style={{ gap: 6 }}>
        {citations.map((c) => (
          <button key={c.n} className="cite" aria-expanded={open === c.n} aria-label={t('assistant.citationOpen', { n: c.n })} onClick={() => setOpen(open === c.n ? null : c.n)}>
            <span className="cite-n">{c.n}</span>
            {c.document.publisher} · {c.passage.section}
          </button>
        ))}
      </div>
      {current && (
        <div className="cite-body">
          <strong>{current.document.title[lang]}</strong>
          <div className="muted small">
            {current.passage.section} · {current.document.version}
            {current.document.status !== 'verified-current' && (
              <>
                {' '}
                · <span className="badge badge-warn">{t(`rules.status.${current.document.status}`)}</span>
              </>
            )}
          </div>
          <blockquote lang={current.passage.lang}>{current.passage.text}</blockquote>
          <div className="row small">
            <a href={current.document.url} target="_blank" rel="noreferrer">
              {t('rules.openOriginal')} <Icon name="external" size={14} />
            </a>
            <span className="muted">{t('rules.retrieved', { date: formatDate(current.document.retrievedAt, lang) })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
