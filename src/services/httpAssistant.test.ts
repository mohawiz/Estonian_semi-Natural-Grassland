import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantEvent, AssistantService } from './assistant';
import { HttpAssistant, readSse } from './httpAssistant';

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

const local: AssistantService = {
  async *ask() {
    yield { type: 'token', text: 'local' };
    yield { type: 'done', answer: { kind: 'answer', text: 'local', citations: [], suggestions: [] } };
  },
};

async function collect(gen: AsyncGenerator<AssistantEvent>) {
  const out: AssistantEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe('readSse', () => {
  it('reassembles events split across chunks and CRLF line ends', async () => {
    const events = [];
    for await (const ev of readSse(sseBody(['event: token\r\ndata: {"te', 'xt":"Hi"}\r\n\r\nevent: done\ndata: {}\n\n']))) events.push(ev);
    expect(events).toEqual([
      { event: 'token', data: '{"text":"Hi"}' },
      { event: 'done', data: '{}' },
    ]);
  });
});

describe('HttpAssistant', () => {
  it('streams tokens and resolves citations against the bundled library', async () => {
    const body = sseBody([
      'event: token\ndata: {"text":"Grazing must start by 31 May "}\n\n',
      'event: token\ndata: {"text":"[1]."}\n\n',
      'event: done\ndata: {"kind":"answer","text":"Grazing must start by 31 May [1].","citations":[{"n":1,"passageId":"rt-niit-maarus-79-p11","docId":"rt-niit-maarus-79"}]}\n\n',
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const events = await collect(new HttpAssistant('https://api.example/', local).ask('When must grazing start?', 'en', undefined, [{ role: 'user', text: 'hi' }]));
    expect(events.filter((e) => e.type === 'token').map((e) => (e as { text: string }).text).join('')).toBe('Grazing must start by 31 May [1].');
    const done = events.at(-1) as Extract<AssistantEvent, { type: 'done' }>;
    expect(done.answer.mode).toBe('ai');
    expect(done.answer.citations[0].passage.section).toContain('§');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/api/ask');
    expect(sent).toEqual({ question: 'When must grazing start?', lang: 'en', history: [{ role: 'user', text: 'hi' }] });
  });

  it('falls back to keyword search when the server is unreachable or busy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    let done = (await collect(new HttpAssistant('https://api.example', local).ask('q', 'en'))).at(-1) as Extract<AssistantEvent, { type: 'done' }>;
    expect(done.answer.mode).toBe('search');
    expect(done.answer.note).toMatch(/not reachable/);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 429 })));
    done = (await collect(new HttpAssistant('https://api.example', local).ask('q', 'et'))).at(-1) as Extract<AssistantEvent, { type: 'done' }>;
    expect(done.answer.note).toMatch(/hõivatud/);
  });

  it('uses the translated "I don\'t know" when the model finds no answer', async () => {
    const body = sseBody(['event: done\ndata: {"kind":"unknown","text":"","citations":[]}\n\n']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const done = (await collect(new HttpAssistant('https://api.example', local).ask('diesel price?', 'en'))).at(-1) as Extract<AssistantEvent, { type: 'done' }>;
    expect(done.answer.kind).toBe('unknown');
    expect(done.answer.text).toMatch(/^I don’t know/);
    expect(done.answer.suggestions).toContain('library');
  });
});
