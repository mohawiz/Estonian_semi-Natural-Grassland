// The AI assistant: streams answers from the RAG backend (backend/, FastAPI + pgvector
// + Groq) over Server-Sent Events. Citations arrive as passage ids and are resolved
// against the same bundled library, so the chips show the verbatim official text.
// If the backend is unreachable, busy or not configured, it falls back to the local
// keyword assistant and says so.
import { translate } from '../i18n';
import type { Lang } from '../lib/types';
import { suggestionsFor, type AssistantAnswer, type AssistantEvent, type AssistantService, type ChatTurn, type Citation } from './assistant';
import { getDocument } from './library';

interface DoneData {
  kind: 'answer' | 'unknown';
  text: string;
  citations: { n: number; passageId: string; docId: string }[];
}

export function resolveCitations(raw: DoneData['citations']): Citation[] {
  const out: Citation[] = [];
  for (const c of raw) {
    const document = getDocument(c.docId);
    const passage = document?.passages.find((p) => p.id === c.passageId);
    if (document && passage) out.push({ n: c.n, passage, document });
  }
  return out;
}

/** Split an SSE byte stream into {event, data} records. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    // normalise after joining, so a \r\n split across two chunks is still caught
    buf = (buf + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
    let cut: number;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
    if (done) return;
  }
}

export class HttpAssistant implements AssistantService {
  constructor(
    private baseUrl: string,
    private fallback: AssistantService,
  ) {}

  private async *fallBack(question: string, lang: Lang, signal: AbortSignal | undefined, note: 'fallbackNote' | 'busyNote'): AsyncGenerator<AssistantEvent> {
    for await (const ev of this.fallback.ask(question, lang, signal)) {
      if (ev.type === 'done') yield { type: 'done', answer: { ...ev.answer, mode: 'search', note: translate(lang, `assistant.${note}`) } };
      else yield ev;
    }
  }

  async *ask(question: string, lang: Lang, signal?: AbortSignal, history: ChatTurn[] = []): AsyncGenerator<AssistantEvent> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, lang, history: history.slice(-6) }),
        signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      yield* this.fallBack(question, lang, signal, 'fallbackNote');
      return;
    }
    if (!res.ok || !res.body) {
      yield* this.fallBack(question, lang, signal, res.status === 429 ? 'busyNote' : 'fallbackNote');
      return;
    }

    let streamed = '';
    for await (const { event, data } of readSse(res.body)) {
      const payload = JSON.parse(data);
      if (event === 'token') {
        streamed += payload.text;
        yield { type: 'token', text: payload.text };
      } else if (event === 'error') {
        if (!streamed) {
          yield* this.fallBack(question, lang, signal, payload.code === 'rate_limited' ? 'busyNote' : 'fallbackNote');
          return;
        }
        const answer: AssistantAnswer = { kind: 'answer', text: `${streamed}\n\n${translate(lang, 'errors.generic')}`, citations: [], suggestions: [], mode: 'ai' };
        yield { type: 'done', answer };
        return;
      } else if (event === 'done') {
        const d = payload as DoneData;
        const kind = d.kind === 'unknown' ? 'unknown' : 'answer';
        const answer: AssistantAnswer = {
          kind,
          text: d.text || (kind === 'unknown' ? translate(lang, 'assistant.unknown') : streamed),
          citations: resolveCitations(d.citations ?? []),
          suggestions: suggestionsFor(question, kind),
          mode: 'ai',
        };
        yield { type: 'done', answer };
        return;
      }
    }
    // stream ended without a done event
    yield { type: 'done', answer: { kind: 'answer', text: streamed || translate(lang, 'errors.generic'), citations: [], suggestions: [], mode: 'ai' } };
  }
}
