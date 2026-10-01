import Link from 'next/link'
import { Sparkles } from '@/components/design-icons'
import type { ReactNode } from 'react'

import { PageBar } from '@/components/shell/page-grid'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { INSUFFICIENT, tileInsufficient, type HomeData, type HomeNumbers, type HomeNumbersHalf, type HomeTile, type HomeTileRow, type HomeWeeks } from '@/lib/pages/home'

// THE DASHBOARD, drawn to the approved artboard `Page-Dashboard.dc.html`
// (pages build, HOME package, 1 Oct): the title; "Your market in numbers" and
// "Week by week" in two columns beside the Agent; then six page tiles, three
// to a row. Every size, colour and word below is the artboard's.
//
// PALETTE A, LOCALLY. The app's tokens still carry the old identity (muted
// #6E7378, hairline #DCDFE3, the green), and the app-wide colour swap is a
// separate task, so this page states the artboard's values itself: ink
// #26292C, muted #5F656B, hair #E4E2DC, the bar track #ECEAE4, yellow #FFD43B
// and the orange text #C2410C.
//
// No quotes on this page (rule 5), no left-stripe accents and no highlighted
// phrases (the design bans). A block with nothing to show is not drawn (rule
// 2); a TILE always is, with "Insufficient data" where its rows would be
// (Heinrich, 1 Oct). The loader decides that; this file draws what it is given.

/** The artboard's card shadow. */
const SHADOW = 'shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_14px_rgba(0,0,0,0.04)]'
/** A main block: radius 16, 22px by 26px. */
const CARD = `flex flex-col rounded-[16px] bg-white px-[26px] py-[22px] ${SHADOW}`
const MUTED = 'text-[#5F656B]'
const HAIR = 'border-[#E4E2DC]'

export function HomePage({ data }: { data: HomeData }) {
  const left = [
    data.numbers ? <NumbersBlock key="numbers" numbers={data.numbers} /> : null,
    data.weeks ? <WeeksBlock key="weeks" weeks={data.weeks} /> : null,
  ].filter(Boolean)
  // THE DASHBOARD'S OWN PANE: its artboard pads 28/36/36 where every other
  // page's pads 28/40/40 (the shell's), so 4px of the shell's padding is
  // taken back at the sides and the foot, from md, where that padding applies.
  return (
    <div className="flex flex-col gap-5 leading-[normal] text-[#26292C] md:-mx-1 md:-mb-1">
      {/* The Dashboard's artboard draws its title as a bare 26px line (about
          34px), not the other pages' 40px bar: the shared bar, 3px pulled in
          at the top and the foot, lands on the drawn line exactly. */}
      <div className="-my-[3px]"><PageBar title={surface('home').label} /></div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {left.length > 0 ? <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">{left}</div> : null}
        <div className={left.length > 0 ? 'min-w-0' : 'min-w-0 xl:col-span-3'}>
          <AgentBlock />
        </div>
      </div>
      {data.tiles.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.tiles.map((t) => <PageTile key={t.key} tile={t} />)}
        </div>
      ) : null}
    </div>
  )
}

// ---- 1. Your market in numbers -------------------------------------------------------

function NumbersBlock({ numbers }: { numbers: HomeNumbers }) {
  const halves = [numbers.week, numbers.month].filter((h): h is HomeNumbersHalf => h != null)
  return (
    <section className={`${CARD} gap-[18px]`} aria-labelledby="home-numbers">
      <h2 id="home-numbers" className="m-0 text-[17px] font-bold">Your market in numbers</h2>
      <div className={halves.length === 2 ? 'grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-0' : 'grid grid-cols-1'}>
        {halves.map((h, i) => (
          <div
            key={h.heading}
            className={
              halves.length < 2
                ? 'flex flex-col gap-[14px]'
                : i === 0
                  ? `flex flex-col gap-[14px] sm:border-r sm:pr-6 ${HAIR}`
                  : `flex flex-col gap-[14px] border-t pt-6 sm:border-t-0 sm:pl-6 sm:pt-0 ${HAIR}`
            }
          >
            <div className={`text-[13px] font-semibold ${MUTED}`}>{h.heading}</div>
            <div className="grid grid-cols-2 gap-4">
              <Stat value={h.videos} unit="videos" />
              <Stat value={h.comments} unit="comments" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div data-copy="figure" className="font-mono text-[34px] font-medium tabular-nums">{value}</div>
      <div className={`text-[13px] ${MUTED}`}>{unit}</div>
    </div>
  )
}

// ---- 2. Week by week -----------------------------------------------------------------

/** Headroom over the tallest bar and the highest point, so neither touches the top. */
const PLOT_TOP = 0.88

function WeeksBlock({ weeks }: { weeks: HomeWeeks }) {
  const n = weeks.columns.length
  const at = (v: number, max: number) => (max > 0 ? (v / max) * PLOT_TOP * 100 : 0)
  // The comments line: one segment per run of consecutive weeks that have a figure.
  const runs: { x: number; y: number; settled: boolean }[][] = []
  weeks.columns.forEach((c, i) => {
    if (c.comments == null) return runs.push([])
    const point = { x: ((i + 0.5) / n) * 100, y: 100 - at(c.comments, weeks.maxComments), settled: c.settled }
    if (runs.length === 0) runs.push([])
    runs[runs.length - 1].push(point)
  })
  const segments = runs.filter((r) => r.length > 0)
  const summary = weeks.columns
    .filter((c) => c.videos != null && c.comments != null)
    .map((c) => `${c.label}: ${fmtInt(c.videos!)} videos, ${fmtInt(c.comments!)} comments`)
  return (
    <section className={`${CARD} gap-[14px]`} aria-labelledby="home-weeks">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="home-weeks" className="m-0 text-[17px] font-bold">Week by week</h2>
        <div className={`flex gap-4 text-[12px] ${MUTED}`} aria-hidden>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-[#FFD43B]" />Videos</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-[#26292C]" />Comments</span>
        </div>
      </div>
      <div className="relative flex h-[190px]" role="img" aria-label={`Videos and comments in your market, week by week. ${summary.join('; ')}.`}>
        {weeks.columns.map((c, i) => (
          <div key={c.week} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              // The baseline is a solid bottom border under all eight weeks, as
              // drawn, with the bars standing on it; the dashed gridline is its
              // own element, because `border-dashed` would style every side.
              className={`relative flex w-full grow items-end justify-center border-b ${HAIR}`}
              title={c.videos != null && c.comments != null ? `${c.label}: ${fmtInt(c.videos)} videos, ${fmtInt(c.comments)} comments` : undefined}
            >
              {i > 0 ? <span aria-hidden className={`absolute inset-y-0 left-0 border-l border-dashed ${HAIR}`} /> : null}
              {c.videos != null ? (
                // A week still filling: the same yellow, faint, with no words
                // (Heinrich, 1 Oct); solid once it has settled.
                <div className={`w-[44%] max-w-8 rounded-t-[3px] bg-[#FFD43B] ${c.settled ? '' : 'opacity-45'}`} data-week-state={c.settled ? 'settled' : 'filling'} style={{ height: `${at(c.videos, weeks.maxVideos)}%` }} />
              ) : null}
            </div>
            <div className={`whitespace-nowrap text-[12px] max-sm:text-[10px] ${MUTED}`}>{c.label}</div>
          </div>
        ))}
        {/* The comments line, over the plot area: the 190px less the labels'
            row (12px at normal leading, 15.6), its 8px gap and the 1px baseline. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[24.6px]" aria-hidden>
          <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {segments.map((seg, i) =>
              seg.length > 1 ? (
                <polyline
                  key={i}
                  points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#26292C"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
          </svg>
          {segments.flat().map((p, i) => (
            <span
              key={i}
              className={`absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#26292C] ${p.settled ? '' : 'opacity-45'}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ---- 3. The Agent --------------------------------------------------------------------

/** The Agent box: a question and Ask, which opens the Agent with the question
 *  in its box (`/dashboard/agent?ask=…`). A plain GET form, so it works before
 *  any script has loaded. No suggested questions (the artboard). */
function AgentBlock() {
  return (
    <form
      action={surface('ask').href}
      method="get"
      className={`flex h-full flex-col gap-[14px] rounded-[16px] bg-white p-[22px] ${SHADOW}`}
      aria-labelledby="home-agent"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-[8px] bg-[#FFD43B]">
          <Sparkles className="size-4 text-[#26292C]" strokeWidth={2} aria-hidden />
        </div>
        <h2 id="home-agent" className="m-0 text-[17px] font-bold">Agent</h2>
      </div>
      <p className={`m-0 text-[14px] leading-[1.5] ${MUTED}`}>Ask what your market thinks about anything: a product, a price, a claim, a competitor.</p>
      <label className="flex grow flex-col gap-1.5">
        <span className="text-[12px] font-semibold">Your question</span>
        <textarea
          name="ask"
          placeholder="What does my market say about…"
          className={`min-h-[176px] grow resize-none rounded-[10px] border ${HAIR} bg-white p-3 font-[inherit] text-[14px] text-[#26292C] outline-none placeholder:text-[#757575] focus-visible:border-[#26292C] focus-visible:ring-2 focus-visible:ring-[#FFD43B]`}
        />
      </label>
      <button
        type="submit"
        className="flex min-h-11 items-center justify-center rounded-[10px] bg-[#26292C] text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[#FFD43B] focus-visible:ring-offset-2"
      >
        Ask
      </button>
    </form>
  )
}

// ---- 4. The tiles --------------------------------------------------------------------

function PageTile({ tile }: { tile: HomeTile }) {
  const bars = tile.rows.filter((r): r is Extract<HomeTileRow, { kind: 'bar' }> => r.kind === 'bar')
  const texts = tile.rows.filter((r): r is Extract<HomeTileRow, { kind: 'text' }> => r.kind === 'text')
  return (
    <section className={`flex min-w-0 flex-col gap-2.5 rounded-[14px] bg-white px-[22px] py-5 ${SHADOW}`} aria-label={tile.title}>
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-bold">{tile.title}</h2>
        <Link
          href={tile.href}
          className="rounded-sm text-[13px] font-semibold text-[#C2410C] no-underline outline-none hover:text-[#26292C] focus-visible:ring-2 focus-visible:ring-[#FFD43B]"
          aria-label={`Open ${tile.title}`}
        >
          Open →
        </Link>
      </div>
      {tile.big ? (
        <div className="flex items-baseline gap-2.5">
          <div data-copy="figure" className="font-mono text-[30px] font-medium tabular-nums">{tile.big}</div>
          <div className={`text-[13px] ${MUTED}`}>{tile.sub}</div>
        </div>
      ) : null}
      {/* Heinrich, 1 Oct: the tile stays, and says so where its rows would be. */}
      {tileInsufficient(tile) ? (
        <div className={`border-t ${HAIR} py-1.5 text-[13px] ${MUTED}`}>{INSUFFICIENT}</div>
      ) : null}
      {bars.length > 0 ? (
        <div className="flex flex-col gap-[7px]">
          {bars.map((r) => (
            <div key={r.label} className="flex items-center gap-2.5">
              <div className="w-[150px] shrink-0 truncate text-[13px]" title={r.label}>
                <Label copy={r.copy}>{r.label}</Label>
              </div>
              <div className="h-1.5 grow overflow-hidden rounded-[3px] bg-[#ECEAE4]">
                {r.pct != null ? <div className="h-1.5 bg-[#FFD43B]" style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }} /> : null}
              </div>
              <div data-copy="figure" className={`${r.pct != null ? 'w-[34px]' : ''} shrink-0 text-right font-mono text-[12px] tabular-nums`}>{r.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {texts.length > 0 ? (
        <div className="flex flex-col">
          {texts.map((r) => (
            <div key={r.label} className={`flex justify-between gap-2.5 border-t ${HAIR} py-1.5 text-[13px]`}>
              <span><Label copy={r.copy}>{r.label}</Label></span>
              <span className={MUTED}>{r.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/** A row label, marked by where its words came from: a theme's label is Pass
 *  B's, a finding's headline the weekly read's; anything else is the page's. */
function Label({ copy, children }: { copy: 'theme' | 'finding' | null; children: ReactNode }) {
  if (copy === 'theme') return <span data-copy="subject" data-slot="pass_b_theme">{children}</span>
  if (copy === 'finding') return <span data-copy="stored" data-slot="week_read">{children}</span>
  return <>{children}</>
}
