# Aftershock Re-entry: 5-minute pitch

**One line:** After a big earthquake, millions of people sleep outside because nobody can tell them when it's safe to go back in. We use recorded USGS data to explore aftershock shaking near a chosen spot, with explicit uncertainty and limits.

**Theme fit:** *Time*: risk fades over hours and days, and we turn it into a time to act. *Data for prediction and decision making*: a forecast becomes a projected threshold-crossing time at a chosen risk level, checked against what really happened.

## Before you go on

- [ ] Open `index.html` in Chrome (works offline; no Wi-Fi needed).
- [ ] Press **Fullscreen**, then **▶ Story**. Use **→** (or a presentation clicker) to advance and **←** to go back.
- [ ] Zoom the browser to 110–125% if the screen is large or far away.
- [ ] Backup: the hosted link on a phone, and `docs/screenshot.png`.
- [ ] Have the **Accuracy** and **Sources** tabs ready for questions.

## Script (5:00)

| Time | Screen | Say |
|---|---|---|
| **0:00–0:30** | Welcome screen | "February 2023. An M7.8 earthquake hits Türkiye and Syria. Over 50,000 people die, and in the following nights millions sleep outside in freezing weather. They all ask the same question: *when is it safe to go back in?* Entry still needs inspection and authority guidance. We explore one part of that decision: the chance of more shaking." |
| **0:30–0:55** | Story 1: mainshock shaking | "This is the actual USGS shaking map. About 2.7 million people felt severe shaking or worse. Every one of them has a different answer, because it depends on where they are and what they live in." |
| **0:55–1:25** | Story 2: pick a spot | "Pick a spot, say Kahramanmaraş, seven hours in. For a typical local building read the updated next-24-hour shaking probability on screen. Instead of a percentage, we give a **time**: when this model falls below a chosen limit. This is not building clearance." |
| **1:25–2:05** | Story 3: the M7.5 | "Watch the clock. Nine hours after the first quake, an M7.5 hit near Elbistan. Our rate fit excludes events with later origin times, but the catalogue contains subsequent revisions, and two hours before it, it put an M7+ that day at about 1 in 60. Unlikely, but not zero. That's exactly why a one-off 'all clear' is dangerous and the forecast has to update with every new quake." |
| **2:05–2:40** | Story 4: Kâhta, 3 km circle | "Our estimate also depends on local ground conditions. Soft ground shakes harder. Inside this 3 km circle, read the updated 7-day range on screen. The input grid is about 1 km here; this is not a street survey or validated damage estimate." |
| **2:40–3:10** | Story 5: Japan | "USGS PAGER models population fatality rates by country and shaking intensity. Our prototype converts those modelled rates into different intensity thresholds. This is a heuristic, not an individual building assessment or a measured level of preparedness." |
| **3:10–3:50** | Story 6: Accuracy tab | "Does it work? We scored 93 complete regional forecast windows across 12 sequences using a revised catalogue. M5+ skill is 0.55 against a reference estimated from the other sequences. M6+ skill is -0.01, slightly worse than that reference. These checks do not validate point shaking, damage or safe entry." |
| **3:50–4:25** | Story 7: People tab | "It's built for the people waiting outside: who's at risk this week, town by town, and opt-in 'I'm safe' / 'I need help' check-ins on a shared map." |
| **4:25–5:00** | Back to the map | "Under the hood: the USGS earthquake catalogue, ShakeMaps, ground-failure maps and PAGER casualty models, all free and public, plus a simplified model from the Reasenberg-Jones family. USGS operational forecasts use regional parameters and more detailed handling of missing early events. Live ingestion and operational validation remain future work. Every number on screen links to its source. Aftershock Re-entry: from data to a decision you can act on." |

If you're running long, cut step 7 and say its line over step 6.

## Likely questions

**Isn't telling people it's safe dangerous?**
A model threshold crossing is not permission to enter. Building safety needs an inspection and local authority guidance. We forecast the chance of *more shaking* and show it at the risk level the person chooses. The app says this on every verdict.

**Doesn't USGS already do this?**
USGS publishes regional aftershock odds, like "a 1 in 3 chance of an M6+ this week somewhere in the area". We turn that into a time for a specific spot, building type and country, adding soil, how hard that spot already shook, liquefaction, and local building vulnerability.

**How do you know it works?**
Two checks, both in the Accuracy tab: 93 complete regional seven-day forecast windows across 12 sequences (M5+ skill 0.55; M6+ -0.01 against a reference from the other sequences), and in-sample comparisons against 26 aftershock ShakeMaps. The latter are not independent validation of local shaking.

**How precise is "street level"?**
Neighbourhood level: about 1 km in Türkiye and 2–4 km elsewhere, set by the USGS ShakeMap grids. Finer soil maps exist for some cities and could plug straight in.

**What's your rule for damage?**
For "typical local building" we use the intensity at which USGS PAGER's country model estimates a fatality rate of 1 in 10,000, clamped to the prototype's threshold range. That conversion is our design choice, not a building fragility model. The Sources tab explains it. Users can also select heuristic thresholds by building type.

**Who would use or pay for this?**
Emergency agencies and NGOs deciding when to send people home or where to put shelters, insurers, and the public through a simple app. It could also feed messaging services that alert people when re-entry becomes reasonable.

**What about privacy for check-ins?**
Opt-in only. Only people with contributor access to the page can see them, and you can delete yours at any time.

**What would you build next?**
Live ingestion of new earthquakes, finer city soil maps, building data from OpenStreetMap, SMS/WhatsApp alerts when your re-entry time arrives, and multiple languages.

## Accuracy note

Numbers changed after fixing discarded posterior probability and aligning the simulations with the formula. Use the current screen values. The recorded data is a retrospective snapshot, not live ingestion or an as-issued hindcast. See [the model audit](docs/model-audit.md).

## Optional 3.1 feature demonstration

1. Change the exposure from 10 minutes to 8 hours. The estimate, parameter range, projected start and curve update for that whole interval.
2. Select **Choose B on map**, then click another place. A stays fixed; the blue B pin is compared at the same intensity threshold and replay time. These are model comparisons, not verified shelters.
3. Select **Save this check**, then advance the replay past more earthquakes. **Since your saved check** explains newly visible catalogue entries, elapsed time and any settings changes. The baseline stays fixed until explicitly saved again.
