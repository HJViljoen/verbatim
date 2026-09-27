import type { ReactNode } from 'react'
import { BlockFrame } from '@/components/blocks/frame'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import type { WeeklyData } from '@/lib/pages/weekly'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { WeeklyBlock } from './section'

// WR1 · your market this week (market-first WP3.7; the approved preview's
// WeeklyReport, its masthead card): the market's level in the reading month,
// then what the update brought into it.
//
//   "Your market in September so far: 654 videos."
//   "The 20 Sep update brought in 436 of them, with 9,471 comments."
//
// THE UPDATE'S COUNTS ARE THIS WEEK'S (`marketCameIn`), the same the page
// prints. Its month is the one the update's window ends in; where that is not
// the reading month (1 to 15 of a month, when every page reads the month that
// has just ended), the second line names its own month instead of "of them":
// "The 11 Oct update brought 150 videos and 3,000 comments into your market's
// October." Levels only: no change, no gate.
//
// NO HEADER IN AN INBOX: the section sits under the masthead in its card, as
// the preview draws it.

export const WEEKLY_WEEK_TITLE = 'Your market'

const Fig = ({ children, email }: { children: ReactNode; email: boolean }) => (
  <span data-copy="figure" className={email ? undefined : 'font-mono font-semibold tabular-nums tracking-[-0.03em] text-foreground'} style={email ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink, fontVariantNumeric: 'tabular-nums' } : undefined}>{children}</span>
)

/** "Your market in September so far: 654 videos." */
function Level({ data, email }: { data: WeeklyData; email: boolean }) {
  const month = longMonth(data.month)
  const soFar = data.overview.reading?.state === 'so_far'
  const v = data.market?.videos ?? null
  if (v == null) return <>Your market in {month}{soFar ? ' so far' : ''} is not counted here yet.</>
  return <>Your market in {month}{soFar ? ' so far' : ''}: <Fig email={email}>{fmtInt(v)}</Fig> {v === 1 ? 'video' : 'videos'}.</>
}

/** "The 20 Sep update brought in 436 of them, with 9,471 comments." */
function Arrived({ data, email }: { data: WeeklyData; email: boolean }): ReactNode {
  const c = data.cameIn
  if (!c) return null
  const same = c.month === data.month && data.market?.videos != null
  const v = c.market.videos
  const n = c.market.comments
  return same
    ? <>The {shortDate(c.update)} update brought in <Fig email={email}>{fmtInt(v)}</Fig> of them, with <Fig email={email}>{fmtInt(n)}</Fig> {n === 1 ? 'comment' : 'comments'}.</>
    : <>The {shortDate(c.update)} update brought <Fig email={email}>{fmtInt(v)}</Fig> {v === 1 ? 'video' : 'videos'} and <Fig email={email}>{fmtInt(n)}</Fig> {n === 1 ? 'comment' : 'comments'} into your market’s {longMonth(c.month)}.</>
}

function body(data: WeeklyData, mode: RenderMode): ReactNode {
  const email = mode === 'email'
  const arrived = <Arrived data={data} email={email} />
  if (email) {
    return (
      <>
        <div style={{ fontFamily: FONT.sans, fontSize: 28, lineHeight: '36px', fontWeight: 500, letterSpacing: '-.02em', color: EMAIL.ink }}><Level data={data} email /></div>
        {data.cameIn ? <div style={{ fontFamily: FONT.sans, fontSize: 16, lineHeight: '26px', color: EMAIL.ink2, marginTop: 16 }}>{arrived}</div> : null}
      </>
    )
  }
  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      <p className="m-0 text-[24px] font-medium leading-[1.3] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[28px]"><Level data={data} email={false} /></p>
      {data.cameIn ? <p className="m-0 text-[16px] leading-[1.7] text-secondary-foreground">{arrived}</p> : null}
    </div>
  )
}

export const weeklyWeek: WeeklyBlock = {
  key: 'weekly.week',
  title: WEEKLY_WEEK_TITLE,

  render(data, mode = 'app') {
    return (
      <BlockFrame title={WEEKLY_WEEK_TITLE} mode={mode} header={mode !== 'email'} roomy card>
        {body(data, mode)}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    const month = longMonth(data.month)
    if (data.market?.videos != null) out.weekly_market_videos = { value: data.market.videos, unit: 'videos', label: `videos in your market in ${month}` }
    if (data.cameIn) {
      out.came_in_market_videos = { value: data.cameIn.market.videos, unit: 'videos', label: `videos this update brought into your market’s ${longMonth(data.cameIn.month)}` }
      out.came_in_market_comments = { value: data.cameIn.market.comments, unit: 'comments', label: `comments this update brought into your market’s ${longMonth(data.cameIn.month)}` }
    }
    return out
  },

  emptyState() {
    return null
  },
}
