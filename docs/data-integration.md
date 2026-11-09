# Real data: plots, satellite, weather, rules and onboarding

This answers the review of November 2026: what each screen now does, where its data comes from, and what is still out of reach.

## Data sources at a glance

| Data | Source | Access | Used for |
| --- | --- | --- | --- |
| Heritage meadow areas: outline, area, type, maintenance choice (`N` mowing, `K` grazing), mowing/grazing start date | PRIA public register, WFS layer `pria_avalik:pria_plk_alad` (`kls.pria.ee/geoserver/pria_avalik`) | Open, no key, browser can call it | Adding a plot; start dates on Deadlines and in the work log |
| Cadastral units: outline, address, official area | Land and Spatial Development Board, WFS `kataster:ky_kehtiv` (`gsavalik.envir.ee/geoserver/kataster`) | Open | Adding a plot by cadastral number or map click |
| Semi-natural habitat type (EU habitat code, coastal yes/no) | Environmental Register (EELIS), WFS `eelis:kr_plk` | Open | Suggesting the community type |
| Base map and aerial photo | Land Board tiles `tiles.maaamet.ee` (`kaart`, `foto`, `hybriid`) | Open | All maps |
| Sentinel-2 L2A imagery | Microsoft Planetary Computer: STAC search + statistics API | Open, no key | NDVI curve per plot |
| Daily weather 1940–today | Open-Meteo historical API (ERA5 reanalysis) | Open | Weather evidence |
| Rule texts | Riigi Teataja public API, PRIA, Keskkonnaamet, EU Publications Office, Loodusrikas Eesti | Open | Rules library, AI assistant, change checks |
| Cadastre X-tee services (incl. state land auctions, MAAOK) | Land Board X-tee | **Needs an X-tee member organisation and a security server** | Not used; the open WFS gives the same parcel data for our purpose. The auction service is for agencies to publish auctions, not a source of farmers' plots. |
| An applicant's own parcels and conditions in e-PRIA | PRIA | **No public API** | Not possible; the open register covers outlines, maintenance choice and start dates |

None of these return owner names. All calls go straight from the browser (or the backend, for rule checks); farm data still stays on the device.

## 1. Plots: from dummy data to real outlines

**Before:** each plot was one typed-in point; the dashboard map was a hand-drawn coastline.

**Now:** *Plots → Add plot → Find your meadow* offers four ways in:

1. **PRIA heritage meadow number** (11 digits, shown in e-PRIA). Returns every area of that meadow for this year with outline, area, meadow type, maintenance choice and start date.
2. **Cadastral number** (e.g. `41101:003:0700`, typed with or without colons). Returns the cadastral unit and the registered heritage meadow areas inside it.
3. **Pick on the map.** Click a field; PRIA's registered meadows are shaded on the map so farmers can see them.
4. **Upload a file**: GeoJSON, KML (Google Earth, phone apps) or a zipped shapefile (GIS, consultants). Estonian L-EST97 coordinates are converted automatically. The file never leaves the device.

The chosen result fills the form (name, area, community type, maintenance, registry code, a weather point inside the outline); the farmer checks it and saves. The plot keeps its outline and where it came from ("Outline from PRIA heritage meadow register: 48250239357/1, fetched 9 Nov 2026").

The dashboard map is now a real map (Land Board base map or aerial photo) with real outlines. **The demo farm stays invented on purpose**: putting simulated "missed mowing" entries on a real PRIA meadow would attach made-up problems to a real person's subsidy parcel.

### Seeing all meadows in Estonia

The **Meadow map** answers "how many meadows are there and which are they": national totals (2026: 6,135 areas, 43,519 ha; 1,975 mowing, 3,845 grazing), every area as a dot at country scale, PRIA's outlines when zoomed in, a list of the areas in view and a details card for each. The dots come from a ~100 KB file built from PRIA's register before each deploy; the outlines and details are fetched live.

**Personal data in PRIA's register:** the area label field is free text and some entries contain people's names. The app never shows such labels (only short codes like `1`, `2E`), uses PRIA's numeric area id for references, and does not pre-select several areas of the same meadow number, because they can belong to different applicants.

## 2. Mowing and grazing dates

**Who defines the dates?** The farmer, always. Every date in the calendar, report and charts comes from the work log; the demo farm's dates are invented and labelled. What the farmer does *not* set is the **official start date**: the Environmental Board sets it per meadow, and PRIA publishes it. The app now reads it from PRIA's register and:

- lists it per plot on **Deadlines** ("Mowing and grazing start dates");
- shows it on the plot page with the rule behind it (PRIA's guide: you must not mow before a date set by the Environmental Board);
- **warns in the work log** when a mowing entry starts before that date.

**Single date vs range.** Grazing always lasted days to months, so it had *From–To*. Mowing had one date, but mowing a large meadow takes several days and the rules care about when the cut grass is removed. Now all work uses the same *From–To* pattern; for mowing *To* is optional (one-day mowing) and there is a new optional **Hay removed on** date, validated (not before the mowing ends) and shown in the log, on-screen report and PDF.

## 3. Satellite data

**Before:** only simulated detections on the demo farm.

**Now:** for every plot with an outline the dashboard shows the season's **NDVI curve** (how green and dense the vegetation is) from real Copernicus Sentinel-2 images:

1. Find all Sentinel-2 L2A scenes over the outline (Planetary Computer STAC; scenes over 70% cloud skipped, one per date).
2. For each date, ask the statistics API for two numbers over the exact outline: the share of the field that is clear (scene classification: vegetation or bare soil) and the median NDVI (with the +1000 offset of processing baseline ≥ 04.00 corrected). One request of about 1 KB per date, instead of downloading imagery.
3. Keep dates where at least 80% of the field is clear.
4. Mark a **sharp drop** (≥ 0.15, from ≥ 0.55, within 25 days, before October) as *possible mowing*, and compare with the farmer's mowing records: *Matches*, *Not seen*, *Not in log* or *Too cloudy to check*.

Tested on real 2026 meadows: a meadow registered for grazing shows a smooth curve with no drops; a meadow registered for mowing (start date 25 June) shows a drop from 0.89 on 22 June to 0.58 on 30 June. A first load takes 15–60 s (a progress bar shows it), then it is cached for 12 hours.

It is labelled as an indication, not proof, and as **not** PRIA's area monitoring (SATIKAS), whose results are not open to third parties.

## 4. Weather

**Why it failed:** Open-Meteo's free service occasionally returns errors or rate-limits; the app showed the error at once. We could not reproduce it later from localhost or from the Vercel site (both load fine), so it was most likely a short outage.

**Now:** network errors, rate limits (429) and server errors (5xx) are retried twice (after 0.8 s and 2.5 s); a period ending in the future is cut to today instead of rejected; and the message says what happened ("The weather service is busy… (HTTP 429)").

**Reliable source:** Open-Meteo (ERA5 reanalysis, 1940–today, with soil moisture) stays the main source because it is open, keyless and covers every plot. The Estonian Environment Agency's station observations (ilmateenistus.ee) would be stronger evidence for a report; they need a backend proxy and nearest-station selection, and are the natural next step.

## 5. Rules library: new sources and automatic change detection

**Added** (13 documents, 60 passages, all verbatim and checked against the source):

- *Maaomanike nõustamine*: how to check whether land is a heritage meadow, restoration (state-funded), who to contact, renting out and renting in, newsletter.
- *Pärandniitude majandajate lood*: the award and three good-practice examples (coastal, floodplain, wooded meadows), labelled as stories, not rules.
- *Pärandniitude rendihuvi juhend* (Land Board 2023): finding meadows in the KATRI map and registering rental interest.

**How it was imported:** the library is `src/data/documents.json`, curated by hand (verbatim excerpts with plain-language summaries). The app bundles it; the backend indexes it for the AI on start-up when it changes.

**Automatic updates:** regulators' changes are now detected automatically, every day:

- a new version of a law in force (Riigi Teataja API),
- a quoted passage no longer appearing word for word,
- other changes on the source page.

Detection happens in the backend (every 24 h) and in a daily GitHub Action that opens an issue for the team. As decided, a changed source is **flagged, not replaced**: the Rules page marks it "Changed at source: review needed" and the reviewed text stays in use until a person updates the passages and accepts them (`python -m app.source_check --update-baseline`). Pushing to `main` then redeploys the app and re-indexes the AI with no code change. Fully automatic replacement was ruled out because a wrong extraction would silently change legal text that farmers rely on. Details: [rag.md](rag.md#watching-the-official-sources-for-changes).

## 6. Onboarding non-technical farmers

The shortest path for a farmer:

1. Open the app, choose a language, skip or take the 2-minute tour.
2. **Create my farm** (dashboard, or the demo banner): farm name and your name, then paste all your heritage meadow numbers from e-PRIA at once (or a cadastral number, or a file), tick your areas and press *Add … and finish*. Single meadows can also be added from the **Meadow map** (*Add to my plots*) or *Plots → Add plot*.
3. Log work as it happens (*Mowed / Grazed / Could not do planned work*), with photos straight from the phone.
4. When work could not be done, **Proof report** builds the PDF from the log, photos and weather.

What is automatic: outline, area, maintenance choice, start dates, habitat type, weather, satellite curve. What the farmer still enters: what they actually did and when, photos, and reasons for missed work, because no register knows that.

Not possible without agreements: pulling a farmer's full application from e-PRIA (no public API) or the X-tee cadastre services (member organisations only). A future version run by an organisation that joins X-tee, or a PRIA data-sharing agreement, could add sign-in with the farmer's ID and import everything at once.
