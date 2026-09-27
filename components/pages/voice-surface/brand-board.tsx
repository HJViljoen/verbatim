import type { ReactNode } from 'react'

import type { BlockContext, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { marketKindLabel } from '@/lib/pages/overview-market'
import { voiceSurfaceHref, type VoiceSurfaceData } from '@/lib/pages/voice-surface'
import type { BrandView } from '@/lib/pages/voice-surface-brand'
import type { FigureTable } from '@/lib/reading/verdicts'
import { LevelBar, RULE, SCALE, barAxis } from '@/components/pages/overview/market'

// C2 under `?brand=` · one brand's videos, last 90 days (the Brands page's B2
// footer "Open {brand}'s videos →", the approved preview's link to Conversation
// filtered by brand; `lib/pages/voice-surface-brand.ts`).
//
// THE BOARD'S PLACE AND THE BOARD'S FACE: the same rules, type scale, rank and
// level bar as every theme at 10 or more, over the columns a window has. The
// themes are the brand's own, counted in its videos over the ninety days B2
// reads, so the base sits in the Videos head ("of 32") and no share prints (a
// rival's n never reaches a share's floor). No month before, no flag, no
// provenance: those are a month's.
//
// THE TITLE SAYS WHICH VIDEOS AND WHICH DAYS, as B2's does; the footer holds
// links only: "Show all {n}" where the list is cut at twelve rows, and the way
// back to the market's own board.

/** The view's title: the brand, and the window B2 reads. */
export const brandBoardTitle = (name: string): string => `${name}’s videos, last 90 days`

/** Why no theme prints, in the view's own words; null where one does. */
export function brandBoardEmpty(v: BrandView): string | null {
  if (v.videos === 0) return `No video was filed under ${v.name} in the last 90 days.`
  if (v.themes == null) return `${v.name}’s themes over the last 90 days are not read yet.`
  if (v.total === 0) return `${v.name}’s videos in the last 90 days carry no theme yet.`
  return null
}

/** The desktop columns from 900px of board (a container query, as the month
 *  board's): the rank, the theme, the bar, Videos. Below, the theme and its
 *  count. Written out in full for Tailwind's scanner. */
const COLS = 'grid grid-cols-[minmax(0,1fr)_56px] gap-x-3 @min-[900px]:grid-cols-[32px_minmax(200px,1fr)_minmax(96px,176px)_56px] @min-[900px]:gap-x-4'
const WIDE = '@max-[900px]:hidden'

/** "Videos · of 32": the count's head and its base (the copy contract's
 *  "of N", in the column head). */
function VideosHead({ n, mode }: { n: number | null; mode: RenderMode }) {
  if (mode === 'email') {
    return (
      <span data-copy="level" style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted }}>
        Videos{n != null ? <span style={{ fontFamily: FONT.mono, fontWeight: 400 }}> of {fmtInt(n)}</span> : null}
      </span>
    )
  }
  return (
    <span data-copy="level" className="flex flex-col items-end text-right leading-[1.35]">
      <span className={SCALE.head}>Videos</span>
      {n != null ? <span className="whitespace-nowrap font-mono text-[12px] font-normal text-muted-foreground">of {fmtInt(n)}</span> : null}
    </span>
  )
}

function Table({ v, mode }: { v: BrandView; mode: RenderMode }) {
  const themes = v.themes ?? []
  if (mode === 'email') {
    const cell = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 10px 4px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...cell, borderTop: 0, color: EMAIL.muted, fontSize: 11, textAlign: 'left' }}>Theme</th>
            <th style={{ ...cell, borderTop: 0, textAlign: 'right' }}><VideosHead n={v.videos} mode={mode} /></th>
          </tr>
        </thead>
        <tbody>
          {themes.map((t) => (
            <tr key={t.registryId}>
              <td style={cell}>
                <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
                {t.kind ? <span style={{ color: EMAIL.muted }}> · {marketKindLabel(t.kind)}</span> : null}
              </td>
              <td style={{ ...cell, fontFamily: FONT.mono, fontWeight: 600, textAlign: 'right' }}><span data-copy="figure">{fmtInt(t.videos)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const n = v.videos && v.videos > 0 ? v.videos : Math.max(1, ...themes.map((t) => t.videos))
  const axis = barAxis(themes.map((t) => t.videos / n))
  return (
    <div className="flex min-w-0 flex-col @container">
      <div role="table" aria-label={brandBoardTitle(v.name)} className="flex min-w-0 flex-col">
        <div role="row" className={`${COLS} items-end ${RULE.head}`}>
          <span role="columnheader" className={WIDE} />
          <span role="columnheader" className={`flex flex-col ${SCALE.head}`}>
            Theme
            <span className="font-mono text-[12px] font-normal">kind</span>
          </span>
          <span role="columnheader" className={WIDE} />
          <span role="columnheader"><VideosHead n={v.videos} mode={mode} /></span>
        </div>
        {themes.map((t, i) => (
          <div key={t.registryId} role="row" className={`${COLS} min-h-14 items-center py-2 ${RULE.row}`}>
            <span className={`${WIDE} font-mono text-[13px] tabular-nums text-muted-foreground`}>{i + 1}</span>
            <span role="rowheader" className="flex min-w-0 flex-col gap-0.5">
              <span className={`min-w-0 [text-wrap:pretty] ${SCALE.row}`}><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></span>
              {t.kind ? <span className="text-[13px] leading-[18px] text-muted-foreground">{marketKindLabel(t.kind)}</span> : null}
            </span>
            <span className={`block ${WIDE}`}><LevelBar share={t.videos / n} prevShare={null} axis={axis} /></span>
            <span role="cell" className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(t.videos)}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The footer's links: the rest of the list where it is cut, and the
 *  market's own board. */
function footer(data: VoiceSurfaceData, v: BrandView, mode: RenderMode, appUrl: string): ReactNode {
  const shown = v.themes?.length ?? 0
  const more = !v.all && v.total > shown
    ? openLink(mode, `${appUrl}${voiceSurfaceHref(data.params, { board: 'all' })}#board`, `Show all ${fmtInt(v.total)} →`)
    : null
  const market = openLink(mode, `${appUrl}${voiceSurfaceHref(data.params, { brand: null, board: null })}#board`, 'Your market’s themes at 10 or more →')
  if (!more || !market) return more ?? market
  if (mode === 'email') return <>{more}<span style={{ display: 'inline-block', width: 24 }} />{market}</>
  return <span className="flex flex-wrap gap-x-8 gap-y-3">{more}{market}</span>
}

/** The board's block, drawn for one brand. */
export function renderBrandBoard(data: VoiceSurfaceData, v: BrandView, mode: RenderMode, ctx: BlockContext): ReactNode {
  const empty = brandBoardEmpty(v)
  return (
    <BlockFrame title={brandBoardTitle(v.name)} mode={mode} footer={footer(data, v, mode, ctx.appUrl)} roomy>
      {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : <Table v={v} mode={mode} />}
    </BlockFrame>
  )
}

/** The view's one declared figure: the base every row is counted in. */
export function brandBoardFigures(v: BrandView): FigureTable {
  return v.videos != null
    ? { brand_videos: { value: v.videos, unit: 'videos', label: `videos filed under ${v.name} over the last 90 days` } }
    : {}
}
