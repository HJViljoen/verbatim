import Link from 'next/link'
import type { ReactNode } from 'react'
import { MovementBadge, nonAnswerParts, signedChange } from '@/components/delta-badge'
import { BrandChip } from '@/components/colour-roles'
import { translationNote } from '@/components/quote-block'
import { CARD, commaCite, EmptyBox, FlagChip, GoLink, MiniBars, shortDates, SpikeBars, TBL, TD as KIT_TD, TD_NUM, TH as KIT_TH, toMax, translationLine, type StatItem } from '@/components/v2'
import { GO, QUOTE, ROW } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { noGroupSaying, noReadingYet, platformRows, subjectNoRead, subjectNotCompared, type InsideConv, type MarketData, type PanelQuote, type SubjectPage, type SubjectPanel } from '@/lib/pages/v2/market'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { SectionHead } from './analysis'
import { GroupRows, shareBars, SubjectBase } from './panel'
import { ABOUT_NOT_COUNTED, ABOUT_NOT_READ, BrandsNamed, Stored } from './parts'
import { WEEKS_NOT_DRAWN, WEEKS_NOT_DRAWN_TITLE } from './rail'

// A TRACKED SUBJECT'S PAGE, THE HUB (F3-Market-Subject, 17 Oct), drawn to the
// audit design's board (Market-Subject.dc.html, 7 Nov). The richest of
// Market's pages: its read, its conversations, its numbers. Its figures are
// the title's figures row (`subjectStats`: the week, this week as a count on
// the level's base, the month's videos and share, the conversations inside
// it), then, in order:
//   1. OUR READ, one tile: the stored headline as its heading, "Our read of
//      {month}", what people are saying beside what it means;
//   2. INSIDE {SUBJECT}: every conversation inside it, in one tile, each
//      opening its page (the board drops the three cards: the list holds
//      them; and the three-weeks column, small call 12);
//   3. THE NUMBERS, as tiles: week by week on the level's base and the share
//      month by month with its change; the one-base line; who is saying it,
//      what people did and where, each tile's sub naming its base, the
//      counts bare against it (decision 2) and the bars against the list's
//      largest (decision 5);
//   4. IN THEIR WORDS: three comments, a tile each, labelled with its
//      conversation;
//   5. THE AGENT, a link.
//
// RULING U6: a subject whose check has not passed prints no figure: the
// figures row says its state's line once, and the conversations inside it
// are named with no count. DECISION 1: every week figure stands beside its
// month, and a change word comes only from a `Verdict`; the only chip a week
// earns is "Unusual this week". The week is a COUNT on the level's base
// ("82 of 241 videos"), never a percent beside the month's percent.

/** A page's card: its padding and rhythm. */
export const PAGE_CARD = cn(CARD, 'gap-[26px] sm:p-[30px] max-sm:gap-5')
/** Written prose on a page. */
export const READ = 'm-0 text-[16px] leading-[1.65] text-foreground max-sm:text-[15px] max-sm:leading-[1.6]'
/** A state said in one line inside its card. */
const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-secondary-foreground'
/** A heading inside a tile (the board's h3). */
const H3 = 'm-0 text-[15px] leading-[1.4] font-semibold text-secondary-foreground'
/** The kit's table cells, at the board's rhythm. */
const TH = cn(KIT_TH, 'whitespace-nowrap')
const TD = cn(KIT_TD, 'py-3 align-top')

/** A ready subject with no read for the month: its card's line. */
export const SUBJECT_NO_READ = subjectNoRead

/** Where the week holds none of the subject's videos and the month some:
 *  the block keeps its frame and says so (the parity rule, 14 Oct). */
export const SUBJECT_NONE_THIS_WEEK = 'No video this week.'

/** A subject that prints no figure: its numbers card, in one line (U6). In
 *  plain words (5 Nov: "until its check passes" was our machinery). */
export const SUBJECT_NUMBERS_HELD = 'We’re still checking which comments belong to this subject, so there are no figures for it yet.'

/** A subject whose check has not passed: its read card, in one line. No read
 *  is written for it (`subjectOwnRead`), so none prints. */
export const SUBJECT_READ_HELD = 'We’re still checking which comments belong to this subject, so there’s no read of it yet.'

/**
 * THE NUMBERS CARD OF A SUBJECT THAT PRINTS NO FIGURE, in one line: the
 * state's own reason (17 Oct). Not read in the month yet, the month's own
 * line (`noReadingYet`); its check open or failed, why no figure prints
 * (the figures row above already says "Not measured yet" or the failed
 * line, so this place does not repeat it). Pure.
 */
export function subjectNumbersLine(panel: Pick<SubjectPanel, 'state' | 'monthText'>): string {
  if (panel.state === 'unread') return noReadingYet(panel.monthText)
  return SUBJECT_NUMBERS_HELD
}

/** The week's figure where its count on the level's base could not be read
 *  (`SubjectPage.week` is `'unread'`): said in its cell, never a figure from
 *  another base. */
export const SUBJECT_WEEK_UNREAD = 'This week’s videos could not be read just now.'

/** Words as a sentence opens them: "no clear change" as "No clear change". */
const sentenceCase = (words: string): string => `${words.charAt(0).toUpperCase()}${words.slice(1)}`

/** The change where none prints: the Dashboard week tile's words for the
 *  same state (`subjectNotCompared`), as a sentence in its frame. No reason,
 *  by the one condition (plan §0a). */
export const subjectChangeGap = (prev: string): string => `${sentenceCase(subjectNotCompared(prev))}.`

/** A ready subject with no conversation this period: the Inside section's
 *  frame, and one line. */
export const insideNone = (when: string): string => `No conversation in it reached three videos ${when}.`

/** Whether the change has a change to draw: `MovementBadge` draws nothing
 *  for no verdict or a refused one, and the tile then says so. */
const changeDrawn = (verdict: SubjectPanel['verdict']): boolean => verdict != null && verdict.state !== 'refused'

/** This week's count on the level's base, where it was read (a dump from
 *  before it has none). */
export const weekLevelOf = (page: Pick<SubjectPage, 'week'>): { k: number; n: number } | null =>
  page.week && page.week !== 'unread' ? page.week : null

/** Its check passed: its words print, and its conversations' own counts. */
const passed = (panel: Pick<SubjectPanel, 'state'>): boolean => panel.state === 'ready' || panel.state === 'unread'

/** One to twelve in words, as the boards write a count in a sentence
 *  ("Three comments"); a digit past that. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const inWords = (n: number): string => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n))

/** The change's title (a badge's word, or its arrow and change). */
const FW = 'text-[22px] leading-[1.3] font-semibold tracking-[-0.01em] text-foreground'

// ---- 0. The figures row ------------------------------------------------------------------

/**
 * The subject's figures row (the board's four cells): the week; this week
 * as a count on the level's base ("32 of 162 videos"); the month's videos
 * and its share ("199 of 766 videos, 26%"); the conversations inside it. Off
 * the week, the month and its two. A subject that prints no figure (U6) says
 * its state's line once, in the month's cell, and a ready one with no
 * reading this month the month's own line. Pure.
 */
export function subjectStats(page: SubjectPage, data: MarketData): StatItem[] {
  const { panel } = page
  const week = data.period === 'week' && data.week ? data.week : null
  const level = panel.level
  // Off the week, the month's own cell names the period.
  const cells: StatItem[] = week ? [{ key: 'week', term: 'Week', value: shortDates(week.dates) }] : []
  const conversations: StatItem = {
    key: 'conversations',
    term: week ? 'Conversations this week' : `Conversations in ${panel.monthText}`,
    // "See them below" jumps to the list (live's link, lost in the redesign
    // and restored: the operator pass, 8 Nov), underlined, no arrow.
    value: page.insideTotal > 0
      ? <><span data-copy="figure">{fmtInt(page.insideTotal)}</span> <a href="#inside" data-see-below="" className={cn(GO, 'ml-1.5 text-[13.5px] font-normal')}>See them below</a></>
      : <span data-copy="figure">{fmtInt(page.insideTotal)}</span>,
  }
  if (!level) {
    // Its check open or failed: its state's line, once (U6). Its check
    // passed and the month not read for it yet: the month's own line.
    const line = panel.state === 'unread' ? noReadingYet(panel.monthText) : panel.note ?? SUBJECT_NOT_MEASURED
    cells.push({ key: 'month', term: sentenceCase(panel.monthText), value: <span data-subject-state={panel.state} className="font-normal">{line}</span> })
    if (passed(panel)) cells.push(conversations)
    return cells
  }
  if (week && page.week !== undefined) {
    const w = weekLevelOf(page)
    cells.push({
      key: 'this-week', term: 'This week',
      value: w ? <span data-copy="level">{fmtInt(w.k)} of {fmtInt(w.n)} videos</span> : <span data-week-gap="" className="font-normal">{SUBJECT_WEEK_UNREAD}</span>,
    })
  }
  const pct = Math.round((100 * level.k) / Math.max(1, level.n))
  cells.push({ key: 'month', term: sentenceCase(panel.monthText), value: <><span data-copy="level">{fmtInt(level.k)} of {fmtInt(level.n)} videos</span>, <span data-copy="figure">{pct}%</span></> })
  cells.push(conversations)
  return cells
}

// ---- 1. The read --------------------------------------------------------------------------

/** "Our read of {month}": the line under the read's heading (the board's). */
export const ourReadOf = (monthText: string): string => `Our read of ${monthText}`

/** The read's tile (the board's merged hub and read): the stored headline as
 *  its heading where the read has one (never an invented one), "Our read of
 *  {month}" under it, then what people are saying beside what it means
 *  (stored prose), printed exactly where its card on the top page prints a
 *  read (`subjectOwnRead`). Else the state's own line, in its frame. */
function ReadCard({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const read = passed(panel) ? panel.read ?? null : null
  const headline = read && !read.thin ? read.headline ?? null : null
  const written = read && !read.thin && read.lines.length > 0 ? read : null
  const head = headline
    ? (
      <div className="flex flex-col gap-1.5">
        <Stored as="h2" id="subject-head" line={headline} slot="week_read" className="m-0 max-w-[1000px] text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-foreground max-sm:text-[21px]" />
        <p className="m-0 text-[14px] leading-[1.45] text-muted-foreground">{ourReadOf(panel.monthText)}</p>
      </div>
    )
    : <h2 id="subject-head" className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{ourReadOf(panel.monthText)}</h2>
  if (written) {
    return (
      <article id="subject-read" aria-labelledby="subject-head" className={PAGE_CARD}>
        {head}
        <div className="grid grid-cols-1 gap-12 border-t border-track pt-[26px] max-sm:gap-0 max-sm:pt-[18px] min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-3.5 max-sm:gap-3">
            <h3 className={H3}>What people are saying</h3>
            {written.lines.map((l, i) => <Stored key={i} line={l} slot="week_read" className={READ} />)}
          </div>
          {written.means ? (
            <div className="flex min-w-0 flex-col gap-3.5 max-[1179px]:border-t max-[1179px]:border-track max-[1179px]:pt-6 max-sm:mt-[18px] max-sm:gap-3 max-sm:pt-[18px]">
              <h3 className={H3}>What it means</h3>
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
    <article id="subject-read" aria-labelledby="subject-head" data-subject-read={read?.thin ? 'thin' : passed(panel) ? 'no_read' : panel.state} className={PAGE_CARD}>
      {head}
      <div className="flex flex-col gap-3">
        <h3 className={H3}>What people are saying</h3>
        {line}
        {/* A tenant whose reads are switched off: the week read's sentence on
            it stands in, as the 14 Oct panel's did. */}
        {passed(panel) && !read && panel.sentence ? <Stored line={panel.sentence} slot="week_read" className={READ} /> : null}
      </div>
    </article>
  )
}

// ---- 2. Inside {subject} ----------------------------------------------------------------------

/** The brands a conversation's videos name, or why that is not said. */
function BrandsCell({ conv, data }: { conv: InsideConv['conv']; data: MarketData }) {
  if (data.brands !== 'counted') return <span className="text-[13px] text-muted-foreground">{data.brands === 'not_counted' ? ABOUT_NOT_COUNTED : ABOUT_NOT_READ}</span>
  return <BrandsNamed parts={conv.who} brand={data.brand} noun={data.noun} />
}

/** A conversation's description (Pass B's), as its own page reads it. */
function Description({ text, className }: { text: string | null | undefined; className: string }) {
  if (!text) return null
  return <span data-copy="subject" data-slot="pass_b_theme" className={className}>{text}</span>
}

/** Every conversation inside it, biggest first, in one tile (the board's):
 *  its name (its page) and description, the brands named, this week and the
 *  month; a two-line list on a phone; the footnote. With `counts` false (its
 *  check not passed, U6) the names and descriptions alone. */
function AllList({ page, data, counts }: { page: SubjectPage; data: MarketData; counts: boolean }) {
  const week = data.period === 'week'
  // The footnote's second half only where it is so: the conversations'
  // counts add up past the subject's own videos.
  const subjectVideos = week ? weekLevelOf(page)?.k ?? null : page.panel.level?.k ?? null
  const summed = page.inside.reduce((s, c) => s + ((week ? c.conv.week : c.conv.month) ?? 0), 0)
  const over = counts && subjectVideos != null && summed > subjectVideos
  return (
    <section aria-label={`Every conversation inside ${page.panel.name}`} className={cn(CARD, 'gap-3.5')}>
      <div className="max-sm:hidden">
        <table className={TBL}>
          <thead>
            <tr>
              <th scope="col" className={TH}>Conversation</th>
              {counts ? <th scope="col" className={TH}>Brands named</th> : null}
              {counts && week ? <th scope="col" className={cn(TH, TD_NUM)}>This week</th> : null}
              {counts ? <th scope="col" className={cn(TH, TD_NUM, 'pr-0')}>{data.month.text}</th> : null}
            </tr>
          </thead>
          <tbody>
            {page.inside.map((item) => (
              <tr key={item.conv.id}>
                <td className={TD}>
                  <Link href={item.href} className={ROW}><span data-copy="subject" data-slot="pass_b_theme">{item.conv.label}</span></Link>
                  {item.flag ? <FlagChip verdict={item.flag} className="ml-1.5 align-[1px]" /> : null}
                  <Description text={item.description} className="mt-0.5 block text-[14px] font-normal text-secondary-foreground" />
                </td>
                {counts ? <td className={cn(TD, 'text-[14px]')}><BrandsCell conv={item.conv} data={data} /></td> : null}
                {counts && week ? <td className={cn(TD, TD_NUM, 'font-semibold')}>{item.conv.week != null ? <span data-copy="figure">{fmtInt(item.conv.week)}</span> : null}</td> : null}
                {counts ? <td className={cn(TD, TD_NUM, 'pr-0 text-secondary-foreground')}>{item.conv.month != null ? <span data-copy="figure">{fmtInt(item.conv.month)}</span> : null}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col sm:hidden">
        {page.inside.map((item) => {
          const count = week ? item.conv.week : item.conv.month
          return (
            <div key={item.conv.id} data-phone-row="" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-t border-track py-3 first:border-t-0 first:pt-0">
              <span className="min-w-0 text-[15px]">
                <Link href={item.href} className={ROW}><span data-copy="subject" data-slot="pass_b_theme">{item.conv.label}</span></Link>
                {item.flag ? <><br /><FlagChip verdict={item.flag} className="mt-1.5" /></> : null}
              </span>
              <span className="text-right text-[15px] font-semibold tabular-nums">{counts && count != null ? <span data-copy="figure">{fmtInt(count)}</span> : null}</span>
              {counts && week ? (
                <span className="col-span-2 text-[13px] text-muted-foreground">{item.conv.month != null ? <><span data-copy="figure" className="tabular-nums text-foreground">{fmtInt(item.conv.month)}</span> {data.week?.inMonth ?? `in ${data.month.text}`}</> : null}</span>
              ) : null}
            </div>
          )
        })}
      </div>
      {counts ? (
        <p data-inside-note="" className="m-0 text-[14px] text-muted-foreground">
          A video can sit in more than one conversation
          {over ? <>, so these add up to more than the <span data-copy="figure">{fmtInt(subjectVideos!)}</span> videos in {page.panel.name} {week ? 'this week' : `in ${data.month.text}`}</> : null}.
        </p>
      ) : null}
    </section>
  )
}

/** "Inside {subject}": every conversation inside it, in one tile. A ready
 *  subject with none this period keeps the section's frame and says so. */
function InsideSection({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const counts = passed(panel)
  const week = data.period === 'week'
  const when = week ? 'this week' : `in ${panel.monthText}`
  const total = page.inside.length
  return (
    <>
      <div id="inside" className="scroll-mt-6">
        <SectionHead title={`Inside ${panel.name}`} note={total > 0 ? (counts ? `Biggest ${when} first. Each opens as its own page.` : 'Each opens as its own page.') : null} />
      </div>
      {total === 0 ? (
        <section aria-label={`Inside ${panel.name}`} data-inside-none="" className={cn(CARD, 'gap-2')}>
          <p className={GAPLINE}>{insideNone(when)}</p>
        </section>
      ) : <AllList page={page} data={data} counts={counts} />}
    </>
  )
}

// ---- 3. The numbers ------------------------------------------------------------------------

/** A tile of the numbers (the board's): its heading, its sub (what its rows
 *  are of, the base said once), its body. */
function Tile({ title, sub, children, ...rest }: { title: string; sub?: ReactNode; children: ReactNode; [data: `data-${string}`]: string }) {
  return (
    <article {...rest} className={cn(CARD, 'gap-4')}>
      <div>
        <h3 className="m-0 text-[18px] leading-[1.3] font-semibold text-foreground">{title}</h3>
        {sub ? <p className="m-0 mt-1.5 text-[14px] leading-[1.45] text-muted-foreground">{sub}</p> : null}
      </div>
      {children}
    </article>
  )
}

/** The change against last month, from its `Verdict` alone; or, with no
 *  change to draw, the Dashboard week tile's words in the dashed box. */
function Change({ page, data }: { page: SubjectPage; data: MarketData }) {
  const verdict = page.panel.verdict
  if (!changeDrawn(verdict)) return <div data-fig-gap=""><EmptyBox>{subjectChangeGap(data.month.prev.text)}</EmptyBox></div>
  const nonAnswer = nonAnswerParts(verdict, 'pts')
  const prev = verdict?.baseline ?? null
  return (
    <div data-change="" className="flex flex-col gap-1">
      {nonAnswer ? (
        // A non-answer: the badge's word is the title, and the change it
        // refused opens the line under it, so the claim stays checkable.
        <div data-copy="verdict" title={nonAnswer.title} className={FW}>{sentenceCase(nonAnswer.word)}</div>
      ) : (
        <div data-copy="verdict" className={cn(FW, '[&>span]:text-[length:inherit] [&>span]:leading-[inherit] [&>span]:font-[inherit] [&>span]:text-foreground')}>
          <MovementBadge verdict={verdict} unit="pts" good="neutral" bandTip />
        </div>
      )}
      <div className="text-[14px] leading-[1.45] text-foreground">
        {nonAnswer?.change != null ? <><span data-copy="verdict" className="whitespace-nowrap">{signedChange(nonAnswer.change, 'pts')}</span> </> : null}
        against {data.month.prev.text}{page.prevPct != null ? <>, <span data-copy="figure">{Math.round(page.prevPct)}%</span></> : null}
      </div>
      {prev && page.prevPct != null ? <div className="text-[13.5px] text-muted-foreground"><span data-copy="level">{fmtInt(prev.k)} of {fmtInt(prev.n)}</span> in {data.month.prev.text}</div> : null}
    </div>
  )
}

/** A row of a numbers tile's list: the name, a bar against the list's
 *  largest (decision 5), the bare count (the tile's sub says its base). */
function BarRow({ name, k, pct }: { name: ReactNode; k: number; pct: number }) {
  return (
    <div role="listitem" className="grid grid-cols-[minmax(0,1fr)_96px_40px] items-center gap-3 text-[15px] leading-[1.35]">
      <span className="min-w-0">{name}</span>
      <div aria-hidden className="h-2 rounded-[4px] bg-track"><div className="h-2 rounded-[4px] bg-brand" style={{ width: `${pct}%` }} /></div>
      <span data-copy="figure" className="text-right tabular-nums">{fmtInt(k)}</span>
    </div>
  )
}

/** Week by week on the level's base, the share month by month with its
 *  change, the one-base line, then who is saying it, what people did and
 *  where, on the videos where a comment was about it, each tile's sub naming
 *  its base. A subject that prints no figure: its state's reason in one line
 *  (U6). */
function NumbersSection({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const level = panel.level
  const detail = panel.detail ?? null
  const week = data.period === 'week'
  const weeks = week && page.weeks && page.weeks.some((w) => w != null) ? page.weeks : null
  const weekLevel = weekLevelOf(page)
  if (!level) {
    return (
      <section aria-label={`${panel.name} in numbers`} data-numbers-gap={panel.state} className={PAGE_CARD}>
        <p className={GAPLINE}>{subjectNumbersLine(panel)}</p>
      </section>
    )
  }
  const cited = detail?.cited?.month ?? detail?.doing?.n ?? null
  const ofCited = cited != null ? <>Videos in {panel.monthText}, of <span data-copy="figure">{fmtInt(cited)}</span></> : <>Videos in {panel.monthText}</>
  return (
    <section id="subject-numbers" aria-label={`${panel.name} in numbers`} className="flex flex-col gap-5">
      <div className={cn('grid grid-cols-1 gap-5', week ? 'min-[1180px]:grid-cols-2' : null)}>
        {week ? (
          <Tile title="Videos, week by week" sub="By the week people commented" data-weeks="">
            {weeks ? (
              // Three bare counts on the level's base, in the market's yellow
              // (a subject earns no week chip); a week our own change cut
              // draws nothing in its column.
              // The phone's own drawing under 640, so its text stays at 12px.
              <>
                <SpikeBars weeks={weeks.map((count, i) => ({ label: page.weekLabels[i] ?? '', count }))} counts="all" size="wide" highlightLast={false} className="max-w-[520px] max-sm:hidden" label={`${panel.name}, videos a week`} />
                <SpikeBars weeks={weeks.map((count, i) => ({ label: page.weekLabels[i] ?? '', count }))} counts="all" size="phone" highlightLast={false} className="max-w-[360px] sm:hidden" label={`${panel.name}, videos a week`} />
              </>
            ) : <EmptyBox chart title={WEEKS_NOT_DRAWN_TITLE}>{WEEKS_NOT_DRAWN}</EmptyBox>}
          </Tile>
        ) : null}
        <Tile title="Share of your market’s videos" sub="Month by month" data-share="">
          <Change page={page} data={data} />
          {/* The tile's own drawing at 640 and over, the phone's under it, so
              the text stays at 12px at both. */}
          {panel.bars.length > 0 ? (
            <>
              <MiniBars bars={shareBars(panel.bars)} size="half" highlight={null} className="max-w-[480px] max-sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
              <MiniBars bars={shareBars(panel.bars)} size="md" highlight={null} className="max-w-[360px] sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
            </>
          ) : null}
        </Tile>
      </div>
      {detail ? <SubjectBase level={level} week={weekLevel} detail={detail} monthText={panel.monthText} /> : null}
      {detail ? (
        <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
          <Tile title="Who’s saying it" sub={<>{ofCited}. Each opens in Voices.</>} data-saying="">
            {detail.groups.length > 0
              ? <GroupRows groups={detail.groups.slice(0, 4)} n={cited} note={false} />
              : <p className="m-0 text-[14px] text-secondary-foreground">{noGroupSaying(`in ${panel.monthText}`)}</p>}
          </Tile>
          <Tile title="What people did" sub={detail.doing ? <>Videos {detail.doing.text}, of <span data-copy="figure">{fmtInt(detail.doing.n)}</span></> : null} data-did="">
            {detail.doing ? (() => {
              const bar = toMax(detail.doing.rows.map((r) => r.k))
              return <div role="list" className="flex flex-col gap-2.5">{detail.doing.rows.map((r) => <BarRow key={r.kind} name={r.label} k={r.k} pct={bar(r.k)} />)}</div>
            })() : <p className="m-0 text-[14px] text-secondary-foreground">Not read yet.</p>}
          </Tile>
          <Tile title="Where it’s said" sub={detail.platforms ? <>Videos by platform.{detail.platforms.month ? <> {detail.platforms.month.text.replace(/^in /, '').replace(/^./, (c) => c.toUpperCase())} counts are of <span data-copy="figure">{fmtInt(detail.platforms.month.n)}</span>.</> : null}</> : null} data-where="">
            {detail.platforms ? (
              <table className={TBL}>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Platform</th>
                    {detail.platforms.month && week ? <th scope="col" className={cn(TH, TD_NUM)}>This week</th> : null}
                    <th scope="col" className={cn(TH, TD_NUM, 'pr-0')}>{detail.platforms.month ? detail.platforms.month.text.replace(/^in /, '').replace(/^./, (c) => c.toUpperCase()) : 'Videos'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.platforms.month && week
                    ? (detail.platforms.rows.length > 0 ? detail.platforms.rows : platformRows(detail.platforms.month.counts, 'month')?.rows ?? [])
                    : detail.platforms.rows).map((r) => (
                    <tr key={r.platform}>
                      <td className={cn(TD, 'py-2.5')}>{r.label}</td>
                      {detail.platforms!.month && week ? <td className={cn(TD, TD_NUM, 'py-2.5')}><span data-copy="figure">{fmtInt(detail.platforms!.rows.find((x) => x.platform === r.platform)?.videos ?? 0)}</span></td> : null}
                      <td className={cn(TD, TD_NUM, 'py-2.5 pr-0 text-secondary-foreground')}><span data-copy="figure">{fmtInt(detail.platforms!.month && week ? detail.platforms!.month.counts[r.platform] ?? 0 : r.videos)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="m-0 text-[14px] text-secondary-foreground">No video counted by platform yet.</p>}
            {detail.platforms && week && detail.platforms.month && detail.platforms.rows.length === 0 ? <p className="m-0 text-[14px] text-secondary-foreground">{SUBJECT_NONE_THIS_WEEK}</p> : null}
          </Tile>
        </div>
      ) : null}
    </section>
  )
}

// ---- 4. In their words -----------------------------------------------------------------------

/** One comment in its tile, labelled with its conversation, its words the
 *  commenter's own: the quote, its language line and its English where it
 *  has them, then where and when ("TikTok, 27 Oct"). */
function QuoteTile({ q, data }: { q: PanelQuote; data: MarketData }) {
  const note = translationNote({ lang: q.lang, english: q.english })
  const line = translationLine({ language: note.language, english: note.english })
  return (
    // The tile, its conversation's link, then the quote in the grey box the
    // week's and the conversation's pages give theirs (the board's `.q`).
    <article className={cn(CARD, 'gap-3.5')}>
      {q.from ? (
        <Link href={q.from.href} data-quote-from="" className={cn(ROW, 'self-start text-[15px]')}>
          <span data-copy="subject" data-slot="pass_b_theme">{q.from.label}</span>
        </Link>
      ) : null}
      <figure className="m-0 flex flex-col gap-2 rounded-[10px] bg-inner px-[18px] py-4">
        <blockquote data-copy="quote" className={cn('m-0 text-foreground', QUOTE)}>“{q.text}”</blockquote>
        {line ? <span className="text-[13px] text-muted-foreground">{line}</span> : null}
        {note.english ? <p data-copy="quote" className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">{note.english}</p> : null}
        <figcaption className="text-[13px] text-muted-foreground">
          {commaCite(q.source)}
          {q.about === 'client' ? <>, <BrandChip who="you" plain>{data.brand}</BrandChip></> : q.about && q.about !== 'market' ? <>, <BrandChip who="rival" plain>{q.about.slice('rival:'.length)}</BrandChip></> : null}
        </figcaption>
      </figure>
    </article>
  )
}

function QuotesSection({ quotes, data }: { quotes: readonly PanelQuote[]; data: MarketData }) {
  const labelled = quotes.every((q) => q.from)
  const count = sentenceCase(inWords(quotes.length))
  return (
    <>
      <SectionHead title="In their words" note={<>{count} {quotes.length === 1 ? 'comment' : 'comments'}{labelled ? ', each from its conversation' : null}</>} />
      <section aria-label="In their words" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {quotes.map((q, i) => <QuoteTile key={i} q={q} data={data} />)}
      </section>
    </>
  )
}

// ---- 5. The Agent ------------------------------------------------------------------------------

function AskCard({ panel }: { panel: SubjectPanel }) {
  return (
    <section aria-label="Ask the Agent" className={cn(CARD, 'mt-[26px] flex-row flex-wrap items-center justify-between gap-3.5')}>
      <p className="m-0 text-[15px] text-secondary-foreground">Ask what people say about {panel.name}, in your own words.</p>
      <GoLink href={panel.askHref}>Ask the Agent about {panel.name}</GoLink>
    </section>
  )
}

/** The page's body under its title block, in the board's order. */
export function SubjectPageBody({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const quotes = panel.detail?.quotes ?? []
  return (
    <>
      <ReadCard page={page} data={data} />
      <InsideSection page={page} data={data} />
      <SectionHead title="The numbers" />
      <NumbersSection page={page} data={data} />
      {quotes.length > 0 ? <QuotesSection quotes={quotes} data={data} /> : null}
      <AskCard panel={panel} />
    </>
  )
}
