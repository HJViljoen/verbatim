# Verbatim — Design System (marketing surfaces)

> The design contract for `verbatimintel.com` (`app/site/*`). Consult BEFORE
> styling anything on the marketing site. The app (`app.verbatimintel.com`)
> runs its own identity (`design-system/verbatim/MASTER.md`); since 2026-10-01
> both are palette A (below): "the whole brand should move to yellow"
> (Heinrich). The site keeps its own faces, scale and the dark Room. Rewritten
> 2026-09-06 for the site that replaced the August "Annotated transcript" page.

## Palette A, the app and the brand (2026-10-01)

Neither the app nor the site uses the Verbatim green any more. The app's
values live in `app/globals.css` `:root` and are described in MASTER.md
§Color Palette; the site's tokens (below) take the same values:

| Role | Hex |
|---|---|
| Page ground | `#F7F6F2` |
| Cards / paper | `#FFFFFF` |
| Ink (text, primary buttons, white text on them) | `#26292C` |
| Muted text | `#5F656B` |
| Hairlines / track | `#E4E2DC` / `#ECEAE4` |
| Brand yellow (bars, the Agent row, badges, mastheads; ink on it) | `#FFD43B` |
| Pale yellow (soft panels) | `#FFF4C7` |
| Orange text (small labels, links) / orange accent (never text) | `#C2410C` / `#F2651D` |
| Chart: you / rivals / market | `#9A6B00` / `#8A9097` / ink |

In the app the mark and wordmark draw in ink. **Anti-list, app and site
alike:** no left-stripe accent blocks (no coloured left border or bar on a card
or a quote), no highlighted phrases, no gradient washes, no emoji.

## Direction — "The murmur"

Verbatim's raw material is speech: thousands of overlapping voices in comment
threads, Reddit threads and videos. The site's one idea is **that murmur
resolving into a model of the market.** The hero is a dark room full of voices
drifting behind the headline; then the light comes on and the analysis appears
on white. All the boldness goes there. Everything else stays quiet.

**Signature element (spend all boldness here):** the murmur, and the moments
that show scale honestly: the 18,440-mark count, the streaming quotes, the
analyst stage that answers on its own. Product surfaces are drawn faithfully
from the app's real shapes (profiles, theme map, face-off, brief) so the page
shows the product rather than describing it.

## Brand mark

The mark is the ditto mark (〃), "repeated exactly as said": two short parallel
strokes leaning forward, on a 64 viewBox with 12-wide round caps.

- Two colours and no others (palette A, 2026-10-01). Ink `#26292C` on a light
  ground (Paper, the ground, white cards), the brand yellow `#FFD43B` on the
  Room. The white mark retired with the green tile it sat on.
- The app icon is the ink mark on a yellow rounded tile (radius 12 of 64): the
  favicons `app/icon.svg`, `app/icon.tsx` (32px) and `app/favicon.ico`, and
  `app/apple-icon.tsx` (180px, square, because iOS applies its own mask).
- The share card (`app/opengraph-image.tsx`) is the Room with the yellow mark,
  the white wordmark, the descriptor at 60% white and the line.
- The descriptor sits beside the wordmark, never under it. The wordmark itself
  does not change: Bricolage Grotesque 700 at −0.02em.
- Minimum 16px. Under that the two strokes close into one.
- Static files: `public/brand/verbatim-mark.svg` (ink) and
  `verbatim-mark-yellow.svg`, plus 128px PNGs for email, where clients drop
  SVG: `verbatim-mark-ink.png` (the one the emails name), `verbatim-mark.png`
  (ink too, kept for emails sent before palette A) and
  `verbatim-mark-yellow.png`. `scripts/build-brand-assets.ts` rebuilds the
  PNGs and `favicon.ico` whenever the mark or its colours change.
- In React it is `VerbatimMark` (`components/brand/mark.tsx`), drawn in
  `currentColor` so the surface picks the colour: ink in the app and on the
  site's light nav and footer, yellow on the site's dark nav.

## Palette (marketing)

Palette A since 2026-10-01, with the app's values; the site adds the Room and
what sits on it. On paper the signal is ink with yellow (a yellow fill with ink
on it); on the Room the yellow is the signal by itself.

| Token | Hex | Role |
|---|---|---|
| Room | `#1F2124` | The dark band: hero, closing band, the reports block. A neutral ink, never black, never tinted |
| Paper | `#FFFFFF` | Page background, panels, cards |
| Paper 2 | `#F7F6F2` | Alternate section ground and inner blocks: palette A's ground |
| Ink | `#26292C` | Text, the product's own primary button (the analyst's Ask), focus rings on paper, the market in a chart |
| Ink 2 / Muted | `#45494D` / `#5F656B` | Secondary text. Muted passes AA on Paper and Paper 2 |
| Hair / Track | `#E4E2DC` / `#ECEAE4` | Rules inside panels; the track a bar is drawn on, and the softer rule in a mail or a nav |
| Yellow | `#FFD43B` | The brand: every "Get early access" button (ink on it), the mark and the second line of a headline on the Room, bars, citation and claim badges, the four named marks in the dot field. **Never text on a light ground** (1.3:1) |
| Pale yellow | `#FFF4C7` | Your theme's tile, the active chip, kept and supported chips, Verbatim's column in the comparison |
| Orange / orange text | `#F2651D` / `#C2410C` | The orange marks a contradicted claim (never text); the orange text is a flagged chip's word and a link (`.legal`, the use-case rows) |
| Orange pale | `#FEEEE5` | The flagged chip's panel (orange text on it, 4.6:1) |
| Gold / rival grey | `#9A6B00` / `#8A9097` | Data only, as the app's charts: you are the gold, a rival the grey, the market the ink |
| On the Room | `#ECEEF0` / `#C9CCD0` / `#9AA0A6` | Text, quieter text, the quietest (6.2:1); the voices drift in `#BABEC2` |

Set aside, untested and dropped are neutral (Paper 2 or Paper with muted text
and a hairline), so kept, flagged and dropped are yellow, orange and grey and
cannot be mistaken for each other. Red `#DB3B2E` stays a data-only token for a
negative reading, as in the app.

Tokens live in `app/globals.css` under `.site-theme`, **below the drift-guard
marker**, so the app's guards (a)-(e) in `scripts/check-design-drift.sh` never
scan them; guard (f) holds the block, everything under `app/site`, the
favicons, the share card, the mark files and the crowd art to the site's
allow-list instead, and `lib/palette-guard.test.ts` fails on any retired green
(the 2026-08-28 set, the old Room `#0F1F19`, mint `#3DBF8C`, the pine
`#14503A`) anywhere. Component rules live in `app/site/site.css`, every rule
nested under `.site-theme`.

**Anti-list (aware and deliberate):** no cream beyond palette A's ground, no
terracotta, no yellow as a text colour or a marker behind words, no pure black,
no gradient washes (the hero's scrim is the Room's own colour thickening under
the headline, not a wash between two colours), no glass blur, no all-caps
eyebrow labels, no mono metadata strings joined with middle dots, no single
accented word in a headline, no identical card grids, no text shadow on light
headings, no left stripe on a note or a card, no highlighted phrase (a claim in
the analyst's document is underlined in its verdict's colour as it is checked).
The dark band is a neutral ink, not near-black plus an acid accent.

## Typography

| Role | Face | Notes |
|---|---|---|
| Everything a person did not say | **Bricolage Grotesque** (variable, `opsz` axis) | Display and body. Display at opsz 96, weights 600–700, tight tracking (−0.035 to −0.045em). Loaded in `app/site/layout.tsx` via `next/font`, var `--font-bricolage` |
| Everything a person did say | **IBM Plex Serif italic** | Quotes, voice fragments, the phrases in profiles. Loaded by the root layout, var `--font-plex-serif`. Italic is semantic, never decorative |

In the app a quote is set at 15px in IBM Plex Serif italic (`components/quote-block.tsx`), which supersedes the mock's sans italic.

Scale: big jumps. Hero `clamp(56px, 9.2vw, 148px)`, statements `clamp(44px,
6.6vw, 104px)`, section leads `clamp(38px, 4.6vw, 68px)`, surface headings
`clamp(30px, 3vw, 44px)`. Body 19px on leads, 17–18px elsewhere, 15px for the
quiet line under a panel. No mono anywhere on the marketing site.

## Layout

- Left-weighted, 1320px content width, 72px section rhythm at 140px vertical.
- Sections alternate Paper and Paper 2; the dark Room band opens and closes
  the page. Separation is whitespace first, ground shift second, elevation
  third. No flat 1px borders between sections.
- Panels carry the ambient shadow (`--shadow-lg`); inner blocks are flat
  Paper 2, never bordered. Radius 6 on controls and tiles, 8 on panels.
- Subsections within a part must not repeat one layout: alternate text-left,
  text-right, full-width and dark blocks.

## Motion

- One orchestrated moment per section, triggered on first sight, then still.
  The murmur drifts continuously (one rAF loop, idle off-screen). The count
  draws once. Bars and tiles reveal once via `is-on` (CSS transitions). The
  analyst stage cycles on its own until a visitor picks a chip, then stops.
  The report covers cycle until hover, then stop.
- No hover transitions on every card. No fade-and-slide on every section.
- `prefers-reduced-motion`: everything visible and static, streams unrolled,
  cyclers off. Every effect has a cleanup; nothing runs after unmount.
- No animation dependency. CSS transitions plus two small rAF loops.

## Copy rules

Copy contract: `.agents/product-marketing.md`. On the site specifically:
- The home page stops people, makes them curious, moves them on. Specifics
  live on `/how-it-works`, in three parts: gather, analyse, deliver.
- No em-dashes. No comprehensiveness claims ("every comment", "whole market").
  One "it isn't X, it's Y" per page at most. No rule-of-three on autopilot.
- Sample data is one illustrative market (backpacks, fictional brands) from
  `app/site/_data/sample.ts`; every number must read the same everywhere.
- Quotes use typographic quotes and apostrophes. Anything a person said is
  set in the voice face.

## Quality floor (non-negotiable, never announced)

Responsive to 390px with no horizontal scroll. Visible focus on every control.
Muted text at AA contrast on the ground it sits on. Screen readers never hear
the analyst typing or the duplicate stream cards. Keyboard reaches every chip
and cover. Lead form: name, work email, brand, optional question; honeypot;
honest failure message.

## Review loop

Fresh-eyes design and copy review against this file and the copy contract;
a fact check of every mechanism against the code; mobile at 390px; then
Heinrich signs off. Merge and deploy are his call.
