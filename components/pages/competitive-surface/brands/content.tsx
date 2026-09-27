import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { CONTENT_TITLE, levelWords, type ContentBlock } from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import type { FigureTable } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { RULE, SCALE } from '@/components/pages/overview/market'
import { competitivePlaybook } from '../playbook'
import { Fig, Inner } from './parts'

// B6 · How the market makes content (market-first WP3.5, plan §2.5 B6, CO7;
// the approved preview's half-width block).
//
// THE CATEGORY'S FORMATS AND OPENINGS, on the clock of the upload (a format is
// a property of a video, not of a comment), each a level of the videos read
// for it, with how many of the month's category videos were read at all. The
// category's side only: no column of yours or a rival's beside it, so no
// "you against them" reading prints on this page (the WP's done-when).
//
// THE KEY IS CO7'S (`competitive.playbook`); a page built before deploy 5
// draws CO7 as it was.

const COLS = 'grid-cols-[minmax(0,1fr)_4.5rem]'

function Table({ title, rows, n, mode }: { title: string; rows: ContentBlock['formats']; n: number | null; mode: RenderMode }) {
  if (rows.length === 0) return null
  if (mode === 'email') {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.muted }}>{title}{n != null ? <span data-copy="level" style={{ fontFamily: FONT.mono, fontWeight: 400 }}> · of {fmtInt(n)}</span> : null}</div>
        {rows.map((r) => (
          <div key={r.key} style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
            {r.label} · <span data-copy="figure" style={{ fontFamily: FONT.mono }}>{levelWords(r.k, r.n)}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div role="table" aria-label={title} className="flex min-w-0 flex-col">
      <div role="row" className={cn('grid items-end gap-x-4', COLS, RULE.head, SCALE.head)}>
        <span role="columnheader">{title}</span>
        {n != null ? <span role="columnheader" data-copy="level" className="text-right font-mono text-[12px] font-normal">of {fmtInt(n)}</span> : <span />}
      </div>
      {rows.map((r, i) => (
        <div key={r.key} role="row" className={cn('grid min-h-10 items-center gap-x-4', COLS, i === rows.length - 1 ? null : RULE.row)}>
          <span role="rowheader" className={cn('min-w-0 truncate', SCALE.row)}>{r.label}</span>
          <span role="cell" data-copy="figure" className={cn(SCALE.num, 'font-semibold')}>{levelWords(r.k, r.n)}</span>
        </div>
      ))}
    </div>
  )
}

function Body({ c, mode }: { c: ContentBlock; mode: RenderMode }) {
  const read = (
    <>
      <Fig value={c.read} mode={mode} className="font-semibold text-foreground" /> of the <Fig value={c.published} mode={mode} className="font-semibold text-foreground" /> have their format read.
    </>
  )
  if (mode === 'email') {
    return (
      <div>
        <div style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink }}>The formats and openings of the category videos posted in {longMonth(c.month)}.</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, marginTop: 6 }}>{read}</div>
        <Table title="Format" rows={c.formats} n={c.formats[0]?.n ?? null} mode={mode} />
        <Table title="Opening" rows={c.openings} n={c.openings[0]?.n ?? null} mode={mode} />
      </div>
    )
  }
  return (
    <>
      <p className="m-0 max-w-[480px] text-[17px] font-medium leading-[1.5] tracking-[-0.01em] text-foreground [text-wrap:pretty]">
        The formats and openings of the category videos posted in {longMonth(c.month)}.
      </p>
      <Inner mode={mode} className="flex-1 gap-4">
        <p className="m-0 text-[15px] leading-[1.5] text-secondary-foreground">{read}</p>
        <div className="@container min-w-0">
          <div className="grid min-w-0 grid-cols-1 gap-6 @min-[520px]:grid-cols-2">
            <Table title="Format" rows={c.formats} n={c.formats[0]?.n ?? null} mode={mode} />
            <Table title="Opening" rows={c.openings} n={c.openings[0]?.n ?? null} mode={mode} />
          </div>
        </div>
      </Inner>
    </>
  )
}

export const CONTENT_EMPTY = 'The category’s formats were not read for this month.'

export const brandsContent: Block<CompetitiveSurfaceData> = {
  key: competitivePlaybook.key,
  title: CONTENT_TITLE,
  question: 'How does the market make its videos?',

  render(data, mode = 'app', ctx) {
    const b = data.brands
    if (!b) return competitivePlaybook.render(data, mode, ctx)
    const c = b.content && b.content.formats.length > 0 ? b.content : null
    const footer = openLink(mode, `${ctx.appUrl}/dashboard/reports`, 'The Content brief →')
    return (
      <BlockFrame title={CONTENT_TITLE} mode={mode} footer={footer} roomy className={mode === 'app' ? 'h-full' : undefined}>
        {c ? <Body c={c} mode={mode} /> : <BlockEmpty mode={mode}>{CONTENT_EMPTY}</BlockEmpty>}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const b = data.brands
    if (!b) return competitivePlaybook.figures?.(data) ?? {}
    return b.content ? { content_read: { value: b.content.read, unit: 'videos', label: `category videos posted in ${longMonth(b.content.month)} with their format read` } } : {}
  },

  emptyState(data) {
    const b = data.brands
    if (!b) return competitivePlaybook.emptyState(data)
    return b.content && b.content.formats.length > 0 ? null : CONTENT_EMPTY
  },
}
