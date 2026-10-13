// The v2 kit's gallery (depth redesign, T2): every component in
// components/v2, drawn from Össur-shaped fixtures and laid out the way the
// depth boards lay them out, on one static page a screenshot can be taken of
// beside E2-Market, E2-Market-Open, E3-Voices, E4-Products,
// E4-Products-Liners, E5-Content and E6-Moves. NOT a tenant route: nothing
// here is served by the app, and no database, session or network is touched
// beyond Google Fonts.
//
//   node --import tsx scripts/render-kit.tsx [--out <file.html>]
//
// The default output is ~/.claude/plans/verbatim-depth-v2/kit-gallery.html.
// The CSS is app/globals.css through the project's own Tailwind pipeline (as
// scripts/pages-shots.ts does it), so the tokens and the utilities are what
// the app would ship. A 281px sidebar-width gutter and the boards' 28px by
// 40px main padding keep every card the width it is on the boards, so the
// charts scale as they would there. The last section repeats a few pieces
// under `.dark`.
//
// Screenshot (what T2 was reviewed on):
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --hide-scrollbars --window-size=1440,<height> --screenshot=<file.png> file://<file.html>

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { BarChart3, Boxes, Lightbulb, ListChecks, MessageSquareText, Smartphone, Sparkles, Target, TrendingUp, Users } from 'lucide-react'

import { PageBar } from '../components/shell/page-grid'
import { BrandChip, ChipSep, TAG } from '../components/colour-roles'
import { MovementBadge } from '../components/delta-badge'
import { ProportionBar } from '../components/proportion-bar'
import { Sparkline } from '../components/charts/sparkline'
import {
  CARD, CardHead, CatalogueShelf, FlagChip, InPlacePanel, MiniBars, PairedBars, PanelSection, PanelTitle, PERIODS,
  PeriodSwitch, SELECTED_CARD_RING, ShelfLegend, SlopePair, SpikeBars, StatCell, StatRow, TickBar, TickBarRow,
  TickKey, UnitSquares, type Period,
} from '../components/v2'
import {
  GONE_QUIET, GROWING, LINER_MONTHS, MONTHS, MOVED, NEW_FLAG, NO_CLEAR, PAIRED, SHELF, SLOPE_ROWS, SPIKE_WEEKS,
  THREE_WEEKS, VOLUME_WEEKS, WEEK_FLAG,
} from '../components/v2/fixture'
import { cn } from '../lib/utils'

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const out = flag('out', join(homedir(), '.claude/plans/verbatim-depth-v2/kit-gallery.html'))

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400;1,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

// ---- small pieces the gallery composes (not kit components) -----------------

/** What the gallery names each piece: the component, in mono, over it. */
function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 font-mono text-[11px] text-muted-foreground">{children}</div>
}

const PLATFORMS = [
  { label: 'TikTok', count: 128, pct: 53, color: 'bg-foreground' },
  { label: 'Instagram', count: 76, pct: 32, color: 'bg-comp' },
  { label: 'YouTube', count: 37, pct: 15, color: 'bg-neutral-seg' },
]

const OLINK = 'text-[13.5px] font-semibold text-orange-text no-underline hover:underline'
const MONO_MUTED = 'font-mono text-[12.5px] text-muted-foreground'

function Quote({ text, cite }: { text: string; cite: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
      <p data-copy="quote" className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground">“{text}”</p>
      <span className="text-[12px] text-muted-foreground">{cite}</span>
    </div>
  )
}

function ConvRow({ name, n, flag: chip }: { name: string; n: number; flag?: ReactNode }) {
  return (
    <a href="#" className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14.5px] text-foreground no-underline hover:bg-inner">
      <span>{name}</span>
      {chip}
      <span data-copy="figure" className="ml-auto whitespace-nowrap font-mono text-[13px] tabular-nums text-secondary-foreground">{n}</span>
    </a>
  )
}

// ---- the sections -----------------------------------------------------------

function Bar() {
  const href = (p: Period) => `/dashboard/market?period=${p}`
  return (
    <section>
      <Label>PageBar (meta) + PeriodSwitch</Label>
      <PageBar
        title="Market"
        meta={<>5 to 11 Oct · <span data-copy="figure">241</span> videos · <span data-copy="level">1,203 of 3,912 comments in October so far</span></>}
      >
        <PeriodSwitch value="week" options={PERIODS} hrefFor={href} />
      </PageBar>
    </section>
  )
}

function Movers() {
  return (
    <section className="flex flex-col gap-5">
      <Label>CARD + CardHead (lg, FlagChip) + SpikeBars + SELECTED_CARD_RING · MiniBars (sm) · UnitSquares · then InPlacePanel (notchAt 0.25) + PanelTitle + StatRow/StatCell + PanelSection + MiniBars (lg) + TickBarRow + ProportionBar</Label>
      <div className="grid grid-cols-12 gap-5">
        <article className={cn(CARD, 'col-span-6', SELECTED_CARD_RING)}>
          <CardHead icon={TrendingUp} size="lg" flag={<FlagChip verdict={WEEK_FLAG} />} title="Insurance refusals for powered knees" />
          <div className="flex flex-wrap items-baseline gap-3.5">
            <div data-copy="figure" className="font-mono text-[44px] leading-none font-medium tracking-[-0.02em] tabular-nums">19</div>
            <div className={cn(MONO_MUTED, 'leading-[1.5]')}>
              <span data-copy="level">of 241 videos this week</span><br />
              <span data-copy="level">31 of 318 in October so far</span>
            </div>
          </div>
          <SpikeBars weeks={SPIKE_WEEKS} label="Videos a week about insurance refusals for powered knees" />
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
              About <BrandChip who="rival">Ottobock <span data-copy="figure">5</span></BrandChip><ChipSep /><BrandChip who="you">Össur <span data-copy="figure">3</span></BrandChip><ChipSep />other knees <span data-copy="figure">11</span>
            </div>
            <a href="#" className={OLINK}>Close ↑</a>
          </div>
        </article>
        <article className={cn(CARD, 'col-span-3')}>
          <CardHead icon={BarChart3} eyebrow="Three weeks" title="How long a liner lasts" />
          <div className="flex items-baseline gap-2"><span data-copy="figure" className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em]">23</span><span data-copy="level" className={MONO_MUTED}>of 241 videos</span></div>
          <MiniBars bars={THREE_WEEKS} label="Videos asking how long a liner lasts" />
          <p className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">New amputees asking when a liner stops holding and how often to replace it.</p>
          <div className="mt-auto"><a href="#" className={OLINK}>Open →</a></div>
        </article>
        <article className={cn(CARD, 'col-span-3')}>
          <CardHead icon={Sparkles} eyebrow="First heard" flag={<FlagChip verdict={NEW_FLAG} />} title="Waterproof knees" />
          <div className="flex items-baseline gap-2"><span data-copy="figure" className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em]">8</span><span data-copy="level" className={MONO_MUTED}>of 241 videos</span></div>
          <UnitSquares k={6} n={8} tone="ink" label="6 of the 8 videos are from active and athletic users" />
          <p className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">Mostly swimmers, asking whether a knee can go in a pool or the shower.</p>
          <div className="mt-auto"><a href="#" className={OLINK}>Open →</a></div>
        </article>
      </div>
      <ConversationPanel />
    </section>
  )
}

function ConversationPanel() {
  return (
      <InPlacePanel
        id="conv-panel"
        notchAt={0.25}
        closeHref="/dashboard/market?period=week"
        labelledBy="conv-title"
        closeLabel="Close this conversation"
        head={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(TAG, 'rounded-md px-2 py-[3px] text-[12px]')}>Cost &amp; access</span>
              <FlagChip verdict={WEEK_FLAG} />
              <span className="font-mono text-[12px] text-muted-foreground">first heard in July</span>
            </div>
            <PanelTitle id="conv-title">Insurance refusals for powered knees</PanelTitle>
          </>
        }
      >
        <StatRow>
          <StatCell value={19} of={241} label="videos this week" />
          <StatCell value={31} of={318} label="videos in October so far" />
          <StatCell value={13} of={839} label="videos in September" />
          <StatCell value={7} label={<>of the <span data-copy="figure">19</span> are replies to one creator’s appeal story</>} />
        </StatRow>
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-[26px]">
            <PanelSection label="Our read">
              <p data-copy="stored" data-slot="pass_c_finding" className="m-0 text-[15.5px] leading-[1.62]">People describe appeals that drag on for months and powered knees judged not medically necessary. Several were told to accept a mechanical knee first and prove they need more.</p>
            </PanelSection>
            <PanelSection label="Month by month · share of your market’s videos">
              <MiniBars bars={MONTHS} size="lg" label="Share of the market's videos about insurance refusals" />
            </PanelSection>
          </div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-[26px]">
            <PanelSection label="Who it’s about">
              <ProportionBar of="videos" segments={[
                { label: 'Ottobock', count: 5, pct: 26, color: 'bg-comp' },
                { label: 'Össur', count: 3, pct: 16, color: 'bg-you' },
                { label: 'other knees', count: 11, pct: 58, color: 'bg-track' },
              ]} />
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <BrandChip who="rival">Ottobock <span data-copy="figure">5</span></BrandChip><ChipSep /><BrandChip who="you">Össur <span data-copy="figure">3</span></BrandChip><ChipSep />other knees <span data-copy="figure">11</span>
              </div>
            </PanelSection>
            <PanelSection label={<>What people did · <span data-copy="level">of 19</span></>}>
              <TickBarRow name="Complained" value="14" pct={74} valueWidth="narrow" label="14 of 19" />
              <TickBarRow name="Asked" value="9" pct={47} valueWidth="narrow" label="9 of 19" />
              <TickBarRow name="Pushed back" value="4" pct={21} valueWidth="narrow" label="4 of 19" />
            </PanelSection>
            <PanelSection label="Who’s saying it">
              <ConvRow name="Long-time users upgrading" n={12} />
              <ConvRow name="Caregivers and family" n={5} />
            </PanelSection>
            <PanelSection label="Where">
              <TickBarRow name="TikTok" value="11" pct={58} tone="ink" valueWidth="narrow" label="11 of 19" />
              <TickBarRow name="Instagram" value="5" pct={26} tone="ink" valueWidth="narrow" label="5 of 19" />
              <TickBarRow name="YouTube" value="3" pct={16} tone="ink" valueWidth="narrow" label="3 of 19" />
            </PanelSection>
          </div>
        </div>
        <PanelSection label={<>In their words · <span data-copy="figure">3</span> of the comments</>}>
          <div className="grid grid-cols-3 gap-3.5">
            <Quote text="Third appeal denied. They say a mechanical knee is adequate. Adequate for sitting, maybe." cite="TikTok · 7 Oct" />
            <Quote text="My prosthetist wrote three letters. Still no." cite="Instagram · 8 Oct" />
            <Quote text="Got the C-Leg approved after a year of fighting. Worth it, but the fight nearly broke me." cite="YouTube · 3 Oct · Ottobock" />
          </div>
        </PanelSection>
        <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5">
          <a href="#" className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-brand px-3.5 text-[13.5px] font-semibold text-brand-foreground no-underline"><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</a>
          <a href="#" className={OLINK}>See the <span data-copy="figure">19</span> videos and every comment →</a>
        </div>
      </InPlacePanel>
  )
}

function SubjectRow({ name, k, n, pct, tick, verdict, months, inside }: {
  name: string; k: number; n: number; pct: number; tick: number; verdict: typeof MOVED; months: number[]
  inside: ReactNode
}) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-7 border-t border-track py-5 first:border-t-0 first:pt-1">
      <div>
        <a href="#" className="text-[16px] font-semibold text-foreground no-underline">{name}</a>
        <div className="mt-2 flex items-baseline gap-2">
          <span data-copy="figure" className="font-mono text-[26px] font-medium tracking-[-0.02em] tabular-nums">{pct}%</span>
          <span data-copy="level" className={cn(MONO_MUTED, 'whitespace-nowrap')}>{k} of {n}</span>
          <span data-copy="verdict" className="ml-auto text-right"><MovementBadge verdict={verdict} unit="pts" good="neutral" bandTip /></span>
        </div>
        <TickBar pct={pct} tick={tick} size="lg" className="mt-2.5" label={`${pct}% October so far, against ${tick}% in September`} />
        <div className="mt-3 flex items-center gap-2.5">
          <span className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">6 months</span>
          <Sparkline values={months} width={160} height={34} color="var(--foreground)" animate={false} />
          <span data-copy="figure" className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">{Math.min(...months)}–{Math.max(...months)}%</span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="m-0 mb-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Inside it</p>
        {inside}
      </div>
    </div>
  )
}

function Board() {
  return (
    <section>
      <Label>Subject board: TickBar (lg, tick) + MovementBadge + Sparkline + FlagChip in rows · rail: TickBarRow + TickKey, SpikeBars (ink, md), ProportionBar</Label>
      <div className="grid grid-cols-12 gap-5">
        <article className={cn(CARD, 'col-span-8')}>
          <CardHead icon={MessageSquareText} title="What the market is talking about" sub={<>Your subjects, as a share of October’s <span data-copy="figure">318</span> videos so far. The black tick is September.</>} />
          <div>
            <SubjectRow name="Cost & access" k={70} n={318} pct={22} tick={15} verdict={MOVED} months={[14, 15, 15, 16, 15, 22]}
              inside={<><ConvRow name="Insurance refusals for powered knees" n={19} flag={<FlagChip verdict={WEEK_FLAG} />} /><ConvRow name="Paying out of pocket" n={15} /><ConvRow name="Medical aid and liners" n={9} /></>} />
            <SubjectRow name="Fit & comfort" k={108} n={318} pct={34} tick={33} verdict={NO_CLEAR} months={[28, 29, 30, 28, 33, 34]}
              inside={<><ConvRow name="How long a liner lasts" n={23} flag={<FlagChip verdict={GROWING} />} /><ConvRow name="Sweat under the liner" n={21} /><ConvRow name="Socket fit changing over time" n={14} /></>} />
            <SubjectRow name="Function & movement" k={80} n={318} pct={25} tick={25} verdict={NO_CLEAR} months={[28, 29, 27, 28, 25, 25]}
              inside={<><ConvRow name="Stairs and slopes" n={16} /><ConvRow name="Waterproof knees" n={8} flag={<FlagChip verdict={NEW_FLAG} />} /><ConvRow name="Foam covers" n={0} flag={<FlagChip verdict={GONE_QUIET} />} /></>} />
          </div>
        </article>
        <div className="col-span-4 flex flex-col gap-5">
          <article className={CARD}>
            <CardHead icon={ListChecks} title="What people do in the comments" sub={<>Share of October’s <span data-copy="figure">318</span> videos where at least one comment did it</>} />
            <div className="flex flex-col gap-[11px]">
              <TickBarRow name="Asked a question" value="45%" pct={45} tick={44} label="45% this month, 44% last month" />
              <TickBarRow name="Praised a device" value="37%" pct={37} tick={38} label="37% this month, 38% last month" />
              <TickBarRow name="Complained" value="32%" pct={32} tick={27} verdict={MOVED} label="32% this month, 27% last month" />
              <TickBarRow name="Wished for something" value="12%" pct={12} tick={12} label="12% this month, 12% last month" />
            </div>
            <TickKey fill="October so far" tick="September" />
          </article>
          <article className={CARD}>
            <CardHead icon={BarChart3} title="Videos, week by week" sub="Your market’s videos, by the week people commented" />
            <SpikeBars weeks={VOLUME_WEEKS} variant="ink" counts="all" size="md" label="Videos a week" />
          </article>
          <article className={CARD}>
            <CardHead icon={Smartphone} title="Where it’s said" sub={<>The <span data-copy="figure">241</span> videos, by platform</>} />
            <ProportionBar of="videos" segments={PLATFORMS} />
            <div className="flex flex-wrap justify-between gap-2.5 text-[13px]">
              {PLATFORMS.map((p) => <span key={p.label} className="inline-flex items-center gap-1.5"><i aria-hidden className={cn('inline-block size-2 rounded-[2px]', p.color)} />{p.label} <span data-copy="figure" className="font-mono">{p.count}</span></span>)}
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function VoicesAndMoves() {
  return (
    <section className="flex flex-col gap-5">
      <Label>SlopePair · StatCell (sm) + UnitSquares (dot) · StatCell (md) · TickBar (xl, figure) + UnitSquares (bar) · FlagChip, every word</Label>
      <div className="grid grid-cols-12 gap-5">
        <article className={cn(CARD, 'col-span-4')}>
          <CardHead icon={Users} title="How the mix changed" sub="Each group’s share of the market’s videos, September against October so far" />
          <SlopePair fromLabel="Sep" toLabel="Oct" rows={SLOPE_ROWS} highlight="caregivers" label="Each group's share of the market's videos" />
        </article>
        <article className={cn(CARD, 'col-span-4')}>
          <CardHead icon={Target} title="What it rests on" sub="Your moves: the advice’s evidence cells" />
          <div className="grid grid-cols-2 gap-2.5">
            <StatCell size="sm" value={19} of={241} label="videos this week" />
            <StatCell size="sm" value={4} label="updates in a row, since 14 Sep">
              <UnitSquares k={4} n={9} shape="dot" className="mt-2" label="4 of the last 9 updates" />
            </StatCell>
            <StatCell size="md" value={23} label="asked how often to replace one" />
            <StatCell size="md" value={9} of={23} label="asked about sweat" />
          </div>
        </article>
        <article className={cn(CARD, 'col-span-4')}>
          <CardHead icon={Sparkles} title="FlagChip" sub="Every word a verdict can earn, then the small size; nothing for a month that moved, a refusal or no verdict" />
          <div className="flex flex-wrap items-center gap-2">
            {[WEEK_FLAG, NEW_FLAG, GONE_QUIET, GROWING, { ...MOVED, direction: 'fading' as const }].map((v, i) => <FlagChip key={i} verdict={v} />)}
            <FlagChip verdict={NEW_FLAG} size="sm" />
          </div>
        </article>
      </div>
      <div className="grid grid-cols-12 gap-5">
        <article className={cn(CARD, 'col-span-8')}>
          <CardHead icon={Lightbulb} title="How the video is made" sub="Content: response, 1× is typical, and your posts" />
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2.2fr)_minmax(0,0.9fr)] items-center gap-x-3.5 gap-y-2.5 text-[13.5px]">
            <span>Story</span><TickBar pct={77.5} tick={25} size="xl" figure="3.1×" label="3.1 times the typical response" /><UnitSquares k={1} n={9} tone="you" shape="bar" label="1 of your 9 posts" />
            <span>A question</span><TickBar pct={45} tick={25} size="xl" figure="1.8×" label="1.8 times the typical response" /><UnitSquares k={0} n={9} tone="you" shape="bar" label="0 of your 9 posts" />
            <span>Talking head</span><TickBar pct={22} tick={25} size="xl" figure="0.9×" label="0.9 times the typical response" /><UnitSquares k={6} n={9} tone="you" shape="bar" label="6 of your 9 posts" />
          </div>
        </article>
      </div>
    </section>
  )
}

function Products() {
  return (
    <section className="flex flex-col gap-5">
      <Label>Standouts: UnitSquares (you, ink), TickBar pair · CatalogueShelf (selected) + ShelfLegend · InPlacePanel (notchAt 0.1) + PairedBars + MiniBars (md)</Label>
      <div className="grid grid-cols-12 gap-5">
        <article className={cn(CARD, 'col-span-3')}>
          <div className="flex items-center gap-2"><p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-orange-text">Most praised</p><span className="font-mono text-[11.5px] text-muted-foreground">Feet</span></div>
          <h2 className="m-0 text-[17px] leading-[1.3] font-semibold">The Cheetah is praised in almost every video</h2>
          <div className="flex items-baseline gap-2"><span data-copy="figure" className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em]">7</span><span className={MONO_MUTED}>of its <span data-copy="figure">9</span> videos</span></div>
          <UnitSquares k={7} n={9} tone="you" label="7 of 9 videos praise the Cheetah" />
          <div className="mt-auto"><a href="#" className={OLINK}>Open →</a></div>
        </article>
        <article className={cn(CARD, 'col-span-3')}>
          <div className="flex items-center gap-2"><p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-orange-text">Worth a look</p><span className="font-mono text-[11.5px] text-muted-foreground">Knees</span></div>
          <h2 className="m-0 text-[17px] leading-[1.3] font-semibold">Rheo Knee talk is mostly about getting it paid for</h2>
          <div className="flex items-baseline gap-2"><span data-copy="figure" className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em]">5</span><span className={MONO_MUTED}>of its <span data-copy="figure">7</span> videos</span></div>
          <UnitSquares k={5} n={7} tone="ink" label="5 of 7 Rheo Knee videos are about insurance" />
          <div className="mt-auto"><a href="#" className={OLINK}>Open →</a></div>
        </article>
        <article className={cn(CARD, 'col-span-3')}>
          <div className="flex items-center gap-2"><p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-orange-text">Category, not you</p><span className="font-mono text-[11.5px] text-muted-foreground">Liners</span></div>
          <h2 className="m-0 text-[17px] leading-[1.3] font-semibold">Sweat is a liner problem, not a Seal-In X one</h2>
          <div className="flex flex-col gap-[9px]">
            <div><div className="flex justify-between text-[12.5px]"><span>All liners</span><span data-copy="level" className="font-mono">19 of 52</span></div><TickBar pct={37} className="mt-[5px]" label="19 of 52" /></div>
            <div><div className="flex justify-between text-[12.5px]"><span>Iceross Seal-In X</span><span data-copy="level" className="font-mono">1 of 6</span></div><TickBar pct={17} tone="you" className="mt-[5px]" label="1 of 6" /></div>
          </div>
          <div className="mt-auto"><a href="#" className={OLINK}>Open →</a></div>
        </article>
        <article className={cn(CARD, 'col-span-3')}>
          <div className="flex items-center gap-2"><p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-orange-text">First month</p><span className="font-mono text-[11.5px] text-muted-foreground">Knees</span><FlagChip verdict={NEW_FLAG} size="sm" /></div>
          <h2 className="m-0 text-[17px] leading-[1.3] font-semibold">The Navii came up for the first time</h2>
          <div className="flex items-baseline gap-2"><span data-copy="figure" className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em]">3</span><span className={MONO_MUTED}>videos, all from swimmers</span></div>
          <MiniBars bars={[{ label: 'Aug', value: 0 }, { label: 'Sep', value: 0 }, { label: 'Oct', value: 3 }]} label="Videos about the Navii each month" />
          <div className="mt-auto"><a href="#" className={OLINK}>Open →</a></div>
        </article>
      </div>
      <article className={CARD}>
        <CardHead icon={Boxes} title="Your catalogue" sub="Every product, by category. The darker the tile, the more videos talked about it this month." action={<ShelfLegend />} />
        <CatalogueShelf
          columns={SHELF.map((c) => (c.id === 'liners'
            ? { ...c, line: <><span data-copy="figure">16%</span> of the market <span data-copy="verdict"><MovementBadge verdict={MOVED} unit="pts" good="neutral" bandTip /></span></>, note: <>Fit &amp; comfort leads, <span data-copy="level">34 of 52</span></> }
            : c.id === 'sockets' ? { ...c, line: 'Quiet this month' } : { ...c, line: <><span data-copy="figure">{c.id === 'feet' ? '14%' : c.id === 'knees' ? '12%' : '2%'}</span> of the market</> }))}
          selected="liners"
          panelId="group-panel"
        />
      </article>
      <InPlacePanel
        id="group-panel"
        notchAt={0.1}
        closeHref="/dashboard/products?period=month"
        labelledBy="group-title"
        closeLabel="Close liners"
        head={<><span className={cn(TAG, 'rounded-md px-2 py-[3px] text-[12px]')}>Category</span><PanelTitle id="group-title">Liners</PanelTitle></>}
      >
        <StatRow>
          <StatCell value={52} of={318} label="videos talk about liners" />
          <StatCell value={11} label="name one of your liners" />
          <StatCell value={11} label="are about one of yours, but we couldn’t tell which" />
          <StatCell value={30} label="are about liners in general, no brand named" />
        </StatRow>
        <div className="grid grid-cols-1 gap-9 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <PanelSection label="Your liners against liners in general">
            <PairedBars {...PAIRED} label="Your liners against liners in general" />
          </PanelSection>
          <PanelSection label="Share of the market, month by month">
            <MiniBars bars={LINER_MONTHS} size="md" highlight={null} label="Liners as a share of the market's videos" />
          </PanelSection>
        </div>
      </InPlacePanel>
    </section>
  )
}

function Dark() {
  return (
    <section className="dark rounded-[16px] bg-background p-6 text-foreground">
      <Label>The same pieces under .dark (tokens, both themes)</Label>
      <div className="grid grid-cols-12 gap-5">
        <article className={cn(CARD, 'col-span-4', SELECTED_CARD_RING)}>
          <CardHead icon={TrendingUp} eyebrow="Unusual this week" flag={<FlagChip verdict={WEEK_FLAG} />} title="Insurance refusals" />
          <SpikeBars weeks={SPIKE_WEEKS} size="md" label="Videos a week" />
        </article>
        <article className={cn(CARD, 'col-span-4')}>
          <CardHead icon={ListChecks} title="What people do" />
          <TickBarRow name="Complained" value="32%" pct={32} tick={27} verdict={MOVED} label="x" />
          <TickBarRow name="Asked" value="45%" pct={45} tick={44} label="x" />
          <UnitSquares k={7} n={9} tone="you" label="7 of 9" />
        </article>
        <article className={cn(CARD, 'col-span-4')}>
          <CardHead icon={Users} title="How the mix changed" />
          <SlopePair fromLabel="Sep" toLabel="Oct" rows={SLOPE_ROWS.slice(0, 3)} highlight="long-time" label="x" />
        </article>
      </div>
      <div className="mt-8">
        <InPlacePanel id="dark-panel" notchAt={0.17} closeHref="#" head={<PanelTitle>Liners</PanelTitle>}>
          <CatalogueShelf columns={SHELF.slice(0, 3)} selected="feet" />
        </InPlacePanel>
      </div>
    </section>
  )
}

function Gallery() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* The sidebar's width, so the main column is the boards' width. */}
      <div aria-hidden className="w-[281px] shrink-0 border-r border-border bg-card shadow-sidebar" />
      <main className="flex min-w-0 flex-1 flex-col gap-10 px-10 pt-7 pb-14">
        <Bar />
        <Movers />
        <Board />
        <VoicesAndMoves />
        <Products />
        <Dark />
      </main>
    </div>
  )
}

async function css(): Promise<string> {
  const src = readFileSync('app/globals.css', 'utf8')
  const res = await postcss([tailwind()]).process(src, { from: 'app/globals.css' })
  return res.css
}

async function main() {
  const style = await css()
  const body = renderToStaticMarkup(<Gallery />)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>v2 kit gallery</title><link rel="stylesheet" href="${FONTS}"><style>${style}
html,body{margin:0;padding:0}
:root{--font-plex-sans:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;--font-plex-serif:'IBM Plex Serif',Georgia,serif;--font-plex-mono:'IBM Plex Mono',ui-monospace,monospace;--font-sans:var(--font-plex-sans);--font-serif:var(--font-plex-serif);--font-mono:var(--font-plex-mono)}
body{font-family:var(--font-sans)}
</style></head><body>${body}</body></html>`
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
  console.log(out)
}

main().catch((e) => { console.error(e); process.exit(1) })
