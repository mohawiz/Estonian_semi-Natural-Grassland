// In-browser lexical retrieval (BM25) over the document library. Behind the
// RetrievalService interface so a FastAPI RAG backend with embeddings can
// replace it later without changing the assistant or UI.
import type { Lang } from '../lib/types';
import type { Passage } from './library';

export interface RetrievalHit {
  passage: Passage;
  score: number;
  /** Share of the question's content words found in the passage (0–1). */
  coverage: number;
  matchedTerms: string[];
}

export interface RetrievalService {
  search(query: string, lang: Lang, k?: number): Promise<RetrievalHit[]>;
}

const STOPWORDS = new Set(
  (
    // English
    'a an the and or of to in on at for from by with is are was were be been being do does did can could ' +
    'should would will shall may might must i me my we our you your it its this that these those what which who whom ' +
    'when where why how if then than so not no yes there their they them he she his her about into over under ' +
    'any all some more most much many very just also only have has had get got tell explain please' +
    // Estonian
    ' ja ning ka või kas et mis mida mille milline millised kuidas kus kui see seda selle need neid ma mina me meie ' +
    'sa sina te teie ta tema nad nemad on oli olid olema olen oled oleme olete ei pole ole aga siis veel juba ' +
    'mul minu mulle meil oma kes keda kelle kuhu millal miks palun mitte nii väga ainult ka siin seal üks üle alla ' +
    'saab saan saame tuleb peab pean peame võib võin võime kohta'
  )
    .split(/\s+/)
    .map((w) => foldDiacritics(w)),
);

/** Small bilingual bridge so English questions reach Estonian passages and vice versa. */
const SYNONYMS: Record<string, string[]> = {
  mow: ['niitmine', 'niita', 'niide'],
  mowing: ['niitmine', 'niita', 'niide'],
  mowed: ['niidetud', 'niitmine'],
  graze: ['karjatamine', 'karjatada'],
  grazing: ['karjatamine', 'karjatada'],
  hay: ['hein', 'niide'],
  subsidy: ['toetus'],
  support: ['toetus'],
  payment: ['toetus', 'makse'],
  weather: ['ilm', 'ilmastik', 'vääramatu'],
  rain: ['vihm', 'sademed', 'märg', 'ilm'],
  wet: ['märg', 'liigniiske', 'vihm'],
  drought: ['põud', 'kuiv'],
  force: ['vääramatu'],
  stop: ['vääramatu', 'takistab'],
  stops: ['vääramatu', 'takistab'],
  prevent: ['vääramatu', 'takistab'],
  prevents: ['vääramatu', 'takistab'],
  unable: ['vääramatu', 'võimeline'],
  cannot: ['vääramatu', 'võimeline'],
  storm: ['ilm', 'vääramatu', 'loodusõnnetus'],
  flood: ['üleujutus', 'vääramatu'],
  flooding: ['üleujutus', 'vääramatu'],
  long: ['kestus', 'periood', 'aastat'],
  maintain: ['hooldama', 'hooldamine', 'kohustus'],
  maintaining: ['hooldamine', 'kohustus'],
  ilm: ['weather', 'vääramatu'],
  ilma: ['weather', 'vääramatu'],
  takistab: ['vääramatu'],
  lase: ['vääramatu', 'takistab'],
  lasknud: ['vääramatu', 'takistab'],
  majeure: ['vääramatu'],
  exceptional: ['erandlik', 'erakorraline', 'vääramatu'],
  circumstances: ['asjaolud', 'asjaolu'],
  notify: ['teavitama', 'teatama', 'teavitus'],
  notification: ['teavitama', 'teatama', 'teavitus'],
  deadline: ['tähtaeg', 'päeva'],
  records: ['arvestus', 'päevik', 'dokumenteerima'],
  record: ['arvestus', 'päevik'],
  breach: ['rikkumine', 'nõue'],
  penalty: ['vähendamine', 'sanktsioon', 'rikkumine'],
  sanction: ['vähendamine', 'sanktsioon'],
  severity: ['raskusaste', 'raskus'],
  extent: ['ulatus'],
  duration: ['kestus'],
  coastal: ['rannaniit', 'ranna'],
  alvar: ['loopealne', 'alvar'],
  meadow: ['niit', 'kooslus'],
  grassland: ['kooslus', 'rohumaa', 'niit'],
  'semi-natural': ['poollooduslik'],
  board: ['keskkonnaamet'],
  environmental: ['keskkonnaamet', 'keskkonna'],
  commitment: ['kohustus'],
  years: ['aasta', 'aastat'],
  consent: ['nõusolek', 'kooskõlastus'],
  livestock: ['loomad', 'kariloomad', 'loomühik'],
  animals: ['loomad', 'loomühik'],
  area: ['pindala', 'ala'],
  eligible: ['abikõlblik', 'nõuded'],
  eligibility: ['abikõlblik', 'nõuded'],
  photo: ['foto', 'fotod'],
  photos: ['foto', 'fotod'],
  repay: ['tagasi', 'tagasinõudmine'],
  clawback: ['tagasi', 'tagasinõudmine'],
  niitmine: ['mowing'],
  karjatamine: ['grazing'],
  toetus: ['subsidy'],
};

export function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function tokenize(text: string): string[] {
  return foldDiacritics(text.toLowerCase())
    .replace(/[^a-z0-9§\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Prefix stem: Estonian is heavily inflected, so the first 5 letters carry most of the meaning. */
export function stem(token: string): string {
  return token.length > 5 ? token.slice(0, 5) : token;
}

function features(text: string): string[] {
  return tokenize(text).map(stem);
}

function expandQuery(query: string): { terms: string[]; groups: string[][] } {
  const raw = foldDiacritics(query.toLowerCase());
  const base = tokenize(query);
  const groups = base.map((t) => {
    const syn = SYNONYMS[t] ?? SYNONYMS[t.replace(/s$/, '')] ?? [];
    return [...new Set([stem(t), ...syn.flatMap((s) => tokenize(s)).map(stem)])];
  });
  if (raw.includes('force majeure')) groups.push(['vaara']);
  return { terms: [...new Set(groups.flat())], groups };
}

interface IndexedDoc {
  passage: Passage;
  tf: Map<string, number>;
  len: number;
}

export class Bm25Retrieval implements RetrievalService {
  private docs: IndexedDoc[];
  private df = new Map<string, number>();
  private avgLen: number;
  constructor(
    passages: Passage[],
    private titles: Record<string, string> = {},
    private k1 = 1.2,
    private b = 0.75,
  ) {
    this.docs = passages.map((p) => {
      // Keywords and summaries are weighted by repetition; section and doc title help "§" lookups.
      const text = [p.text, p.summary.et, p.summary.en, p.summary.en, p.keywords.join(' '), p.keywords.join(' '), p.section, this.titles[p.docId] ?? ''].join(' ');
      const f = features(text);
      const tf = new Map<string, number>();
      for (const t of f) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { passage: p, tf, len: f.length };
    });
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  private idf(t: string): number {
    const n = this.docs.length;
    const df = this.df.get(t) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  searchSync(query: string, k = 4): RetrievalHit[] {
    const { terms, groups } = expandQuery(query);
    if (!terms.length) return [];
    const hits: RetrievalHit[] = [];
    for (const d of this.docs) {
      let score = 0;
      const matched: string[] = [];
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        matched.push(t);
        score += (this.idf(t) * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen));
      }
      if (score <= 0) continue;
      const groupsHit = groups.filter((g) => g.some((t) => d.tf.has(t))).length;
      hits.push({ passage: d.passage, score, coverage: groups.length ? groupsHit / groups.length : 0, matchedTerms: matched });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  async search(query: string, _lang: Lang, k = 4): Promise<RetrievalHit[]> {
    return this.searchSync(query, k);
  }
}

/** Minimum evidence before the assistant answers instead of saying "I don't know". */
export const ANSWER_THRESHOLD = { minScore: 2.5, minCoverage: 0.5 };

export function isConfident(hit: RetrievalHit | undefined): boolean {
  return !!hit && hit.score >= ANSWER_THRESHOLD.minScore && hit.coverage >= ANSWER_THRESHOLD.minCoverage;
}
