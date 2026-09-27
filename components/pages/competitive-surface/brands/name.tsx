import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { NAME_TITLE, nameCommentsLine, nameLeadParts, nameOwnParts, type NameBlock } from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import type { FigureTable } from '@/lib/reading/verdicts'
import { Fig, PartsText, SubHead } from './parts'

// B1 · Your name in your market (market-first WP3.5, plan §2.5 B1; the approved
// preview's first block on Brands).
//
// THE NAME LINE FIRST (heinrich-fidelity must-fix 2), at the preview's lead
// size, and beside it where your name came up: in your market's videos, and in
// your own posts, which are your posts and never the market naming you
// (decision E). It prints only once production's hand check holds your name
// and every match of it outside your own posts has been read by hand; until
// then "not counted yet" (WP2.6's done-when, the same rule as Your market's).
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings).

function Aside({ b, mode }: { b: NameBlock; mode: RenderMode }) {
  const c = b.counted
  if (!c) return null
  const line = nameCommentsLine(b)
  const rows = [
    { label: <>In your market’s {fmtInt(c.n)} videos</>, value: c.k, ink: 'bg-foreground' },
    { label: 'In your own posts', value: c.ownPosts, ink: 'bg-you' },
  ]
  if (mode === 'email') {
    return (
      <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '12px 16px', marginTop: 12 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>Where your name came up</div>
        {rows.map((r, i) => (
          <div key={i} style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '6px 0', borderTop: i > 0 ? `1px solid ${EMAIL.hairline}` : undefined }}>
            {r.label} · <Fig value={r.value} mode={mode} />
          </div>
        ))}
        {line ? <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 4 }}>{line}</div> : null}
      </div>
    )
  }
  return (
    <aside className="flex min-w-0 flex-col gap-2 rounded-md bg-inner p-4 sm:p-6">
      <SubHead title="Where your name came up" mode={mode} />
      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div key={i} className={`flex min-h-12 items-center justify-between gap-4 py-2.5 ${i === 0 ? 'border-b border-border' : ''}`}>
            <span className="inline-flex min-w-0 items-center text-[15px] text-foreground">
              <span aria-hidden className={`mr-2.5 inline-block size-2 flex-none rounded-[2px] ${r.ink}`} />
              {r.label}
            </span>
            <Fig value={r.value} mode={mode} className="text-[20px] font-semibold text-foreground" />
          </div>
        ))}
      </div>
      {line ? <p className="m-0 text-[13px] leading-[1.5] text-secondary-foreground">{line}</p> : null}
    </aside>
  )
}

function Body({ b, mode }: { b: NameBlock; mode: RenderMode }) {
  const own = nameOwnParts(b)
  if (mode === 'email') {
    return (
      <div>
        <div style={{ fontFamily: FONT.sans, fontSize: 18, lineHeight: '26px', fontWeight: 500, color: EMAIL.ink }}><PartsText parts={nameLeadParts(b)} mode={mode} /></div>
        {own ? <div style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.ink2, marginTop: 6 }}><PartsText parts={own} mode={mode} /></div> : null}
        <Aside b={b} mode={mode} />
      </div>
    )
  }
  return (
    <div className={b.counted ? 'grid min-w-0 grid-cols-1 gap-y-6 xl:grid-cols-[minmax(0,1fr)_304px] xl:gap-x-[88px]' : 'min-w-0'}>
      <div className="flex min-w-0 flex-col gap-4 pt-1">
        <p className="m-0 max-w-[680px] text-[22px] font-medium leading-[1.3] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[28px]">
          <PartsText parts={nameLeadParts(b)} mode={mode} figureClassName="font-semibold tracking-[-0.04em]" />
        </p>
        {own ? (
          <p className="m-0 max-w-[600px] text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]">
            <PartsText parts={own} mode={mode} figureClassName="font-semibold text-foreground" />
          </p>
        ) : null}
      </div>
      <Aside b={b} mode={mode} />
    </div>
  )
}

export const competitiveName: Block<CompetitiveSurfaceData> = {
  key: 'competitive.name',
  title: NAME_TITLE,
  question: 'Does your market name you, outside your own posts?',

  render(data, mode = 'app', ctx) {
    const b = data.brands?.name ?? null
    const moves = surface('market')
    const footer = openLink(mode, `${ctx.appUrl}${moves.href}`, `See your own posts on ${moves.label} →`)
    return (
      <BlockFrame title={NAME_TITLE} mode={mode} footer={footer} roomy>
        {b ? <Body b={b} mode={mode} /> : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const c = data.brands?.name?.counted
    if (!c) return {}
    return {
      name_market_videos: { value: c.k, unit: 'videos', label: 'videos in your market naming you, outside your own posts' },
      name_own_posts: { value: c.ownPosts, unit: 'videos', label: 'your own posts naming you' },
    }
  },

  emptyState(data) {
    return data.brands?.name ? null : 'Your name is not read in your market for this workspace.'
  },
}
