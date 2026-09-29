import type { ReactNode } from 'react'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import { ARRIVAL_THEMES_SHOWN, type ArrivalsBlock } from '@/lib/pages/overview-market/arrivals'
import type { OverviewData } from '@/lib/pages/overview'
import { regroupedLine } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'
import { isMarketPage } from './market'
import { OverviewWeeks, WEEK_BY_WEEK_HREF } from './weeks'

// "With this update" (market-first WP2.7, plan §2.2 block 3; the preview's
// Main.dc.html): what came into your market with the latest update, as counts
// that add to months, and the themes heard for the first time with it. From
// WP2.9 it also holds the weekly volume bars (row 3a), under an inner title
// of their own, with no key of their own (25 Sep rulings).
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings):
// "Open This week →". Nothing explains itself under the block; How to read
// holds the method.
//
// THE WORDS ARE SHARED WITH THE MONTHLY ("September in your market",
// `monthly.arrivals`, WP2.1's slot): `ArrivalsCameIn` and `ArrivalsHeard` are
// the one wording of both, so the artefact cannot say a different thing.

export const ARRIVALS_TITLE = 'With this update'

/** Why This week's figures for the same update differ (finish-list item 9).
 *  Your market's only (`clock`): the monthly borrows the line, and its reader
 *  is not on This week. */
export const ARRIVALS_CLOCK_NOTE = 'This week counts only those written in the update’s days.'

const fig = (n: number, mode: RenderMode): ReactNode => (
  <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono font-semibold tabular-nums text-foreground'} style={mode === 'email' ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink } : undefined}>{fmtInt(n)}</span>
)

/**
 * "With the 20 Sep update: 395 videos read in your market for the first time,
 * and 11,999 more comments written in September came in." (the page adds how
 * This week counts them) and, where the month in
 * progress is another, "October so far: {V} videos after 2 updates."
 */
export function ArrivalsCameIn({ a, month, mode, clock = false }: { a: ArrivalsBlock; month: string; mode: RenderMode; clock?: boolean }) {
  const read = a.months.find((m) => m.month.slice(0, 7) === month.slice(0, 7)) ?? null
  const name = longMonth(month)
  return (
    <>
      {read ? (
        // EACH CLOCK SAID (finish-list item 9): these are the comments written
        // on any day of the month that came in with the update; This week
        // counts only those written in the update's own days (4,777 there
        // against 5,199 here), and the two read as a contradiction until each
        // said its clock.
        <>With the {shortDate(a.run.date)} update: {fig(read.videosFirstRead, mode)} {read.videosFirstRead === 1 ? 'video' : 'videos'} read in your market for the first time, and {fig(read.commentsCaptured, mode)} more {read.commentsCaptured === 1 ? 'comment' : 'comments'} written in {name} came in.{clock ? <> {ARRIVALS_CLOCK_NOTE}</> : null}</>
      ) : (
        <>Nothing more of {name} came in with the {shortDate(a.run.date)} update.</>
      )}
      {a.current.month.slice(0, 7) !== month.slice(0, 7) && a.current.videos != null && a.current.updates > 0 ? (
        <> {longMonth(a.current.month)} so far: {fig(a.current.videos, mode)} videos after {fmtInt(a.current.updates)} {a.current.updates === 1 ? 'update' : 'updates'}.</>
      ) : null}
    </>
  )
}

/** One theme's line: its label, and how many of its videos came from searches
 *  first run in the month (one denominator: the theme's own videos). */
function themeLine(t: ArrivalsBlock['newThemes'][number], month: string, mode: RenderMode): ReactNode {
  const name = longMonth(month)
  const label = <>“<span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>”</>
  if (t.fromNewSearches == null) return <>{label}: {fig(t.k, mode)} videos</>
  if (t.fromNewSearches === 0) return <>{label}: none of its {fig(t.k, mode)} videos came from searches we added in {name}</>
  return <>{label}: {fig(t.fromNewSearches, mode)} of its {fig(t.k, mode)} videos came from searches we added in {name}</>
}

/**
 * "Heard for the first time": the themes the update heard first that reached
 * 10 videos in the month, largest first, at most five by name; the rest, and
 * those led by makers or set aside as off-topic (decision F), counted. An
 * update that opened a new clustering regime heard nothing first (WP1.9):
 * "Re-grouped with the 20 Sep update: 468 themes."
 */
export function ArrivalsHeard({ a, month, mode }: { a: ArrivalsBlock; month: string; mode: RenderMode }) {
  const name = longMonth(month)
  if (a.regrouped != null) return <>{regroupedLine({ update: a.run.date, themes: a.regrouped })}</>
  const makers = a.grouped?.makers ?? 0
  const setAside = a.grouped?.setAside ?? 0
  const grouped = (
    <>
      {makers > 0 ? <> {fig(makers, mode)} more {makers === 1 ? 'is' : 'are'} led by makers.</> : null}
      {setAside > 0 ? <> {fig(setAside, mode)} more {setAside === 1 ? 'is' : 'are'} set aside as off-topic.</> : null}
    </>
  )
  if (a.newThemes.length === 0) {
    if (makers + setAside === 0) return <>No theme heard for the first time reached 10 videos in {name}.</>
    return (
      <>
        With 10+ videos in {name}:
        {makers > 0 ? <> {fig(makers, mode)} led by makers{setAside > 0 ? ',' : '.'}</> : null}
        {setAside > 0 ? <> {fig(setAside, mode)} set aside as off-topic.</> : null}
      </>
    )
  }
  const shown = a.newThemes.slice(0, ARRIVAL_THEMES_SHOWN)
  const more = a.newThemes.length - shown.length
  if (mode === 'email') {
    return (
      <>
        With 10+ videos in {name}:
        {shown.map((t) => (
          <div key={t.registryId} style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '21px', color: EMAIL.ink2, marginTop: 6 }}>{themeLine(t, month, mode)}</div>
        ))}
        {more > 0 || makers + setAside > 0 ? (
          <div style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '21px', color: EMAIL.ink2, marginTop: 6 }}>
            {more > 0 ? <>And {fig(more, mode)} more.</> : null}{grouped}
          </div>
        ) : null}
      </>
    )
  }
  return (
    <>
      With 10+ videos in {name}:
      <span className="mt-2 flex flex-col gap-1.5">
        {shown.map((t) => <span key={t.registryId} className="block [text-wrap:pretty]">{themeLine(t, month, mode)}</span>)}
        {more > 0 || makers + setAside > 0 ? <span className="block">{more > 0 ? <>And {fig(more, mode)} more.</> : null}{grouped}</span> : null}
      </span>
    </>
  )
}

/** Came in, and heard for the first time: two columns on a wide block, one
 *  under the other on a narrow one; a two-cell table in an email. */
export function ArrivalsColumns({ a, month, mode, clock = false }: { a: ArrivalsBlock; month: string; mode: RenderMode; clock?: boolean }) {
  if (mode === 'email') {
    const col = (title: string, words: ReactNode) => (
      <td className="vb-m-col" style={{ width: '50%', verticalAlign: 'top', paddingRight: 12 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink }}>{title}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2, marginTop: 8 }}>{words}</div>
      </td>
    )
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
        <tbody><tr>{col('Came in', <ArrivalsCameIn a={a} month={month} mode={mode} clock={clock} />)}{col('Heard for the first time', <ArrivalsHeard a={a} month={month} mode={mode} />)}</tr></tbody>
      </table>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-x-22 gap-y-6 md:grid-cols-2" data-print-cols="2">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="m-0 text-[15px] font-semibold">Came in</p>
        <p className="m-0 max-w-[62ch] text-[15px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]"><ArrivalsCameIn a={a} month={month} mode={mode} clock={clock} /></p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="m-0 text-[15px] font-semibold">Heard for the first time</p>
        <div className="m-0 max-w-[62ch] text-[15px] leading-[1.6] text-secondary-foreground"><ArrivalsHeard a={a} month={month} mode={mode} /></div>
      </div>
    </div>
  )
}

/** The block's figures: the came-in counts for the month, the month in
 *  progress where it is another, and each named theme's counts. */
export function arrivalsFigures(a: ArrivalsBlock, month: string): FigureTable {
  const out: FigureTable = {}
  const read = a.months.find((m) => m.month.slice(0, 7) === month.slice(0, 7))
  const name = longMonth(month)
  const when = `with the ${shortDate(a.run.date)} update`
  if (read) {
    out.arrivals_videos_first_read = { value: read.videosFirstRead, unit: 'videos', label: `videos read in your market for the first time ${when}` }
    out.arrivals_comments_captured = { value: read.commentsCaptured, unit: 'comments', label: `${name} comments that came in ${when}` }
  }
  if (a.current.month.slice(0, 7) !== month.slice(0, 7) && a.current.videos != null && a.current.updates > 0) {
    out.arrivals_current_videos = { value: a.current.videos, unit: 'videos', label: `videos in your market in ${longMonth(a.current.month)} so far` }
  }
  if (a.regrouped == null) {
    for (const t of a.newThemes.slice(0, ARRIVAL_THEMES_SHOWN)) {
      const id = t.registryId.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      out[`arrival_theme_${id}_videos`] = { value: t.k, unit: 'videos', label: `${name} videos of a theme first heard ${when}` }
      if (t.fromNewSearches != null) out[`arrival_theme_${id}_new_searches`] = { value: t.fromNewSearches, unit: 'videos', label: `of them, found by searches added in ${name}` }
    }
  }
  return out
}

export const overviewArrivals: Block<OverviewData> = {
  key: 'overview.arrivals',
  title: ARRIVALS_TITLE,
  question: 'What came into your market with the latest update?',

  render(data, mode = 'app', ctx) {
    const week = surface('week')
    const open = openLink(mode, `${ctx.appUrl}${week.href}`, `Open ${week.label} →`)
    // THE METHOD IS HOW TO READ'S (25 Sep rulings): a link, beside the other.
    const howTo = data.weeks ? openLink(mode, `${ctx.appUrl}${WEEK_BY_WEEK_HREF}`, 'How to read: Week by week →') : null
    const footer = howTo
      ? mode === 'email' ? <>{open}<span style={{ display: 'inline-block', width: 24 }} />{howTo}</> : <span className="flex flex-wrap gap-x-8 gap-y-1">{open}{howTo}</span>
      : open
    const empty = overviewArrivals.emptyState(data)
    const a = data.arrivals ?? null
    return (
      <BlockFrame title={ARRIVALS_TITLE} mode={mode} footer={footer} roomy>
        {a ? <ArrivalsColumns a={a} month={data.month} mode={mode} clock /> : empty && !data.weeks ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {/* Week by week, inside this block (WP2.9; 25 Sep rulings). */}
        <OverviewWeeks data={data} mode={mode} />
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return data.arrivals ? arrivalsFigures(data.arrivals, data.month) : {}
  },

  emptyState(data) {
    if (!isMarketPage(data)) return 'What came in with each update is read on the front page as it is built today, not on this copy.'
    if (!data.arrivals && !data.weeks) return 'What came in with the latest update is not counted here yet.'
    return null
  },
}
