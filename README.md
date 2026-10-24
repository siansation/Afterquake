# Aftershock Re-entry

**After a big earthquake, when is it reasonable to go back inside?**

Aftershock Re-entry forecasts the chance of *damaging shaking at a spot you choose* over the next 24 hours, 7 days and 30 days, then turns it into a time when re-entry fits the level of risk you'll accept. It runs on real USGS data for 13 earthquakes, from Türkiye 2023 to sequences still going in 2026, and you can rewind each one to see what the model would have said and what actually happened next.

Built at OxHack 2026 (themes: time; data for prediction and decision making).

![Map view of the 2023 Kahramanmaraş sequence](docs/screenshot.png)

## Try it

Open `index.html` in a browser. It's one self-contained file (about 6 MB, with the data and map library inside), so it works offline. Only the fonts need internet, and they fall back to system fonts without it.

- **▶ Story** (top right) runs a 7-step guided demo of the Türkiye 2023 sequence. Use **→ / ←** or a presentation clicker to move between steps, and **Esc** to exit.
- **?** reopens the welcome screen. **Space** plays the timeline. **Fullscreen** is for presenting.
- [`PITCH.md`](PITCH.md) has a timed 5-minute script that follows the story, plus answers to likely questions.

To host it, push this repo to GitHub, go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and the app will be served at `https://<your-username>.github.io/aftershock-reentry/`.

## What it does

- **Story mode.** A guided 2-minute demo of the Türkiye 2023 sequence, built for pitching.
- **Map-first console.** Click anywhere, or search a town, to set your spot. Play the timeline to watch the sequence unfold. Aftershocks are coloured by age, as on USGS maps.
- **Forecast at your spot.** The chance of shaking strong enough to damage your type of building, a re-entry time at your risk limit, and a curve of how the risk fades.
- **200 simulated futures.** Monte Carlo runs of the next 30 days, in which big simulated aftershocks trigger their own.
- **Danger factors.** Distance to aftershock activity, ground softness (Vs30), how hard your spot already shook, liquefaction and landslide models, the country's building vulnerability (USGS PAGER), and distance to the coast (tsunami).
- **People.** Population near you, people at risk this week, and the official count of people who felt each shaking level.
- **Opt-in safety check-ins.** Mark yourself safe or in need of help. This needs a shared database (see [Limitations](#limitations)).
- **Sources and accuracy tabs.** Every number links to where it came from, and the model is backtested on all 13 sequences.

## How the forecast works

| Step | Method | Source |
|---|---|---|
| How many aftershocks | Reasenberg–Jones (1989) model, updated by Bayes' rule with the sequence's own M5+ aftershocks | Global starting values from Page et al. (2016), the basis of USGS operational aftershock forecasts |
| Where | Future aftershocks cluster around past ones (6 km smoothing, 10 km depth) | USGS ComCat catalogue |
| How hard at your spot | Allen, Wald & Worden (2012) intensity equation, including its scatter | As implemented in OpenQuake |
| Your ground | Soil term `ΔMMI = -1.76 × log10(Vs30/760)`, fitted by us to 86,234 ShakeMap cells (90% range -1.99 to -1.25) | USGS ShakeMap Vs30 grids |
| Your building | Modified Mercalli damage levels, or for "typical local building", the intensity where the country's fatality rate reaches 1 in 10,000 | USGS PAGER empirical fatality model |
| Already weakened | Threshold drops one level if the spot shook near that level in the mainshock, or if 10% or more of the ground is expected to have liquefied | USGS ShakeMap and ground-failure products |

The rules marked "our rule" in the app (the PAGER-based threshold, the 10% liquefaction cut-off, the one-level drop) are our design choices, not published standards.

## How accurate is it?

- **Aftershock counts (93 seven-day forecasts):** skill 0.51 for M5+ compared with always guessing the average rate (0 = no better, 1 = perfect). For M6+ it is roughly calibrated but no better than the average (-0.09); big aftershocks are rare and hard to forecast.
- **Shaking (26 aftershock ShakeMaps):** USGS ShakeMaps average 0.9 intensity *below* the felt-report equation. The best-reported aftershock (Türkiye M6.3, 449 citizen reports) shook *harder* than the equation close in. The app defaults to the cautious equation and shows the ShakeMap-calibrated figure beside it.

Run `npm run backtest` to reproduce the first check.

## Repo layout

```
index.html                 built app, ready to open or host (works offline)
PITCH.md                   5-minute pitch script and Q&A
src/template.html          app UI and logic (placeholders filled by the build)
src/model.js               aftershock rate model (Reasenberg–Jones + Bayesian update)
src/shake.js               shaking at a point: intensity equation, soil term, probabilities
data/                      everything the app embeds
  sequences.json           catalogue + ShakeMap grids (MMI, Vs30) for 13 quakes
  ground-failure-and-pager.json  liquefaction/landslide grids, PAGER exposure and building notes
  basemap.json             coastlines, borders, town names per area
  population.json          town populations, PAGER country fatality curves
  aftershock-shakemap-check.json  equation vs ShakeMap gaps for 26 aftershocks
  site-term-fit.json       fitted soil coefficient
scripts/
  fetch_usgs.mjs           download catalogue, ShakeMaps, ground failure and PAGER from USGS
  fit_site_term.py         fit the soil term to the ShakeMaps
  prep_basemap.js          clip Natural Earth + GeoNames to each area
  prep_population.js       town populations + PAGER curves
  build.py                 assemble index.html (inlines the fitted soil term into src/shake.js)
  python.mjs               run Python as python3, python or py, whichever the machine has
  backtest.js              score the aftershock model
docs/screenshot.png
```

## Rebuild from scratch

Needs Node 18+ and Python 3 with numpy. Works on Windows, macOS and Linux: the npm scripts find Python whether it's installed as `python3`, `python` or `py`.

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
- Map library: [Leaflet](https://leafletjs.com) (BSD-2-Clause), bundled into `index.html` by the build.
