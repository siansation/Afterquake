# Design direction

AfterQuake should look like a tool a hazard agency would publish, not like a generated template. Two earlier looks were rejected for reading as AI-made: the original dashboard (monospace labels, uppercase eyebrow headings, rounded cards with coloured edges, pulsing animation) and a "newspaper" redesign (cream paper, serif headlines, terracotta accent, hairline rules). The second is a well-known fallback for AI tools once the obvious defaults are banned, and terracotta near `#D97757` is Claude's own accent colour.

So the look comes from the product's own field, not from a style.

## Choices

- **Type:** Public Sans, the US government's typeface (USWDS), at normal weights and sentence case. Figures are tabular. No display or serif face, no monospace.
- **Colour:** a light grey page (`#e9ecef`), white panels and a dark slate header bar.
  - Actions use the standard government link blue (`#005ea2`).
  - Accents for pins and case studies use red from the USGS shaking-intensity scale (`#c80000`), the same scale the data uses.
  - Quake dots keep the USGS age colours. Green and amber appear only for the forecast verdict.
- **Structure:**
  - Plain lists and tables with 1 px dividers.
  - Labels sit above values; there are no oversized "hero" numbers.
  - The verdict is the only tinted box.
  - Overlays on the map copy Leaflet's own controls (white, 4 px radius, Leaflet's shadow), so the page matches its map library.
- **Motion:** none, apart from the globe moving where you drag it and flying to a quake you pick. The globe doesn't spin by itself, pulse or glow. It is drawn flat like a printed map.
- **Wording:** plain labels that say what a control does, and one short safety line per screen. The full caveats live under About.

## Avoid

From write-ups on recognisable AI-generated design ([Capital and Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/), the [pixelslop pattern catalog](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md), [Northeast Times on AI design tools](https://northeasttimes.com/2026/07/31/ai-design-tools-are-making-every-website-look-the-same/)):

- Inter, Roboto, Source Sans, Space Grotesk, or monospace for text that isn't code
- Tracked uppercase "eyebrow" labels, and "A · B · C" metadata strings
- Rounded cards around everything, cards inside cards, and one thick coloured edge on a box
- Rows of big numbers with small labels under them
- Gradients, glass blur, glows, neon on dark
- Cream background with a serif and a terracotta or rust accent
- Pulsing, bouncing or fade-in-on-scroll animation
- Pill badges, ▶ and ◀ glyph buttons, an italic or coloured word in a headline
- Repeating the same disclaimer on every panel

`npm run check` fails if any of `src/template.html`, `src/globe.js` or `src/places.js` brings back uppercase or letter-spaced labels, monospace, gradients (CSS or canvas), glass, animations, "·" separators or glyph buttons. It checks whole files, so inline styles and JS-built markup count too. Colours used from JavaScript are read from the CSS tokens in `:root`, so the palette is defined in one place.

## Rendering and story display

The globe is a locator, so it uses light world outlines at every zoom level. Overview textures are bounded independently of the full-resolution data used for estimates. City names remain visible; population symbols and future events are optional. The story keeps its narrative and uses a compact panel above the app so the controls remain accessible. Its short aftershock replay uses six updates and respects reduced-motion preferences. Gemini, speech and database demonstrations are optional actions within the narrative.
