import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { MovementBadge } from '@/components/delta-badge'
import { BrandChip } from '@/components/colour-roles'
import { translationLabel, translationNote } from '@/components/quote-block'
import { BubbleGlyph } from '@/components/shell/level-glyphs'
import { CARD, FlagChip, MiniBars, PanelSection, SpikeBars, TickBarRow } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { noGroupSaying, noReadingYet, platformRows, subjectNoRead, subjectNotCompared, type InsideConv, type MarketData, type PanelQuote, type SubjectPage, type SubjectPanel } from '@/lib/pages/v2/market'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { SectionHead } from './analysis'
import { ASK, GroupRows, shareBars, SubjectBase } from './panel'
import { About, ABOUT_NOT_COUNTED, ABOUT_NOT_READ, Label, OLINK, Stored } from './parts'
import { PlatformMonthRow } from './rail'

// A TRACKED SUBJECT'S PAGE, THE HUB (F3-Market-Subject, 17 Oct; Heinrich
// chose the board with the read first: "It looks really nice. I like the one
// that has our read first, like then what people are saying and what it
// means, and then inside fit and comfort and the rest of the stuff"). The
// richest of Market's pages, and it looks unlike a conversation's: its read,
// its numbers and its parts, the conversations inside it. In order:
//   1. THE HEADER CARD: "Our read · {month}", the stored headline, and the
//      four figures inside the card (the level, the change against last
//      month as its `Verdict`, this week as a count on the level's base, the
//      conversations inside it this week);
//   2. OUR READ: what people are saying beside what it means;
//   3. INSIDE {SUBJECT}: the three biggest conversations as cards, then all
//      of them as a list (the three included), each opening its page;
//   4. THE NUMBERS: week by week on the level's base, month by month, then
//      who is saying it, what people did and where, on the videos where a
//      comment was about it (one base, named, in the labels);
//   5. IN THEIR WORDS: three comments, each labelled with its conversation;
//   6. THE AGENT.
//
// RULING U6: a subject whose check has not passed prints no figure: the
// header card keeps its frame and says its state's line once, and the
// conversations inside it are named with no count. DECISION 1: every week
// figure stands beside its month, three weeks are three bare counts, and a
// change word comes only from a `Verdict`; the only chip a week earns is
// "Unusual this week". The week is a COUNT on the level's base ("82 of 241
// videos this week"), never a percent beside the month's percent (the board
// report's decision 4).

/** The boards' `.pcard`: a page card's padding and rhythm. */
export const PAGE_CARD = cn(CARD, 'gap-[26px] sm:px-[34px] sm:pt-[30px] sm:pb-8 max-sm:gap-5 max-sm:px-[18px] max-sm:py-5')
/** The boards' `.read`: written prose on a page. */
export const READ = 'm-0 text-[15.5px] leading-[1.62] text-foreground max-sm:text-[15px] max-sm:leading-[1.6]'
/** A state said in one line inside its card. */
const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground'
/** The boards' `.eyebrow` on the header card. */
const EYEBROW = 'm-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-orange-text'

/** A ready subject with no read for the month: its card's line. */
export const SUBJECT_NO_READ = subjectNoRead

/** Where the week holds none of the subject's videos and the month some:
 *  the block keeps its frame and says so (the parity rule, 14 Oct). */
export const SUBJECT_NONE_THIS_WEEK = 'No video this week.'

/** A subject that prints no figure: its numbers card, in one line (U6). */
export const SUBJECT_NUMBERS_HELD = 'No figure prints for this subject until its check passes.'

/** A subject whose check has not passed: its read card, in one line. No read
 *  is written for it (`subjectOwnRead`), so none prints. */
export const SUBJECT_READ_HELD = 'No read prints for this subject until its check passes.'

/**
 * THE NUMBERS CARD OF A SUBJECT THAT PRINTS NO FIGURE, in one line: the
 * state's own reason (17 Oct). Not read in the month yet, the month's own
 * line (`noReadingYet`): its check passed, so "until its check passes" was
 * false there (Össur's six, mid-October). Its check open or failed, why no
 * figure prints until the check passes: the header card above already says
 * "Not measured yet" (or the failed line), so this place does not repeat it.
 * Pure.
 */
export function subjectNumbersLine(panel: Pick<SubjectPanel, 'state' | 'monthText'>): string {
  if (panel.state === 'unread') return noReadingYet(panel.monthText)
  return SUBJECT_NUMBERS_HELD
}

/** The week's figure where its count on the level's base could not be read
 *  (`SubjectPage.week` is `'unread'`): said in its frame, never a figure from
 *  another base. */
export const SUBJECT_WEEK_UNREAD = 'This week’s videos could not be read just now.'

/** The change where none prints: the Dashboard week tile's words for the
 *  same state (`subjectNotCompared`), as a sentence in its frame. No reason,
 *  by the one condition (plan §0a). */
export const subjectChangeGap = (prev: string): string => {
  const words = subjectNotCompared(prev)
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`
}

/** A ready subject with no conversation this period: the Inside section's
 *  frame, and one line. */
export const insideNone = (when: string): string => `No conversation in it reached three videos ${when}.`

/** Whether the change has a change to draw: `MovementBadge` draws nothing
 *  for no verdict or a refused one, and the figure then says so. */
const changeDrawn = (verdict: SubjectPanel['verdict']): boolean => verdict != null && verdict.state !== 'refused'

/** This week's count on the level's base, where it was read (a dump from
 *  before it has none). */
export const weekLevelOf = (page: Pick<SubjectPage, 'week'>): { k: number; n: number } | null =>
  page.week && page.week !== 'unread' ? page.week : null

/** Its check passed: its words print, and its conversations' own counts. */
const passed = (panel: Pick<SubjectPanel, 'state'>): boolean => panel.state === 'ready' || panel.state === 'unread'

/** One to twelve in words, as the boards write a count of conversations in a
 *  sentence ("the three biggest, then all nine"); a digit past that. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const inWords = (n: number): ReactNode => (n >= 0 && n < WORDS.length ? WORDS[n] : <span data-copy="figure">{fmtInt(n)}</span>)

// ---- 1. The header card ------------------------------------------------------------------

const FV = 'font-mono text-[34px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[26px]'
const FW = 'text-[22px] leading-[34px] font-semibold tracking-[-0.01em] text-foreground max-sm:text-[17px] max-sm:leading-[26px]'
const FL = 'text-[13.5px] leading-[1.4] text-foreground max-sm:text-[12.5px]'
const FS = 'text-[12.5px] leading-[1.4] text-muted-foreground max-sm:text-[12px]'

/** One of the strip's figures (the boards' `.fig`): four in a row from 1180,
 *  two to a row under it and on a phone, a hairline between. */
function Fig({ children, span = false }: { children: ReactNode; span?: boolean }) {
  return (
    <div
      data-fig=""
      className={cn(
        'flex min-w-0 flex-col gap-1.5 border-border px-[22px] pt-5 pb-[22px] max-sm:px-4 max-sm:pt-[15px] max-sm:pb-4',
        span
          ? 'col-span-full pl-[34px] max-sm:pl-[18px]'
          : 'min-[1180px]:border-l min-[1180px]:first:border-l-0 min-[1180px]:first:pl-[34px] max-[1179px]:odd:pl-[34px] max-[1179px]:even:border-l max-[1179px]:[&:nth-child(n+3)]:border-t max-sm:odd:pl-[18px]',
      )}
    >
      {children}
    </div>
  )
}

/** The strip: the level, the change, this week, the conversations inside
 *  it; or, where the subject prints no figure, its state's line once. */
function Strip({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const level = panel.level
  const week = data.period === 'week'
  const weekStat = week ? page.week : undefined
  const four = weekStat !== undefined
  const grid = cn('-mx-[34px] mt-1.5 grid grid-cols-2 border-t border-track bg-inner max-sm:-mx-[18px] max-sm:mt-1', four ? 'min-[1180px]:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]' : 'min-[1180px]:grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,1fr))]')
  if (!level) {
    // Its check open or failed: its state's line, once (U6). Its check
    // passed and the month not read for it yet: the month's own line.
    const line = panel.state === 'unread' ? noReadingYet(panel.monthText) : panel.note ?? SUBJECT_NOT_MEASURED
    return (
      <div role="group" aria-label={`${panel.name} in figures`} data-strip={panel.state} className={grid}>
        <Fig span><p data-subject-state={panel.state} className={cn(GAPLINE, 'max-sm:text-[14.5px]')}>{line}</p></Fig>
      </div>
    )
  }
  const pct = (k: number, n: number) => Math.round((100 * k) / Math.max(1, n))
  const verdict = panel.verdict
  const prev = verdict?.baseline ?? null
  const inMonth = data.week?.inMonth ?? `in ${panel.monthText}`
  return (
    <div role="group" aria-label={`${panel.name} in figures`} data-strip="ready" className={grid}>
      <Fig>
        <div data-copy="figure" className={FV}>{pct(level.k, level.n)}%</div>
        <div aria-hidden className="relative mt-1 mb-0.5 h-2.5 max-w-[240px] rounded-[5px] bg-border">
          <div className="absolute inset-y-0 left-0 rounded-[5px] bg-brand" style={{ width: `${Math.min(100, pct(level.k, level.n))}%` }} />
        </div>
        <div className={FL}>of your market’s videos</div>
        <div className={FS}><span data-copy="level">{fmtInt(level.k)} of {fmtInt(level.n)}</span> {inMonth}</div>
      </Fig>
      <Fig>
        {changeDrawn(verdict) ? (
          <>
            {/* The board's change, drawn by the one badge at the figure's
                size: the word and the change beside it, checkable. */}
            <div data-copy="verdict" className={cn(FW, '[&>span]:text-[length:inherit] [&>span]:leading-[inherit] [&>span]:font-[inherit] [&>span]:text-foreground')}>
              <MovementBadge verdict={verdict} unit="pts" good="neutral" bandTip />
            </div>
            <div className={FL}>against {data.month.prev.text}{page.prevPct != null ? <>, <span data-copy="figure">{Math.round(page.prevPct)}%</span></> : null}</div>
            {prev && page.prevPct != null ? <div className={FS}><span data-copy="level">{fmtInt(prev.k)} of {fmtInt(prev.n)}</span> in {data.month.prev.text}</div> : null}
          </>
        ) : (
          // No change to draw (the parity rule): the figure keeps its frame
          // and says so in one line, never an empty slot over its label.
          <p data-fig-gap="" className={cn(FL, 'm-0 text-muted-foreground')}>{subjectChangeGap(data.month.prev.text)}</p>
        )}
      </Fig>
      {four ? (
        <Fig>
          {weekStat && weekStat !== 'unread' ? (
            <>
              <div data-copy="level" className="flex flex-col gap-1.5">
                <div className={FV}>{fmtInt(weekStat.k)}</div>
                <div className={FL}>of {fmtInt(weekStat.n)} videos this week</div>
              </div>
              {data.week ? <div className={FS}>{data.week.dates}</div> : null}
            </>
          ) : <p data-fig-gap="" className={cn(FL, 'm-0 text-muted-foreground')}>{SUBJECT_WEEK_UNREAD}</p>}
        </Fig>
      ) : null}
      <Fig>
        <div data-copy="figure" className={FV}>{fmtInt(page.insideTotal)}</div>
        <div className={FL}>{page.insideTotal === 1 ? 'conversation' : 'conversations'} inside it {week ? 'this week' : `in ${panel.monthText}`}</div>
        {page.insideTotal > 0 ? <a href="#inside" className={cn(OLINK, 'text-[12.5px]')}>See them below ↓</a> : null}
      </Fig>
    </div>
  )
}

/** The header card (F3's `.hub`): "Our read · {month}", the stored headline
 *  as the lead sentence where the read has one (never an invented one), and
 *  the strip inside the card. */
function HubCard({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const read = passed(panel) ? panel.read ?? null : null
  const headline = read && !read.thin ? read.headline ?? null : null
  return (
    <article id="subject-hub" aria-labelledby={headline ? 'subject-head' : undefined} aria-label={headline ? undefined : panel.name} className={cn(CARD, 'gap-[22px] overflow-hidden sm:px-[34px] sm:pt-[30px] sm:pb-0 max-sm:gap-4 max-sm:px-[18px] max-sm:pt-5 max-sm:pb-0')}>
      <div className="flex flex-col gap-2.5">
        <p className={EYEBROW}>Our read · {panel.monthText}</p>
        {headline ? <Stored as="h2" id="subject-head" line={headline} slot="week_read" className="m-0 max-w-[900px] text-[32px] leading-[1.24] font-semibold tracking-[-0.02em] text-foreground max-sm:text-[23px] max-sm:leading-[1.28]" /> : null}
      </div>
      <Strip page={page} data={data} />
    </article>
  )
}

// ---- 2. Our read ---------------------------------------------------------------------------

/** "What people are saying" beside "What it means" (stored prose), printed
 *  exactly where its card on the top page prints a read (`subjectOwnRead`):
 *  every subject whose check passed. Else the state's own line. */
function ReadCard({ panel, data }: { panel: SubjectPanel; data: MarketData }) {
  const read = passed(panel) ? panel.read ?? null : null
  const written = read && !read.thin && read.lines.length > 0 ? read : null
  if (written) {
    return (
      <article id="subject-read" aria-label={`Our read of ${panel.name}`} className={PAGE_CARD}>
        <div className="grid grid-cols-1 gap-11 max-sm:gap-0 min-[1180px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3.5 max-sm:gap-3">
            <Label>What people are saying</Label>
            {written.lines.map((l, i) => <Stored key={i} line={l} slot="week_read" className={READ} />)}
          </div>
          {written.means ? (
            <div className="flex min-w-0 flex-col gap-3.5 max-[1179px]:border-t max-[1179px]:border-track max-[1179px]:pt-6 max-sm:mt-[18px] max-sm:gap-3 max-sm:pt-[18px]">
              <Label>What it means</Label>
              <Stored line={written.means} slot="week_read" className={READ} />
            </div>
          ) : null}
        </div>
      </article>
    )
  }
  // Thin (code's one line), no read this month, or its check not passed: the
  // state's own line, in its frame.
  const line = read?.thin ? <Stored line={read.lines[0]} slot="week_read" className={GAPLINE} />
    : passed(panel) ? <p className={GAPLINE}>{SUBJECT_NO_READ(panel.name, data.month.month)}</p>
      : <p className={GAPLINE}>{SUBJECT_READ_HELD}</p>
  return (
    <article id="subject-read" aria-label={`Our read of ${panel.name}`} data-subject-read={read?.thin ? 'thin' : passed(panel) ? 'no_read' : panel.state} className={PAGE_CARD}>
      <div className="flex flex-col gap-3">
        <Label>What people are saying</Label>
        {line}
        {/* A tenant whose reads are switched off: the week read's sentence on
            it stands in, as the 14 Oct panel's did. */}
        {passed(panel) && !read && panel.sentence ? <Stored line={panel.sentence} slot="week_read" className={READ} /> : null}
      </div>
    </article>
  )
}

// ---- 3. Inside {subject} ----------------------------------------------------------------------

/** Who a conversation's videos are about, or why that is not said. */
function AboutCell({ conv, data }: { conv: InsideConv['conv']; data: MarketData }) {
  if (data.brands !== 'counted') return <span className="text-[12.5px] text-muted-foreground">{data.brands === 'not_counted' ? ABOUT_NOT_COUNTED : ABOUT_NOT_READ}</span>
  if (conv.who.length === 0) return null
  return <About parts={conv.who} brand={data.brand} noun={data.noun} />
}

/** A conversation's description (Pass B's), as its own page reads it. */
function Description({ text, className }: { text: string | null | undefined; className: string }) {
  if (!text) return null
  return <span data-copy="subject" data-slot="pass_b_theme" className={className}>{text}</span>
}

/** One of the three biggest, as a card (F3's `.ccard`). With `counts` false
 *  (its subject's check not passed, U6) the card names it with no figure. */
function ConvCard({ item, data, counts }: { item: InsideConv; data: MarketData; counts: boolean }) {
  const { conv } = item
  const week = data.period === 'week'
  const labels = data.week?.weekLabels ?? []
  return (
    <article data-inside-card="" className={cn(CARD, 'gap-3 px-6 pt-[22px] pb-5 max-sm:gap-2.5 max-sm:px-[18px] max-sm:py-4')}>
      <div className="flex min-h-[26px] items-center justify-between gap-2.5">
        <span aria-hidden className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-track text-secondary-foreground"><BubbleGlyph className="size-3.5" /></span>
        {item.flag ? <FlagChip verdict={item.flag} /> : null}
      </div>
      <h3 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">
        <Link href={item.href} className="text-foreground no-underline underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span></Link>
      </h3>
      <Description text={item.description} className="m-0 block text-[14px] leading-[1.5] text-secondary-foreground max-sm:text-[13.5px]" />
      {counts ? (
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-track pt-3">
          <p className="m-0 text-[13.5px] leading-[1.45] text-muted-foreground">
            {week && conv.week != null ? <><b data-copy="figure" className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{fmtInt(conv.week)}</b> this week<br /></> : null}
            {conv.month != null ? <><span data-copy="figure" className="font-mono tabular-nums text-foreground">{fmtInt(conv.month)}</span> {data.week && week ? data.week.inMonth : `in ${data.month.text}`}</> : null}
          </p>
          {week && conv.weeks.length > 0 ? (
            <SpikeBars weeks={conv.weeks.map((count, i) => ({ label: labels[i] ?? '', count }))} counts="all" size="xs" ghost className="w-[136px] shrink-0" label={`${conv.label}, videos a week`} />
          ) : null}
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">{counts ? <AboutCell conv={conv} data={data} /> : null}</span>
        <Link href={item.href} className={OLINK}>Open →</Link>
      </div>
    </article>
  )
}

const TH = 'whitespace-nowrap border-b border-border pb-2.5 pr-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'
const TD = 'border-b border-track py-[11px] pr-3 align-middle'

/** "9 · 14 · 23": the three weeks as bare counts, oldest first; a week our
 *  own change cut is left out (never 0). */
function ThreeWeeks({ weeks }: { weeks: readonly (number | null)[] }) {
  const read = weeks.filter((w): w is number => w != null)
  return (
    <span className="whitespace-nowrap font-mono text-[12.5px] tabular-nums text-muted-foreground">
      {read.map((w, i) => <Fragment key={i}>{i > 0 ? ' · ' : null}<span data-copy="figure">{fmtInt(w)}</span></Fragment>)}
    </span>
  )
}

/** "All N conversations": every one, the three cards' included (F3's list),
 *  a table from 640 and a two-line list on a phone. */
function AllList({ page, data, counts }: { page: SubjectPage; data: MarketData; counts: boolean }) {
  const week = data.period === 'week'
  const total = page.inside.length
  const last = data.week?.weekLabels[data.week.weekLabels.length - 1] ?? null
  // The footnote's second half only where it is so: the conversations'
  // counts add up past the subject's own videos.
  const subjectVideos = week ? weekLevelOf(page)?.k ?? null : page.panel.level?.k ?? null
  const summed = page.inside.reduce((s, c) => s + ((week ? c.conv.week : c.conv.month) ?? 0), 0)
  const over = counts && subjectVideos != null && summed > subjectVideos
  return (
    <section aria-label={`Every conversation inside ${page.panel.name}`} className={cn(CARD, 'gap-3.5 px-[26px] pt-[22px] pb-5 max-sm:px-[18px] max-sm:py-4')}>
      <div className="min-w-0">
        <h2 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">
          {counts ? <>All <span data-copy="figure">{fmtInt(total)}</span> {total === 1 ? 'conversation' : 'conversations'}</> : 'Every conversation inside it'}
        </h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground max-sm:hidden">{counts ? `Biggest ${week ? 'this week' : `in ${data.month.text}`} first. Each opens as its own page.` : 'Each opens as its own page.'}</p>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground sm:hidden">
          {counts ? (week ? <>This week, then {data.month.text}.{last ? <> The three weeks to {last}, oldest first.</> : null}</> : <>Biggest in {data.month.text} first.</>) : 'Each opens as its own page.'}
        </p>
      </div>
      <div className="max-sm:hidden">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>Conversation</th>
              {counts ? <th scope="col" className={TH}>About</th> : null}
              {counts && week ? <th scope="col" className={cn(TH, 'text-right max-lg:hidden')}>{last ? `Three weeks to ${last}` : 'Three weeks'}</th> : null}
              {counts && week ? <th scope="col" className={cn(TH, 'text-right')}>This week</th> : null}
              {counts ? <th scope="col" className={cn(TH, 'text-right')}>{data.month.text}</th> : null}
            </tr>
          </thead>
          <tbody>
            {page.inside.map((item) => (
              <tr key={item.conv.id} className="[&:last-child>td]:border-b-0">
                <td className={TD}>
                  <Link href={item.href} className="font-medium text-foreground no-underline underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_b_theme">{item.conv.label}</span></Link>
                  {item.flag ? <FlagChip verdict={item.flag} className="ml-1.5 align-[1px]" /> : null}
                  <Description text={item.description} className="mt-0.5 block text-[12.5px] font-normal text-muted-foreground" />
                </td>
                {counts ? <td className={TD}><AboutCell conv={item.conv} data={data} /></td> : null}
                {counts && week ? <td className={cn(TD, 'text-right max-lg:hidden')}><ThreeWeeks weeks={item.conv.weeks} /></td> : null}
                {counts && week ? <td className={cn(TD, 'text-right font-mono tabular-nums')}>{item.conv.week != null ? <span data-copy="figure">{fmtInt(item.conv.week)}</span> : null}</td> : null}
                {counts ? <td className={cn(TD, 'text-right font-mono tabular-nums')}>{item.conv.month != null ? <span data-copy="figure">{fmtInt(item.conv.month)}</span> : null}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col sm:hidden">
        {page.inside.map((item) => {
          const count = week ? item.conv.week : item.conv.month
          return (
            <div key={item.conv.id} data-phone-row="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-[11px] first:border-t-0 first:pt-0">
              <span className="min-w-0 text-[14px]">
                <Link href={item.href} className="font-medium text-foreground no-underline"><span data-copy="subject" data-slot="pass_b_theme">{item.conv.label}</span></Link>
                {item.flag ? <><br /><FlagChip verdict={item.flag} className="mt-1.5" /></> : null}
              </span>
              <span className="text-right font-mono text-[13.5px] tabular-nums">{counts && count != null ? <span data-copy="figure">{fmtInt(count)}</span> : null}</span>
              {counts ? (
                <>
                  <span className="text-[12.5px] text-muted-foreground">{week && item.conv.month != null ? <><span data-copy="figure" className="font-mono text-foreground">{fmtInt(item.conv.month)}</span> {data.week?.inMonth ?? `in ${data.month.text}`}</> : null}</span>
                  <span className="justify-self-end">{week ? <ThreeWeeks weeks={item.conv.weeks} /> : null}</span>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
      {counts ? (
        <p data-inside-note="" className="m-0 text-[12.5px] text-muted-foreground">
          A video can sit in more than one conversation
          <span className="max-sm:hidden">{over ? <>, so these add up to more than the <span data-copy="figure">{fmtInt(subjectVideos!)}</span> videos in {page.panel.name} {week ? 'this week' : `in ${data.month.text}`}</> : null}</span>.
        </p>
      ) : null}
    </section>
  )
}

/** "Inside {subject}": the three biggest as cards, then all of them. A ready
 *  subject with none this period keeps the section's frame and says so. */
function InsideSection({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const counts = passed(panel)
  const week = data.period === 'week'
  const when = week ? 'this week' : `in ${panel.monthText}`
  const total = page.inside.length
  const note = counts && total > 0
    ? <><span data-copy="figure">{fmtInt(total)}</span> {total === 1 ? 'conversation' : 'conversations'} {when}{total > 3 ? <> · the three biggest, then all {inWords(total)}</> : null}</>
    : null
  return (
    <>
      <div id="inside" className="scroll-mt-6">
        <SectionHead title={`Inside ${panel.name}`} note={note} />
      </div>
      {total === 0 ? (
        <section aria-label={`Inside ${panel.name}`} data-inside-none="" className={cn(CARD, 'gap-2')}>
          <p className={GAPLINE}>{insideNone(when)}</p>
        </section>
      ) : (
        <>
          <section aria-label={`The biggest conversations inside ${panel.name}`} className="grid grid-cols-1 gap-5 max-sm:gap-3 min-[1180px]:grid-cols-3">
            {page.inside.slice(0, 3).map((item) => <ConvCard key={item.conv.id} item={item} data={data} counts={counts} />)}
          </section>
          <AllList page={page} data={data} counts={counts} />
        </>
      )}
    </>
  )
}

// ---- 4. The numbers ------------------------------------------------------------------------

/** Week by week on the level's base, month by month, then who is saying it,
 *  what people did and where, on the videos where a comment was about it. A
 *  subject that prints no figure: its state's reason in one line (U6). */
function NumbersCard({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const level = panel.level
  const detail = panel.detail ?? null
  const week = data.period === 'week'
  const inMonth = data.week?.inMonth ?? `in ${panel.monthText}`
  const weeks = week && page.weeks && page.weeks.some((w) => w != null) ? page.weeks : null
  const weekLevel = weekLevelOf(page)
  if (!level) {
    return (
      <section aria-label={`${panel.name} in numbers`} data-numbers-gap={panel.state} className={PAGE_CARD}>
        <p className={GAPLINE}>{subjectNumbersLine(panel)}</p>
      </section>
    )
  }
  return (
    <section id="subject-numbers" aria-label={`${panel.name} in numbers`} className={PAGE_CARD}>
      <div className={cn('grid grid-cols-1 gap-11 max-sm:gap-0', weeks ? 'min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : null)}>
        {weeks ? (
          <PanelSection label="Week by week · videos">
            {/* Three bare counts on the level's base, the newest in the
                accent; a week our own change cut keeps its slot. */}
            <SpikeBars weeks={weeks.map((count, i) => ({ label: page.weekLabels[i] ?? '', count }))} counts="all" size="wide" ghost className="max-w-[520px]" label={`${panel.name}, videos a week`} />
            <p className="m-0 text-[12.5px] text-muted-foreground">
              {weekLevel ? <><span data-copy="figure">{fmtInt(weekLevel.k)}</span> this week · </> : null}<span data-copy="figure">{fmtInt(level.k)}</span> {inMonth}
            </p>
          </PanelSection>
        ) : null}
        {panel.bars.length > 0 ? (
          <PanelSection label="Month by month · share of your market’s videos" className={weeks ? 'max-[1179px]:mt-6 max-sm:mt-0 max-sm:border-t max-sm:border-track max-sm:pt-[18px]' : undefined}>
            {/* Three months at every width (`MARKET_SUBJECT_PAGE_MONTHS`), the
                phone's at its smaller size. */}
            <MiniBars bars={shareBars(panel.bars)} size="lg" className="max-sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
            <MiniBars bars={shareBars(panel.bars)} size="md" className="sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
          </PanelSection>
        ) : null}
      </div>
      {detail ? <SubjectBase level={level} week={weekLevel} detail={detail} monthText={panel.monthText} /> : null}
      {detail ? (
        <div className="grid grid-cols-1 gap-x-10 gap-y-[26px] border-t border-track pt-6 max-sm:gap-y-0 max-sm:border-t-0 max-sm:pt-0 min-[1180px]:grid-cols-3">
          <PanelSection label={<>Who’s saying it · <span data-copy="level">of {fmtInt(detail.cited?.month ?? detail.doing?.n ?? 0)}</span> {`in ${panel.monthText}`}</>} className="max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
            {detail.groups.length > 0
              ? <GroupRows groups={detail.groups.slice(0, 4)} n={detail.cited?.month ?? 0} />
              : <p className="m-0 text-[13.5px] text-muted-foreground">{noGroupSaying(`in ${panel.monthText}`)}</p>}
          </PanelSection>
          <PanelSection label={detail.doing ? <>What people did · <span data-copy="level">of {fmtInt(detail.doing.n)}</span> {detail.doing.text}</> : 'What people did'} className="max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
            {detail.doing
              ? detail.doing.rows.map((r) => <TickBarRow key={r.kind} name={r.label} value={fmtInt(r.k)} pct={r.n > 0 ? (100 * r.k) / r.n : 0} valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(r.n)}`} />)
              : <p className="m-0 text-[13.5px] text-muted-foreground">Not read yet.</p>}
          </PanelSection>
          <PanelSection label={detail.platforms ? <>Where · <span data-copy="level">of {fmtInt(detail.platforms.month?.n ?? detail.platforms.n)}</span> {detail.platforms.month ? `in ${detail.platforms.month.text}` : week ? 'this week' : `in ${panel.monthText}`}</> : 'Where'} className="max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
            {detail.platforms && week && detail.platforms.month ? (
              // This week: each platform's week beside its month (decision 1).
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 gap-y-1.5 text-[13.5px]">
                <span />
                <span className="text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">This week</span>
                <span className="text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{detail.platforms.month.text}</span>
                {(detail.platforms.rows.length > 0 ? detail.platforms.rows : platformRows(detail.platforms.month.counts, 'month')?.rows ?? []).map((r) => (
                  <PlatformMonthRow key={r.platform} label={r.label} week={detail.platforms!.rows.find((x) => x.platform === r.platform)?.videos ?? 0} month={detail.platforms!.month!.counts[r.platform] ?? 0} n={detail.platforms!.month!.n} />
                ))}
                {detail.platforms.rows.length === 0 ? <p className="col-span-3 m-0 text-[13px] text-muted-foreground">{SUBJECT_NONE_THIS_WEEK}</p> : null}
              </div>
            ) : detail.platforms ? detail.platforms.rows.map((r) => (
              <TickBarRow key={r.platform} name={r.label} value={fmtInt(r.videos)} pct={r.pct} tone="ink" valueWidth="narrow" label={`${fmtInt(r.videos)} of ${fmtInt(detail.platforms!.n)}`} />
            )) : <p className="m-0 text-[13.5px] text-muted-foreground">No video counted by platform yet.</p>}
          </PanelSection>
        </div>
      ) : null}
    </section>
  )
}

// ---- 5. In their words -----------------------------------------------------------------------

/** One comment, labelled with its conversation (F3's `.qfrom`), its words
 *  the commenter's own, translated as every quote is. */
function QuotePanel({ q, data }: { q: PanelQuote; data: MarketData }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const label = translationLabel(note)
  return (
    <figure className="m-0 flex flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
      {q.from ? (
        <Link href={q.from.href} data-quote-from="" className="mb-0.5 inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-secondary-foreground no-underline underline-offset-[3px] hover:text-foreground hover:underline">
          <BubbleGlyph className="size-3 text-muted-foreground" />
          <span data-copy="subject" data-slot="pass_b_theme">{q.from.label}</span>
        </Link>
      ) : null}
      <blockquote data-copy="quote" className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground max-sm:text-[15px]">“{q.text}”</blockquote>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      <figcaption className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
        <span>{q.source}</span>
        {q.about === 'client' ? <BrandChip who="you">{data.brand}</BrandChip> : q.about && q.about !== 'market' ? <BrandChip who="rival">{q.about.slice('rival:'.length)}</BrandChip> : null}
      </figcaption>
    </figure>
  )
}

function QuotesCard({ quotes, data }: { quotes: readonly PanelQuote[]; data: MarketData }) {
  const labelled = quotes.every((q) => q.from)
  return (
    <section aria-label="In their words" className={PAGE_CARD}>
      <div className="flex flex-col gap-3">
        <Label>In their words · <span data-copy="figure">{quotes.length}</span> {quotes.length === 1 ? 'comment' : 'comments'}{labelled ? ', each from its conversation' : null}</Label>
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
          {quotes.map((q, i) => <QuotePanel key={i} q={q} data={data} />)}
        </div>
      </div>
    </section>
  )
}

// ---- 6. The Agent ------------------------------------------------------------------------------

function AskCard({ panel }: { panel: SubjectPanel }) {
  return (
    <>
      <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-3.5 px-[26px] py-5 max-sm:hidden')}>
        <p className="m-0 text-[14.5px] text-secondary-foreground">Ask what people say about {panel.name}, in your own words.</p>
        <Link href={panel.askHref} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about {panel.name}</Link>
      </section>
      {/* On a phone the Agent closes the page, full width (F3-Market-Subject-Phone). */}
      <Link href={panel.askHref} className={cn(ASK, 'justify-center sm:hidden')}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about {panel.name}</Link>
    </>
  )
}

/** The page's body under its title block, in the board's order. */
export function SubjectPageBody({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const week = data.period === 'week'
  const quotes = panel.detail?.quotes ?? []
  return (
    <>
      <HubCard page={page} data={data} />
      <ReadCard panel={panel} data={data} />
      <InsideSection page={page} data={data} />
      <SectionHead title="The numbers" note={panel.level ? <>{panel.name}’s videos, {week ? `this week beside ${panel.monthText}` : `in ${panel.monthText}`}</> : null} />
      <NumbersCard page={page} data={data} />
      {quotes.length > 0 ? <QuotesCard quotes={quotes} data={data} /> : null}
      <AskCard panel={panel} />
    </>
  )
}
