import Link from 'next/link'
import { FlagChip, TBL, TD, TD_NUM, TH, toMax } from '@/components/v2'
import { ROW } from '@/components/v2/look'
import { newVerdict } from '@/components/pages/v2/market/parts'
import { MARKET_FIRST_RUN } from '@/components/pages/v2/market'
import { fmtInt } from '@/lib/format'
import { tileHref } from '@/lib/pages/home'
import { flagBaseWords, type MarketConv, type MarketTop } from '@/lib/pages/v2/market'
import type { MarketTile, TileRead } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { Bar, CSUB, Fig, TILE, TILE_FAILED, TileHead, TileLine, TT_WIDE } from './parts'

// THE DASHBOARD'S MARKET TILE, drawn to the audit design's board
// (Dashboard.dc.html, "Market this week", 7 Nov), from `topMarket`: the same
// picks Market's top row makes, so the two never disagree. The lead is the
// anomaly check's flag where it raised one, else the week's biggest
// conversation first heard this week, else its biggest; then one table of up
// to three conversations, each opening its own page on Market: its share of
// the week drawn against the list's largest (decision 5), its videos this
// week and in the month (bare counts: the foot line says once what they are
// of, decision 2).
//
// DECISION 1: no "3× its usual level", no "Rising", no "usually about 6".
// The flag prints the check's own chip and its two sides as levels. No quote
// and no "our read" here: both are one click down.

/** Market's own words for "no conversation leads". */
export const MARKET_NONE = 'No conversation leads this week yet.'

/** The heading's words where the week's biggest leads: a rank, and no claim
 *  of movement (the board's "{lead} led the conversation"). */
export const MARKET_LEADS = 'led the conversation'

/** The foot's words where nothing on the tile was first heard this week
 *  (the board's), and where only the lead was. */
export const MARKET_NOTHING_NEW = 'Nothing new surfaced this week.'
export const MARKET_NOTHING_ELSE_NEW = 'Nothing else new surfaced this week.'

/** Why the table draws no earlier weeks, said only where one of its rows has
 *  a week our own change cut (the board's foot line). */
export const MARKET_WEEKS_CUT = 'Earlier weeks are left out until they compare fairly.'

/** The tile's conversations: the lead, then the week's biggest and what was
 *  first heard this week, then (where nothing more was) the week's next
 *  biggest, at most three, none twice. */
export const MARKET_TABLE_ROWS = 3

type Row = { conv: MarketConv; href: string }

function tableRows(top: MarketTop): Row[] {
  const out: Row[] = []
  const add = (r: Row | null | undefined) => {
    if (r && out.length < MARKET_TABLE_ROWS && !out.some((x) => x.conv.id === r.conv.id)) out.push(r)
  }
  const hero = top.hero
  if (hero?.kind === 'flag') add(hero.card.conv && hero.card.href ? { conv: hero.card.conv, href: hero.card.href } : null)
  else if (hero) add({ conv: hero.conv, href: hero.href })
  for (const r of top.rows) add(r)
  if (!top.rows.some((r) => r.kind === 'new')) add(top.also ?? null)
  return out
}

/** The heading: the lead as a sentence ("How long a liner lasts led the
 *  conversation"), or, for a flag or the week's biggest new conversation,
 *  its chip beside its name; a flag's two sides under it, as levels. */
function Hero({ top, month }: { top: MarketTop; month: string | null }) {
  const hero = top.hero
  if (!hero) return null
  if (hero.kind === 'flag') {
    const { card } = hero
    const f = card.flag
    const title = card.conv?.label ?? f.label
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <FlagChip verdict={card.verdict} />
          <h2 className={TT_WIDE}>{f.objectKind === 'theme' ? <span data-copy="subject" data-slot="pass_b_theme">{title}</span> : title}</h2>
        </div>
        <p className={cn(CSUB, 'text-[14px] text-secondary-foreground')}>
          <span data-copy="level">{fmtInt(f.week.k)} of {fmtInt(f.week.n)} videos</span> this week, {flagBaseWords(f.denominator)}, against{' '}
          <span data-copy="level">{fmtInt(f.baseline.k)} of {fmtInt(f.baseline.n)}</span> in {card.baselineText}, the same base.
          {/* A flag on no conversation the table lists: its month here. */}
          {card.month && !card.conv ? <> <span data-copy="level">{fmtInt(card.month.k)} of {fmtInt(card.month.n)}</span> category videos {top.week.inMonth}.</> : null}
        </p>
      </div>
    )
  }
  const { conv } = hero
  const label = <span data-copy="subject" data-slot="pass_b_theme">{conv.label}</span>
  if (hero.kind === 'new' && month) {
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <FlagChip verdict={newVerdict(conv.id, conv.label, conv.month ?? conv.week ?? 0, top.category.month ?? 0, month)} />
        <h2 className={TT_WIDE}>{label}</h2>
      </div>
    )
  }
  return <h2 className={TT_WIDE}>{label} {MARKET_LEADS}</h2>
}

/** The month a count is restated against, as a column's head: "October so
 *  far" (the tile's own words, `inMonth`, without "in"). */
const monthHead = (inMonth: string): string => {
  const w = inMonth.replace(/^\s*in\s+/i, '').trim()
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : 'This month'
}

/** The board's table: each conversation's name (its page), its share of the
 *  week against the list's largest, its videos this week and in the month. */
function Table({ top, rows, month }: { top: MarketTop; rows: readonly Row[]; month: string | null }) {
  const bar = toMax(rows.map((r) => r.conv.week ?? 0))
  return (
    <table className={cn(TBL, 'tabular-nums')}>
      <thead>
        <tr>
          <th scope="col" className={cn(TH, 'max-sm:pr-2')}>Conversation</th>
          <th scope="col" className={cn(TH, 'w-[34%] max-sm:hidden')}><span className="sr-only">Share of this week</span></th>
          {/* On a phone the two counts keep 52 and 60px, so a name keeps two
              thirds of the row (the review of 7 Nov: it wrapped on four
              lines). */}
          <th scope="col" className={cn(TH, TD_NUM, 'w-[90px] max-sm:w-[52px] max-sm:pr-2')}>This week</th>
          <th scope="col" className={cn(TH, TD_NUM, 'w-[110px] pr-0 max-sm:w-[60px]')}>{monthHead(top.week.inMonth)}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const c = r.conv
          return (
            <tr key={c.id} data-market-row={c.id}>
              <td className={cn(TD, 'py-3 max-sm:pr-2')}>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={r.href} className={cn(ROW, i === 0 ? null : 'font-normal')}>
                    <span data-copy="subject" data-slot="pass_b_theme">{c.label}</span>
                  </Link>
                  {/* A row first heard this week carries the reader flag, a
                      quiet tag (the lead's sits beside its heading). */}
                  {i > 0 && month && c.isNew
                    ? <FlagChip size="sm" verdict={newVerdict(c.id, c.label, c.month ?? c.week ?? 0, top.category.month ?? 0, month)} />
                    : null}
                </span>
              </td>
              <td className={cn(TD, 'py-3 align-middle max-sm:hidden')}>
                <Bar pct={bar(c.week ?? 0)} />
              </td>
              <td className={cn(TD, TD_NUM, 'py-3 max-sm:pr-2', i === 0 ? 'font-semibold' : null)}>{c.week != null ? <Fig n={c.week} /> : null}</td>
              <td className={cn(TD, TD_NUM, 'py-3 pr-0 text-secondary-foreground')}>{c.month != null ? <Fig n={c.month} /> : null}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Whether anything on the tile was first heard this week: the lead, the
 *  flag's conversation, or a row. Pure. */
export function anyNewOnTile(top: MarketTop): boolean {
  const hero = top.hero
  const lead = hero ? (hero.kind === 'flag' ? hero.card.conv?.isNew ?? false : hero.kind === 'new' || hero.conv.isNew) : false
  return lead || top.rows.some((r) => r.conv.isNew)
}

/** The foot: what the counts are of (decision 2: the base said once), that
 *  nothing (else) was new where nothing was, and why no earlier week is
 *  drawn where a row's week was cut. */
function Foot({ top, rows }: { top: MarketTop; rows: readonly Row[] }) {
  const hasNew = top.rows.some((r) => r.kind === 'new')
  const cut = rows.some((r) => r.conv.weeks.some((w) => w == null))
  const { week, month } = top.category
  return (
    <p data-market-foot="" className={CSUB}>
      {week != null || month != null ? (
        <>
          Counted in the category&rsquo;s videos:{' '}
          {week != null ? <><Fig n={week} /> this week</> : null}
          {week != null && month != null ? ', ' : null}
          {month != null ? <><Fig n={month} /> {top.week.inMonth}</> : null}.{' '}
        </>
      ) : null}
      {hasNew ? null : <span data-row="nothing-new">{anyNewOnTile(top) ? MARKET_NOTHING_ELSE_NEW : MARKET_NOTHING_NEW}</span>}
      {cut ? <> {MARKET_WEEKS_CUT}</> : null}
    </p>
  )
}

/** Where a tile with nothing to open links: Market. */
export function marketTileHref(): string {
  return tileHref('market')
}

export function MarketTileView({ read }: { read: TileRead<MarketTile> }) {
  const top = read.state === 'ok' ? read.top.top : null
  const month = read.state === 'ok' ? read.top.month : null
  const rows = top ? tableRows(top) : []
  return (
    <article aria-labelledby="home-market" data-tile="market" className={cn(TILE, 'min-[1180px]:col-span-2')}>
      <TileHead label="Market this week" id="home-market" open={{ href: marketTileHref(), words: 'Open Market' }} />
      {read.state === 'failed' ? <TileLine>{TILE_FAILED}</TileLine>
        : !top ? <TileLine>{MARKET_FIRST_RUN}</TileLine>
          : !top.hero && top.rows.length === 0 ? <TileLine>{MARKET_NONE}</TileLine>
            : (
              <>
                <Hero top={top} month={month} />
                {rows.length > 0 ? <Table top={top} rows={rows} month={month} /> : null}
                <Foot top={top} rows={rows} />
              </>
            )}
    </article>
  )
}
