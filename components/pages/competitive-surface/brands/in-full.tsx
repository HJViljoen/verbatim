import Link from 'next/link'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { IN_FULL_TITLE, type InFullBlock } from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import type { FigureTable } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { RULE, SCALE } from '@/components/pages/overview/market'
import { competitiveRivals } from '../rivals'
import { emailCell, emailHead, SubHead } from './parts'

// B2 · A brand in full, last 90 days (market-first WP3.5, plan §2.5 B2; the
// approved preview's block beside "Asked under their content").
//
// WHAT WAS FILED UNDER EACH BRAND OVER THE NINETY DAYS ENDING AT THE READING
// MONTH'S LAST UPDATE (never the clock: Össur's window ends on 13 Sep), and
// one brand in full: what people did in the comments under its videos, as
// counts. A rival audience never reaches a share's floor (research F31, F33),
// so nothing here is a share. Each brand's name opens it in full (`?vs=`);
// the biggest is read by default.
//
// FREITAG PRINTS PLAINLY (the lead's R2, 26 Sep): the 25 Sep production
// re-tag moved its German "Friday" videos to the category, so no note sits
// beside its filed counts (the preview's "mostly German for Friday" predates
// the re-tag). Its name in the market is B1's to count, gated by the hand
// check.
//
// THE KEY IS CO1'S (`competitive.rivals`), whose selection this block now
// carries; a page built before deploy 5 (no `brands`) draws CO1 as it was.

/** The table's columns: the brand, then its videos and comments. */
const FILED_COLS = 'grid-cols-[minmax(0,1fr)_3.5rem_4.5rem]'
const KIND_COLS = 'grid-cols-[minmax(0,1fr)_3.5rem]'

function Filed({ b, mode }: { b: InFullBlock; mode: RenderMode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SubHead title="Filed under each brand" mode={mode} />
      <div role="table" aria-label="Filed under each brand" className="flex flex-col">
        <div role="row" className={cn('grid items-end gap-x-4', FILED_COLS, RULE.head, SCALE.head)}>
          <span role="columnheader">Brand</span>
          <span role="columnheader" className="text-right">Videos</span>
          <span role="columnheader" className="text-right">Comments</span>
        </div>
        {b.rows.map((r, i) => (
          <div key={r.audience} role="row" className={cn('grid min-h-11 items-center gap-x-4', FILED_COLS, i === b.rows.length - 1 ? null : RULE.row)}>
            <span role="rowheader" className={cn('min-w-0 truncate', SCALE.row, r.selected ? 'font-semibold' : null)}>
              {mode === 'app' && !r.selected
                ? <Link href={r.href} className="underline decoration-border underline-offset-[5px] hover:decoration-foreground">{r.label}</Link>
                : r.label}
            </span>
            <span role="cell" data-copy="figure" className={cn(SCALE.num, 'font-semibold')}>{fmtInt(r.videos)}</span>
            <span role="cell" data-copy="figure" className={cn(SCALE.num, 'text-secondary-foreground')}>{fmtInt(r.comments)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function InFull({ b, mode }: { b: InFullBlock; mode: RenderMode }) {
  const s = b.selected
  if (!s) return null
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SubHead title={`${s.label} in full`} note={`of its ${fmtInt(s.videos)} videos`} mode={mode} />
      {s.kinds.length > 0 ? (
        <div role="table" aria-label={`${s.label} in full`} className="flex flex-col">
          <div role="row" className={cn('grid items-end gap-x-4', KIND_COLS, RULE.head, SCALE.head)}>
            <span role="columnheader">What people did</span>
            <span role="columnheader" className="text-right">Videos</span>
          </div>
          {s.kinds.map((k, i) => (
            <div key={k.kind} role="row" className={cn('grid min-h-11 items-center gap-x-4', KIND_COLS, i === s.kinds.length - 1 ? null : RULE.row)}>
              <span role="rowheader" className={cn('min-w-0', SCALE.row)}>{k.label}</span>
              <span role="cell" data-copy="figure" className={cn(SCALE.num, 'font-semibold')}>{fmtInt(k.videos)}</span>
            </div>
          ))}
        </div>
      ) : <BlockEmpty mode={mode}>Nothing in the comments under its videos was read in these days.</BlockEmpty>}
    </div>
  )
}

function EmailBody({ b }: { b: InFullBlock }) {
  const s = b.selected
  return (
    <div>
      <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>Filed under each brand</div>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
        <thead><tr><th style={emailHead}>Brand</th><th style={{ ...emailHead, textAlign: 'right' }}>Videos</th><th style={{ ...emailHead, textAlign: 'right' }}>Comments</th></tr></thead>
        <tbody>
          {b.rows.map((r) => (
            <tr key={r.audience}>
              <td style={emailCell}>{r.label}</td>
              <td style={{ ...emailCell, textAlign: 'right' }}><span data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600 }}>{fmtInt(r.videos)}</span></td>
              <td style={{ ...emailCell, textAlign: 'right' }}><span data-copy="figure" style={{ fontFamily: FONT.mono }}>{fmtInt(r.comments)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {s ? (
        <>
          <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink, marginTop: 16 }}>{s.label} in full <span style={{ fontFamily: FONT.mono, fontWeight: 400, color: EMAIL.muted }}>· of its {fmtInt(s.videos)} videos</span></div>
          {s.kinds.map((k) => (
            <div key={k.kind} style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
              {k.label} · <span data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600 }}>{fmtInt(k.videos)}</span>
            </div>
          ))}
        </>
      ) : null}
    </div>
  )
}

export const IN_FULL_EMPTY = 'No brand you track had a video filed under it in the last 90 days.'

export const brandsInFull: Block<CompetitiveSurfaceData> = {
  key: competitiveRivals.key,
  title: IN_FULL_TITLE,
  question: 'What is said under each brand’s videos, over the last 90 days?',

  render(data, mode = 'app', ctx) {
    const b = data.brands?.inFull
    if (!b) return competitiveRivals.render(data, mode, ctx)
    const empty = b.rows.length === 0 ? IN_FULL_EMPTY : null
    if (mode === 'email') {
      return <BlockFrame title={IN_FULL_TITLE} mode={mode}>{empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : <EmailBody b={b} />}</BlockFrame>
    }
    return (
      <BlockFrame title={IN_FULL_TITLE} mode={mode} roomy>
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : (
          <div className="@container min-w-0">
            <div className="grid min-w-0 grid-cols-1 items-start gap-y-8 @min-[640px]:grid-cols-2 @min-[640px]:gap-x-12 @min-[760px]:gap-x-[88px]">
              <Filed b={b} mode={mode} />
              <InFull b={b} mode={mode} />
            </div>
          </div>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const b = data.brands?.inFull
    if (!b) return competitiveRivals.figures?.(data) ?? {}
    const s = b.selected
    return s ? { in_full_videos: { value: s.videos, unit: 'videos', label: `videos filed under ${s.label} over the last 90 days` } } : {}
  },

  emptyState(data) {
    const b = data.brands?.inFull
    if (!b) return competitiveRivals.emptyState?.(data) ?? null
    return b.rows.length === 0 ? IN_FULL_EMPTY : null
  },
}
