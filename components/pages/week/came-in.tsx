import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import { heardAtFloor, heardWithheld, monthPhrase, NEW_THEME_FLOOR, regroupedLine, type MarketCameIn, type WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'
import { RULE, SCALE } from '@/components/pages/overview/market'
import { weekBarsOmitted } from '@/lib/pages/overview-market/weeks'

// "With this update" (market-first WP3.7, `week.came-in`; the approved
// preview's This week, its first tile): what this update's days brought into
// the market's month, as one sentence, handed back to the month ("436 of the
// 654 videos September holds so far"), and the same counts by part of the
// market in a table beside it: the category, the brands you track, and the two
// together (decision E: your own posts are not the market).
//
// THE WEEKLY PRINTS THE SAME COUNTS (WR1): both read `marketCameIn`, so the
// page and the email cannot disagree about one update.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings).
// The anchors under the sentence jump to the tiles that hold what it counts.

export const CAME_IN_TITLE = 'With this update'

/** The anchors the page gives the tiles this block points into. */
export const WEEK_ANCHORS = { weeks: 'week-by-week', heard: 'heard-for-the-first-time', reply: 'worth-a-reply' } as const

/** A part of the market, as the table prints it. */
function parts(m: MarketCameIn): { label: string; videos: number; comments: number; total?: boolean }[] {
  return [
    { label: 'The category', ...m.category },
    ...(m.brands ? [{ label: 'Brands you track', ...m.brands }] : []),
    { label: 'Your market', ...m.market, total: true },
  ]
}

const Fig = ({ children, email, className = 'font-mono font-semibold tabular-nums tracking-[-0.03em]' }: { children: ReactNode; email: boolean; className?: string }) => (
  <span data-copy="figure" className={email ? undefined : className} style={email ? { fontWeight: 600, fontVariantNumeric: 'tabular-nums' } : undefined}>{children}</span>
)

/** "The 20 Sep update brought 436 videos and 9,471 comments into your
 *  market’s September." */
function Headline({ m, email }: { m: MarketCameIn; email: boolean }) {
  const month = longMonth(m.month)
  return (
    <>
      The {shortDate(m.update)} update brought <Fig email={email}>{fmtInt(m.market.videos)}</Fig> {m.market.videos === 1 ? 'video' : 'videos'} and{' '}
      <Fig email={email}>{fmtInt(m.market.comments)}</Fig> {m.market.comments === 1 ? 'comment' : 'comments'} into your market’s {month}.
    </>
  )
}

/** "That is 436 of the 654 videos September holds so far, after 3 updates. 9
 *  themes were heard for the first time with 10 or more videos this month, and
 *  12 comments are worth a reply." One denominator per sentence. */
function Body({ data, m, email }: { data: WeekData; m: MarketCameIn; email: boolean }) {
  const month = longMonth(m.month)
  const b = (n: number) => <Fig email={email} className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(n)}</Fig>
  const heard = data.heard ?? null
  const at = heard ? heardAtFloor(heard) : null
  const replies = data.replies.unread ? null : data.replies.total
  const when = monthPhrase(m.month, data.readingAt)
  const sentences: ReactNode[] = []
  if (m.monthVideos != null && m.monthVideos > 0) {
    sentences.push(
      <span key="of">
        {/* The preview's words, "436 of the 654 videos": two figures and the
            month's own base in the sentence, one denominator. */}
        That is {b(m.market.videos)} of the {b(m.monthVideos)} videos {month} holds{m.ended ? '' : ' so far'}
        {m.updates != null && m.updates > 0 ? <>, after {b(m.updates)} {m.updates === 1 ? 'update' : 'updates'}</> : null}.
      </span>,
    )
  }
  // The count leaves out a theme our new searches found (`heardAtFloor`,
  // T0a mechanism 4); where that leaves none, nothing is said of it, never
  // "no theme was heard for the first time".
  const heardPart = heard?.regrouped
    ? null
    : at != null && !(at === 0 && heardWithheld(heard!))
      ? at === 0
        ? <>No theme was heard for the first time with {fmtInt(NEW_THEME_FLOOR)} or more videos {when}</>
        : <>{b(at)} {at === 1 ? 'theme was' : 'themes were'} heard for the first time with {fmtInt(NEW_THEME_FLOOR)} or more videos {when}</>
      : null
  const replyPart = replies != null && replies > 0 ? <>{b(replies)} {replies === 1 ? 'comment is' : 'comments are'} worth a reply</> : null
  if (heardPart && replyPart) sentences.push(<span key="n">{' '}{heardPart}, and {replyPart}.</span>)
  else if (heardPart) sentences.push(<span key="n">{' '}{heardPart}.</span>)
  else if (replyPart) sentences.push(<span key="n">{' '}{replyPart}.</span>)
  if (heard?.regrouped) sentences.push(<span key="r">{' '}{regroupedLine(heard.regrouped)}</span>)
  if (sentences.length === 0) return null
  return <>{sentences}</>
}

/** The anchors: "Week by week ↓", "9 heard for the first time ↓", "12 worth a
 *  reply ↓" (app only; paper and an inbox have the tiles in order). */
function Anchors({ data }: { data: WeekData }) {
  const heard = data.heard ?? null
  const at = heard && !heard.regrouped ? heardAtFloor(heard) : 0
  const links: { href: string; label: string }[] = [
    ...(data.weeks && !weekBarsOmitted(data.weeks) ? [{ href: `#${WEEK_ANCHORS.weeks}`, label: 'Week by week' }] : []),
    ...(at > 0 ? [{ href: `#${WEEK_ANCHORS.heard}`, label: `${fmtInt(at)} heard for the first time` }] : []),
    ...(!data.replies.unread && data.replies.total > 0 ? [{ href: `#${WEEK_ANCHORS.reply}`, label: `${fmtInt(data.replies.total)} worth a reply` }] : []),
  ]
  if (links.length === 0) return null
  return (
    <nav aria-label="On this page" className="flex flex-wrap gap-x-8 gap-y-2">
      {links.map((l) => (
        <a key={l.href} href={l.href} className="inline-flex items-center gap-2 text-[14px] font-medium text-foreground underline decoration-border decoration-1 underline-offset-[6px] hover:decoration-foreground">
          {l.label}<span aria-hidden className="text-muted-foreground">↓</span>
        </a>
      ))}
    </nav>
  )
}

/** "Came in with it": the category, the brands you track, your market. */
function Table({ m, mode }: { m: MarketCameIn; mode: RenderMode }) {
  const rows = parts(m)
  if (mode === 'email') {
    const cell = { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '8px 0', borderTop: `1px solid ${EMAIL.hairline}` }
    const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const, paddingLeft: 12 }
    const head = { ...cell, borderTop: 0, fontSize: 11, color: EMAIL.muted, fontWeight: 600 }
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%', marginTop: 12 }}>
        <thead><tr><th style={{ ...head, textAlign: 'left' }}>Came in with it</th><th style={{ ...head, textAlign: 'right' }}>Videos</th><th style={{ ...head, textAlign: 'right' }}>Comments</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{ ...cell, fontWeight: r.total ? 600 : 400 }}>{r.label}</td>
              <td style={{ ...num, fontWeight: r.total ? 600 : 400 }}><span data-copy="figure">{fmtInt(r.videos)}</span></td>
              <td style={{ ...num, fontWeight: r.total ? 600 : 400 }}><span data-copy="figure">{fmtInt(r.comments)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  return (
    <div role="table" className="flex min-w-0 flex-col self-start rounded-md bg-inner px-6 py-5">
      <div role="row" className={`grid grid-cols-[minmax(0,1fr)_64px_76px] items-end gap-x-3 ${RULE.head}`}>
        <span role="columnheader" className={SCALE.head}>Came in with it</span>
        <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
        <span role="columnheader" className={`text-right ${SCALE.head}`}>Comments</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} role="row" className={`grid grid-cols-[minmax(0,1fr)_64px_76px] items-center gap-x-3 py-3 ${r.total ? 'border-t border-border' : RULE.row}`}>
          <span role="rowheader" className={`text-[14px] ${r.total ? 'font-semibold text-foreground' : 'text-secondary-foreground'}`}>{r.label}</span>
          <span className={`text-right font-mono text-[14px] tabular-nums ${r.total ? 'font-semibold' : ''}`}><span data-copy="figure">{fmtInt(r.videos)}</span></span>
          <span className={`text-right font-mono text-[14px] tabular-nums ${r.total ? 'font-semibold' : ''}`}><span data-copy="figure">{fmtInt(r.comments)}</span></span>
        </div>
      ))}
    </div>
  )
}

export const weekCameIn: Block<WeekData> = {
  key: 'week.came-in',
  title: CAME_IN_TITLE,
  question: 'What did this update bring into your market’s month?',

  render(data, mode = 'app', ctx) {
    const m = data.cameIn.market ?? null
    const email = mode === 'email'
    const nav = surface('overview')
    const footer = openLink(mode, `${ctx.appUrl}${nav.href}`, `Open ${nav.label} →`)
    const empty = weekCameIn.emptyState(data)
    if (empty || !m) {
      return (
        <BlockFrame title={CAME_IN_TITLE} mode={mode} footer={footer} roomy card>
          <BlockEmpty mode={mode}>{empty ?? CAME_IN_UNREAD}</BlockEmpty>
        </BlockFrame>
      )
    }
    if (email) {
      return (
        <BlockFrame title={CAME_IN_TITLE} mode={mode} footer={footer} roomy card>
          <p style={{ fontFamily: FONT.sans, fontSize: 17, lineHeight: '24px', fontWeight: 500, color: EMAIL.ink, margin: '0 0 8px' }}><Headline m={m} email /></p>
          <p style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.ink2, margin: 0 }}><Body data={data} m={m} email /></p>
          <Table m={m} mode={mode} />
        </BlockFrame>
      )
    }
    return (
      <BlockFrame title={CAME_IN_TITLE} mode={mode} footer={footer} roomy card>
        <div className="grid grid-cols-1 gap-x-16 gap-y-8 xl:grid-cols-[minmax(0,1fr)_304px]" data-print-cols="2">
          <div className="flex min-w-0 flex-col gap-6 pt-1">
            <div className="flex max-w-[640px] flex-col gap-4">
              <p className="m-0 text-[24px] font-medium leading-[1.3] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[28px]"><Headline m={m} email={false} /></p>
              <p className="m-0 text-[16px] leading-[1.7] text-secondary-foreground [text-wrap:pretty]"><Body data={data} m={m} email={false} /></p>
            </div>
            {mode === 'app' ? <Anchors data={data} /> : null}
          </div>
          <Table m={m} mode={mode} />
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const m = data.cameIn.market
    if (!m) return {}
    const month = longMonth(m.month)
    const out: FigureTable = {
      came_in_market_videos: { value: m.market.videos, unit: 'videos', label: `videos this update brought into your market’s ${month}` },
      came_in_market_comments: { value: m.market.comments, unit: 'comments', label: `comments this update brought into your market’s ${month}` },
      came_in_category_videos: { value: m.category.videos, unit: 'videos', label: `category videos this update brought into ${month}` },
      came_in_category_comments: { value: m.category.comments, unit: 'comments', label: `category comments this update brought into ${month}` },
    }
    if (m.brands) {
      out.came_in_brands_videos = { value: m.brands.videos, unit: 'videos', label: `videos filed under a brand you track this update brought into ${month}` }
      out.came_in_brands_comments = { value: m.brands.comments, unit: 'comments', label: `comments under a brand you track this update brought into ${month}` }
    }
    if (m.monthVideos != null) out.came_in_month_videos = { value: m.monthVideos, unit: 'videos', label: `videos in your market in ${month} so far` }
    return out
  },

  emptyState(data) {
    if (!data.cameIn.window) return 'This update covered no window, so there are no days for anything to have come in.'
    if (!data.cameIn.market) return CAME_IN_UNREAD
    return null
  },
}

/** Where the window read is not there: no count is printed nobody counted. */
export const CAME_IN_UNREAD = 'What this update brought into your market is not counted here yet.'
