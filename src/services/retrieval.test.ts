import { describe, expect, it } from 'vitest';
import { translate } from '../i18n';
import { composeAnswer } from './assistant';
import { allPassages, library } from './library';
import { Bm25Retrieval, isConfident, stem, tokenize } from './retrieval';

const titles = Object.fromEntries(library.documents.map((d) => [d.id, `${d.title.et} ${d.title.en}`]));
const r = new Bm25Retrieval(allPassages(), titles);

// Estonian and English test questions with the passages we expect among the top results.
const CASES: { q: string; expect: string[] }[] = [
  { q: 'Mis saab, kui vääramatu jõu tõttu ei saa kohustust jätkata?', expect: ['rt-niit-maarus-79-p5', 'pria-abiks-taotlejale-2026-p5', 'eurlex-2021-2116-p1', 'keskkonnaamet-niit-koolitus-2026-p1'] },
  { q: 'Kui mitme tööpäeva jooksul tuleb PRIA-t vääramatust jõust teavitada?', expect: ['pria-abiks-taotlejale-2026-p6'] },
  { q: 'How soon must I notify PRIA about force majeure?', expect: ['pria-abiks-taotlejale-2026-p6'] },
  { q: 'How long is the commitment period for new commitments from 2026?', expect: ['rt-niit-maarus-79-p2', 'pria-niit-2026-p1'] },
  { q: 'Mis kuupäevaks peab rannaniidul karjatamine algama?', expect: ['rt-niit-maarus-79-p11'] },
  { q: 'How are breaches assessed: severity, extent and duration?', expect: ['pria-niit-hindamismaatriksid-2026-p1', 'pria-abiks-taotlejale-2026-p7', 'pria-abiks-taotlejale-2026-p9', 'pria-nouete-rikkumise-hindamise-alused-p1', 'eurlex-2021-2116-p2'] },
  { q: 'When do I have to tell the Environmental Board before mowing?', expect: ['keskkonnaamet-niit-koolitus-2026-p2', 'rt-niit-maarus-79-p10'] },
  { q: 'Mis juhtub, kui hein jääb maha ja ala pole 1. septembriks niidetud?', expect: ['pria-niit-hindamismaatriksid-2026-p4'] },
  { q: 'What is a rest year?', expect: ['rt-niit-maarus-79-p8', 'keskkonnaamet-korraldus-puhkeaasta-p2'] },
];

describe('tokenizer', () => {
  it('folds diacritics and drops stopwords', () => {
    expect(tokenize('Kas ma võin niita rannaniitu?')).toEqual(['niita', 'rannaniitu']);
    expect(stem('karjatamine')).toBe('karja');
  });
});

describe('retrieval returns the expected sources', () => {
  for (const c of CASES) {
    it(c.q, () => {
      const hits = r.searchSync(c.q, 4);
      expect(isConfident(hits[0])).toBe(true);
      const ids = hits.map((h) => h.passage.id);
      expect(ids.some((id) => c.expect.includes(id)), ids.join(', ')).toBe(true);
    });
  }
});

describe('suggested example questions always get a sourced answer', () => {
  const examples = ['assistant.example1', 'assistant.example2', 'assistant.example3'] as const;
  for (const lang of ['en', 'et'] as const) {
    for (const k of examples) {
      const q = translate(lang, k);
      it(`${lang}: ${q}`, () => {
        expect(composeAnswer(q, r.searchSync(q, 6), lang).kind).toBe('answer');
      });
    }
  }
});

describe('assistant honesty', () => {
  it("says I don't know for questions the documents do not cover", () => {
    for (const q of ['What is the price of diesel in Tartu?', 'Kes võitis eile jalgpallimatši?', 'How do I bake rye bread?']) {
      const a = composeAnswer(q, r.searchSync(q, 6), 'en');
      expect(a.kind, q).toBe('unknown');
      expect(a.citations).toHaveLength(0);
    }
  });
  it('cites every answer and only from the library', () => {
    const a = composeAnswer('force majeure notification', r.searchSync('force majeure notification', 6), 'et');
    expect(a.kind).toBe('answer');
    expect(a.citations.length).toBeGreaterThan(0);
    for (const c of a.citations) {
      expect(c.document.url).toMatch(/^https:\/\//);
      expect(a.text).toContain(`[${c.n}]`);
    }
  });
  it('suggests building the report for weather questions', () => {
    const q = 'What if weather stops me mowing?';
    expect(composeAnswer(q, r.searchSync(q, 6), 'en').suggestions).toContain('report');
  });
});

describe('library integrity', () => {
  it('every document has a URL, retrieval date and status', () => {
    for (const d of library.documents) {
      expect(d.url).toMatch(/^https:\/\//);
      expect(d.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['verified-current', 'older-version', 'unverified']).toContain(d.status);
      for (const p of d.passages) {
        expect(p.text.length).toBeGreaterThan(20);
        expect(p.summary.et && p.summary.en).toBeTruthy();
      }
    }
  });
});
