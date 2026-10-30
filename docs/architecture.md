# Architecture and the path to a backend

The prototype is a static single-page app with no server. Every part that a backend will later take over sits behind a TypeScript interface. Components only talk to those interfaces, which are wired up in one place: [`src/services/index.ts`](../src/services/index.ts).

```
 UI (React pages, assistant panel, tour)
        │ uses only interfaces
        ▼
 ┌────────────────┬──────────────────┬──────────────────┬───────────────┐
 │ WeatherService │ RetrievalService │ AssistantService │ buildReport() │
 └───────┬────────┴────────┬─────────┴────────┬─────────┴───────┬───────┘
         │ today           │ today            │ today           │ pure function
   Open-Meteo API    BM25 in browser    LocalAssistant     (same shape a
   (browser fetch)   over documents.json (extractive)       backend returns)
         │ later           │ later            │ later
   FastAPI /weather  FastAPI /search     FastAPI /ask (RAG + LLM, streaming)

 Farmer data: IndexedDB (src/services/db.ts). Stays local unless the user exports it.
```

## Interfaces

### `WeatherService` — [`src/services/weather.ts`](../src/services/weather.ts)

```ts
getDaily(lat, lon, start, end, signal?): Promise<WeatherSeries>
getBaseline(lat, lon, start, end, signal?): Promise<WeatherBaseline>
```

A `WeatherSeries` carries its `source` (name, URL, licence, note), so the report always shows where the numbers came from. Errors are thrown as `WeatherError` and the UI never substitutes data.

A backend version could proxy Estonian Environment Agency station data (ilmateenistus.ee), choose the nearest station, add groundwater or flood data, and cache responses.

### `RetrievalService` — [`src/services/retrieval.ts`](../src/services/retrieval.ts)

```ts
search(query, lang, k?): Promise<RetrievalHit[]>   // hit = { passage, score, coverage, matchedTerms }
```

Today this is BM25 with diacritic folding, 5-letter prefix stemming for Estonian inflection, and a small bilingual synonym map. A backend can replace it with hybrid search (BM25 plus multilingual embeddings such as `intfloat/multilingual-e5` or LaBSE) over a larger, automatically refreshed corpus. It should keep returning the same `Passage` objects (document id, section, verbatim text, summaries), so citations keep working.

### `AssistantService` — [`src/services/assistant.ts`](../src/services/assistant.ts)

```ts
ask(question, lang, signal?): AsyncGenerator<
  | { type: 'token'; text: string }
  | { type: 'done'; answer: { kind: 'answer' | 'unknown'; text; citations; suggestions } }
>
```

The streaming contract maps directly onto Server-Sent Events. A FastAPI implementation:

```python
@app.post("/ask")
async def ask(q: Question):
    hits = retriever.search(q.text, q.lang, k=6)
    if not confident(hits):
        return sse_done(kind="unknown", ...)
    async def stream():
        async for tok in llm.stream(system=GROUNDED_PROMPT, passages=hits, question=q.text):
            yield sse("token", tok)
        yield sse("done", answer_with_citations(hits))
    return EventSourceResponse(stream())
```

Rules for the LLM version, carried over from the prototype:

- Answer only from retrieved passages, cite them as `[n]`, and return `unknown` when retrieval confidence is low. Do not let the model fall back on what it already knows.
- Keep the API key on the server. The browser never calls an LLM directly.
- Keep the "older version" and "unverified" flags in the citations.
- Log questions only with consent and without farmer data.

To plug it in, write `HttpAssistant implements AssistantService` that reads the SSE stream, and change one line in `src/services/index.ts`.

### Report — [`src/services/report.ts`](../src/services/report.ts)

`buildReport(args): ProofReport` is a pure function, unit-tested in `report.test.ts`. A backend can produce the same `ProofReport` JSON (for example to sign it, or to submit it through an agency API if one ever exists). The screen view (`ReportDocument.tsx`) and the PDF (`pdf.ts`) both render from that object.

## Data model (IndexedDB, `src/services/db.ts`)

`farms`, `parcels` (areas stored in hectares, plus coordinates), `entries` (mowing, grazing, missed; missed entries hold the planned action, reason and window), `photos` (JPEG blob plus EXIF date and GPS, or browser location the user agreed to share), `checklists`, `reports` (saved inputs; the report itself is rebuilt from current data), `settings`, and `weatherCache` (7-day TTL).

A multi-device version would need accounts and sync. The JSON export format (`grassland-assistant/v1`, see `transfer.ts`) is a reasonable wire format to start from.

## Two-way exchange with the Environmental Board (future)

Marika suggested two-way data exchange. Today the farmer downloads a PDF and sends it through whatever channel the Board asks for. A future version could:

1. Submit the `ProofReport` JSON plus photos to a Board endpoint, if one is created.
2. Receive the Board's maintenance conditions (*hooldamistingimused*) and mowing start dates per parcel. PRIA's guide says these are shown in e-PRIA; there is no known public API.
3. Compare PRIA area-monitoring mowing detections with the farmer's log and flag mismatches. This needs access to SATIKAS results, which we could not confirm are available to third parties.
