# Aftershock Re-entry: 5-minute pitch

**One line:** After a big earthquake, people face a difficult choice about going back inside, so we use USGS data to help them understand how the chance of more shaking changes near their chosen spot.

**Theme fit:** *Time*: risk fades over hours and days, and we turn it into a time to act. *Data for prediction and decision making*: a forecast becomes a projected threshold-crossing time at a chosen risk level, checked against what really happened.

## Before you go on

- [ ] Open `index.html` in Chrome. It opens on the live globe, which needs Wi-Fi to reach USGS. The Story and the 13 case studies work offline; without Wi-Fi the globe says so and still shows the case-study stars.
- [ ] Press **Fullscreen**, then **Story**. Use **→** (or a presentation clicker) to advance and **←** to go back.
- [ ] Zoom the browser to 110–125% if the screen is large or far away.
- [ ] Backup: the hosted link on a phone, and `docs/map.jpg` / `docs/globe.jpg`.
- [ ] Have the **Accuracy** and **Sources** tabs ready for questions.

## Script (5:00)

| Time | Screen | Say |
|---|---|---|
| **0:00–0:30** | Welcome screen | "In February 2023, an M7.8 earthquake hit Türkiye and Syria. Over 50,000 people died, and in the following nights millions slept outside in freezing weather. As they waited, they faced the same question: *when is it safe to go back in?* That still needs inspection and authority guidance, so we explore one part of the decision: the chance of more shaking." |
| **0:30–0:55** | Story 1: mainshock shaking | "To understand the scale, start with the USGS shaking map. About 2.7 million people felt severe shaking or worse. But the outlook varies from place to place, because it depends on where people are and what they live in." |
| **0:55–1:25** | Story 2: pick a spot | "So let's start in Kahramanmaraş, about seven hours after the mainshock. The panel gives the next-24-hour shaking estimate for a typical local building. From there, it projects a **time** when the model falls below the person's chosen limit. That helps explain the changing aftershock risk, while building entry still needs an inspection." |
| **1:25–2:05** | Story 3: the M7.5 | "Now watch what happens as the clock moves forward. Nine hours after the first quake, an M7.5 hit near Elbistan. Two hours earlier, the model put an M7+ that day at about 1 in 60. Although later events are excluded from the fit, the catalogue does contain subsequent revisions. Even with that limitation, the example shows why a low chance is not an 'all clear', and why the estimate has to update as new quakes arrive." |
| **2:05–2:40** | Story 4: Kâhta, 3 km circle | "Timing is only part of the picture, though. Around Kâhta, softer ground sits beside firmer ground, so the model gives different shaking estimates within this 3 km circle. You can see the current 7-day range on screen. With an input grid of about 1 km here, this is a neighbourhood comparison; it cannot replace a street survey or validate building damage." |
| **2:40–3:10** | Story 5: Japan | "The building assumptions matter too, which brings us to Japan. USGS PAGER models population fatality rates by country and shaking intensity, and our prototype converts those rates into intensity thresholds. Because that conversion is our own rule, it cannot assess an individual building or measure a country's preparedness." |
| **3:10–3:50** | Story 6: Accuracy tab | "That raises the next question: how well does the model perform? We scored 93 complete regional forecast windows across 12 sequences using a revised catalogue. For M5+, skill is 0.55 against a reference estimated from the other sequences. For M6+, though, it is -0.01, slightly worse than that reference. So these checks tell us about regional occurrence; they do not validate point shaking, damage or safe entry." |
| **3:50–4:25** | Story 7: People tab | "With those limits in mind, we can bring the estimate back to the people waiting outside. The People tab shows town populations and estimated exposure over the coming week. Where the shared check-in service is available, people can also mark themselves safe or ask for help." |
| **4:25–5:00** | Back to the globe (**World map**) | "From here, we can return to the globe and explore recent earthquakes from USGS, checked every two minutes. Open one with a ShakeMap to use the same model with current data. The sources explain how the public catalogue, shaking maps and PAGER models feed into each estimate. It still needs operational validation, but this prototype lets people explore how the chance of more shaking changes with their location, time and plans." |

If you're running long, cut step 7 and say its line over step 6.

## Likely questions

**Isn't telling people it's safe dangerous?**
Building entry needs an inspection and local authority guidance, so crossing a model threshold cannot give permission to enter. We estimate the chance of *more shaking* at the risk level the person chooses, and keep that distinction beside every verdict.

**Doesn't USGS already do this?**
USGS publishes regional aftershock odds, like "a 1 in 3 chance of an M6+ this week somewhere in the area". We turn that into a time for a specific spot, building type and country, adding soil, how hard that spot already shook, liquefaction, and local building vulnerability.

**How do you know it works?**
The Accuracy tab brings together two checks: 93 complete regional seven-day forecast windows across 12 sequences (M5+ skill 0.55; M6+ -0.01 against a reference from the other sequences), and comparisons against 26 aftershock ShakeMaps. Because the ShakeMap comparisons use the same events involved in development, they do not independently validate local shaking.

**How precise is "street level"?**
Neighbourhood level: about 1 km in Türkiye and 2–4 km elsewhere, set by the USGS ShakeMap grids. Finer soil maps exist for some cities and could plug straight in.

**What's your rule for damage?**
For "typical local building" we use the intensity at which USGS PAGER's country model estimates a fatality rate of 1 in 10,000, clamped to the prototype's threshold range. That conversion is our design choice, not a building fragility model. The Sources tab explains it. Users can also select heuristic thresholds by building type.

**Who would use or pay for this?**
Emergency agencies and NGOs deciding when to send people home or where to put shelters, insurers, and the public through a simple app. It could also feed messaging services that alert people when re-entry becomes reasonable.

**What about privacy for check-ins?**
Opt-in only. Only people with contributor access to the page can see them, and you can delete yours at any time.

**Is it really live?**
Yes. The globe reads the USGS feed of M4.5+ quakes from the last 30 days every two minutes. Opening a quake downloads its catalogue, ShakeMap and PAGER report straight from USGS, and checks for revisions to all three while it is open. Failed updates are labelled and the last successful data stays visible. Only quakes with a ShakeMap (usually M5.5+) get a forecast, ground-failure maps are not loaded for live quakes yet, and it is not an official USGS forecast.

**Can I trust the chatbot?**
Gemini calls the same forecast model as the panel, then lists what it checked beneath each answer. Its instructions forbid saying a building is safe to enter, but it can still misread or misphrase a result. That is why the checks are shown alongside the reply.

**What would you build next?**
Ground-failure maps for live quakes, finer city soil maps, building data from OpenStreetMap, SMS/WhatsApp alerts when your re-entry time arrives, and multiple languages.

## Accuracy note

Numbers changed after fixing discarded posterior probability and aligning the simulations with the formula. Use the current screen values. The 13 case studies are a retrospective snapshot, not an as-issued hindcast; the live globe uses current USGS data but is not an official forecast. See [the model audit](docs/model-audit.md).

## Optional feature demonstration

0. Open the chat bubble at the bottom left of the map and click "What if I'm only inside for 20 minutes?". Gemini runs the forecast for a 20-minute stay and answers; point out the "Checked:" line under the answer.

1. Change the exposure from 10 minutes to 8 hours. The estimate, parameter range, projected start and curve update for that whole interval.
2. Select **Choose B on map**, then click another place. A stays fixed; the blue B pin is compared at the same intensity threshold and replay time. These are model comparisons, not verified shelters.
3. Select **Save this check**, then advance the replay past more earthquakes. **Since your saved check** explains newly visible catalogue entries, elapsed time and any settings changes. The baseline stays fixed until explicitly saved again.
4. Change the pins or settings, then select **Restore saved setup**. The saved comparison returns while the current time stays selected.
5. On the hosted site, select **Share view** and open the link. Both pins, settings and the exact UTC time return; figures are recalculated from the available data.
6. Select **Read summary**. It reads the calculated estimate, parameter range and limits using a device voice. Open **Voice options and text summary** to slow it down or read the transcript.
