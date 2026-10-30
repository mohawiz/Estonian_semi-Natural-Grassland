// Service wiring. To plug in a backend later, replace these instances with
// HTTP-backed implementations of the same interfaces (see docs/architecture.md).
import { LocalAssistant, type AssistantService } from './assistant';
import { allPassages, library } from './library';
import { Bm25Retrieval, type RetrievalService } from './retrieval';
import { OpenMeteoWeatherService, type WeatherService } from './weather';

const titles = Object.fromEntries(library.documents.map((d) => [d.id, `${d.title.et} ${d.title.en}`]));

export const retrieval: Bm25Retrieval & RetrievalService = new Bm25Retrieval(allPassages(), titles);
export const weatherService: WeatherService = new OpenMeteoWeatherService();

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const assistant: AssistantService = new LocalAssistant(retrieval, { tokenDelayMs: reducedMotion ? 0 : 14 });
