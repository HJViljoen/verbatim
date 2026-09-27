import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import type { MarketCameIn } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'
import { RULE, SCALE } from '@/components/pages/overview/market'
import type { WeeklyBlock } from './section'

// WR1 · With this update (market-first WP3.7; the approved preview's
// WeeklyReport, its second card): what the update brought into the market, by
// part of it: the category, the brands you track, and the two together (your
// own posts are not the market, decision E). This week's `marketCameIn`, so
// the email and the page print the same counts for one update. No footer: the
// preview draws none on this card.

export const WEEKLY_CAME_IN_TITLE = 'With this update'

function rowsOf(c: MarketCameIn): { label: string; videos: number; comments: number; total?: boolean }[] {
  return [
    { label: 'The category', ...c.category },
    ...(c.brands ? [{ label: 'Brands you track', ...c.brands }] : []),
    { label: 'Your market', ...c.market, total: true },
  ]
}

function Table({ c, mode }: { c: MarketCameIn; mode: RenderMode }) {
  const rows = rowsOf(c)
  if (mode === 'email') {
    const cell = { fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', color: EMAIL.ink, padding: '11px 0', borderTop: `1px solid ${EMAIL.hairline}` }
    const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const, paddingLeft: 8 }
    const head = { ...cell, borderTop: 0, borderBottom: `1px solid ${EMAIL.border}`, fontSize: 12, lineHeight: '16px', color: EMAIL.muted, padding: '0 0 8px', fontWeight: 400 }
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th style={{ ...head, textAlign: 'left' }}>Part of your market</th><th style={{ ...head, textAlign: 'right', width: 72 }}>Videos</th><th style={{ ...head, textAlign: 'right', width: 88 }}>Comments</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const top = r.total ? { borderTop: `1px solid ${EMAIL.ink2}`, fontWeight: 600 } : {}
            return (
              <tr key={r.label}>
                <td style={{ ...cell, ...top }}>{r.label}</td>
                <td style={{ ...num, ...top }}><span data-copy="figure">{fmtInt(r.videos)}</span></td>
                <td style={{ ...num, ...top }}><span data-copy="figure">{fmtInt(r.comments)}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }
  return (
    <div role="table" className="flex min-w-0 max-w-[720px] flex-col">
      <div role="row" className={`grid grid-cols-[minmax(0,1fr)_72px_88px] items-end gap-x-3 ${RULE.head}`}>
        <span role="columnheader" className={SCALE.head}>Part of your market</span>
        <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
        <span role="columnheader" className={`text-right ${SCALE.head}`}>Comments</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} role="row" className={`grid grid-cols-[minmax(0,1fr)_72px_88px] min-h-11 items-center gap-x-3 ${r.total ? 'border-t border-foreground/60 font-semibold' : RULE.row}`}>
          <span role="rowheader" className={SCALE.row}>{r.label}</span>
          <span className={SCALE.num}><span data-copy="figure">{fmtInt(r.videos)}</span></span>
          <span className={SCALE.num}><span data-copy="figure">{fmtInt(r.comments)}</span></span>
        </div>
      ))}
    </div>
  )
}

export const weeklyCameIn: WeeklyBlock = {
  key: 'weekly.came-in',
  title: WEEKLY_CAME_IN_TITLE,

  render(data, mode = 'app') {
    const empty = weeklyCameIn.emptyState(data)
    return (
      <BlockFrame title={WEEKLY_CAME_IN_TITLE} mode={mode} roomy card>
        {empty || !data.cameIn ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : <Table c={data.cameIn} mode={mode} />}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const c = data.cameIn
    if (!c) return {}
    const month = longMonth(c.month)
    const out: FigureTable = {
      came_in_category_videos: { value: c.category.videos, unit: 'videos', label: `category videos this update brought into ${month}` },
      came_in_category_comments: { value: c.category.comments, unit: 'comments', label: `category comments this update brought into ${month}` },
      came_in_market_videos: { value: c.market.videos, unit: 'videos', label: `videos this update brought into your market’s ${month}` },
      came_in_market_comments: { value: c.market.comments, unit: 'comments', label: `comments this update brought into your market’s ${month}` },
    }
    if (c.brands) {
      out.came_in_brands_videos = { value: c.brands.videos, unit: 'videos', label: `videos filed under a brand you track this update brought into ${month}` }
      out.came_in_brands_comments = { value: c.brands.comments, unit: 'comments', label: `comments under a brand you track this update brought into ${month}` }
    }
    return out
  },

  emptyState(data) {
    if (!data.window) return 'This update covered no window, so there are no days for anything to have come in.'
    if (!data.cameIn) return 'What this update brought into your market is not counted here yet.'
    return null
  },
}
