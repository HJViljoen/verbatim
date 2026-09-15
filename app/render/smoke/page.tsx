import { notFound } from 'next/navigation'
import { PrintRoot, printStyleFrom } from '@/components/print/print-root'
import { Slide } from '@/components/print/slide'
import { MethodNote } from '@/components/print/method-note'
import { PrintTile } from '@/components/print/print-tile'
import { Tile, TileBlock, StripCell } from '@/components/shell/tile'
import { StatValue, Delta } from '@/components/charts/stat'
import { Sparkline } from '@/components/charts/sparkline'
import { RankedBar } from '@/components/charts/ranked-bar'
import { Ring } from '@/components/charts/ring'
import { CalendarLine } from '@/components/charts/calendar-line'
import { MovementBadge } from '@/components/delta-badge'
import { monthAxis } from '@/lib/reading/series'
import type { CalendarSeries } from '@/lib/charts/calendar'

// Development-only fixture for the print frame: real shell and chart
// components, made-up numbers. `scripts/render-smoke.ts` prints it to PDF and
// PNG so the frame can be checked without a snapshot. 404 in production.
//
// Slide 3 is WP10's calendar line, carrying every token at once — a below-floor
// month, a month whose own k is under the numerator floor, a hollow month, a
// still-filling month with "at this point last month" beside it, a recorded
// rule with its affected band, a reconstructed rule and the read-back hatch.
// It is here because the tokens have to be LOOKED at, and on production data no
// single tenant has all seven in one axis (a real Össur axis is four months and
// two points). Invented numbers, exactly like the rest of this page.

const CAL_AXIS = monthAxis('2026-02-01', '2026-09-01')

const CAL_SERIES: CalendarSeries[] = [
  {
    label: 'You', color: 'var(--you)', endNote: 'of 84',
    points: [
      { month: '2026-02-01', value: null, state: 'below_floor', n: 22 },
      { month: '2026-03-01', value: 17, state: 'read', k: 18, n: 106 },
      { month: '2026-04-01', value: 19, state: 'read', k: 22, n: 116 },
      { month: '2026-05-01', value: null, state: 'hollow' },
      { month: '2026-06-01', value: 24, state: 'read', k: 19, n: 79 },
      { month: '2026-07-01', value: 26, state: 'read', k: 21, n: 81 },
      { month: '2026-08-01', value: 28, state: 'read', k: 23, n: 82 },
      { month: '2026-09-01', value: 31, state: 'filling', k: 26, n: 84, atLastMonth: 27 },
    ],
  },
  {
    label: 'Brand B', color: 'var(--comp)', excludes: 'excludes Reddit', endNote: 'of 142',
    points: [
      { month: '2026-02-01', value: null, state: 'hollow' },
      { month: '2026-03-01', value: null, state: 'hollow' },
      { month: '2026-04-01', value: null, state: 'below_numerator', k: 2, n: 140 },
      { month: '2026-05-01', value: 38, state: 'read', k: 52, n: 137 },
      { month: '2026-06-01', value: 39, state: 'read', k: 54, n: 138 },
      { month: '2026-07-01', value: 40, state: 'read', k: 55, n: 138 },
      { month: '2026-08-01', value: 41, state: 'read', k: 57, n: 139 },
      { month: '2026-09-01', value: 44, state: 'read', k: 62, n: 142 },
    ],
  },
]

export default async function SmokePage({ searchParams }: { searchParams: Promise<{ style?: string; tile?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  const chrome = {
    context: 'Dashboard · Sealand · 23 Aug 2026',
    footer: (
      <MethodNote
        data={{ company: 'Sealand', period: 'Update of 23 Aug 2026', platforms: ['tiktok', 'instagram', 'youtube'], videos: 412, comments: 4950, note: 'A conversation is one video and the comments it sparked; a theme is heard when at least two conversations carry it.' }}
      />
    ),
  }
  const strip = (
    <Tile col={12} row={1} variant="strip">
      <StripCell eyebrow="Tracking"><StatValue size="sm">3</StatValue><span className="text-[11.5px] text-muted-foreground">brands · 4 keywords</span></StripCell>
      <StripCell eyebrow="Videos"><div className="flex items-end gap-3"><StatValue>412</StatValue><Sparkline values={[120, 180, 210, 260, 330, 412]} color="var(--you)" /></div><Delta value={82} good="up" unit="count" /></StripCell>
      <StripCell eyebrow="Comments"><div className="flex items-end gap-3"><StatValue>4,950</StatValue><Sparkline values={[900, 1800, 2400, 3100, 4200, 4950]} color="var(--you)" /></div><Delta value={750} good="up" unit="count" /></StripCell>
      <StripCell eyebrow="Themes heard"><StatValue>27</StatValue><span className="text-[11.5px] text-muted-foreground">9 confirmed · 11 early · 7 once</span></StripCell>
    </Tile>
  )
  if (sp.tile) {
    return (
      <PrintRoot style={printStyleFrom(sp.style)}>
        <PrintTile>{strip}</PrintTile>
      </PrintRoot>
    )
  }
  return (
    <PrintRoot style={printStyleFrom(sp.style)}>
      <Slide title="Where the conversation is" chrome={chrome} page={1} pages={2}>
        {strip}
        <Tile col={7} row={3} variant="hero" eyebrow="Executive brief" meta="9 confirmed themes" lead="Comfort on long wear is the conversation your market keeps having — and the one competitor answer to it is losing ground.">
          <p className="text-[12.5px] text-secondary-foreground">Three of the five strongest themes this update are about wear over time; two of them are new since July. The share ring on the right is the one figure that moved.</p>
          <TileBlock><p className="font-serif italic text-[12.5px]">“It gets really heavy to carry on your back after the first hour, which nobody tells you.”</p></TileBlock>
          {/* Emoji in a quote: printed through the self-hosted Noto Color Emoji on paper (Stage 2 T0). */}
          <TileBlock><p className="font-serif italic text-[12.5px]">“Finally one that fits my kid 🙌 — we tried three before this 😩”</p></TileBlock>
        </Tile>
        <Tile col={5} row={1} eyebrow="Audience sentiment" meta="1,204 judged">
          <div className="flex items-baseline gap-2"><StatValue>61%</StatValue><span className="text-[12px] text-muted-foreground">positive</span><Delta value={3} good="up" unit="pt" /></div>
        </Tile>
        <Tile col={5} row={2} eyebrow="Share of tracked conversation">
          <div className="flex items-center gap-4">
            <Ring segments={[{ label: 'You', value: 38, color: 'var(--you)' }, { label: 'Brand B', value: 27, color: 'var(--comp)' }, { label: 'Others', value: 35, color: 'var(--neutral-seg)' }]} center="38%" sub="you" />
            <ul className="flex flex-col gap-1 text-[12px]"><li>You · 38%</li><li>Brand B · 27%</li><li>Others · 35%</li></ul>
          </div>
        </Tile>
      </Slide>
      <Slide title="What your market is talking about" chrome={chrome} page={2} pages={2}>
        <Tile col={5} row={2} eyebrow="Themes" meta="by conversations">
          <div className="flex flex-col gap-1.5">
            <RankedBar label="Comfort on long wear" pct={100} color="var(--you)" count="41" />
            <RankedBar label="Strap durability" pct={70} color="var(--cat)" count="29" />
            <RankedBar label="Price vs. Brand B" pct={45} color="var(--comp)" count="18" />
          </div>
        </Tile>
        <Tile col={4} row={2} eyebrow="Since your first update"><p className="text-[12.5px]">Lead competitor: Brand B · share −4 pt</p></Tile>
        <Tile col={3} row={1} eyebrow="Top recommendation"><p className="text-[12.5px] font-medium">Answer the long-wear question in your own content.</p></Tile>
        <Tile col={3} row={1} eyebrow="On your accounts"><p className="text-[12.5px]">Instagram +212 followers</p></Tile>
      </Slide>
      <Slide title="Durability, month by month" chrome={chrome} page={3} pages={3}>
        <Tile col={12} row={3} eyebrow="Share of videos where durability came up" meta="monthly · Feb → Sep 2026">
          <CalendarLine
            axis={CAL_AXIS}
            series={CAL_SERIES}
            rules={[
              { month: '2026-09-01', at: '2026-09-03', kind: 'tracking_change', label: 'Brand C was added to what we track.', affects: ['2026-09-01'] },
              { month: '2026-06-01', kind: 'reconstructed', label: 'We did not record how themes were grouped for this month.' },
            ]}
            bands={[{ months: ['2026-02-01', '2026-03-01'], label: 'Read back at setup — these months had already closed when we started.' }]}
            format={(v) => `${v}%`}
            caption="February is below the floor for your audience (22 videos) — drawn in the gutter, with no reading. Brand B is read from May."
          />
        </Tile>
        <Tile col={6} row={1} eyebrow="This month against last">
          <div className="flex items-center gap-3">
            <MovementBadge verdict={{ objectKind: 'theme', objectId: 'r1', objectLabel: 'Durability', audience: 'client', window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' }, value: { k: 26, n: 84 }, baseline: { k: 23, n: 82 }, changePts: 3.1, bandPts: 2.4, state: 'moved', flags: [] }} unit="pts" />
            <MovementBadge verdict={{ objectKind: 'theme', objectId: 'r2', objectLabel: 'Repair', audience: 'competitor:Brand B', window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' }, value: { k: 62, n: 142 }, changePts: null, bandPts: null, state: 'refused', refusedReason: 'rename', flags: [] }} />
            <MovementBadge verdict={{ objectKind: 'theme', objectId: 'r3', objectLabel: 'Fit', audience: 'industry-other', window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' }, value: { k: 4, n: 33 }, changePts: null, bandPts: null, state: 'too_little_data', flags: [] }} />
          </div>
        </Tile>
      </Slide>
    </PrintRoot>
  )
}
