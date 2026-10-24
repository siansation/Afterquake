# Afterquake model and data audit

Reviewed 24 October 2026, including the latest upstream changes through `e2eb709`.
The source snapshot was downloaded from USGS at `2026-10-24T17:32:53.517Z`.
The upstream cross-platform build and fitted soil coefficient (`k=-1.757`) are preserved.

## Findings and changes

| Finding | Evidence | Change |
|---|---|---|
| Point probabilities lost posterior mass | `SHAKE.compact(f).slice(0,160)` retained only 47.62% of the early prior. A diagnostic with a hypothetical per-event exceedance chance of 0.1 gave about 24% instead of 52% for the next day. This is a numerical example, not a building-specific estimate. | Keep every posterior weight. Tests compare the point calculation with an independent sum over the full rate posterior across all 13 sequences and three horizons. |
| Formula and simulated futures represented different models | The displayed formula used a Reasenberg–Jones mixture; the simulation added one generation of secondary triggering, different source jitter and a different magnitude treatment. | Simulate daily marks from the same posterior, magnitude distribution and shaking lookup table. No extra branching process. Seeded Monte Carlo frequencies agree with analytic 1-, 7- and 30-day probabilities within sampling variation. |
| Magnitude integration did not exactly match its stated support | Floating point increments could create an extra bin beyond 8.5; the table also omitted the tail without normalising the retained mass. | Use integer-indexed bins and explicitly normalise the truncated M5 to below M8.5 distribution. |
| Parameter uncertainty was hidden | Only a mean probability was shown. | Add a 90% equal-tail range over fitted rate parameters. It excludes uncertainty in ground conditions, spatial sources, building thresholds and model choice. |
| Accuracy claims overstated the test | The 93 complete seven-day windows cover 12 sequences; Nagqu has insufficient follow-up. Windows overlap, and the catalogue has subsequent revisions. | Share one validation implementation between the CLI and UI. State the scope and use a reference frequency calculated from the other sequences, excluding the entire target sequence. |
| Shaking calibration reused its evaluation data | The soil coefficient and optional offset came from the same collection of mainshock/aftershock products being discussed. Missing far-distance bins were also treated as zero. | Label the offset as in-sample, describe the soil-term transfer, and average only available distance-bin means. |
| Source and decision labels overstated precision | The page described bundled data as live and a model threshold as reasonable re-entry. Some mainshock grids were processed years after the replay time. | Show the snapshot date, retrospective scope, grid spacing and product processing time. Describe the output as a projected model threshold, with inspection and authority guidance required for entry. |
| Map and point thresholds could disagree near borders | The heat map used the sequence country everywhere while the pin used the nearest town's country. | Apply the same country approximation to map cells and the pin. It remains an approximation, not a boundary or building survey. |

The integral now uses `log1p` and `expm1` for numerical stability. The likelihood uses sufficient statistics without changing the statistical model. Repeated interval rates are cached to keep the full posterior practical for the map.

Version 3.1 adds selected exposure windows from 5 minutes to 24 hours. The projected start and curve integrate that full window after each candidate start; the 24-hour default preserves the earlier behaviour. Location comparisons hold the intensity threshold fixed at both pins. Saved-check explanations distinguish elapsed time, newly visible catalogue entries, revised earlier entries and changed assumptions; they use browser-local storage with a session-only fallback and do not provide live alerts.

## Data verification

Read-only requests to the official USGS event and count services matched all 13 bundled mainshock magnitudes, origin times and coordinates. Regional M5+ counts also matched for the recorded radius and coverage window:

| Sequence | Bundled / USGS M5+ count |
|---|---:|
| Türkiye | 39 / 39 |
| Nepal | 32 / 32 |
| Darfield | 9 / 9 |
| Noto | 16 / 16 |
| Kaikōura | 41 / 41 |
| Ridgecrest | 5 / 5 |
| Myanmar | 5 / 5 |
| Kumamoto | 16 / 16 |
| Ecuador | 18 / 18 |
| Morocco | 1 / 1 |
| Flores | 63 / 63 |
| Panama | 20 / 20 |
| Nagqu | 4 / 4 |

These are aggregate catalogue checks, not verification of every event or grid value. `npm run audit:data` repeats them without changing the snapshot. All bundled shaking and ground-failure arrays also passed dimension checks.

## Regional occurrence results

The rate-model predictions are effectively unchanged; the major probability correction was in the point-forecast interface, which the old regional backtest did not exercise.

| Seven-day target | Windows | Occurrences | Mean forecast | Observed | Model Brier | Other-sequence reference Brier | Skill |
|---|---:|---:|---:|---:|---:|---:|---:|
| M5+ | 93 | 45 | 57.3% | 48.4% | 0.121 | 0.270 | 0.55 |
| M6+ | 93 | 14 | 19.4% | 15.1% | 0.140 | 0.138 | -0.01 |

Lower Brier is better; skill is `1 - model Brier / reference Brier`. For each target sequence, its reference is the observed frequency in the other sequences. This baseline does not use the target sequence's outcomes, but is **not chronological**: some reference sequences happened later. The previous pooled baseline remains in the CLI as a descriptive comparison (skills 0.51 and -0.09).

M6+ occurrence does not beat the reference. In the highest forecast band, its average forecast is about 70%, while occurrence is 25% across just eight windows. The results do not establish calibration of large aftershocks, local intensity exceedance, damage, or re-entry decisions. No independent confidence interval is claimed for these correlated windows.

Machine-readable metrics and limitations are in [validation-report.json](../data/validation-report.json). Regenerate them with `npm run backtest -- --json` after a data update.

## Scientific limits that remain

1. **One prior across tectonic regimes.** USGS operational forecasts use regional parameters and account more carefully for missing early events. This prototype uses fixed `b=1`, `c=0.018`, a prior over `a,p`, M5+ fitting and a fixed initial exclusion window. It is not a reproduction of the USGS operational product. The prior for `p` is also truncated by the implemented grid.
2. **No secondary triggering.** Reasenberg–Jones does not provide the requested ETAS behaviour in which every event triggers its own sequence. A consistent ETAS replacement would need joint fitting, stable branching, catalogue completeness treatment and held-out testing. Appending offspring only to the simulation does not solve this.
3. **Simplified local shaking.** Fixed 10 km depth, a 6 km distance smoothing term, past epicentres as source proxies, an active-crust intensity equation, 0.5 km / 0.05 MMI lookup increments, M5 to below M8.5 and a roughly 400 km cutoff. Smaller nearby events can cause damage. The resulting probability is conditional on these exclusions and approximations.
4. **Experimental soil transfer.** `fit_site_term.py` fits a slope to later mainshock ShakeMaps using a rupture-distance equation and early-aftershock rupture proxy. `shake.js` applies it to a hypocentral-distance aftershock equation. Those are different formulations. The mainshock fit does not establish out-of-sample aftershock accuracy; leave-one-sequence-out fitting and independent observations are needed before changing or validating that coefficient.
5. **Heuristic damage thresholds.** PAGER estimates population fatality, not an individual building's fragility, code compliance or inspection status. Converting a fatality rate to an intensity threshold, and dropping that threshold for prior shaking or liquefaction, are prototype rules. Nearest-town country inference is also approximate.
6. **Retrospective inputs.** Later catalogue revisions, ShakeMaps, ground-failure products and fitted coefficients prevent a strict as-issued hindcast. Origin-time filtering prevents future earthquake occurrences from entering the fitted rate, but does not remove those other retrospective inputs.
7. **No complete secondary-hazard model.** Coast distance is not tsunami probability; the regional M7+ chance must not be presented as one. River, dam, tree, wall and power-line observations have no calibrated numerical contribution to this shaking forecast.

The next scientific priorities are an independent local-shaking evaluation by held-out earthquake, region-appropriate rate and ground-motion models, explicit early-catalogue completeness, and an as-issued validation dataset. Parameter tuning on the current retrospective examples would not establish better real-world accuracy.

## Verification and primary sources

- `npm test`: 34 numerical, simulation, data-integrity and controller tests. These cover 60,000 monthly Monte Carlo futures, cache invalidation, fitted-coefficient consistency, duration-specific threshold crossings, catalogue change explanations and local saved-check workflows. Controller tests use DOM/map/storage doubles and do not verify visual layout.
- `npm run backtest`: reproducible regional metrics from the same code as the Accuracy tab.
- `npm run build` and `npm run check`: standalone artifact rebuilt; inline scripts parsed, embedded datasets decoded and bundled numerical modules executed without CommonJS. The bundled catalogue and soil coefficient must match the source files, and browser-module forecasts must match Node forecasts.
- Browser interaction and visual layout were not verified because this session has no available browser surface.
- [USGS FDSN event service](https://earthquake.usgs.gov/fdsnws/event/1/) documents the source queries.
- [USGS aftershock scientific background](https://earthquake.usgs.gov/data/oaf/background.php) describes the Reasenberg–Jones family, regionalisation, Bayesian mixture and secondary-triggering limitations.
- [GEM OpenQuake Allen 2012 implementation](https://github.com/gem/oq-engine/blob/master/openquake/hazardlib/gsim/allen_2012_ipe.py) supplies the published hypocentral coefficients, checked against the implementation.
- [USGS aftershock forecast overview](https://earthquake.usgs.gov/data/oaf/overview.php) explains changing forecasts and product scope.
