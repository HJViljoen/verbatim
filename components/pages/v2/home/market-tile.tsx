import Link from 'next/link'
import { FlagChip, MiniBars, SpikeBars, type MiniBar } from '@/components/v2'
import { NAV_ICON } from '@/components/nav-icons'
import { newVerdict } from '@/components/pages/v2/market/parts'
import { MARKET_FIRST_RUN } from '@/components/pages/v2/market'
import { fmtInt, fmtPct } from '@/lib/format'
import { tileHref } from '@/lib/pages/home'
import { flagBaseWords, type MarketConv, type MarketTop } from '@/lib/pages/v2/market'
import type { MarketTile, TileRead } from '@/lib/pages/v2/home'
import { TAG } from '@/components/colour-roles'
import { cn } from '@/lib/utils'
import { BIG, Fig, MONO_MUTED, MROW, TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

// THE DASHBOARD'S MARKET TILE (Design v2, T8; E1-Dashboard's first card),
// from `topMarket`: the same picks Market's top row makes, so the two never
// disagree. The anomaly check's flag where it raised one, else the week's
// biggest conversation first heard this week, else its biggest; then the
// week's biggest with its three weekly counts and one more first heard this
// week. Each opens its panel on Market (`?conv=`).
//
// DECISION 1: the board's "3× its usual level", "Rising 3 weeks" and
// "usually about 6" go. The flag prints the check's own chip ("Unusual this
// week") and its two sides as levels; a week's count sits beside its month;
// the three weeks are three bare counts. No quote and no "our read" here: both
// are one click down, in the panel.

/** Market's own words for "no conversation leads". */
export const MARKET_NONE = 'No conversation leads this week yet.'

/** "of 151 category videos this week (153 in your market)" and "35 of
 *  279 in October so far". The category's count sits inside the market's
 *  (the week tile's figure), and both are named, so the two totals on the
 *  page read as one inside the other. On a phone the two run as one line, as
 *  the phone board draws it. */
function WeekLines({ conv, top, marketWeek }: { conv: MarketConv; top: MarketTop; marketWeek: number | null }) {
  const inside = marketWeek != null && top.category.week != null && marketWeek !== top.category.week
  return (
    <div className={cn(MONO_MUTED, 'mt-2')}>
      {top.category.week != null ? (
        <span className="sm:block">
          <span data-copy="level">of {fmtInt(top.category.week)} category videos this week</span>
          {inside ? <> (<span data-copy="figure">{fmtInt(marketWeek!)}</span> in your market)</> : null}
        </span>
      ) : null}
      {conv.month != null && top.category.month != null
        ? <span className="sm:block"><span className="sm:hidden"> · </span><span data-copy="level">{fmtInt(conv.month)} of {fmtInt(top.category.month)}</span> {top.week.inMonth}</span>
        : null}
    </div>
  )
}

/** The three weekly windows as bars, oldest first: counts only. */
const weekBars = (conv: MarketConv, top: MarketTop) => conv.weeks.map((count, i) => ({ label: top.week.labels[i] ?? '', count }))

/** The chip beside a lead conversation's name, where the board draws its flag
 *  chip (parity pass, 13 Oct: chip and title on one line in every state): the
 *  reader flag "New" where it was first heard this week, else the pale tag
 *  saying why it leads, which is a rank and no claim of movement. */
export const MARKET_LEADS = 'Most talked about this week'

/** The row the board keeps for what was first heard this week, where nothing
 *  was (the brief's own words for Market's third card). */
export const MARKET_NOTHING_NEW = 'Nothing new this week'
/** The same, where the lead itself is the week's one new conversation. */
export const MARKET_NOTHING_ELSE_NEW = 'Nothing else new this week'

function LeadChip({ hero, top, month }: { hero: { kind: 'new' | 'biggest'; conv: MarketConv }; top: MarketTop; month: string | null }) {
  const c = hero.conv
  if (hero.kind === 'new' && month) {
    return <FlagChip verdict={newVerdict(c.id, c.label, c.month ?? c.week ?? 0, top.category.month ?? 0, month)} />
  }
  return <span data-chip="leads" className={cn(TAG, 'whitespace-nowrap rounded-full px-2 py-[5px] text-[12px] leading-none font-semibold')}>{MARKET_LEADS}</span>
}

function Hero({ top, marketWeek, month }: { top: MarketTop; marketWeek: number | null; month: string | null }) {
  const hero = top.hero
  if (!hero) return null
  if (hero.kind === 'flag') {
    const { card } = hero
    const f = card.flag
    const title = card.conv?.label ?? f.label
    const weekPct = f.week.n > 0 ? (100 * f.week.k) / f.week.n : 0
    const basePct = f.baseline.n > 0 ? (100 * f.baseline.k) / f.baseline.n : 0
    const bars: MiniBar[] = [
      { label: card.baselineText, value: basePct, display: fmtPct(basePct), sub: `${fmtInt(f.baseline.k)} of ${fmtInt(f.baseline.n)}` },
      { label: 'This week', value: weekPct, display: fmtPct(weekPct), sub: `${fmtInt(f.week.k)} of ${fmtInt(f.week.n)}` },
    ]
    return (
      <>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <FlagChip verdict={card.verdict} />
          <h3 className={TT}>{f.objectKind === 'theme' ? <span data-copy="subject" data-slot="pass_b_theme">{title}</span> : title}</h3>
        </div>
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-end gap-7 max-sm:grid-cols-1 max-sm:gap-3">
          <div>
            <div data-copy="figure" className={BIG}>{fmtInt(f.week.k)}</div>
            <div className={cn(MONO_MUTED, 'mt-2')}>
              <span data-copy="level" className="block">of {fmtInt(f.week.n)} videos this week, {flagBaseWords(f.denominator)}</span>
              <span data-copy="level" className="block">{fmtInt(f.baseline.k)} of {fmtInt(f.baseline.n)} in {card.baselineText}, the same base</span>
              {card.month ? <span data-copy="level" className="block">{fmtInt(card.month.k)} of {fmtInt(card.month.n)} category videos {top.week.inMonth}</span> : null}
            </div>
          </div>
          <MiniBars bars={bars} size="md" className="w-full max-w-[400px] justify-self-end max-sm:justify-self-start" label={`Share of every audience's videos about ${title}, the months before against this week`} />
        </div>
      </>
    )
  }
  const { conv } = hero
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <LeadChip hero={hero} top={top} month={month} />
        <h3 className={TT}><span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span></h3>
      </div>
      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-end gap-7 max-sm:grid-cols-1 max-sm:gap-3">
        <div>
          <Fig n={conv.week} className={cn(BIG, 'block')} />
          <WeekLines conv={conv} top={top} marketWeek={marketWeek} />
        </div>
        <SpikeBars weeks={weekBars(conv, top)} counts="all" size="md" className="w-full max-w-[400px] justify-self-end max-sm:justify-self-start" label={`Category videos a week about ${conv.label}`} />
      </div>
    </>
  )
}

/** A row under the lead: its name, a chip where earned, its counts. */
function Row({ row, top, month }: { row: MarketTop['rows'][number]; top: MarketTop; month: string | null }) {
  const c = row.conv
  return (
    <Link href={row.href} className={cn(MROW, '-mx-2 rounded-md px-2 text-foreground no-underline hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span data-copy="subject" data-slot="pass_b_theme" className="min-w-0">{c.label}</span>
        {/* Any row first heard this week carries the chip, the week's
            biggest included. */}
        {month && c.isNew
          ? <FlagChip size="sm" verdict={newVerdict(c.id, c.label, c.month ?? c.week ?? 0, top.category.month ?? 0, month)} />
          : null}
      </span>
      {row.kind === 'biggest' && c.weeks.length > 0 && c.weeks.every((w) => w != null) ? (
        // Decision 1: three weeks are three bare counts, no word. A window our
        // own change cut is never a count, so a row missing one prints its
        // week beside its month instead.
        <span className="whitespace-nowrap font-mono text-[13px] tabular-nums text-secondary-foreground" aria-label={`${c.weeks.map((w) => fmtInt(w ?? 0)).join(', ')} videos, the last three weeks`}>
          {c.weeks.map((w, i) => (
            <span key={i}>{i > 0 ? ' · ' : null}<span data-copy="figure">{fmtInt(w ?? 0)}</span></span>
          ))}
          {' videos'}
        </span>
      ) : (
        // A week's count, its month beside it (decision 1), on two lines on a
        // phone rather than past the tile's edge.
        <span className="text-right font-mono text-[13px] tabular-nums text-secondary-foreground">
          <span className="whitespace-nowrap"><Fig n={c.week} /> this week</span>
          {c.month != null && top.category.month != null
            ? <span className="whitespace-nowrap text-muted-foreground max-sm:block"><span className="max-sm:hidden"> · </span><span data-copy="level">{fmtInt(c.month)} of {fmtInt(top.category.month)}</span> {top.week.inMonth}</span>
            : null}
        </span>
      )}
    </Link>
  )
}

/** Whether anything on the tile was first heard this week: the lead, the
 *  flag's conversation, or a row. Pure. */
export function anyNewOnTile(top: MarketTop): boolean {
  const hero = top.hero
  const lead = hero ? (hero.kind === 'flag' ? hero.card.conv?.isNew ?? false : hero.kind === 'new' || hero.conv.isNew) : false
  return lead || top.rows.some((r) => r.conv.isNew)
}

/** The rows under the lead: the week's biggest, and what was first heard
 *  this week. Where nothing more was, the board's second row is the week's
 *  next biggest (`also`), and one quiet line says nothing (else) is new, so
 *  the tile keeps the board's two rows and its weight (parity pass). */
function Rows({ top, month }: { top: MarketTop; month: string | null }) {
  const hasNew = top.rows.some((r) => r.kind === 'new')
  return (
    <div className="flex flex-col">
      {top.rows.map((r) => <Row key={r.conv.id} row={r} top={top} month={month} />)}
      {!hasNew && top.also ? <Row row={{ kind: 'biggest', conv: top.also.conv, href: top.also.href }} top={top} month={month} /> : null}
      {hasNew ? null : (
        <p data-row="nothing-new" className="m-0 border-t border-track pt-2.5 text-[13px] leading-[1.4] text-muted-foreground">
          {anyNewOnTile(top) ? MARKET_NOTHING_ELSE_NEW : MARKET_NOTHING_NEW}
        </p>
      )}
    </div>
  )
}

/** Where the tile's link goes: the lead's panel, else Market. */
export function marketTileHref(top: MarketTop | null): string {
  const hero = top?.hero
  if (!hero) return top?.href ?? tileHref('market')
  return hero.kind === 'flag' ? hero.card.href ?? top!.href : hero.href
}

export function MarketTileView({ read }: { read: TileRead<MarketTile> }) {
  const top = read.state === 'ok' ? read.top.top : null
  const month = read.state === 'ok' ? read.top.month : null
  return (
    <article aria-labelledby="home-market" data-tile="market" className={cn(TILE, 'col-span-12 min-[1180px]:col-span-8')}>
      <TileHead icon={NAV_ICON.market} name="Market" id="home-market" href={read.state === 'ok' ? marketTileHref(top) : tileHref('market')} open="Open Market" />
      {read.state === 'failed' ? <TileLine>{TILE_FAILED}</TileLine>
        : !top ? <TileLine>{MARKET_FIRST_RUN}</TileLine>
          : !top.hero && top.rows.length === 0 ? <TileLine>{MARKET_NONE}</TileLine>
            : (
              <>
                <Hero top={top} marketWeek={read.state === 'ok' ? read.top.marketWeek : null} month={month} />
                <Rows top={top} month={month} />
              </>
            )}
    </article>
  )
}
