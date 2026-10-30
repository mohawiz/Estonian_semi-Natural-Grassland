// The assistant. AssistantService is the seam for a future LLM backend: a
// FastAPI RAG service can implement the same streaming contract. The local
// implementation is extractive — it only restates passages it retrieved, so it
// cannot make unsourced claims, and it says "I don't know" below a threshold.
import { translate } from '../i18n';
import type { Lang } from '../lib/types';
import { getDocument, type LibraryDocument, type Passage } from './library';
import { isConfident, type RetrievalHit, type RetrievalService } from './retrieval';

export interface Citation {
  n: number;
  passage: Passage;
  document: LibraryDocument;
}

export type SuggestionAction = 'report' | 'photos' | 'deadlines' | 'library' | 'weather';

export interface AssistantAnswer {
  kind: 'answer' | 'unknown';
  text: string;
  citations: Citation[];
  suggestions: SuggestionAction[];
}

export type AssistantEvent = { type: 'token'; text: string } | { type: 'done'; answer: AssistantAnswer };

export interface AssistantService {
  ask(question: string, lang: Lang, signal?: AbortSignal): AsyncGenerator<AssistantEvent>;
}

const INTENTS: [RegExp, SuggestionAction][] = [
  [/(weather|rain|wet|drought|flood|ilm|vihm|märg|marg|põud|poud|üleujut|vääramatu|vaaramatu|force|exceptional|erand)/i, 'report'],
  [/(photo|picture|evidence|record|foto|pilt|tõend|toend|päevik|paevik|arvestus)/i, 'photos'],
  [/(deadline|days|notify|notif|tähtaeg|tahtaeg|teavit|päeva|paeva)/i, 'deadlines'],
  [/(weather|rain|ilm|vihm|sade)/i, 'weather'],
];

export function suggestionsFor(question: string, kind: AssistantAnswer['kind']): SuggestionAction[] {
  const out = new Set<SuggestionAction>();
  for (const [re, action] of INTENTS) if (re.test(question)) out.add(action);
  if (kind === 'unknown') out.add('library');
  return [...out].slice(0, 3);
}

/** Pick the passages worth citing: confident ones, close to the best score. */
export function selectCitations(hits: RetrievalHit[], max = 3): RetrievalHit[] {
  if (!isConfident(hits[0])) return [];
  const top = hits[0].score;
  return hits.filter((h) => h.score >= top * 0.45 && h.coverage >= 0.34).slice(0, max);
}

export function composeAnswer(question: string, hits: RetrievalHit[], lang: Lang): AssistantAnswer {
  const chosen = selectCitations(hits);
  if (!chosen.length) {
    return { kind: 'unknown', text: translate(lang, 'assistant.unknown'), citations: [], suggestions: suggestionsFor(question, 'unknown') };
  }
  const citations: Citation[] = chosen.map((h, i) => ({ n: i + 1, passage: h.passage, document: getDocument(h.passage.docId)! }));
  const lines = citations.map((c) => {
    const flag =
      c.document.status === 'older-version'
        ? ` (${translate(lang, 'assistant.olderVersion')})`
        : c.document.status === 'unverified'
          ? ` (${translate(lang, 'assistant.unverified')})`
          : '';
    return `• ${c.passage.summary[lang]} [${c.n}]${flag}`;
  });
  const text = [translate(lang, 'assistant.answerIntro'), ...lines, '', translate(lang, 'assistant.caveat')].join('\n');
  return { kind: 'answer', text, citations, suggestions: suggestionsFor(question, 'answer') };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

export class LocalAssistant implements AssistantService {
  constructor(
    private retrieval: RetrievalService,
    private opts: { tokenDelayMs: number } = { tokenDelayMs: 14 },
  ) {}

  async *ask(question: string, lang: Lang, signal?: AbortSignal): AsyncGenerator<AssistantEvent> {
    const hits = await this.retrieval.search(question, lang, 6);
    const answer = composeAnswer(question, hits, lang);
    // Stream word by word for a conversational feel; reduced-motion users get a delay of 0.
    const words = answer.text.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 2) {
      if (this.opts.tokenDelayMs) await sleep(this.opts.tokenDelayMs, signal);
      yield { type: 'token', text: words.slice(i, i + 2).join('') };
    }
    yield { type: 'done', answer };
  }
}
