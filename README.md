# Pärandniidu abiline · Grassland Assistant

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

On first start you get a welcome screen (choose Estonian or English), then a 2-minute tour. Open the **demo farm** from the dashboard, then run **Help → Run the guided demo** to watch the main scenario: no mowing from 1 to 31 July, heavy rain, waterlogged-ground photos, a finished PDF report.

Keyboard: `?` shortcuts, `/` assistant, `n` new entry, `g` then `d`/`l`/`r`/`w`/`b` to move between pages.

## What is real and what is demo

| Part | Status |
| --- | --- |
| Weather (rain, max temperature, soil moisture 0–7 cm, 1991–2020 comparison) | **Real**: fetched live from the [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) for the parcel's coordinates. It is modelled reanalysis data on a 9–25 km grid, not weather-station measurements. If a fetch fails the app says so and shows nothing; it never fills gaps with invented numbers. |
| Rule library (10 documents, 47 passages) | **Real** official texts from Riigi Teataja, PRIA, Keskkonnaamet and EUR-Lex, quoted verbatim, each with URL, version and retrieval date (30 Oct 2026). Older or legacy documents are labelled. The plain-language summaries were written for this tool; the originals are authoritative. |
| Assistant | **Real retrieval, no LLM.** BM25 search over the passages with a small Estonian–English synonym bridge. It restates retrieved passages and says "I don't know" below a confidence threshold. |
| Demo farm "Kadakaniidu talu (näidis)", its parcels, entries and people | **Invented**, and labelled "Demo data" everywhere. The parcels sit near Matsalu and on Muhu so the weather is real for those places. |
| Demo photos | **Drawn illustrations**, stamped "DEMO ILLUSTRATION" in the image and labelled in the report. Not photographs. |
| Weather "consistent with the reason" verdict | The tool's **own rule of thumb**, not an official criterion, and labelled as such. |
| 15-working-day notification window | PRIA's 2026 applicant guide **recommends** notifying PRIA within 15 working days. It is not a legal deadline and is **not verified for the Environmental Board**. It is configurable on the Deadlines page. |
| Severity, extent, duration | PRIA's assessment criteria. Whether the Environmental Board uses the same criteria is **not verified**. |

## Privacy

All farmer data (parcels, entries, photos, checklists, reports) stays in the browser's IndexedDB. There is no account, no backend and no tracking or analytics. The only network calls are to Open-Meteo, sending a parcel's coordinates and dates when the user asks for weather. Fonts are self-hosted. **Settings → Export data** saves a JSON file (including photos) that a teammate can load with **Import data**.

## Add or update documents

The library is one file: [`src/data/documents.json`](src/data/documents.json).

1. Find the current version on the official site (Riigi Teataja *terviktekst*, PRIA, Keskkonnaamet). Note the URL, the version (for example `RT I, 02.05.2026, 8`) and today's date.
2. Add a document object, or update the existing one, with `id`, `title.et`/`title.en`, `publisher`, `url`, `version`, `versionDate`, `retrievedAt` and `status` (`verified-current`, `older-version` or `unverified`), plus a `statusNote` in both languages.
3. For each passage, add `id`, `section` (e.g. `§ 4 lg 7`), `lang`, `text` (a **verbatim** excerpt, about 90 words at most, with `[…]` for omissions), `summary.et`, `summary.en` and `keywords`. Include inflected Estonian forms and English equivalents in the keywords, because retrieval is lexical.
4. Run `npm test`. The library integrity test checks the fields. Add a question and its expected passage id to `CASES` in [`src/services/retrieval.test.ts`](src/services/retrieval.test.ts).
5. Never paraphrase a rule into `text`, and never add numbers or deadlines to a summary that are not in the passage.

Unverified findings go in the `unverified` list in the same file and are shown on the Rules page.

## Deploy

The same build runs on GitHub Pages, Netlify, Vercel, Cloudflare Pages or any host with Docker. Step-by-step instructions and the final URL format for each are in [docs/deployment.md](docs/deployment.md).

## Project layout

```
src/
  app/          store (IndexedDB-backed state), UI state, routes
  components/   layout, icons, toasts, shared UI
  features/     assistant panel, tour, weather timeline, report document + PDF, photos
  pages/        dashboard, parcels, log, weather, report, rules, deadlines, help, settings
  services/     interfaces + implementations: weather, retrieval, assistant, report, db, demo, transfer
  i18n/         en.ts and et.ts (all UI text, same keys enforced by a test)
  data/         documents.json (the rule library)
docs/           architecture.md (future FastAPI backend), deployment.md
```

## Known limits

- Retrieval is lexical. Questions phrased very differently from the documents may get "I don't know" even when the answer exists. A backend with embeddings and an LLM would do better; see [docs/architecture.md](docs/architecture.md).
- The assistant does not yet answer questions about the farmer's own records.
- Weather is modelled reanalysis on a coarse grid. Coastal grid cells can show zero soil moisture (sea), which the app hides. Official station data from the Estonian Environment Agency (Keskkonnaagentuur) would be stronger evidence.
- No satellite mowing comparison. PRIA's area-monitoring (SATIKAS) results are not, as far as we found, open to third parties.
- Data lives in one browser. Clearing site data deletes it; export a file to back it up.
- GitHub Pages serves deep links through a `404.html` copy of the app. The page works, but the HTTP status is 404.
- The report is addressed to the Environmental Board, as the team decided, but PRIA's 2026 guide says force majeure notices go to PRIA. The report says so.
- The Estonian texts were written carefully but have not been reviewed by a native-speaking domain expert.

## Licence

Code: MIT (see [LICENSE](LICENSE)). Official document excerpts are public legal and administrative texts quoted with their sources. Weather data © Open-Meteo.com, CC BY 4.0. Fonts: IBM Plex Sans and Source Serif 4, SIL Open Font License.
