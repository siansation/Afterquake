# Afterquake: 5-minute pitch

**One line:** After a big earthquake, millions of people wait outside because nobody can tell them how long the danger lasts. Afterquake turns live USGS data into an answer for their exact spot, in their own language.

**Tracks:** HRT Best Use of Data for Predictions and Decision Making (main target), MLH Gemini, MLH ElevenLabs, MLH Tiger Data, and the general prizes.

## The live moment

The pitch builds to one moment that only works because the product is real: **the Vanuatu aftershock sequence, happening this weekend, scored live against our own forecast, spoken aloud, while the judges check in from their phones.**

| Beat | Button | What the room sees | Needs |
|---|---|---|---|
| **Live** | **Live now** | The globe flies to Vanuatu (the most active sequence of the week: an M6.9 and M6.3 on Saturday, dozens of M4.5+ since). The banner shows the **live forecast check**: what the model expected 24 hours ago versus what USGS has recorded since | Venue Wi-Fi; press it once before going on stage so it loads instantly |
| **Hear** | **Read summary** | The forecast spoken by ElevenLabs, with the transcript on screen. Vanuatu's languages aren't supported, so it reads in English; to show another language, open the Türkiye case study (Turkish) | `ELEVENLABS_API_KEY` on Vercel |
| **Join** | **Join on your phone** | A QR code. Judges scan, tap a spot, press "I'm safe here". A large counter over the map rises as they do | Tiger Data service and `TIGER_DATABASE_URL` on Vercel |

The Gemini assistant is for Q&A, not the main flow. If one beat isn't working on the day, skip it; each stands on its own.

**Why not "what happened since the pitch began"?** Vanuatu is producing roughly one M4.5+ an hour and falling, and USGS takes 10 to 30 minutes to publish a remote quake, so a 5-minute window will almost never contain one. The 24-hour forecast check is the honest live version: a real prediction, made from earlier data, scored against what happened.

**Pin the quake if needed:** `https://afterquake.vercel.app/?live=us6000u4j2` makes Live now open the Vanuatu M6.9 even if a bigger quake happens before the pitch.

## Script (5:00)

| Time | Screen | Say |
|---|---|---|
| **Before you start** | Globe, live | (Let it sit while judges settle.) "Every dot is a real earthquake from the last 30 days." |
| **0:00–0:25** | Story step 1 | "February 2023. An M7.8 hits Türkiye. 2.7 million people feel severe shaking. That night millions sleep outside in the cold, asking one question: *when can we go back in?* Nobody could answer it." |
| **0:25–0:50** | Step 2 | "Pick a place and a time. Kahramanmaraş, seven hours in: a 9% chance of damaging shaking in the next day for a typical local building. We turn that into a *time*: when the chance drops below the risk you're willing to take." |
| **0:50–1:20** | Step 3 | "Watch the clock. Nine hours in, an M7.5 hits. Two hours before, the model gave it 1.6%. Unlikely, not impossible. That's why this updates with every quake instead of one all-clear." |
| **1:20–1:45** | Step 4 | "And it depends on your street. Inside this 3 km circle, soft ground and firm ground: 3% to 44%. A city-wide warning can't tell those people apart." |
| **1:45–2:00** | Step 6 | "Does it work? We replayed 93 weeks across 12 earthquakes using only past data. It clearly beats a simple reference for medium aftershocks. For the biggest ones it doesn't, and we show that." |
| **2:00–2:20** | Step 8, then **Live now** | "But this isn't a replay. Right now, Vanuatu is in an aftershock sequence: an M6.9 on Saturday and dozens of quakes since." *(point at the banner)* "Twenty-four hours ago, using only the data available then, our model expected about [X] quakes of M5 or more today. USGS has recorded [Y]. That's the model being scored live." |
| **2:20–2:40** | Click a spot on Espiritu Santo, **Read summary** | "For someone who doesn't read charts, it speaks." *(let 8–10 seconds play)* "In Türkiye it speaks Turkish; in Japan, Japanese." |
| **2:40–3:15** | **Join on your phone** | "Take out your phones. Scan this, tap anywhere, press I'm safe." *(press Done, then keep talking while the counter rises)* "Every check-in is stored as a time series in Tiger Data, so responders see who's safe and who needs help, hour by hour." |
| **3:15–4:00** | Back to the map, check-ins visible | "Under the hood: the USGS catalogue, ShakeMaps, ground-failure maps and PAGER casualty models, all public. Aftershocks *are* a time series, so the live feed goes into a Tiger hypertable with continuous aggregates; the observed rate is checked against the model as it decays. Gemini answers questions by calling the forecast itself, so it can't invent numbers. ElevenLabs speaks the result in the local language." |
| **4:00–4:30** | Accuracy tab | "And we're honest about limits: for the biggest aftershocks the model is no better than a simple reference, and the app says so." |
| **4:30–5:00** | Check-in count | "[N] of you just checked in. In a real earthquake, that's [N] people nobody has to search for. Afterquake: from public data to a decision you can act on, for the next earthquake, within hours." |

**If you're running long:** drop story steps 4 and 6.
**If Wi-Fi fails:** stay on the Türkiye story (it works offline), skip Live and Join, and say "this normally pulls today's earthquakes live" while showing `docs/globe.jpg`.

## Before you go on

- [ ] Open https://afterquake.vercel.app in Chrome, full screen, browser zoom 110–125%.
- [ ] Press **Live now** once and let the Vanuatu forecast load (it stays cached), note the forecast-check numbers for your script, then go back to the start.
- [ ] Press **Join on your phone** once with a teammate's phone to confirm a pin appears.
- [ ] Press **Read summary** once to confirm the voice works and the volume is up.
- [ ] Laptop charged, notifications off, a phone hotspot ready as backup Wi-Fi.
- [ ] Backup: `index.html` on the laptop (works offline for the story).

## Likely questions

**Isn't telling people it's safe dangerous?** We never say a building is safe; that needs an inspection. We estimate the chance of *more shaking* at the risk level a person chooses, and say so on every verdict.

**Doesn't USGS already do this?** USGS publishes regional odds ("a 1 in 3 chance of an M6+ in the area this week"). We turn that into a time for a specific spot, building type and country, using soil, how hard that spot already shook, liquefaction and local building vulnerability.

**How do you know it works?** The Accuracy tab: 93 replayed seven-day windows across 12 earthquakes (M5+ skill 0.55 against a reference from the other sequences; M6+ no better than that reference), plus a comparison of our shaking equation against USGS ShakeMaps of 26 real aftershocks.

**Why Tiger Data rather than a normal database?** Earthquakes and check-ins are append-heavy time series. Hypertables partition them by time, continuous aggregates keep hourly rates pre-computed so the chart stays instant, and compression keeps months of feed small.

**What about privacy?** Check-ins are opt-in and invite-only, expire after 24 hours, and you can delete your own at any time.

**What's next?** Push alerts when your re-entry time arrives, finer city soil maps, building data from OpenStreetMap, and working with responders on the check-in board.
