# Aftershock Re-entry

**After a big earthquake, how does the estimated risk of further shaking change?**

Aftershock Re-entry estimates the chance of shaking above a chosen intensity at a location over an exposure you choose, plus the next 24 hours, 7 days and 30 days. It projects when the chance during your chosen exposure falls below a limit. It uses bundled USGS data for 13 earthquakes and a simplified Reasenberg-Jones model. It is a retrospective prototype; building inspection and local authorities determine whether entry is safe.

Built at OxHack 2026 (themes: time; data for prediction and decision making).

![Live globe of USGS earthquakes from the last 30 days](docs/globe.jpg)

![Map view of the 2023 Kahramanmaraş sequence](docs/map.jpg)

## Try it

Open `index.html` in a browser. It's one self-contained file (about 10 MB, with the data, map libraries and world outlines inside). The 13 case studies work offline; the live world view needs internet to reach USGS. The fonts also need internet, and fall back to system fonts without it.

- **Story** (top right) runs a 7-step guided demo of the Türkiye 2023 sequence. Use **→ / ←** or a presentation clicker to move between steps, and **Esc** to exit.
- The page opens on the **live globe**: drag to spin, scroll to zoom, click a quake, then **Open the forecast**. **World map** in the header comes back to it.
- **Help** reopens the welcome screen. **Space** plays the timeline. **Fullscreen** is for presenting.
- [`PITCH.md`](PITCH.md) has a timed 5-minute script that follows the story and ends on the live globe, plus answers to likely questions.

**Live at https://afterquake.vercel.app** (Vercel). `vercel.json` serves the prebuilt `index.html` as it is, with no install or build step, and `.vercelignore` also includes the assistant's API function. The page asks search engines not to index it (a `robots` meta tag and an `X-Robots-Tag` header); the URL is still public. To redeploy after `npm run build`, run `npx vercel@65.2.0 deploy --prod`; `npx vercel@65.2.0 login` first on a new machine.

It also works on GitHub Pages: in the repo's **Settings → Pages**, choose **Deploy from a branch**, then `main` and `/ (root)`.

## What it does

- **Live world view.** The page opens on a globe of every M4.5+ earthquake in the last 30 days, from the USGS feed and checked every 2 minutes. Drag to spin, scroll to zoom, click a quake. Any quake with a USGS ShakeMap opens the same forecast, built in the browser from its live catalogue, ShakeMap and PAGER report. While open, all three are checked every 2 minutes; revised products replace earlier versions without resetting your pins or selected time. **Refresh USGS** checks immediately; **Go to live time** resumes following the latest data. Failed or delayed updates are labelled, with the last successful data retained. The 13 case studies are the red stars.
- **Story mode.** A guided 2-minute demo of the Türkiye 2023 sequence, built for pitching.
- **Map-first console.** Click anywhere, or search a town, to set your spot. Play the timeline to watch the sequence unfold. Aftershocks are coloured by age, as on USGS maps.
- **Exposure duration.** Choose 5, 10 or 30 minutes, 1 hour, 8 hours or 24 hours. The probability, parameter range, projected start and curve use that entire interval. The 24-hour, 7-day and 30-day context figures remain available.
- **Compare two places.** Keep your spot A and choose B on the map or by town search. Compare shaking over the selected duration, ground softness, mainshock intensity, modelled ground-failure extent and coast proximity. Both places use the same intensity threshold; neither is a verified shelter.
- **Since your saved check.** Save a check, then move the replay timeline, change assumptions or return after a data update. The explanation distinguishes elapsed time, newly visible events, revised past entries, location/settings changes and data/model updates. **Restore saved setup** restores A, B and settings while keeping the current forecast time and the saved baseline. Checks remain in this browser, with a session-only fallback if storage is blocked. This is not a live news or alert feed.
- **Share a comparison.** **Share view** copies a link containing the earthquake, both pins, settings and exact selected UTC time. Opening it recalculates the figures using the available data, so later revisions can change the result. Links require an HTTP(S)-hosted copy; clipboard restrictions fall back to manual copying. The link includes the coordinates and place names you choose to share.
- **Read the figures aloud.** **Read summary** uses English voices supplied by the browser or device, with stop and speed controls and a text transcript. It reads the calculated figures directly, includes stale-data warnings and stops if the forecast changes. No speech API key is needed; available voices depend on the device.
- **Forecast at your spot.** Modelled intensity exceedance from M5+ aftershocks, a projected threshold-crossing time, and a curve of how the estimate changes. A 90% parameter range describes fitted rate uncertainty, excluding other model errors.
- **200 simulated futures.** Monte Carlo runs from the same posterior and marked Poisson process as the displayed formula. This model does not simulate secondary triggering (ETAS).
- **Danger factors.** Distance to aftershock activity, ground softness (Vs30), how hard your spot already shook, liquefaction and landslide models, a country fatality proxy (USGS PAGER; not building fragility), and distance to the coast (tsunami).
- **People.** Population near you, people at risk this week, and the official count of people who felt each shaking level.
- **Ask about this forecast.** A chat bubble in the bottom-left corner of the forecast map, answered by Google Gemini. Gemini doesn't guess: it calls the page's own forecast as tools (forecast at a place or for a different stay, how the risk changes over time, danger factors, aftershocks so far, people at risk, method and limits), and each answer lists what it checked. It never clears a building for entry. Runs on the hosted site only (see [the assistant](#the-assistant)).
- **Opt-in safety check-ins.** Mark yourself safe or in need of help. This needs a shared database (see [Limitations](#limitations)).
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

The 26 aftershock ShakeMap comparisons are in-sample diagnostics, not independent calibration. The optional -0.90 intensity offset is an event-average gap; it is not evidence that the unadjusted equation is always conservative. The soil term was fitted to mainshock grids using a different distance formulation and then transferred to the aftershock equation.

See [the model audit](docs/model-audit.md) for numerical fixes, evidence, sources and remaining scientific limits. The CLI and the Accuracy tab share the validation implementation.

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
PITCH.md                   5-minute pitch script and Q&A
src/template.html          app UI and logic (placeholders filled by the build)
src/model.js               aftershock rate model (Reasenberg–Jones + Bayesian update)
src/shake.js               shaking, uncertainty ranges and consistent Monte Carlo futures
src/validation.js          regional occurrence checks shared by the UI and CLI
src/scenario.js            duration estimates and saved-check change explanations
src/planner.js             browser controls for comparison pins and local saved checks
src/view-state.js          validated share-link inputs and saved-setup conversion
src/spoken.js              deterministic captions from the current calculated figures
src/access.js              sharing, restore and device speech controls
src/live-controls.js       version-aware live refresh and visible update status
src/assistant.js           "Ask about this forecast": the tools Gemini calls, run on the page's own model
api/chat.js                Vercel serverless function: holds the Gemini key, safety rules and tool list, rate-limits
src/globe.js               world view: canvas globe drawn with d3-geo
src/live.js                live USGS feed and per-quake loader for the browser (mirrors fetch_usgs.mjs)
tests/forecast.test.js      numerical, simulation and data-integrity regression tests
tests/scenario.test.js      exposure windows, threshold crossings and change attribution
tests/planner.test.js       controller workflows with DOM/map/storage test doubles
tests/live.test.js          live loader: grid parsing, 180° handling, coast clipping, PAGER
tests/live-refresh.test.js  revised products, retries, timeouts and invalid responses
tests/live-controls.test.js refresh caching, time/pin preservation and navigation races
tests/view-state.test.js    share-link validation and deterministic summary wording
tests/access.test.js        sharing, restore and speech controller workflows
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

`api/chat.js` runs on Vercel and calls the Gemini API (`generateContent` with function calling). The default model is `gemini-3.5-flash-lite` with minimal thinking, which answers in about a second per step; `gemini-3.8-flash` took 30 to 50 s. Set `GEMINI_MODEL` or `GEMINI_THINKING` to change them. Every new question must start with a tool call, so figures can't be reused or invented. Gemini replies with tool calls, the browser runs them against the open forecast (`src/assistant.js`), and the results go back to Gemini, so every figure comes from the model on the page. The function only accepts this app's message shapes and tool names, and allows about 40 requests per visitor per 10 minutes.

It needs a Gemini API key (free from [Google AI Studio](https://aistudio.google.com/apikey)) stored as a Vercel environment variable, never in the code:

```bash
npx vercel@65.2.0 env add GEMINI_API_KEY production   # paste the key when asked
npx vercel@65.2.0 deploy --prod                       # redeploy so the function sees it
```

Opened from a file or the local Python server, the box says the assistant only works on the hosted site; everything else still works.

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

`scripts/fetch_usgs.mjs` is a Node port of the browser code that produced the shipped data. Every other script was checked to reproduce the files in `data/` exactly. To add an earthquake, append its USGS event ID to `MAINS` in `fetch_usgs.mjs` and its country to `SEQC` in `prep_population.js`.

## Limitations

- **Prototype, not safety advice.** Whether a building is safe to enter is decided by a structural inspection and local authorities. This tool only covers the chance of more shaking.
- **Live quakes have less data.** Ground-failure maps (liquefaction, landslides) are not loaded for live earthquakes, the coastline is 1:50m Natural Earth, and towns are limited to 5,000+ people. A ShakeMap only exists for some quakes, usually M5.5+, and is often an automatic first version. A live forecast is not an official USGS aftershock forecast.
- **Case studies are snapshots.** Catalogue entries include later revisions, and mainshock ShakeMaps may have been processed years after the replay time. Filtering by origin time does not reconstruct the data available then.
- **Model scope.** A single prior is used globally. Shaking uses a fixed 10 km depth, an active-crust equation, an experimental soil term, M5 to below M8.5, and a 400 km source-distance cutoff. Smaller aftershocks can still cause damage.
- **Resolution** follows each ShakeMap grid: about 1 km for Türkiye and 1.8–3.7 km elsewhere. It's neighbourhood-scale, not street-by-street.
- **No global data** for nearby trees, walls, power lines or dams. The app asks the user instead, and that only changes the advice on where to wait.
- **Check-ins** use the shared database of the Claude-hosted version. A standalone copy (e.g. GitHub Pages) shows them as unavailable until it's given its own backend.
- Town populations are point counts from GeoNames, so rural homes aren't included.

## Data and credits

- Earthquake catalogue, ShakeMap, ground failure and PAGER: [U.S. Geological Survey](https://earthquake.usgs.gov) (public domain).
- PAGER fatality model: [usgs/pager](https://github.com/usgs/pager), after Jaiswal & Wald.
- Intensity equation: Allen, Wald & Worden (2012), via [OpenQuake](https://github.com/gem/oq-engine).
- Coastlines and borders: [Natural Earth](https://www.naturalearthdata.com) via `world-atlas` (public domain).
- Places and populations: [GeoNames](https://www.geonames.org) via `cities.json` and `all-the-cities` (CC BY 4.0).
- Font: [Public Sans](https://public-sans.digital.gov) (SIL Open Font License), from Google Fonts.
- Map library: [Leaflet](https://leafletjs.com) (BSD-2-Clause); globe: [d3-geo](https://d3js.org/d3-geo) (ISC) and [topojson-client](https://github.com/topojson/topojson-client) (ISC). All bundled into `index.html` by the build.
