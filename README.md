# Afterquake

**After a big earthquake, how does the estimated risk of further shaking change?**

Afterquake helps people understand further shaking at their chosen place, hear a short summary and check in with a group. The main screen shows one estimate and practical steps; charts and model details are optional. It uses public USGS data and a simplified aftershock model. It cannot inspect a building or give permission to re-enter.

Built at OxHack 2026 (themes: time; data for prediction and decision making).

![Live globe of USGS earthquakes from the last 30 days](docs/globe.jpg)

![Map view of the 2023 Kahramanmaraş sequence](docs/map.jpg)

## Try it

Open `index.html` in a browser. It's one self-contained file (about 10 MB, with the data, map libraries and world outlines inside). The 13 case studies work offline; the live world view needs internet to reach USGS. The fonts also need internet, and fall back to system fonts without it.

- **Story** (top right) runs a 5-step guided demo of the Türkiye 2023 sequence. Use **→ / ←** or a presentation clicker to move between steps, and **Esc** to exit.
- The page opens on the **live globe**: drag to spin, scroll to zoom, click a quake, then **Open the forecast**. **World map** in the header comes back to it.
- **Help** reopens the welcome screen. **Space** plays the timeline. **Fullscreen** is for presenting.

**Live at https://afterquake-one.vercel.app** (Vercel, Aftershocks account). `vercel.json` serves the prebuilt `index.html` and installs the runtime dependencies for the assistant and check-in API routes. The page asks search engines not to index it (a `robots` meta tag and an `X-Robots-Tag` header); the URL is still public. To redeploy after `npm run build`, run `npx vercel@65.2.0 deploy --prod`; `npx vercel@65.2.0 login` first on a new machine. Shared check-ins also need the [Tiger Data setup](docs/checkins.md).

It also works on GitHub Pages: in the repo's **Settings → Pages**, choose **Deploy from a branch**, then `main` and `/ (root)`.

## What it does

- **Live world view.** The page opens on a globe of every M4.5+ earthquake in the last 30 days, from the USGS feed and checked every 2 minutes. Drag to spin, scroll to zoom, click a quake. Any quake with a USGS ShakeMap opens the same forecast, built in the browser from its live catalogue, ShakeMap and PAGER report. While open, all three are checked every 2 minutes; revised products replace earlier versions without resetting your pins or selected time. **Refresh USGS** checks immediately; **Go to live time** resumes following the latest data. Failed or delayed updates are labelled, with the last successful data retained. The 13 case studies are the red stars.
- **Story mode.** Follow the same Türkiye 2023 narrative, from the first shaking to checking in and opening a recent earthquake. A compact panel above the app keeps Back, Next and Exit visible. Optional controls within the story demonstrate time, Gemini answers, ElevenLabs speech and Tiger Data records.
- **Live now.** Jumps to the most active shallow aftershock sequence of the past week that has a USGS shaking map (most M4.5+ quakes within 250 km, then the largest mainshock), flies the globe to it and opens its forecast. `?live=<USGS event id>` pins a specific quake.
- **Live forecast check.** For a live sequence, refits the model using only quakes recorded up to 24 hours earlier and compares its expected count of M5+ aftershocks over the next day (with a 90% range) with what USGS has recorded since. If USGS products for the newest quake are incomplete it tries the next one, and it says so if neither loads. The story's last step hands off to it.
- **Join on your phone.** Shows a QR code with a short link (`#j=<earthquake>.<group>`). Scanning it opens the same earthquake on a phone, joins the check-in group and lands on the check-in buttons; check-ins on the presenting screen refresh every 3 seconds while presenting. Without the check-in service, the code simply opens the same forecast.
- **Map-first console.** Click anywhere, or search a town, to set your spot. Play the timeline to watch the sequence unfold. Aftershocks are coloured by age, as on USGS maps.
- **Exposure duration.** Choose 5, 10 or 30 minutes, 1 hour, 8 hours or 24 hours. The probability, parameter range, projected start and curve use that entire interval. The 24-hour, 7-day and 30-day context figures remain available.
- **Read summary.** A short readout in English, Chinese or the earthquake's local language, with stop and speed controls and a transcript. It uses one calculated estimate, labels recorded or delayed data, and gives practical next steps. The hosted voice uses ElevenLabs and Gemini; device English speech remains the fallback.
- **Optional forecast detail.** Explore the next 24 hours, 7 days and 30 days, the uncertainty range, and how estimates change with time. A projected lower chance is not a re-entry time.
- **Quick summary.** The selected date, one estimate and timeframe, earthquake magnitude, a relevant local condition and practical next steps. Delayed data is flagged; repeated example labels, model ranges, settings and projected entry times are left out of the readout.
- **Share this place.** Share the selected place, timeframe and replay time. Older links open their main place using the standard estimate.
- **Danger factors.** Distance to aftershock activity, ground softness (Vs30), how hard your spot already shook, liquefaction and landslide models, a country fatality proxy (USGS PAGER; not building fragility), and distance to the coast (tsunami).
- **People.** Population near you, people at risk this week, and the official count of people who felt each shaking level.
- **Ask about this forecast.** A chat bubble in the bottom-left corner of the forecast map, answered by Google Gemini. Gemini calls the page's own forecast as tools (forecast at a place or for a different stay, how the risk changes over time, danger factors, aftershocks so far, people at risk, method and limits), and each answer lists what it checked. Its instructions prohibit clearing a building for entry. It needs the configured assistant API (see [the assistant](#the-assistant)).
- **Aftershock rate from Tiger Data.** Every USGS quake the app sees is stored in a Tiger Data hypertable; an hourly continuous aggregate feeds a chart of the observed aftershock rate against the forecast model's expected rate. See [the time series](docs/tiger.md).
- **Shared safety check-ins with Tiger Data.** Create an invite-only group, share a selected map pin and short note, then update or remove your own status from this browser. The People tab shows current safe/help counts and hourly status updates; entries stop appearing after 24 hours. This needs the hosted API and a configured Tiger Data PostgreSQL service. See [database setup](docs/checkins.md).
- **Sources and accuracy tabs.** Source links, processing dates and model assumptions, with regional occurrence checks where complete outcome windows exist.

## How the forecast works

| Step | Method | Source |
|---|---|---|
| How many aftershocks | Reasenberg–Jones (1989) model, updated by Bayes' rule with the sequence's own M5+ aftershocks | Prototype prior from the same model family; USGS operational forecasts use tectonic-region-specific parameters |
| Where | Future aftershocks cluster around past ones (6 km smoothing, 10 km depth) | USGS ComCat catalogue |
| How hard at your spot | Allen, Wald & Worden (2012) intensity equation, including its scatter | As implemented in OpenQuake |
| Your ground | Soil term `ΔMMI = -1.76 × log10(Vs30/760)`, fitted by us to 86,234 ShakeMap cells (90% range -1.99 to -1.25) | USGS ShakeMap Vs30 grids |
| Your building | Modified Mercalli damage levels, or for "typical local building", the intensity where the country's fatality rate reaches 1 in 10,000 | USGS PAGER empirical fatality model |
| Already weakened | Threshold drops one level if the spot shook near that level in the mainshock, or if 10% or more of the ground is expected to have liquefied | USGS ShakeMap and ground-failure products |

The rules marked "our rule" in the app (the PAGER-based threshold, the 10% liquefaction cut-off, the one-level drop) are our design choices, not published standards.

## How accurate is it?

On the bundled catalogue, 93 complete seven-day forecast windows can be scored across 12 of the 13 sequences. The newest sequence has insufficient follow-up. These checks concern regional occurrence, not point shaking or building damage.

| Target | Model Brier score | Other-sequence reference Brier | Skill |
|---|---:|---:|---:|
| M5+ in the next 7 days | 0.121 | 0.270 | 0.55 |
| M6+ in the next 7 days | 0.140 | 0.138 | -0.01 |

Lower Brier is better; negative skill means worse than the reference. For each forecast, the reference frequency excludes its entire earthquake sequence. This is a retrospective comparison, not a chronological holdout; overlapping windows are correlated. The old pooled baseline gives skills 0.51 and -0.09 but uses the evaluated outcomes to estimate the reference frequency.

The 26 aftershock ShakeMap comparisons are in-sample diagnostics, not independent calibration. The historical -0.90 intensity offset (no longer offered in the interface) is an event-average gap; it is not evidence that the unadjusted equation is always conservative. The soil term was fitted to mainshock grids using a different distance formulation and then transferred to the aftershock equation.

See [the model audit](docs/model-audit.md) for numerical fixes, evidence, sources and remaining scientific limits. The CLI and the optional checks under About share the validation implementation.

```bash
npm test
npm run backtest
npm run backtest -- --json   # write data/validation-report.json
npm run audit:data          # read-only comparison with current USGS records
npm run build
npm run check
```

## Repo layout

```
index.html                 built app, ready to open or host (works offline)
src/template.html          app UI and logic (placeholders filled by the build)
src/model.js               aftershock rate model (Reasenberg–Jones + Bayesian update)
src/shake.js               shaking, uncertainty ranges and consistent Monte Carlo futures
src/forecast-cache.js      current-fit reuse with explicit live-data invalidation
src/heatmap.js             cancellable map shading in short batches
src/map-render.js          bounded overview textures and globe pixel budgets
src/story.js               narrative display and optional live feature demos
src/validation.js          regional occurrence checks shared by the UI and CLI
src/scenario.js            duration estimates, probability labels and geographic distance
src/places.js              shared place helpers and the short action card
src/view-state.js          validated share-link inputs, including older links
src/spoken.js              deterministic captions from the current calculated figures
src/access.js              sharing, restore and device speech controls
src/live-controls.js       version-aware live refresh and visible update status
src/assistant.js           "Ask about this forecast": the tools Gemini calls, run on the page's own model
api/chat.js                Vercel serverless function: holds the Gemini key, safety rules and tool list, rate-limits
api/speak.js               ElevenLabs voice for Read summary, with number-checked Gemini translation
api/checkins.js            invite-group API backed by Tiger Data PostgreSQL
server/checkins-store.js   parameterised SQL, transactions and verified TLS connections
src/checkins.js            group invites, shared pins, status updates and expiry
db/checkins.sql            current entries and a TimescaleDB status-history hypertable
src/globe.js               world view: canvas globe drawn with d3-geo
src/live.js                live USGS feed and per-quake loader for the browser (mirrors fetch_usgs.mjs)
tests/forecast.test.js      numerical, simulation and data-integrity regression tests
tests/scenario.test.js      exposure windows, threshold crossings and distances
tests/live.test.js          live loader: grid parsing, 180° handling, coast clipping, PAGER
tests/live-refresh.test.js  revised products, retries, timeouts and invalid responses
tests/live-controls.test.js refresh caching, time/pin preservation and navigation races
tests/view-state.test.js    share-link validation and deterministic summary wording
tests/access.test.js        sharing and speech controller workflows
tests/chat.test.js          assistant endpoint: input validation, tool list, error handling, rate limit
data/                      everything the app embeds
  sequences.json           catalogue + ShakeMap grids (MMI, Vs30) for 13 quakes
  ground-failure-and-pager.json  liquefaction/landslide grids, PAGER exposure and building notes
  basemap.json             coastlines, borders, town names per area
  population.json          town populations, PAGER country fatality curves (all countries)
  world-towns.json         towns of 5,000+ people worldwide, for live earthquakes
  aftershock-shakemap-check.json  equation vs ShakeMap gaps for 26 aftershocks
  site-term-fit.json       fitted soil coefficient
scripts/
  fetch_usgs.mjs           download catalogue, ShakeMaps, ground failure and PAGER from USGS
  fit_site_term.py         fit the soil term to the ShakeMaps
  prep_basemap.js          clip Natural Earth + GeoNames to each area
  prep_population.js       town populations + PAGER curves + world towns
  build.py                 assemble index.html (inlines the fitted soil term into src/shake.js)
  python.mjs               run Python as python3, python or py, whichever the machine has
  backtest.js              score the aftershock model
docs/map.jpg               case-study map view
docs/DESIGN.md             design direction and the AI-template patterns it avoids
docs/globe.jpg             live world view
```

## The assistant

`api/chat.js` runs on Vercel and calls the Gemini API (`generateContent` with function calling). The default model is `gemini-3.1-flash-lite` with minimal thinking. Set `GEMINI_MODEL` or `GEMINI_THINKING` to change them. Every new question must start with a tool call, so figures can't be reused or invented. Gemini replies with tool calls, the browser runs them against the open forecast (`src/assistant.js`), and the results go back to Gemini, so every figure comes from the model on the page. The function only accepts this app's message shapes and tool names, and allows about 40 requests per visitor per 10 minutes.

It needs a Gemini API key (free from [Google AI Studio](https://aistudio.google.com/apikey)) stored as a Vercel environment variable, never in the code:

```bash
npx vercel@65.2.0 env add GEMINI_API_KEY production   # paste the key when asked
npx vercel@65.2.0 deploy --prod                       # redeploy so the function sees it
```

Opened from a file or a static Python server, the assistant and shared check-ins are unavailable because their API routes are absent. Use `npm run dev` to run those routes locally with the corresponding environment settings; the recorded forecasts still work offline without them.

## Voice (ElevenLabs)

**Read summary** speaks the forecast with an [ElevenLabs](https://elevenlabs.io) voice when the hosted `api/speak.js` route is configured, in English or the earthquake's local language (for example Turkish for Türkiye, Japanese for Noto, Spanish for Ecuador and Panama). The words come from the page's own summary (`src/spoken.js`), so the figures are the model's. For other languages, Gemini translates the summary first, and the translation is discarded (falling back to English) unless every number in the English text appears in it. Without the route (opened as a file or on static hosting), the page uses the browser's own voices as before. The default model is `eleven_flash_v2_5` for low latency; the default voice is George (`JBFqnCBsd6RMkjVDRZzb`). Clips are cached per summary and language in the page, so replaying costs no extra credits. The route allows about 20 requests per visitor per 10 minutes.

```bash
npx vercel@65.2.0 env add ELEVENLABS_API_KEY production    # paste the key when asked
npx vercel@65.2.0 env add ELEVENLABS_VOICE_ID production   # optional: another voice from your library
npx vercel@65.2.0 deploy --prod                            # redeploy so the function sees it
```

English and **Chinese (中文)** are available for every earthquake when translation is configured, alongside its local language. Your selected language stays selected as you move between forecasts. Chinese and other translated languages need `GEMINI_API_KEY` too (already set for the assistant). For `npm run dev`, put the same variables in `.env.local`.

## Rebuild from scratch

Needs Node 20+ and Python 3 with numpy. Works on Windows, macOS and Linux: the npm scripts find Python whether it's installed as `python3`, `python` or `py`.

```bash
npm install
pip install -r requirements.txt
npm run fetch      # downloads from USGS, takes a few minutes
npm run fit        # soil term
npm run prep       # base map + population
npm run build      # writes index.html
```

To rebuild only the page after editing `src/`, run `npm install` and then `npm run build`.

The main navigation is Your area, Check in and About. Spoken summaries include the date, one estimate, earthquake magnitude and a relevant local condition; uncertainty ranges and model settings stay in optional detail. Comparison pins, saved-check history, simulation galleries and the alternative shaking-model switch have been removed. Older links still open their primary place using the standard estimate. The globe opens without fitting a case study or running the accuracy backtest. Charts are drawn as they come into view, and risk trends, population context and model checks sit in optional details. Map overviews are capped at 128 pixels per edge, with cached masks and images; globe drawing uses simplified outlines and a two-million-pixel budget. Place names stay visible, while population markers and future events are optional. Map shading runs in short, cancellable batches; the displayed figures still use the complete posterior. Display changes reuse the current fit, while live-data revisions clear it and the map caches. Background tabs pause polling and playback.

`scripts/fetch_usgs.mjs` is a Node port of the browser code that produced the shipped data. Every other script was checked to reproduce the files in `data/` exactly. To add an earthquake, append its USGS event ID to `MAINS` in `fetch_usgs.mjs` and its country to `SEQC` in `prep_population.js`.

## Limitations

- **Prototype, not safety advice.** Whether a building is safe to enter is decided by a structural inspection and local authorities. This tool only covers the chance of more shaking.
- **Live quakes have less data.** Ground-failure maps (liquefaction, landslides) are not loaded for live earthquakes, the coastline is 1:50m Natural Earth, and towns are limited to 5,000+ people. A ShakeMap only exists for some quakes, usually M5.5+, and is often an automatic first version. A live forecast is not an official USGS aftershock forecast.
- **Case studies are snapshots.** Catalogue entries include later revisions, and mainshock ShakeMaps may have been processed years after the replay time. Filtering by origin time does not reconstruct the data available then.
- **Model scope.** A single prior is used globally. Shaking uses a fixed 10 km depth, an active-crust equation, an experimental soil term, M5 to below M8.5, and a 400 km source-distance cutoff. Smaller aftershocks can still cause damage.
- **Resolution** follows each ShakeMap grid: about 1 km for Türkiye and 1.8–3.7 km elsewhere. It's neighbourhood-scale, not street-by-street.
- **No global data** for nearby trees, walls, power lines or dams. The app asks the user instead, and that only changes the advice on where to wait.
- **Check-ins** require a configured Tiger Data database and the API routes. A standalone file or static GitHub Pages copy cannot save shared posts. Anyone with a group invite can see its entries; these are anonymous self-reports and do not contact emergency services. See [setup and visibility](docs/checkins.md).
- Town populations are point counts from GeoNames, so rural homes aren't included.

## Data and credits

- Earthquake catalogue, ShakeMap, ground failure and PAGER: [U.S. Geological Survey](https://earthquake.usgs.gov) (public domain).
- PAGER fatality model: [usgs/pager](https://github.com/usgs/pager), after Jaiswal & Wald.
- Intensity equation: Allen, Wald & Worden (2012), via [OpenQuake](https://github.com/gem/oq-engine).
- Coastlines and borders: [Natural Earth](https://www.naturalearthdata.com) via `world-atlas` (public domain).
- Places and populations: [GeoNames](https://www.geonames.org) via `cities.json` and `all-the-cities` (CC BY 4.0).
- Font: [Public Sans](https://public-sans.digital.gov) (SIL Open Font License), from Google Fonts.
- Map library: [Leaflet](https://leafletjs.com) (BSD-2-Clause); globe: [d3-geo](https://d3js.org/d3-geo) (ISC) and [topojson-client](https://github.com/topojson/topojson-client) (ISC). All bundled into `index.html` by the build.
