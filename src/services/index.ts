// Service wiring. Set VITE_ASSISTANT_API_URL at build time to use the RAG backend
// (see backend/ and docs/rag.md); without it the app stays fully static and the
// assistant uses in-browser keyword search.
import { LocalAssistant, type AssistantService } from './assistant';
import { HttpAssistant } from './httpAssistant';
import { allPassages, library } from './library';
import { Bm25Retrieval, type RetrievalService } from './retrieval';
import { OpenMeteoWeatherService, type WeatherService } from './weather';

const titles = Object.fromEntries(library.documents.map((d) => [d.id, `${d.title.et} ${d.title.en}`]));

export const retrieval: Bm25Retrieval & RetrievalService = new Bm25Retrieval(allPassages(), titles);
export const weatherService: WeatherService = new OpenMeteoWeatherService();

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const local = new LocalAssistant(retrieval, { tokenDelayMs: reducedMotion ? 0 : 14 });

const apiUrl = (import.meta.env.VITE_ASSISTANT_API_URL as string | undefined)?.trim();
/** True when questions go to the AI backend (the privacy page says so). */
export const aiAssistantEnabled = Boolean(apiUrl);
export const assistant: AssistantService = apiUrl ? new HttpAssistant(apiUrl, local) : local;
