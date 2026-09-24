# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/verbatim/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Verbatim
**System:** the "green refresh" (live since June 2026)
**Updated:** 2026-08-28 — new visual-identity target added (see first section); 2026-07-03 replaced the stale April blue/amber system.
**Source of truth:** `app/globals.css` (tokens) + `lib/ui-colors.ts` (accent/status helpers). This file describes them; if they disagree, the code wins.

---

## Visual identity — 2026-08-28 direction (APPROVED on the Dashboard mock · the target for the refresh)

> **Status:** approved by Heinrich on 2026-08-28 after four mock rounds. **Not yet in code** — `app/globals.css`
> still runs the 2026-07 green refresh until the refresh ships. Where this section and the sections below
> disagree, **this section is the target**; the sections below describe the code as it is today.
> Mock (open in a browser; click an underlined claim): `docs/redesign-2026-08/mock-dashboard-2026-08-28.html`.
> Reasoning + research: vault `Decisions/Log` 2026-08-28 (evening).

### Why
Cream `#F6F1E7` + pine `#14503A` + serif display is the recognised AI-default look ("cluster 1"; Chayka, Nielsen,
Unslop all name it). Banning colours only re-samples the next default — a tell is an *unspecified* default — so
this is a positive spec: grey-scale chrome, colour reserved for meaning, and a green that is not the sage.

### Tokens (light theme — derive dark from these; every surface must read in both)

| Job | Hex | Notes |
|---|---|---|
| Canvas **and** tile | `#FFFFFF` | same white; depth comes from elevation, never tone |
| Elevation | `0 0 0 1px rgba(38,41,44,.04), 0 1px 3px rgba(38,41,44,.05), 0 0 16px rgba(38,41,44,.09)` | **ambient** (no offset, no negative spread) so all edges/corners read alike; sidebar uses the same |
| Ink | `#26292C` | charcoal — never black; no black blocks / dark heroes |
| Ink-2 / muted / faint | `#45494D` / `#6E7378` / `#9AA0A6` | cool greys |
| Hairline / hairline-2 | `#DCDFE3` / `#EBEDF0` | inside tiles only |
| **Verbatim green** | `#0E8A5F` | primary button · active-nav mark · "you" in every chart · "good" (positive sentiment, up-deltas, evidence chip). Mid-light, higher chroma, blue-leaning — the shift from the old pine is lightness + chroma, not just hue |
| Green tint | `#DDF3E9` | chips, hover fills only |
| Competitor | `#F0742B` | data only |
| Category / rest of field | `#9AA1A9` | data only |
| Mixed / early | `#E6B03C` | data only |
| Negative | `#DB3B2E` | data only |
| Neutral segment | `#CDD2D7` | data only |
| Retired | `#F6F1E7` cream · `#14503A` pine · `#FDFAF3` tile · all `--accent-*` bucket hues · glass/backdrop-blur | |

### Rules (decided, 2026-08-28)
1. **Chrome is grey-scale.** Green does exactly four jobs (above). Nothing else in the frame carries a hue.
2. **Colour = meaning, in data only.** You green · competitor orange · category grey; valence green / amber / red.
   Category chips are grey text labels — retire the hashed `ACCENT_TINTS` cycling in `lib/ui-colors.ts`.
   Accepted: "you" and "positive" share the green; where a chart needs them apart, positive drops to the tint.
3. **Depth by elevation, not tone or borders.** No 1px border on every card, no pill-everything; radius 6;
   `rounded-full` only on single-line pills (existing rule).
4. **Type — DECIDED 2026-08-28: IBM Plex Sans (UI) · IBM Plex Serif (verbatim quotes only — quotes are speech) ·
   IBM Plex Mono (counts, metadata; tabular figures).** One superfamily, so all three share the same bones.
   Google Fonts via `next/font` (replaces Plus Jakarta Sans + JetBrains Mono). Chosen by eye from three sets on
   the Dashboard tile (Schibsted/Source Serif/JetBrains · Plex · Manrope/Literata/DM Mono). No Inter, no display
   serifs. Marketing keeps its own `DESIGN.md` faces until it is migrated deliberately.
5. **Claims are clickable evidence** (the Agent page's document-review pattern): a sentence with voices behind it
   gets a quiet grey dotted underline; click → popover with count, platform split, two quotes, link to the page
   that holds the rest. **Nothing is underlined that cannot be clicked.** No highlighter fills, no coloured tints.
6. **The crowd backdrop is back in the app shell** (reversed 2026-09-24, Heinrich's call; it left on 2026-08-28).
   `.crowd-bg` (`public/crowd.svg`, centre bottom, cover, 10% with the top fade) sits behind every dashboard page,
   absolute in the non-scrolling pane right of the sidebar (`app/dashboard/layout.tsx`): `aria-hidden`, never
   interactive, no scroll height, hidden in print. Tiles stay opaque white on top of it. Login keeps its own.
7. **Pages may scroll.** The 2026-08-22 "one screen, no scroll at 1440×900" rule is **retired** — it is no longer
   a constraint, not a new requirement. The 12-column grid, `Tile`, `PageGrid` and `Drawer` stay; the 6-row height
   cap goes. Whether a given page fits one screen or scrolls is a per-page judgment.
8. **No top bar.** The 48px `<header>` in `app/dashboard/layout.tsx` only ever held the mobile sidebar trigger
   (the drift fix was the `h-dvh` inner-scrolling `<main>`, not the bar). Remove it; move the trigger into the
   sidebar rail (desktop) / a floating control (mobile). Keep the inner-scroll pane: with the crowd back in the
   shell (rule 6) it is what holds the backdrop still while content scrolls, and what stopped the mobile toolbar
   from shifting it.
9. **Drift guards (mechanical, run before merge):** every neutral must have blue ≥ red in RGB (cream fails);
   the only green in `globals.css` is `#0E8A5F` and its tint; no `backdrop-blur` in the app.

### Preferences — things Heinrich likes and wants more of (2026-08-28). NOT rules: apply with judgment, page by page
> His words: "the things I say aren't always going to be a fit — just stuff that I liked and that I want more of."
> Use these as a direction to lean toward, and leave them out where they don't serve the page.

- **The brief in one line: the same amount of useful information as today, delivered cleaner.** Density is not
  the problem, noise is — clarity comes from grouping, alignment, one padding scale and open space, never from
  cutting information.
- **Blocks inside blocks.** He likes items as bounded inner blocks inside a tile (ShadcnStore Dashboard 2): the
  eye groups before it reads. Discipline: two levels only (tile with shadow → tinted inner block), one padding
  scale, never a third level. Inner blocks carry **no border or outline**; they are flat, except where blocks are
  the content itself (the Voice theme map), where they sit on `--shadow-block` — a hair of lift, never a ring
  (Heinrich, 2026-08-29: "remove the darker outlines… give the blocks a shadow… neutral blocks a bit lighter grey").
- **Spacing as a material.** Sites he admires use open space for emphasis; leaving an area open can look as good
  as putting something there. Ours tend to fill every tile to the edge. Lean toward more air — while the 08-23
  note that content shouldn't pack into a tile's top-left with a void below still applies where it applies.
- **"A page inside the page."** Tiles that do more than sit still: their own filters, tabs, sorting, a list that
  scrolls inside the tile. Use where a tile genuinely holds more than one view; don't bolt controls onto tiles
  that have one thing to say.
- **Hover that answers a question.** Exact values at the hovered point on a chart; a ring / proportion segment
  that expands and shows its %; buttons and rows that lighten on hover. Do it where the hover reveals something
  the static view can't show; skip decorative motion.

### Build sequence
Tokens in `globals.css` → rewrite the sections below to match → Dashboard (pattern proof, reviewed live) →
Market, Voice, Competitive, Content → Profile, Agent, Reports. Components from **21st.dev** (Heinrich's pick)
normalised onto one **tweakcn** token set; keep our SSR SVG charts and add a client hover layer.

---

## Character

Grey-scale chrome, colour reserved for meaning, one green. Depth comes from elevation and
never from tone: the canvas and the tile are the same white and a tile is found by its
shadow. The product expresses judgment — chips and prose, never raw scores (Redesign Spec §1).

**Primary viewport: laptop/desktop.** Clients read this on laptops; design desktop-first.
Mobile must work but is the secondary pass.

> **Corrected 2026-09-15 (Phase 1 WP10).** The four sections below described the 2026-07
> cream-and-pine system as "current code". It has not been current since the identity shipped
> — `app/globals.css` carries the 2026-08-28 tokens, and `scripts/check-design-drift.sh`
> FAILS the build if a retired cream or pine hex comes back. A doc that describes a palette
> the build refuses is worse than no doc, so they now describe the stylesheet.

## Color Palette

> The tokens below ARE `app/globals.css`. §Visual identity — 2026-08-28 above states the
> reasoning; this states the values. When the two disagree, the stylesheet wins.

All tokens are CSS variables in `app/globals.css`, mapped to Tailwind utilities via `@theme inline`.
Light theme:

| Role | Hex | Token / utility |
|------|-----|-----------------|
| Canvas **and** tile | `#FFFFFF` | `--background`, `--tile`, `--card` |
| Inner block (inside a tile) | `#F6F7F8` | `--inner`, `--muted` |
| Ink | `#26292C` charcoal | `--foreground` |
| Ink-2 / muted / faint | `#45494D` / `#6E7378` / `#9AA0A6` | `--secondary-foreground`, `--muted-foreground` |
| Verbatim green | `#0E8A5F` | `--primary`, `--you`, `--positive`, `--ring` |
| Green tint | `#DDF3E9` → `#0B6E4C` | `--accent` / `--accent-foreground` — chips and hover fills only |
| Hairline | `#DCDFE3` | `--border`, `--input` — inside tiles only |

**Data buckets** (colour = meaning, data only): you `--you` `#0E8A5F` · competitor `--comp` `#F0742B`
· category / rest of field `--cat` `#9AA1A9` · mixed / early `--mixed` `#E6B03C` · neutral segment
`--neutral-seg` `#CDD2D7`.

**Semantic status**: positive `#0E8A5F` (shares the green) · warning `#E6B03C` · negative/destructive `#DB3B2E`.

**Category chips carry NO hue.** `lib/ui-colors.ts` `ACCENT_TINTS` is a ONE-entry list
(`bg-inner text-muted-foreground`) and `categoryTint(key)` returns it for every key — the hashed
multi-hue set retired with the identity. `categorySolid` and `levelBadge` no longer exist;
`SENTIMENT_BADGE` and `PREVALENCE_BADGE` do.

**Chart ramp** — ink lightness, NOT a green ramp: `--chart-1…5` = `#26292C` · `#0E8A5F` · `#6E7378`
· `#9AA1A9` · `#CDD2D7`. `chart-2` is the green, for where "you"/"good" is implied. There is no
`greenForPct()` anywhere in the codebase and there never was.

A full dark theme exists (`.dark` block); every new surface must read in both.

## Typography

- **Sans + headings:** IBM Plex Sans (`--font-plex-sans`, via `next/font/google`)
- **Serif:** IBM Plex Serif (`--font-plex-serif`) — **verbatim quotes only**; quotes are speech
- **Mono:** IBM Plex Mono (`--font-plex-mono`) — counts, metadata, tabular figures
- `--font-emoji` (Noto Color Emoji) is referenced ONLY from the `.vb-print` stacks: Vercel's
  Chromium ships no emoji face, so a customer's "🙌" printed as a blank box on paper.
- Page title: `text-2xl font-bold`. Section headings: `text-sm font-semibold uppercase tracking-wide text-muted-foreground`, optionally with a normal-case hint suffix.

## Shape & Elevation

- Radius base `--radius: 0.375rem` (6px — the value in `app/globals.css`, which is the source of
  truth); chips/pills `rounded-full`, single-line only. This doc drifted to `1rem`, was corrected
  to `0.3rem` on 2026-08-18 and to the shipped `0.375rem` on 2026-09-15 — when the two disagree,
  the stylesheet wins.
- **Elevation is ambient**, no offset and no negative spread, so every edge and corner reads alike:
  `--shadow-tile: 0 0 0 1px rgba(38,41,44,.04), 0 1px 3px rgba(38,41,44,.05), 0 0 16px rgba(38,41,44,.09)`.
  `--shadow-tile-hover` is the same, deeper. `--shadow-block` is a hair of lift for a block inside
  a tile — never a ring. The sidebar uses the tile shadow. **No `backdrop-blur` anywhere in the
  app** (drift guard (c) fails the build); `app/site` marketing is excluded.

## Signature components

- **`.crowd-bg`** — ambient crowd illustration, on `/login` and (since 2026-09-24, rule 6) behind every
  dashboard page via the shell.
- **Chips** — `px-2 py-0.5 rounded-full text-xs font-medium`; category chips use `categoryTint(key)`
  (grey, always), sentiment uses `SENTIMENT_BADGE`, prevalence uses `PREVALENCE_BADGE`,
  evidence tiers show "Strong evidence" (green tint) / "Early signal" (warning tint) — never numeric scores.
- **Voice links** — pill outline in primary: `text-primary ring-1 ring-primary/25 hover:bg-primary/5`.
- **`.stat-hero`** is RETIRED. Rule 1 ("no black blocks / dark heroes") removed it from
  `app/globals.css`; the class name survives only in a comment in `components/stat-band.tsx`.

## One-screen grid pages (2026-08-22 redesign — Dashboard first)

> **2026-08-28:** the *no-scroll one-screen* rule is retired (§Visual identity rule 9). `PageGrid`/`Tile`/`Drawer` and the 12-column grid stay.

The redesign spec is `docs/redesign-2026-08/README.md` (+ the approved canvas linked there). Grid pages are
built from `components/shell/` and `components/charts/`, not from `Card`:

- **Density tokens:** body `13px / 1.45` (rem stays 16px, so spacing utilities are unchanged). Tile surface
  `--tile: #FDFAF3` → `bg-tile` (solid; no backdrop-blur behind a dense grid). `Card` keeps the glass look on
  pages that haven't moved yet.
- **Frame:** `PageFrame` (flex column, `h = max(100dvh − 6rem, 776px)` on ≥xl) → `PageBar` (title · context ·
  right controls · How-to-read) → `PageGrid` (12 cols × 6 equal rows on ≥xl, one screen at 1440×900; single
  stacked column below xl). A 1280×800 laptop scrolls ~70px by design rather than crushing tiles.
- **Tile** (`col`, `row` spans; `variant` default | hero (`.stat-hero`) | warm (clay ring, for the top
  recommendation) | strip): eyebrow 10.5px caps + meta 11px · body · footer (link deeper, left; quiet note,
  right). Tiles clamp their own content (`overflow-hidden`, `min-h-0`); long lists scroll or truncate inside.
  `StripCell` = one counted receipt; `TileEmpty` = the honest one-line empty state — a tile keeps its size.
- **Drawer:** `DetailDrawer` (client, on `ui/sheet`, right, ~480px) is the universal one-click-deeper surface,
  URL-driven like `DetailOverlay` (`?detail=<id>`; closing navigates to `closeHref`). Pages stay server
  components; only the drawer shell is client code.
- **Charts** (server SVG, no libraries): `Sparkline` (now `(number|null)[]` — a gap is a gap),
  `StatValue` (mono 24/30/18, tabular) + `Delta` (favourability-coloured, `good: up|down|neutral`),
  `RankedBar` (dot · label · bar · count; bar colour follows the entity, never the rank), `Mover`
  (label · spark · value · delta), `LineChart` (end labels, no legend box for ≤4 series),
  `CalendarLine` (the dated axis — see §Chart rules), `Ring` (the ONE circle allowed: share of
  something, ≤4 slices, your number in the centre), `PlatformIcon`. `ProportionBar`/`BarLegend`
  stay for splits. `MovementBadge` is the ONE badge (§Chart rules).
- **Colour jobs on tiles:** you / positive = green (`--positive`, `--primary`); wider category = slate; a
  competitor = clay (first), ochre, plum, slate; rest-of-field = `--input` sand; mixed / early = warning gold;
  the verbatim rule stays the signature (clay/primary left rule).
- **Numbers:** counts of real voices, videos, themes and shares are shown big and in mono; model confidence is
  never a number. Formatters in `lib/format.ts` are hydration-safe (UTC dates, hand-rolled separators).
- **Rounding follows the content, not the box:** `rounded-full` ONLY on single-line pills (fixed height or
  `whitespace-nowrap`). Anything that can wrap — quotes, phrases, labels in a list — takes a fixed radius
  (`rounded-lg`/`rounded-[10px]`), otherwise a three-line chip renders as an oval (Heinrich, 2026-08-22).

## Chart rules (amended 2026-09-15 — Phase 1 WP10, decision U)

> **This section AMENDS the mock's `spec/design-system.md` §3.9**, which is code-lifted from
> `components/charts/line-chart.tsx` and says: *"No gridlines beyond baseline + midline, no axis
> rules, no tick marks, no filled areas. Points are **solid**, ringed in the surface colour, never
> hollow. Event markers are the only ringed-hollow circle, in `#E6B03C`."*
> That spec is still right for `LineChart`. It cannot express a monthly reading, and the amendment
> below is what `CalendarLine` is allowed instead. Reasoning: decision U (plan §1) and
> `research/change-log-break-rules.md` §5.

**Why an amendment was needed.** §3.9 allocates exactly ONE non-solid token (the amber ringed-hollow
event marker). A monthly reading needs four distinctions on the same axis — an event, a month with
no reading, a month whose reading cannot be compared, and a month that is not finished — and the
spec forbids both obvious escapes (hollow points, filled areas). It could not absorb them silently.

**The resolution: the change leaves the data line.** Every DATA point stays solid, ringed in
`--tile`, exactly as §3.9 says. The new tokens live in axis furniture — a gutter row 6px under the
baseline, and rules drawn behind the lines.

### `CalendarLine` — the dated axis (`components/charts/calendar-line.tsx`)

- **x is a MONTH, not an index.** `x(m) = padL + (i/(n−1))·innerW` over a GENERATED axis
  (`lib/reading/series.ts` `monthAxis`), so a month with no reading keeps its slot. Index spacing
  closes a hollow month up and misdates everything after it — 16 of Ottobock's 36 months, 17 of the
  Össur category's 72. Geometry: `880×210`, `padL 56`, `padR 180`, `top 12`, `baseline = height−30`,
  gutter `baseline+6`, month labels `height−7`. Arithmetic in `lib/charts/calendar.ts`.
- **A gap is a gap.** `(number | null)` per month, one `<polyline>` per unbroken run. `Sparkline`
  behaves the same way.
- **The calendar line scales UNIFORMLY** — no `preserveAspectRatio="none"`, unlike `LineChart`. Its
  two gutter tokens differ by shape alone (circle vs square), and a stretched viewBox turns the
  circle into an ellipse and the square into a rectangle until they read as the same mark.
- **Five month states, three of them new tokens:**

| state | token | meaning |
|---|---|---|
| `read` | solid point, `r 2.2` (`3.4` at the series end), ringed `--tile` | §3.9 unchanged |
| `below_floor` | **hollow circle in the GUTTER**, `r 3.5`, fill `--tile`, stroke the entity colour `1.5` | the audience's denominator is under `SHARE_BAND.minN` — a real number, no comparison |
| `below_numerator` | **hollow square in the gutter**, `6×6`, same stroke | the object's own k is under the numerator floor |
| `hollow` | nothing on the line at all | no row at all — the gap IS the statement; the month's column still answers when hovered |
| `filling` | the point, plus a **part-height bar** at `opacity .14` in the entity colour, with an "at this point last month" dashed tick beside it | the month is still taking comments and will be rewritten |

- **Dated rules** (`tracking change` / `clustering change` / `rename`): a vertical
  `stroke-dasharray="2 3"` in `--border` from `top−4` to the baseline, carrying the change note as
  its `<title>` and the change's own day as a 9px mono tick label. Drawn at the month the change was
  MADE.
- **A reconstructed row draws a SECOND token**: `stroke-dasharray="1 4"` in `--muted-foreground` at
  `.5` opacity. "We worked out that this probably happened" is not "this was recorded".
- **The affected-months band**: the stored `config_changes.affects_months` span, a `--inner` rect
  behind the lines. This is the "no filled areas" exception, and it is the point of decision U — a
  retroactive change is an interval, not a tick.
- **Read back at setup**: a 45° hairline hatch (`<pattern>` of `--border`) over the months that had
  already closed when the tenant was set up.
- **A run of identical breaks on adjacent months collapses into ONE rule** (`collapseRules`). Every
  month frozen before the clustering fingerprint shipped carries no key and two unknowns are not one
  regime, so drawn literally that is a dated rule on every bar of the history the trial is sold on.
- **Month labels thin** past 12 months, keeping the last month always: a 68-month axis under a 644px
  plot gives each label ~9px, which is not a label.
- **Hover carries k of n**, and the hover target is a COLUMN PER MONTH, not a target per point:
  "Aug 2026 / Sealand 28% · 23 of 82 videos / Freitag 41% · 57 of 139 videos". A column belongs to
  the axis, like a dated rule does — SVG has no z-index, so per-series targets let the last line
  painted cover every earlier line's points and answer for them. A share without its denominator is
  a score, and this product shows no scores.
- **Legend whenever there are ≥2 series or any gutter token**; identity is never colour-alone. A
  series that excludes Reddit says so there, in its own entry.

### Amended 2026-09-24 — a quieter calendar line (Subjects "comfort" review)

- **Under three readable months on every series, no line is drawn.** The chart prints each series'
  readings with their "of N", newest first, plus one line: "The chart appears from the third month."
  (`MIN_CHART_MONTHS`, `figureLines`, `CHART_WAITING` in `lib/charts/calendar.ts`; the email arm too.)
- **Only series that draw a point are keyed, labelled, ringed or hovered.** Every series with no
  line is named once — "No line yet: A, B, C (too few videos)" (`undrawnLine`), no per-series reason.
  A series never read on the axis (all `hollow`) and a stopped rival (`omitWhenUndrawn`) are left out.
- **End labels never overlap**: 18-unit minimum gap (sized for `--cal-ke` 1.6); a label the plot
  cannot hold is dropped and its line stays in the key.
- **`filling` is a light tint, not a bar**: the month's slot washed in `--muted-foreground` at .05,
  and the line INTO the month dashed `4 3`. The "at this point last month" tick is unchanged.
- **The Subjects chart axis is its own**: trailing twelve months, or from the tenant's first
  readable month (`chartMonths`, lib/reading/horizon.ts), whatever the horizon control says.

### `MovementBadge` — the one badge (`components/delta-badge.tsx`)

- One component, three visual states: a movement that cleared its band (arrowed, coloured, `title`
  naming the band); one of the honest non-answers (sans, weight 500, muted — **never coloured,
  never arrowed**, spec §3.5); or nothing at all.
- It takes the reading layer's `Verdict` (five states) or the band's `DeltaVerdict` (three).
  Every non-answer word is in `MOVEMENT_WORDS`, stated once.
- `CountBadge` is the COUNT arm of the same badge and the same vocabulary — a count has no band, and
  requiring one would silence "6 themes confirmed → 5". `DeltaBadge` is gone.
- `favourability()` has **no epsilon**. Flat is exactly zero; `Delta` rounds before it colours, so
  what is coloured is what is printed.

### The block primitives (`components/blocks/`)

Every visual a reading block draws has an app/print form and an **email-safe form** — `<table>` with
inline styles, no classes, no CSS variables, no flex, no grid, because Outlook lays out with Word.
The email arm delegates to `components/email/primitives.tsx`; colours cross through `tokenHex`.
`BlockCalendar` never emits inline SVG into an email: it takes the runner's attached PNG, and prints
the same numbers as a table when none was rendered.

Every primitive stamps its own `data-copy` (`figure` / `level` / `verdict`), so a block keeps the
copy contract by construction (`lib/test/copy-contract.ts`).

## Rules

1. Write Tailwind class strings out in full — never interpolated — so v4 detects them (see `lib/ui-colors.ts` header).
2. Client-facing language ban list applies to all UI copy (Redesign Spec §1): no *run, pass, gather, scraped, pipeline, corpus, run id*.
3. Charts are server-rendered (divs/SVG) with the chart-green range or category accents — no chart libraries, no client JS for static data.
4. shadcn/ui components in `components/ui/` are the base layer; extend, don't fork.

## Anti-patterns

- ❌ Emojis as icons (use Lucide SVGs)
- ❌ Raw confidence/opportunity scores in client-facing UI
- ❌ Layout-shifting hovers; instant state changes (use 150–300ms transitions)
- ❌ Low-contrast text (4.5:1 minimum) or invisible focus states
- ❌ Cool grays, pure white surfaces, neon accents — everything stays warm

## Pre-delivery checklist

- [ ] Reads correctly in light AND dark themes
- [ ] Desktop-first layout verified at 1280–1440px, then mobile at 375px (no horizontal scroll)
- [ ] Empty states in client language, no pipeline jargon
- [ ] `cursor-pointer` + visible focus states on interactive elements
