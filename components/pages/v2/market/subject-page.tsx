import Link from 'next/link'
import type { ReactNode } from 'react'
import { List, Sparkles } from 'lucide-react'
import { MovementBadge } from '@/components/delta-badge'
import { EYEBROW, IconTile } from '@/components/colour-roles'
import { CARD, MiniBars, PanelSection, SpikeBars, TickBarRow } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { platformRows, type MarketData, type SubjectPage, type SubjectPanel } from '@/lib/pages/v2/market'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { SectionHead } from './analysis'
import { ASK, GroupRows, QuotesSection, shareBars, SubjectBase } from './panel'
import { Label, OLINK, Stored } from './parts'
import { PlatformMonthRow } from './rail'
import { ConversationRows } from './table'

// A TRACKED SUBJECT'S PAGE (depth as pages, 17 Oct; boards F2-Market-Subject,
// -Switcher and -Phone): the subject fills the page. Its read first ("Our
// read": the headline, what people are saying beside what it means), then
// the numbers (the four tiles, week by week, month by month, who is saying
// it, what people did, where, three comments, the Agent), then the
// conversations inside it. The data and builders are the 14 Oct subject
// panel's (`buildSubjectPanel`, `subjectDetailOf`), moved into a page.
//
// RULING U6: a subject whose check has not passed carries its name, why
// (`SUBJECT_NOT_MEASURED`, or `FAILED_EXPLAINED` for a failed check, said once
// on its page) and the conversations inside it by name: no figure, no line,
// no chip count. DECISION 1: every week figure stands beside its month, and a
// change word comes only from a `Verdict` (the month against the month
// before).

/** The boards' `.pcard`: a page card's padding and rhythm. */
export const PAGE_CARD = cn(CARD, 'gap-[26px] sm:px-[34px] sm:pt-[30px] sm:pb-8 max-sm:gap-5 max-sm:px-[18px] max-sm:py-5')
/** The boards' `.phd`: a page card's headline. */
const PAGE_HEAD = 'm-0 max-w-[900px] text-[28px] leading-[1.28] font-semibold tracking-[-0.02em] text-foreground max-sm:text-[21px] max-sm:leading-[1.3]'
/** The boards' `.read`: written prose on a page. */
export const READ = 'm-0 text-[15.5px] leading-[1.62] text-foreground max-sm:text-[15px] max-sm:leading-[1.6]'
/** A state said in one line inside its card. */
const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground'

/** A ready subject with no read for the month. */
export const SUBJECT_NO_READ = (name: string, month: string) => `No read of ${name} in ${longMonth(month)} yet.`

/** Where the week holds none of the subject's videos and the month some:
 *  the block keeps its frame and says so (the parity rule, 14 Oct). */
export const SUBJECT_NONE_THIS_WEEK = 'No video this week.'

/** The unready page's numbers card, in one line (U6). */
export const SUBJECT_NUMBERS_HELD = 'No figure prints for this subject until its check passes.'

/** The week tile where its share on the level's base could not be read
 *  (`SubjectPage.week` is `'unread'`): said in its frame, never a figure from
 *  another base. */
export const SUBJECT_WEEK_UNREAD = 'This week’s share could not be read just now.'

/** One tile of the four (the boards' `.stat`): a big value over its label. */
function Tile({ value, children, figure = true }: { value: ReactNode; children: ReactNode; figure?: boolean }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-inner px-4 pt-4 pb-3.5 max-sm:p-[13px] max-sm:pb-3">
      <div data-copy={figure ? 'figure' : undefined} className="font-mono text-[30px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[24px]">{value}</div>
      <div className="mt-2 text-[12.5px] leading-[1.4] text-muted-foreground">{children}</div>
    </div>
  )
}

/** A tile whose figure could not be read: its frame, and one calm line. */
function GapTile({ children }: { children: ReactNode }) {
  return (
    <div data-tile-gap="" className="min-w-0 rounded-[10px] bg-inner px-4 pt-4 pb-3.5 max-sm:p-[13px] max-sm:pb-3">
      <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">{children}</p>
    </div>
  )
}

/** This week's share on the level's base, where it was read (a dump from
 *  before it has none). */
export const weekLevelOf = (page: Pick<SubjectPage, 'week'>): { k: number; n: number } | null =>
  page.week && page.week !== 'unread' ? page.week : null

/** "Our read · October so far": the headline, then what people are saying
 *  beside what it means; or the state's own line. */
function ReadCard({ panel, data }: { panel: SubjectPanel; data: MarketData }) {
  const read = panel.state === 'ready' ? panel.read ?? null : null
  const written = read && !read.thin && read.lines.length > 0 ? read : null
  const eyebrow = <p className={cn('m-0', EYEBROW)}>Our read · {panel.monthText}</p>
  if (written) {
    return (
      <article id="subject-read" aria-labelledby={written.headline ? 'subject-head' : undefined} className={PAGE_CARD}>
        <div className="flex flex-col gap-2">
          {eyebrow}
          {written.headline ? <Stored as="h2" id="subject-head" line={written.headline} slot="week_read" className={PAGE_HEAD} /> : null}
        </div>
        <div className="grid grid-cols-1 gap-11 border-t border-track pt-6 max-sm:gap-0 max-sm:pt-[18px] min-[1180px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3.5 max-sm:gap-3">
            <Label>What people are saying</Label>
            {written.lines.map((l, i) => <Stored key={i} line={l} slot="week_read" className={READ} />)}
          </div>
          {written.means ? (
            <div className="flex min-w-0 flex-col gap-3.5 max-[1179px]:mt-6 max-[1179px]:border-t max-[1179px]:border-track max-[1179px]:pt-6 max-sm:mt-[18px] max-sm:gap-3 max-sm:pt-[18px]">
              <Label>What it means</Label>
              <Stored line={written.means} slot="week_read" className={READ} />
            </div>
          ) : null}
        </div>
      </article>
    )
  }
  // Thin (code's one line), not measured, failed, or no read this month: the
  // card's own state line, in its frame.
  const line = read?.thin ? <Stored line={read.lines[0]} slot="week_read" className={GAPLINE} />
    : panel.state === 'ready' ? <p className={GAPLINE}>{SUBJECT_NO_READ(panel.name, data.month.month)}</p>
      : <p data-subject-state={panel.state} className={GAPLINE}>{panel.note ?? SUBJECT_NOT_MEASURED}</p>
  return (
    <article id="subject-read" data-subject-read={read?.thin ? 'thin' : panel.state === 'ready' ? 'no_read' : panel.state} className={PAGE_CARD}>
      <div className="flex flex-col gap-3">
        {eyebrow}
        {line}
        {/* A tenant whose reads are switched off: the week read's sentence on
            it stands in, as the 14 Oct panel's did. */}
        {panel.state === 'ready' && !read && panel.sentence ? <Stored line={panel.sentence} slot="week_read" className={READ} /> : null}
      </div>
    </article>
  )
}

/** The numbers (F2-Market-Subject): the tiles, week by week and month by
 *  month, who is saying it, what people did, where, three comments, the
 *  Agent. A ready subject's alone (U6). */
function NumbersCard({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const level = panel.level
  const detail = panel.detail ?? null
  const week = data.period === 'week'
  // This week's share, on the month tile's own base (17 Oct): its figure, or
  // the line saying it could not be read.
  const weekStat = week ? page.week ?? null : null
  const inMonth = data.week?.inMonth ?? `in ${panel.monthText}`
  const insideWords = week ? 'this week' : `in ${panel.monthText}`
  const pct = (k: number, n: number) => `${Math.round((100 * k) / Math.max(1, n))}%`
  const weeks = detail?.weeks ?? null
  if (!level) {
    return (
      <section aria-label={`${panel.name} in numbers`} className={PAGE_CARD}>
        <p className={GAPLINE}>{SUBJECT_NUMBERS_HELD}</p>
      </section>
    )
  }
  return (
    <section id="subject-numbers" aria-label={`${panel.name} in numbers`} className={PAGE_CARD}>
      <div className={cn('grid grid-cols-2 gap-3 max-sm:gap-2.5', weekStat ? 'min-[1180px]:grid-cols-4' : 'min-[1180px]:grid-cols-3')}>
        {weekStat === 'unread'
          ? <GapTile>{SUBJECT_WEEK_UNREAD}</GapTile>
          : weekStat ? <Tile value={pct(weekStat.k, weekStat.n)}><span data-copy="level">{fmtInt(weekStat.k)} of {fmtInt(weekStat.n)}</span> videos this week</Tile> : null}
        <Tile value={(
          // The board's 26px change, drawn by the one badge; a non-answer
          // ("no clear change") at the tile's quieter size.
          <span data-copy="verdict" className={cn('block font-sans tracking-[-0.01em] [&>span]:leading-[1.15]', panel.verdict?.state === 'moved' ? '[&>span]:text-[26px] max-sm:[&>span]:text-[22px]' : '[&>span]:text-[17px] max-sm:[&>span]:text-[15px]')}>
            <MovementBadge verdict={panel.verdict} unit="pts" good="neutral" bandTip />
          </span>
        )} figure={false}>
          {panel.monthText} against {data.month.prev.text}{page.prevPct != null ? <>, <span data-copy="figure">{Math.round(page.prevPct)}%</span></> : null}
        </Tile>
        <Tile value={pct(level.k, level.n)}><span data-copy="level">{fmtInt(level.k)} of {fmtInt(level.n)}</span> videos {inMonth}</Tile>
        <Tile value={fmtInt(page.insideTotal)}>conversations inside it {insideWords}</Tile>
      </div>
      {detail ? <SubjectBase level={level} week={weekLevelOf(page)} detail={detail} monthText={panel.monthText} /> : null}
      <div className={cn('grid grid-cols-1 gap-11 max-sm:gap-0', week && weeks ? 'min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : null)}>
        {week && weeks ? (
          <PanelSection label="Week by week · videos">
            <SpikeBars weeks={weeks.map((count, i) => ({ label: page.weekLabels[i] ?? '', count }))} counts="all" ghost className="max-w-[560px]" label={`Videos a week about ${panel.name}`} />
          </PanelSection>
        ) : null}
        {panel.bars.length > 0 ? (
          <PanelSection label="Month by month · share of your market’s videos" className={week && weeks ? 'max-[1179px]:mt-6 max-sm:mt-0 max-sm:border-t max-sm:border-track max-sm:pt-[18px]' : undefined}>
            {/* Three months at every width (`MARKET_SUBJECT_PAGE_MONTHS`), the
                phone's at its smaller size. */}
            <MiniBars bars={shareBars(panel.bars)} size="lg" className="max-sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
            <MiniBars bars={shareBars(panel.bars)} size="md" className="sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
          </PanelSection>
        ) : null}
      </div>
      {detail ? (
        <div className="grid grid-cols-1 gap-x-10 gap-y-[26px] border-t border-track pt-6 max-sm:gap-y-0 max-sm:border-t-0 max-sm:pt-0 min-[1180px]:grid-cols-3">
          <PanelSection label={<>Who’s saying it · <span data-copy="level">of {fmtInt(detail.cited?.month ?? detail.doing?.n ?? 0)}</span> {`in ${panel.monthText}`}</>} className="max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
            {detail.groups.length > 0
              ? <GroupRows groups={detail.groups.slice(0, 4)} n={detail.cited?.month ?? 0} />
              : <p className="m-0 text-[13.5px] text-muted-foreground">No group’s own talk is in it yet.</p>}
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
      {detail && detail.quotes.length > 0 ? <QuotesSection quotes={detail.quotes} data={data} /> : null}
      <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5 max-sm:hidden">
        <Link href={panel.askHref} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about {panel.name}</Link>
      </div>
    </section>
  )
}

/** "Conversations inside it": the biggest three, then the table filtered to
 *  it; for a subject whose check has not passed, their names alone (U6). */
function InsideCard({ page, data }: { page: SubjectPage; data: MarketData }) {
  const { panel } = page
  const ready = panel.level != null
  const sub = ready
    ? `The biggest ${data.period === 'week' ? 'this week' : `in ${panel.monthText}`}. Each opens as its own page.`
    : 'Each opens as its own page.'
  return (
    <section id="subject-inside" aria-labelledby="inside-title" className={cn(CARD, 'gap-4')}>
      <div className="flex items-center gap-3">
        <IconTile icon={List} />
        <div className="min-w-0 flex-1">
          <h2 id="inside-title" className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">{ready ? 'Conversations inside it' : 'Inside it'}</h2>
          <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">{sub}</p>
        </div>
      </div>
      {(ready ? page.inside.length : panel.inside.length) === 0 ? (
        <p className="m-0 text-[13.5px] text-muted-foreground">No conversation in it reached three videos {data.period === 'week' ? 'this week' : `in ${panel.monthText}`}.</p>
      ) : ready ? (
        <ConversationRows rows={page.inside} data={data} subjects={false} arrows />
      ) : (
        <div className="flex flex-col">
          {panel.inside.map((c) => (
            <Link key={c.id} href={c.href} className="-mx-2 rounded-md px-2 py-1.5 text-[14.5px] text-foreground no-underline hover:bg-inner">
              <span data-copy="subject" data-slot="pass_b_theme">{c.label}</span>
            </Link>
          ))}
        </div>
      )}
      {ready && page.insideTotal > 0 ? (
        <div><Link href={page.allHref} className={OLINK}>All <span data-copy="figure">{fmtInt(page.insideTotal)}</span> {page.insideTotal === 1 ? 'conversation' : 'conversations'} in {panel.name} →</Link></div>
      ) : null}
    </section>
  )
}

/** The page's body under its bar. */
export function SubjectPageBody({ page, data }: { page: SubjectPage; data: MarketData }) {
  const ready = page.panel.level != null
  const weekLevel = data.period === 'week' ? weekLevelOf(page) : null
  const note = ready
    ? weekLevel
      ? <>This week’s <span data-copy="figure">{fmtInt(weekLevel.k)}</span> {weekLevel.k === 1 ? 'video' : 'videos'}, beside {page.panel.monthText}</>
      : <>{page.panel.monthText}</>
    : null
  return (
    <>
      <ReadCard panel={page.panel} data={data} />
      <SectionHead title="The numbers" note={note} />
      <NumbersCard page={page} data={data} />
      <InsideCard page={page} data={data} />
      {/* On a phone the Agent closes the page, full width (F2-Market-Subject-Phone). */}
      <Link href={page.panel.askHref} className={cn(ASK, 'justify-center sm:hidden')}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about {page.panel.name}</Link>
    </>
  )
}
