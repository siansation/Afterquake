# Aftershock Re-entry: 5-minute pitch

**One line:** After a big earthquake, millions of people sleep outside because nobody can tell them when it's safe to go back in. We turn live USGS data into an answer for their exact spot.

**Theme fit:** *Time*: risk fades over hours and days, and we turn it into a time to act. *Data for prediction and decision making*: a forecast becomes a yes/no decision at the user's own risk level, checked against what really happened.

## Before you go on

- [ ] Open `index.html` in Chrome (works offline; no Wi-Fi needed).
- [ ] Press **Fullscreen**, then **▶ Story**. Use **→** (or a presentation clicker) to advance and **←** to go back.
- [ ] Zoom the browser to 110–125% if the screen is large or far away.
- [ ] Backup: the hosted link on a phone, and `docs/screenshot.png`.
- [ ] Have the **Accuracy** and **Sources** tabs ready for questions.

## Script (5:00)

| Time | Screen | Say |
|---|---|---|
| **0:00–0:30** | Welcome screen | "February 2023. An M7.8 earthquake hits Türkiye and Syria. Over 50,000 people die, and in the following nights millions sleep outside in freezing weather. They all ask the same question: *when is it safe to go back in?* Official advice is basically 'stay out' with no end date. We built a tool that gives a real answer." |
| **0:30–0:55** | Story 1: mainshock shaking | "This is the actual USGS shaking map. About 2.7 million people felt severe shaking or worse. Every one of them has a different answer, because it depends on where they are and what they live in." |
| **0:55–1:25** | Story 2: pick a spot | "Pick a spot, say Kahramanmaraş, seven hours in. For a typical local building there's about a 6% chance of damaging shaking in the next 24 hours. Instead of a percentage, we give a **time**: when going back in fits the level of risk you choose." |
| **1:25–2:05** | Story 3: the M7.5 | "Watch the clock. Nine hours after the first quake, an M7.5 hit near Elbistan. Our model only uses data available at each moment, and two hours before it, it put an M7+ that day at about 1 in 60. Unlikely, but not zero. That's exactly why a one-off 'all clear' is dangerous and the forecast has to update with every new quake." |
| **2:05–2:40** | Story 4: Kâhta, 3 km circle | "It also depends on your street. Soft ground shakes harder. Inside this 3 km circle, the 7-day chance ranges from 3% to 43%. A city-wide warning can't tell those people apart; we can." |
| **2:40–3:10** | Story 5: Japan | "And on your country. USGS's casualty records show severe shaking killed about 1 in 880 exposed people in Türkiye, and about 1 in 22,000 in Japan. So the same shaking leads to a different decision, and we build that in automatically." |
| **3:10–3:50** | Story 6: Accuracy tab | "Does it work? We replayed 13 real earthquakes, forecasting each week using only what was known at the time. It clearly beats a naive forecast for medium aftershocks, scoring 0.51. For the biggest ones it's only roughly right, and we say so on screen. Where two shaking models disagree, we default to the cautious one." |
| **3:50–4:25** | Story 7: People tab | "It's built for the people waiting outside: who's at risk this week, town by town, and opt-in 'I'm safe' / 'I need help' check-ins on a shared map." |
| **4:25–5:00** | Back to the map | "Under the hood: the USGS earthquake catalogue, ShakeMaps, ground-failure maps and PAGER casualty models, all free and public, plus the same aftershock model USGS uses. That means it works for the **next** big earthquake within hours. Every number on screen links to its source. Aftershock Re-entry: from data to a decision you can act on." |

If you're running long, cut step 7 and say its line over step 6.

## Likely questions

**Isn't telling people it's safe dangerous?**
We never say a building is safe. That needs a structural inspection. We forecast the chance of *more shaking* and show it at the risk level the person chooses. The app says this on every verdict.

**Doesn't USGS already do this?**
USGS publishes regional aftershock odds, like "a 1 in 3 chance of an M6+ this week somewhere in the area". We turn that into a time for a specific spot, building type and country, adding soil, how hard that spot already shook, liquefaction, and local building vulnerability.

**How do you know it works?**
Two checks, both in the Accuracy tab: a replay of 93 seven-day forecasts across 13 earthquakes (skill 0.51 for M5+), and a comparison of our shaking equation against USGS ShakeMaps of 26 real aftershocks.

**How precise is "street level"?**
Neighbourhood level: about 1 km in Türkiye and 2–4 km elsewhere, set by the USGS ShakeMap grids. Finer soil maps exist for some cities and could plug straight in.

**What's your rule for damage?**
For "typical local building" we use the shaking level at which USGS PAGER's record shows 1 in 10,000 exposed people died in that country. That's our design choice, and the Sources tab marks it as one. Users can also pick their building type directly.

**Who would use or pay for this?**
Emergency agencies and NGOs deciding when to send people home or where to put shelters, insurers, and the public through a simple app. It could also feed messaging services that alert people when re-entry becomes reasonable.

**What about privacy for check-ins?**
Opt-in only. Only people with contributor access to the page can see them, and you can delete yours at any time.

**What would you build next?**
Live ingestion of new earthquakes, finer city soil maps, building data from OpenStreetMap, SMS/WhatsApp alerts when your re-entry time arrives, and multiple languages.
