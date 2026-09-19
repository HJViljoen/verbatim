import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { TileBlock } from '@/components/shell/tile'
import { Derivation } from './derivation'
import { TierChip, tierMetaLine } from './tier'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { ConclusionRow, MarketSurfaceData } from '@/lib/pages/market-surface'

// MK1 · What we concluded this month (design §3 MK1; ported to the artboard,
// Block D wave 2).
//
// THE ARTBOARD'S SHAPE IS TWO ABREAST, not one stacked column. Each conclusion
// is a tinted inner block carrying its tier chip and its count on one line, the
// model's words under them, and its theme chips pinned to the bottom so cards
// of different lengths still line their chips up. The page had this as a single
// column of hairline-separated paragraphs at roughly half the density.
//
// THE TIER CHIP IS SHOWN EXACTLY AS BUILT. The design's gate is one sentence —
// "a conclusion below the evidence bar is labelled, not hidden" — and on both
// tenants the conclusion the model is MOST confident about (10 of 10) is the
// one with no grounding at all, which is precisely the row the gate exists for.
// The artboard's answer is the footer control: the below-bar rows are one press
// away, under a summary that COUNTS them and says what they are, rather than
// dropped. In print and in an email there is nothing to press, so they are
// drawn inline — a disclosure that cannot be opened is a row that is hidden.
//
// THE CHIPS LINK INTO VOICE, which is the design's "each beside the theme it
// came from". A chip carries a theme SLUG, which is what `/dashboard/voice
// ?themes=` narrows on; the registry id is the cross-run identity (AGENTS.md)
// and is not what this link is for — it is a filter on the update's own themes.
//
// "NEW" IS A FACT ABOUT OUR RECORD AND SAYS SO. `ConclusionRow.recurrence` is
// `recurrenceOf` over the leading `theme_registry` id behind the conclusion,
// and `isNew` means we hold no earlier month in which that theme was read.
// `newLine` is printed once under the rows, because the chip alone would read
// as a claim about the conversation. A conclusion whose theme the month tables
// hold nothing for carries NO chip — an absent record is not a new theme.
//
// THE MODEL'S WORDS ARE MARKED `stored`, NOT `prose`. The title and the
// description are Pass D-a's, written at some past update and read back out of
// a column; `prose` means "composed for this page", and the difference is not
// pedantry — 22 of 135 stored conclusions carry a numeral (gap-05 §2) and one
// of today's says "before curiosity turns into distrust or drop-off", so
// marking them `prose` fails rules (a) and (c) on correct copy. The marker
// names the slot (`pass_d_a_insight`, policy `digits`), so a reader can see
// what was adjudicated and what was not. The count beside them is code's and
// stays `figure`.

/** The artboard's mono figure: a number a reader can see is counted rather
 *  than asserted.
 *
 *  AND IT DOES NOT WEAR THE DOTTED UNDERLINE, which on this page is a promise.
 *  MASTER rule 5 gives a quiet grey dotted underline to a claim with evidence
 *  BEHIND it — "click → popover with count, platform split, two quotes, link to
 *  the page" — and `components/claim-popover.tsx` states the rule in the same
 *  words it is built to: "Nothing gets this treatment unless it can open — a
 *  claim without evidence is plain text." The artboard draws the decoration on
 *  a bare `<span>` because an artboard is a still; the spec's own §3.12 draws
 *  the same ink as a `<button>` with a `role="dialog"` panel behind it.
 *
 *  This page's port took the still. Five of its most load-bearing counts —
 *  "157 of 1,699 videos behind it", "2 of 1,699 videos behind it" and the three
 *  grounding cells — carried the underline with no link, no handler and no
 *  popover, on the same viewport where every Derivation summary wears it and
 *  DOES open. So the decoration is spent on the thing that opens and nothing
 *  else, and the figure keeps everything the artboard gives it that is not an
 *  affordance: the mono face, the tabular figures, the 11.5px step and the
 *  secondary ink. The day one of these counts has an evidence panel behind it,
 *  the underline comes back with the panel and not before. */
const FIGURE = 'font-mono text-[11.5px] tabular-nums text-secondary-foreground'

function Row({ row, mode, appUrl, corpus }: { row: ConclusionRow; mode: RenderMode; appUrl: string; corpus: number | null }) {
  const email = mode === 'email'
  // THE DENOMINATOR IS PRINTED AND THE POPULATION IS NAMED (D8). The artboard
  // writes "305 of 1,388 category videos" — this month's category corpus —
  // over a numerator that is nothing of the sort: `distinctVideos` counts over
  // the WHOLE corpus (Össur: 1,699 analysed videos), so "305 of 1,388" beside a
  // page bar reading "September 2026" is a fraction of two populations.
  // `corpusLine` under the rows says which population this one is.
  // A COUNT OF NOTHING IS NOT A SHARE OF ANYTHING. "0 of 1,699 videos behind
  // it" is a fraction whose numerator says the record is empty, set in the mono
  // of a measured figure and sitting beside a chip promising an early signal. The row says it in words instead, and `TierChip` drops
  // its tint (never its label) for the same reason.
  const grounded = row.videos > 0
  const count = !grounded
    ? (
      <span
        className={email ? undefined : 'text-[11.5px] text-muted-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}
      >
        no videos we can still count behind it
      </span>
    )
    : (
      <span data-copy="figure" className={email ? undefined : FIGURE} style={email ? { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted } : undefined}>
        {corpus != null
          ? <>{fmtInt(row.videos)} of {fmtInt(corpus)} videos behind it</>
          : <>{fmtInt(row.videos)} {row.videos === 1 ? 'video' : 'videos'} behind it</>}
      </span>
    )
  const chips = row.themes.map((t) => {
    const href = `${appUrl}/dashboard/voice?themes=${encodeURIComponent(t.slug)}`
    const label = t.label ?? t.slug
    return email
      ? <a key={t.slug} href={href} style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2, marginRight: 8 }}>{label}</a>
      : <Link key={t.slug} href={href} className="rounded-full bg-tile px-2 py-0.5 text-[11.5px] font-medium text-secondary-foreground ring-1 ring-border hover:text-foreground">{label}</Link>
  })
  // The artboard's amber flag, and the ONLY thing `recurrence` prints here.
  const isNew = row.recurrence?.isNew === true
  const newChip = !isNew
    ? null
    : email
      ? <span style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.ink2 }}>New</span>
      : <span title={row.recurrence?.line} className="rounded-full bg-warning/15 px-2 py-0.5 text-[11.5px] font-semibold text-warning">New</span>

  if (email) {
    return (
      <div style={{ padding: '6px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div data-copy="stored" data-slot="pass_d_a_insight" style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>{row.title}</div>
        <div style={{ marginTop: 3 }}><TierChip tier={row.tier} mode={mode} ungrounded={!grounded} /> {count}</div>
        <div data-copy="stored" data-slot="pass_d_a_insight" style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 3 }}>{row.description}</div>
        {chips.length > 0 || newChip ? <div style={{ marginTop: 3 }}>{chips} {newChip}</div> : null}
      </div>
    )
  }

  return (
    <TileBlock className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <TierChip tier={row.tier} mode={mode} ungrounded={!grounded} />
        {count}
      </div>
      <p data-copy="stored" data-slot="pass_d_a_insight" className="m-0 text-[13px] font-medium leading-[1.4]">{row.title}</p>
      <p data-copy="stored" data-slot="pass_d_a_insight" className="m-0 text-[12px] leading-[1.4] text-secondary-foreground">{row.description}</p>
      {chips.length > 0 || newChip ? <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-0.5">{chips}{newChip}</span> : null}
    </TileBlock>
  )
}

/** The artboard's footer control, counted by name — over EVERY row below the
 *  bar (`ConclusionsBlock.belowBar`), not over the ones this block happened to
 *  draw. `rows` is capped at `CONCLUSIONS_SHOWN`, so counting the drawn ones
 *  under-counted exactly the rows the block's own rule ("labelled, never
 *  hidden") is about. Where the cap bites, the disclosure says how many of
 *  them it is showing. */
const belowBarWord = (n: number): string => `${fmtInt(n)} below the bar this update`
const belowBarShown = (drawn: number, all: number): string | null =>
  drawn < all ? `${fmtInt(drawn)} of them are on this page; the rest are past this update's cap.` : null

export const marketConclusions: Block<MarketSurfaceData> = {
  key: 'market.conclusions',
  title: 'What we concluded this month',
  question: 'What has the conversation told us?',

  render(data, mode = 'app', ctx) {
    const c = data.conclusions
    const email = mode === 'email'
    const app = mode === 'app'
    const empty = marketConclusions.emptyState(data)
    const meta = tierMetaLine({ confirmed: c.counts.confirmed, early: c.counts.early, archive: c.belowBar }, c.total)
    const above = c.rows.filter((r) => r.tier !== 'archive')
    const below = c.rows.filter((r) => r.tier === 'archive')
    const row = (r: ConclusionRow) => <Row key={r.id} row={r} mode={mode} appUrl={ctx.appUrl} corpus={c.corpusVideos} />
    // THE RUN'S OWN DATE, WEARING THE WORD "UPDATE" (D9). It is the one thing
    // on this block dated by delivery rather than by a comment, and a reader
    // has to be able to tell it from the month in the page bar.
    const concluded = c.concludedOn ? `concluded with the update of ${shortDate(c.concludedOn)}` : undefined

    return (
      <BlockFrame
        title={marketConclusions.title}
        question={marketConclusions.question}
        mode={mode}
        meta={meta}
        footer={below.length === 0
          ? undefined
          : app
            ? (
              <details className="group min-w-0">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-medium text-foreground">
                  {/* The arrow turns with the disclosure — it was a static ▼
                      in both states, which says "open" when it is shut. */}
                  <span aria-hidden className="text-[10px] text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none">▶</span>
                  {belowBarWord(c.belowBar)}
                </summary>
                <div className="mt-2 grid min-w-0 grid-cols-1 gap-2.5 xl:grid-cols-2">{below.map(row)}</div>
                {belowBarShown(below.length, c.belowBar)
                  ? <p className="m-0 mt-1.5 text-[11px] font-normal text-muted-foreground">{belowBarShown(below.length, c.belowBar)}</p>
                  : null}
              </details>
            )
            : belowBarWord(c.belowBar)}
        footerNote={concluded}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'grid min-w-0 grid-cols-1 gap-2.5 xl:grid-cols-2'}>
          {above.map(row)}
          {/* PAPER AND EMAIL HAVE NOTHING TO PRESS, so the rows below the bar
              are drawn with the rest, labelled by their own chip. The block's
              rule is that they are labelled and not hidden, and a disclosure
              nobody can open would hide them. */}
          {!app ? below.map(row) : null}
        </div>
        {/* THE POPULATION STAYS ON THE PAGE. `corpusLine` is what makes every
            "157 of 1,699 videos behind it" on this block a fraction rather
            than two numbers, and the fix pass put it inside `Derivation`,
            which in mode `app` is a SHUT `<details>` — so the one mode a
            reader can act in printed the numerator and the denominator with
            nothing on screen saying what 1,699 is. That is the D8 deviation
            this port made deliberately (the artboard's "305 of 1,388 category
            videos" counts two different populations), and it only holds while
            the sentence that replaces it is visible. `newLine` rides with it:
            the amber chip above is a fact about OUR RECORD and reads as a
            claim about the conversation without it.
            What stays behind the disclosure is method — how the rows are
            ordered — which is the thing a disclosure is for. */}
        <p className={email ? undefined : 'm-0 text-[11px] leading-[1.35] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}>
          {c.corpusLine} {c.newLine}
        </p>
        <Derivation mode={mode} label="How these are ordered">
          {/* THE SORT IS PRINTED, not implied. The design asks for tier and
              then the size of the MOVEMENT behind each conclusion, and the
              movement is not computable: a conclusion cites audience_insight
              ids and the monthly reading is keyed on theme_registry ids, with
              nothing joining the two. So the second key is the size of the
              evidence, and a reader is told which one they are looking at. */}
          Ordered by {c.sortedBy}.
        </Derivation>
      </BlockFrame>
    )
  },

  // NO FIGURES. The counts on this block are counts of the model's own
  // conclusions and of the videos behind them — evidence, not a reading of the
  // month. A number budget counts readings.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.conclusions.empty
  },
}
