# Pärandniitude abiline · Grassland Assistant

A decision-support prototype for Estonian farmers who maintain semi-natural grasslands (heritage meadows, *pärandniidud*). It helps them:

- **understand the rules** of the heritage meadow maintenance subsidy (*pärandniidu hooldamise toetus*, NIIT) with an assistant that answers only from bundled official documents and cites every source;
- **record work**: mowing, grazing and work that could not be done, with dated, geotagged photos;
- **see weather evidence**: real historical rainfall, temperature and soil moisture for each parcel;
- **build a proof report** for the Environmental Board (Keskkonnaamet) that explains why mowing or grazing was not done in a period, and export it as a PDF.

It is **decision support only**. It never decides subsidy outcomes; the Environmental Board and PRIA do.

Built by the Hive Mind group (Valmar, Jay, Mohawiz, Glenn) for the AISS course at Tallinn University, 2026.

---

## Run it

Requires Node 20 or newer (22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (report logic, units, dates, weather, retrieval, translations)
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

The assistant works out of the box with keyword search. For the AI assistant (RAG with Postgres/pgvector and a Groq model), start the backend in `backend/` and set `VITE_ASSISTANT_API_URL`; step-by-step in [docs/rag.md](docs/rag.md).

On first start you get a welcome screen (choose Estonian or English), then a 2-minute tour. Open the **demo farm** from the dashboard, then run **Help → Run the guided demo** to watch the main scenario: no mowing from 1 to 31 July, heavy rain, waterlogged-ground photos, a finished PDF report.

Keyboard: `?` shortcuts, `/` assistant, `n` new entry, `g` then `d`/`l`/`r`/`w`/`b` to move between pages.

## Design: "The Living Meadow"

The interface sits over a generative coastal meadow (`src/features/meadow/`) that is drawn from the weather you are looking at: grass sways with the real daily maximum wind, mist follows humidity, rain falls when the selected period was wet, and the sky follows the time of day. The dashboard timeline's brush, the report period and the weather page all publish their window to it. With no data it stays calm; it never shows invented weather.

- **Palette:** bog green `#1E3A2C`, sea-glass teal `#5E9C94`, birch white `#EEF1EC`, hay amber `#D4A03A`, peat brown `#3A2A1F`, and one accent, lingonberry `#B3313D` (missed periods, risk).
- **Type:** Newsreader (display serif, optical sizes) and Atkinson Hyperlegible Next (text), self-hosted and embedded in the PDF.
- **Surfaces:** content sits on opaque birch sheets for contrast. Glass is used only on floating instruments: the nav rail, top bar, assistant, tour card, toasts and the dashboard readout.
- **Motion:** Framer Motion (`motion`) for the load sequence, route transitions and shared nav pill. Path morphs (logo seed → leaves, drop ↔ sun, parcel dot → field outline) use a small built-in sampler. Rolling numbers, confirmation morphs on controls, a grass-growing loader, and a celebration for the first report.
- **Reduce effects:** the sparkle button in the top bar, Settings → Appearance, or `?effects=reduced` in the URL. The OS "reduce motion" setting is always respected. In reduced mode the meadow is one still frame and animations are off.

### Dashboard charts

All charts follow the parcel selected on the map:

1. **Weather timeline** (hero). Brush a window to drive the stats, the report link and the meadow. Hover for values, click a day for details, toggle series. Keyboard: arrows move the window, Shift + arrows resize it.
2. **Parcel map.** The coastline is schematic and parcel shapes are illustrative (the app stores one point per parcel). Both are labelled.
3. **Management calendar.** Click a cell to open its entry. It highlights the brushed window and the hovered week.
4. **"Where questions could come up" gauge.** The tool's own rule of thumb (`src/services/risk.ts`), labelled as decision support.
5. **Records vs satellite.** Satellite detections are **simulated** for the demo farm only (`src/services/satelliteDemo.ts`) and labelled. Other parcels show an honest "not available" note.
6. **Seasonal trends** by week. Metric filters, zoom presets, cross-highlighting with the calendar, and a "weather fetched" time.

## What is real and what is demo

| Part | Status |
| --- | --- |
| Weather (rain, max temperature, soil moisture 0–7 cm, wind, humidity, 1991–2020 comparison) | **Real**: fetched live from the [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) for the parcel's coordinates. It is modelled reanalysis data on a 9–25 km grid, not weather-station measurements. If a fetch fails the app says so and shows nothing; it never fills gaps with invented numbers. |
| Rule library (10 documents, 47 passages) | **Real** official texts from Riigi Teataja, PRIA, Keskkonnaamet and EUR-Lex, quoted verbatim, each with URL, version and retrieval date (30 Oct 2026). Older or legacy documents are labelled. The plain-language summaries were written for this tool; the originals are authoritative. |
| Assistant | **AI with sources (RAG)** when the backend is configured: hybrid vector + keyword search in Postgres/pgvector, then a Groq language model (temperature 0.2) that may only use the retrieved passages and cites each one. It says "I don't know" when the documents don't cover a question. Without the backend, or when it is asleep, the app falls back to in-browser keyword search (BM25, no AI) and says so. See [docs/rag.md](docs/rag.md). |
| Demo farm "Kadakaniidu talu (näidis)", its parcels, entries and people | **Invented**, and labelled "Demo data" everywhere. The parcels sit near Matsalu and on Muhu so the weather is real for those places. |
| Demo photos | **Drawn illustrations**, stamped "DEMO ILLUSTRATION" in the image and labelled in the report. Not photographs. |
| Weather "consistent with the reason" verdict | The tool's **own rule of thumb**, not an official criterion, and labelled as such. |
| Risk gauge ("Where questions could come up") | The tool's **own rule of thumb** from your records, labelled "Decision support". Not PRIA's or the Board's assessment. |
| Satellite detections | **Simulated**, demo farm only, labelled "Demo". PRIA's area-monitoring results are not open to third parties. |
| Parcel map | Coastline **schematic**, field shapes **illustrative**; both labelled. |
| 15-working-day notification window | PRIA's 2026 applicant guide **recommends** notifying PRIA within 15 working days. It is not a legal deadline and is **not verified for the Environmental Board**. It is configurable on the Deadlines page. |
| Severity, extent, duration | PRIA's assessment criteria. Whether the Environmental Board uses the same criteria is **not verified**. |

## Privacy

All farmer data (parcels, entries, photos, checklists, reports) stays in the browser's IndexedDB. There is no account and no tracking or analytics. The network calls are to Open-Meteo, sending a parcel's coordinates and dates when the user asks for weather, and, when the AI assistant is switched on, the question text and last few chat messages to the assistant backend and Groq (never farm data; the backend does not store questions). Fonts are self-hosted. **Settings → Export data** saves a JSON file (including photos) that a teammate can load with **Import data**.

## Add or update documents

The library is one file: [`src/data/documents.json`](src/data/documents.json).

1. Find the current version on the official site (Riigi Teataja *terviktekst*, PRIA, Keskkonnaamet). Note the URL, the version (for example `RT I, 02.05.2026, 8`) and today's date.
2. Add a document object, or update the existing one, with `id`, `title.et`/`title.en`, `publisher`, `url`, `version`, `versionDate`, `retrievedAt` and `status` (`verified-current`, `older-version` or `unverified`), plus a `statusNote` in both languages.
3. For each passage, add `id`, `section` (e.g. `§ 4 lg 7`), `lang`, `text` (a **verbatim** excerpt, about 90 words at most, with `[…]` for omissions), `summary.et`, `summary.en` and `keywords`. Include inflected Estonian forms and English equivalents in the keywords, because retrieval is lexical.
4. Run `npm test`. The library integrity test checks the fields. Add a question and its expected passage id to `CASES` in [`src/services/retrieval.test.ts`](src/services/retrieval.test.ts).
5. Never paraphrase a rule into `text`, and never add numbers or deadlines to a summary that are not in the passage.

Unverified findings go in the `unverified` list in the same file and are shown on the Rules page.

## Deploy

The same build runs on GitHub Pages, Netlify, Vercel, Cloudflare Pages or any host with Docker. Step-by-step instructions and the final URL format for each are in [docs/deployment.md](docs/deployment.md). The AI assistant backend deploys free on Render with a Neon database (`render.yaml`); see [docs/rag.md](docs/rag.md#deploy-online-free-neon--render--vercel).

## Project layout

```
src/
  app/          store (IndexedDB-backed state), UI state, routes
  components/   layout, icons, toasts, shared UI
  features/     assistant panel, tour, weather timeline, report document + PDF, photos
  pages/        dashboard, parcels, log, weather, report, rules, deadlines, help, settings
  services/     interfaces + implementations: weather, retrieval, assistant, report, db, demo, transfer
  i18n/         en.ts and et.ts (all UI text, same keys enforced by a test)
  data/         documents.json (the rule library, also indexed by the backend)
backend/        RAG API: FastAPI, Postgres + pgvector, fastembed, Groq (app/, tests/, Dockerfile)
docs/           architecture.md, rag.md (AI assistant), deployment.md
```

## Known limits

- The AI assistant needs the backend running (free hosting sleeps when idle, so the first answer after a pause can take 30–60 s). Meanwhile the app uses keyword search, which can miss questions phrased very differently from the documents.
- AI answers are grounded and cited, but a language model can still word things imperfectly. Every answer links to the verbatim official text to check.
- The assistant does not yet answer questions about the farmer's own records.
- Weather is modelled reanalysis on a coarse grid. Coastal grid cells can show zero soil moisture (sea), which the app hides. Official station data from the Estonian Environment Agency (Keskkonnaagentuur) would be stronger evidence.
- No satellite mowing comparison. PRIA's area-monitoring (SATIKAS) results are not, as far as we found, open to third parties.
- Data lives in one browser. Clearing site data deletes it; export a file to back it up.
- **Performance:** Lighthouse mobile (production build, measured on the development machine, CPU benchmark index about 320–520): Accessibility 100, Best Practices 100, CLS 0. Performance scored 67 with Lighthouse's default 4× CPU slowdown, and 72–89 with the slowdown calibrated to this machine (1.5×). It does not reliably reach 90. What remains is mostly React's startup work on a slow simulated CPU. Things already done: route code splitting, a static first-paint shell, font preloads, the animation library kept out of the first bundle, a meadow that draws only its visible region at reduced resolution on phones and starts after idle. Next options: prerender the first screen, or move to Preact.
- In a hidden or background tab browsers pause animation frames, so the meadow and enter animations resume when the tab is visible again.
- GitHub Pages serves deep links through a `404.html` copy of the app. The page works, but the HTTP status is 404.
- The report is addressed to the Environmental Board, as the team decided, but PRIA's 2026 guide says force majeure notices go to PRIA. The report says so.
- The Estonian texts were written carefully but have not been reviewed by a native-speaking domain expert.

## Licence

Code: MIT (see [LICENSE](LICENSE)). Official document excerpts are public legal and administrative texts quoted with their sources. Weather data © Open-Meteo.com, CC BY 4.0. Fonts: Newsreader and Atkinson Hyperlegible Next, SIL Open Font License.
