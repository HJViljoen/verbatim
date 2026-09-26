import type { CSSProperties } from 'react'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { longMonth, shortDate } from '@/lib/format'
import { monthStartOf, nextMonth } from '@/lib/reading/month-key'
import type { FigureTable } from '@/lib/reading/verdicts'
import { changeLead, nextPairLine, placeInMonth, searchChangesLine, type ChangeBlock } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import { cn } from '@/lib/utils'
import { isMarketPage, shortMonthName } from './market'

// "What changed, and what is ours" (market-first WP1.6, plan §2.2 block 10):
// at most two lines at deploy 2, the refusal with its measured reach read with
// its update, and the first pair of months read the same way. Its footer is
// the link to the dated list of our changes (Settings › What we changed), and
// nothing else (25 Sep rulings).

/** Where the dated list is: Settings › The record, at its first section. */
export const WHAT_WE_CHANGED_HREF = '/dashboard/settings/record#what-we-changed'

/** One of our search changes, as the preview marks it: a 9px triangle in
 *  ink. A shape, not a "▲" in the text: it marks a day, it claims no rise. */
function OurMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg width="9" height="7" viewBox="0 0 9 7" aria-hidden className={cn('shrink-0 fill-foreground', className)} style={style}>
      <path d="M4.5 0 9 7H0z" />
    </svg>
  )
}

const pct = (share: number): string => `${(share * 100).toFixed(2)}%`

/**
 * The preview's month strip: the pair the page reads, solid, and the first
 * pair read the same way, dashed, under its bracket with its words above it
 * and the date it is read from below. Under the months read, a mark for each
 * day we changed what we search, keyed beneath; through the month the page is
 * read as at, a rule with "as at {date}" beside it. Drawn only where there is
 * a next pair; the months and the bracket say what the sentences beside them
 * say, so they are hidden from a screen reader, and the key, which says what
 * they do not, is read.
 *
 * EACH MONTH ONCE (default M-e, 26 Sep). Once October leads (from the 18 Oct
 * update, decision A) the pair read is Sep, Oct and the first pair read the
 * same way is Oct, Nov: the strip drew "Sep, Oct | Oct, Nov", October twice
 * and its "as at" in both. It now draws Sep, Oct, Nov, the bracket over Oct
 * and Nov, October solid because it is read, and the "as at" once, in it.
 */
/** The strip's grid, one column a month: two to four months (the pair read
 *  and the next pair, each month once). Written out whole, for Tailwind. */
const STRIP_COLS: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }
const COL_START = ['col-start-1', 'col-start-2', 'col-start-3', 'col-start-4']
const COL_SPAN = ['col-span-1', 'col-span-2', 'col-span-3', 'col-span-4']

/**
 * The strip's months, oldest first, each once: the pair read and the next
 * pair, which share a month once October leads (Sep, Oct and Oct, Nov) and
 * are the same pair once November leads. `read` marks the months the page
 * reads (drawn solid), and `from` and `span` place the bracket over the next
 * pair's columns.
 */
export function stripMonths(read: readonly [string, string], next: readonly [string, string]): {
  months: { month: string; read: boolean }[]
  from: number
  span: number
} {
  const reading = new Set(read.map(monthStartOf))
  const bracketed = new Set(next.map(monthStartOf))
  const months = [...new Set([...read, ...next].map(monthStartOf))].sort()
  const at = months.map((m, i) => (bracketed.has(m) ? i : -1)).filter((i) => i >= 0)
  return {
    months: months.map((month) => ({ month, read: reading.has(month) })),
    from: at[0],
    span: at[at.length - 1] - at[0] + 1,
  }
}

/** Does the block draw its month strip? No update is promised to a paused
 *  tenant, in words or in the strip, and with no next pair there is none.
 *  NOR WHERE ITS MONTHS WOULD NOT TOUCH (deploy 2 review): read through M-d's
 *  menu on an earlier month, the August page drew "Jul | Aug | Oct Nov" and the
 *  March page "Feb | Mar | Oct Nov", joining months a gap apart with nothing
 *  to say so. The strip is the approved preview's, for the months the page
 *  reads by default, where the pair read and the next pair are one run of
 *  months; elsewhere the next pair is said in its sentence alone. */
export function drawsStrip(block: ChangeBlock): boolean {
  const next = block.next
  if (!next || block.prevMonth == null || block.paused) return false
  const months = stripMonths([block.prevMonth, block.month], [next.prevMonth, next.month]).months.map((m) => m.month)
  return months.every((m, i) => i === 0 || m === nextMonth(months[i - 1]))
}

function MonthStrip({ block }: { block: ChangeBlock }) {
  const next = block.next
  if (!next || !block.prevMonth || !drawsStrip(block)) return null
  const asAt = block.asAt ?? null
  const ours = block.searchChanges ?? []
  const key = searchChangesLine(ours)
  const cell = (month: string, kind: 'read' | 'next') => {
    const at = asAt ? placeInMonth(asAt, month) : null
    const marks = kind === 'read' ? ours.map((d) => placeInMonth(d, month)).filter((x): x is number => x != null) : []
    return (
      <span key={`${kind}-${month}`} className="relative flex min-w-0 flex-1">
        <span
          className={cn(
            'flex h-10 min-w-0 flex-1 items-center rounded-lg px-3 text-[14px]',
            kind === 'next' ? 'border border-dashed border-neutral-seg font-medium text-muted-foreground' : 'bg-inner font-semibold text-foreground',
          )}
        >
          {/* The name on its cell's own ground, above the "as at" rule, so a
              rule that falls on it passes behind the letters, not through
              them (a phone's 68px month, or a day early in a dashed one). */}
          <span className={cn('relative z-[1] -mx-1 px-1', kind === 'next' ? 'bg-tile' : 'bg-inner')}>{shortMonthName(month)}</span>
        </span>
        {marks.map((x, i) => (
          // 7px on a phone, where a month is some 70px wide and the 9, 13
          // and 17 Sep marks would touch at 9px.
          <OurMark key={i} className="absolute top-[calc(100%+6px)] -translate-x-1/2 max-sm:h-[5.5px] max-sm:w-[7px]" style={{ left: pct(x) }} />
        ))}
        {at != null && asAt ? (
          <>
            {/* The rule stops at the cell's foot, so it never reads as a
                connector to "from the {date} update" below (deploy 2 review). */}
            <span className="absolute -top-4 bottom-0 w-[1.5px] -translate-x-1/2 bg-foreground" style={{ left: pct(at) }} />
            {/* Its words to the left of the rule, as the preview sets them;
                in a dashed month, to the right, clear of the bracket's leg.
                4px clear of the cell's top edge, so they never sit on a dashed
                border (deploy 2 review, at 768 on 1 Nov). */}
            <span
              className={cn('absolute -top-5 whitespace-nowrap font-mono text-[12px] leading-4 text-muted-foreground', kind === 'read' ? '-translate-x-full pr-1.5' : 'pl-1.5')}
              style={{ left: pct(at) }}
            >
              as at {shortDate(asAt)}
            </span>
          </>
        ) : null}
      </span>
    )
  }
  // THE MONTHS ON ONE ROW, EACH ONCE (design pass; WP1.6 design check;
  // default M-e): the bracket's words sit ABOVE the bracket, the bracket over
  // the next pair, and the date it is read from under it, all centred on it.
  // The rows share one grid, a column a month, so each mark and the "as at"
  // rule land on the day they name. Where the "as at" falls in a bracketed
  // month (from the first update of the month after the one read, and in
  // October once it leads), its rule and words stand under the bracket, so
  // the months drop 10px further to keep them off its line.
  const strip = stripMonths([block.prevMonth, block.month], [next.prevMonth, next.month])
  const cols = STRIP_COLS[strip.months.length] ?? 'grid-cols-4'
  const under = cn(COL_START[strip.from], COL_SPAN[strip.span - 1])
  const asAtUnderBracket = asAt != null && [next.prevMonth, next.month].some((m) => placeInMonth(asAt, m) != null)
  return (
    <div className="flex min-w-0 flex-col">
      <div aria-hidden className="flex min-w-0 flex-col">
        <div className={cn('grid gap-x-3', cols)}>
          <div className={cn(under, 'flex flex-col')}>
            <span className="text-center text-[13px] font-semibold leading-4 text-foreground [text-wrap:balance]">the first comparison read the same way</span>
            <span className="mt-1.5 h-2 border-x border-t border-secondary-foreground" />
          </div>
        </div>
        <div className={cn('grid gap-x-3', cols, asAtUnderBracket ? 'mt-5' : 'mt-2.5')}>
          {strip.months.map((m) => cell(m.month, m.read ? 'read' : 'next'))}
        </div>
        {/* One line from 360px, centred on the bracket as a flex item so it
            may spill a few pixels either side of the pair: at 390 the pair is
            about as wide as the words, and a wrap left "update" alone under
            "from the 6 Dec". Narrower, it breaks once, before the date. */}
        <div className={cn('mt-2.5 grid gap-x-3', cols)}>
          <span className={cn(under, 'flex justify-center')}>
            <span className="text-center font-mono text-[12px] font-medium leading-4 text-foreground [text-wrap:balance] min-[360px]:whitespace-nowrap">
              from the <span className="whitespace-nowrap">{shortDate(next.sameAgeFrom)} update</span>
            </span>
          </span>
        </div>
      </div>
      {key ? (
        <p className="m-0 mt-3 flex items-center gap-2 font-mono text-[12px] leading-4 text-muted-foreground">
          <OurMark />
          {key}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The block's answer, led by its verdict (design pass; the preview's bold
 * lead-in). The words are the calibrated sentence, untouched: where it opens
 * with a clause and a colon ("Not read as a change: we changed our searches
 * in September"), the clause is set in ink at weight 600 and the rest follows
 * in the sentence's own ink, so the answer is read first.
 */
function LeadSentence({ body, figures, mode }: { body: string; figures: FigureTable; mode: 'app' | 'print' }) {
  const cut = body.indexOf(': ')
  const className = 'm-0 max-w-[60ch] text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]'
  const figure = 'font-semibold text-foreground'
  if (cut < 0 || body.slice(0, cut).includes('[[')) {
    return <TokenProse body={body} figures={figures} mode={mode} figureFace="mono" figureClassName={figure} className={className} />
  }
  return (
    <div className={`${className} [&>p]:inline`}>
      <strong className="font-semibold text-foreground">{body.slice(0, cut + 1)}</strong>{' '}
      <TokenProse body={body.slice(cut + 2)} figures={figures} mode={mode} figureFace="mono" figureClassName={figure} className="m-0" />
    </div>
  )
}

export const overviewChange: Block<OverviewData> = {
  key: 'overview.change',
  title: 'What changed, and what is ours',
  question: 'What changed, and which changes were ours?',

  render(data, mode = 'app', ctx) {
    const block = data.change ?? null
    const footer = openLink(mode, `${ctx.appUrl}${WHAT_WE_CHANGED_HREF}`, 'What we changed, and when →')
    const empty = overviewChange.emptyState(data)
    if (empty || !block) {
      return <BlockFrame title={overviewChange.title} mode={mode} footer={footer}><BlockEmpty mode={mode}>{empty}</BlockEmpty></BlockFrame>
    }
    const lead = changeLead(block)
    const next = nextPairLine(block)
    if (mode === 'email') {
      return (
        <BlockFrame title={overviewChange.title} mode={mode} footer={footer}>
          {lead ? <div style={{ fontFamily: FONT.sans, fontSize: 13.5, color: EMAIL.ink }}><TokenProse body={lead.body} figures={lead.figures} mode={mode} /></div> : null}
          {next ? <div style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, marginTop: 6 }}>{next}</div> : null}
        </BlockFrame>
      )
    }
    // ONE COLUMN WHEN THERE IS NOTHING FOR THE SECOND (deploy 2 review): a
    // paused tenant, or no next pair, has the refusal alone, which then keeps
    // its own reading measure rather than half the block beside an empty one.
    if (!next && !drawsStrip(block)) {
      return (
        <BlockFrame title={overviewChange.title} mode={mode} footer={footer} roomy>
          {lead ? <LeadSentence body={lead.body} figures={lead.figures} mode={mode} /> : null}
        </BlockFrame>
      )
    }
    return (
      <BlockFrame title={overviewChange.title} mode={mode} footer={footer} roomy>
        <div className="grid grid-cols-1 gap-x-20 gap-y-8 xl:grid-cols-2" data-print-cols="2">
          {lead ? <LeadSentence body={lead.body} figures={lead.figures} mode={mode} /> : <span />}
          <div className="flex min-w-0 flex-col gap-6">
            {next ? <p className="m-0 text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]">{next}</p> : null}
            <MonthStrip block={block} />
          </div>
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return data.change ? changeLead(data.change)?.figures ?? {} : {}
  },

  emptyState(data) {
    if (!isMarketPage(data) || !data.change) return `What changed in ${longMonth(data.month)}, and what is ours, is read on the front page as it is built today, not on this copy.`
    return null
  },
}
