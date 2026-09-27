import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { levelWords, SHARE_ANSWER, SHARE_TITLE, shareWaiting, type ShareBlock } from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import type { FigureTable } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { RULE, SCALE } from '@/components/pages/overview/market'
import { WHAT_WE_CHANGED_HREF } from '@/components/pages/overview/change'
import { competitiveStandings } from '../standings'
import { Inner } from './parts'

// B7 · Share of what our searches found (market-first WP3.5, plan §2.5 B7;
// the standings, demoted and relabelled; the approved preview's last block).
//
// EACH BRAND'S VIDEOS ON THE MONTH'S ATTENTION PANEL, OF THE PANEL'S VIDEOS:
// a share of what our searches found, never market share. Levels only: no
// month is set against another here, so nothing refuses or joins across a
// panel era (S10), and your own row is never beside a rival's (no "you
// against them" share prints on this page). Where no panel exists yet, the
// update the first one freezes with (Sealand: the 4 Oct update).
//
// THE KEY IS CO2'S (`competitive.months`, kept: `competitive.standings` is the
// parked page's own key, and keys never collide); a page built before deploy
// 5 draws CO2 as it was.

const COLS = 'grid-cols-[minmax(0,1fr)_5.5rem]'

function Body({ s, mode }: { s: ShareBlock; mode: RenderMode }) {
  const rows = s.rows
  if (mode === 'email') {
    return (
      <div>
        <div style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink }}>{SHARE_ANSWER}</div>
        {rows && rows.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.muted }}>{longMonth(s.month)} <span data-copy="level" style={{ fontFamily: FONT.mono, fontWeight: 400 }}>· of {fmtInt(rows[0].n)}</span></div>
            {rows.map((r) => (
              <div key={r.audience} style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
                {r.label} · <span data-copy="figure" style={{ fontFamily: FONT.mono }}>{levelWords(r.k, r.n)}</span>
              </div>
            ))}
          </div>
        ) : <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink, marginTop: 8 }}>{shareWaiting(s)}</div>}
      </div>
    )
  }
  return (
    <>
      <p className="m-0 max-w-[480px] text-[17px] font-medium leading-[1.5] tracking-[-0.01em] text-foreground [text-wrap:pretty]">{SHARE_ANSWER}</p>
      <Inner mode={mode} className="flex-1">
        {rows && rows.length > 0 ? (
          <div role="table" aria-label={SHARE_TITLE} className="flex min-w-0 flex-col">
            <div role="row" className={cn('grid items-end gap-x-4', COLS, RULE.head, SCALE.head)}>
              <span role="columnheader">Brand</span>
              <span role="columnheader" data-copy="level" className="flex flex-col items-end text-right">
                <span className="font-semibold text-secondary-foreground">{longMonth(s.month)}</span>
                <span className="font-mono text-[12px] font-normal">of {fmtInt(rows[0].n)}</span>
              </span>
            </div>
            {rows.map((r, i) => (
              <div key={r.audience} role="row" className={cn('grid min-h-11 items-center gap-x-4', COLS, i === rows.length - 1 ? null : RULE.row)}>
                <span role="rowheader" className={cn('min-w-0 truncate', SCALE.row)}>{r.label}</span>
                <span role="cell" data-copy="figure" className={cn(SCALE.num, 'font-semibold')}>{levelWords(r.k, r.n)}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="flex items-center gap-2.5">
            {s.startsWith ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none text-secondary-foreground">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg> : null}
            <span className="text-[15px] font-semibold text-foreground">{shareWaiting(s)}</span>
          </span>
        )}
      </Inner>
    </>
  )
}

export const brandsShare: Block<CompetitiveSurfaceData> = {
  key: competitiveStandings.key,
  title: SHARE_TITLE,
  question: 'How much of what our searches found is each brand’s?',

  render(data, mode = 'app', ctx) {
    const s = data.brands?.share
    if (!s) return competitiveStandings.render(data, mode, ctx)
    const footer = openLink(mode, `${ctx.appUrl}${WHAT_WE_CHANGED_HREF}`, 'What we changed, and when →')
    return (
      <BlockFrame title={SHARE_TITLE} mode={mode} footer={footer} roomy className={mode === 'app' ? 'h-full' : undefined}>
        <Body s={s} mode={mode} />
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const s = data.brands?.share
    if (!s) return competitiveStandings.figures?.(data) ?? {}
    return {}
  },

  verdicts(data) {
    return data.brands ? [] : competitiveStandings.verdicts?.(data) ?? []
  },

  emptyState(data) {
    return data.brands ? null : competitiveStandings.emptyState(data)
  },
}
