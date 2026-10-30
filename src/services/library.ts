// The bundled document library: real official texts with source URLs and
// retrieval dates. Edit src/data/documents.json to add documents (see README).
import raw from '../data/documents.json';
import type { Localized } from '../lib/types';

export type DocStatus = 'verified-current' | 'older-version' | 'unverified';

export interface Passage {
  id: string;
  docId: string;
  section: string;
  lang: string;
  text: string;
  summary: Localized;
  keywords: string[];
}

export interface LibraryDocument {
  id: string;
  title: Localized;
  publisher: string;
  url: string;
  version: string;
  versionDate: string | null;
  retrievedAt: string;
  status: DocStatus;
  statusNote: Localized;
  passages: Passage[];
}

export interface UnverifiedItem {
  topic: string;
  finding: string;
  sources: string[];
}

interface RawLibrary {
  retrievedAt: string;
  documents: Omit<LibraryDocument, 'passages'> & { passages: Omit<Passage, 'docId'>[] }[];
  unverified?: UnverifiedItem[];
}

export function loadLibrary(data: unknown = raw): { documents: LibraryDocument[]; unverified: UnverifiedItem[]; retrievedAt: string } {
  const lib = data as RawLibrary;
  const documents = (lib.documents as any[]).map((d) => ({
    ...d,
    passages: (d.passages as any[]).map((p) => ({ ...p, docId: d.id, keywords: p.keywords ?? [] })),
  })) as LibraryDocument[];
  return { documents, unverified: lib.unverified ?? [], retrievedAt: lib.retrievedAt };
}

export const library = loadLibrary();

export function getDocument(id: string): LibraryDocument | undefined {
  return library.documents.find((d) => d.id === id);
}

export function allPassages(): Passage[] {
  return library.documents.flatMap((d) => d.passages);
}
