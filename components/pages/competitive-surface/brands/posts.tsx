import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { levelWords, POSTS_TITLE, type PostsBlock } from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import type { FigureTable } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { InnerLine, RULE, SCALE } from '@/components/pages/overview/market'
import { competitiveOwnClaims } from '../own-claims'
import { Line, SubHead } from './parts'

// B5 · What they post and say about themselves (market-first WP3.5, plan §2.5
// B5; the approved preview's full-width block).
//
// EACH BRAND'S OWN POSTS PUBLISHED IN THE MONTH (dated by the post, the one
// clock on this page that is not the comment's), and the claim most of them
// carried, in the words the claims read wrote. A CLAIM IS PLAIN TEXT, NEVER
// SET AS A QUOTE (plan §2.5): it is the brand's own marketing, not a voice of
// the market, and it carries the posts it rests on as a level ("1 of 30",
// through `levelText`), in the row: each row has its own base, so no column
// head can carry it.
//
// THE KEY IS CO4'S (`competitive.ownclaims`); a page built before deploy 5
// draws CO4 as it was.

const POST_COLS = 'grid-cols-[minmax(0,1fr)_2.5rem] @min-[480px]:grid-cols-[minmax(10rem,11.5rem)_minmax(0,1fr)_2.5rem]'

export const postsEmpty = (b: PostsBlock): string | null =>
  b.rows.length === 0 ? `No brand you track published a post in ${longMonth(b.month)}.` : null

/** "1 of 30": the posts a claim rests on, of the brand's month, through
 *  `levelText` as every level is (§4.0; a count under 100 posts). */
const inPosts = (p: { k: number; n: number }): string => levelWords(p.k, p.n)

export const claimsNone = (b: PostsBlock): string =>
  `No claim was read from their posts in ${longMonth(b.month)}.`

function Posts({ b, mode }: { b: PostsBlock; mode: RenderMode }) {
  const max = Math.max(1, ...b.rows.map((r) => r.posts))
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SubHead title={`Posts in ${longMonth(b.month)}`} note="own accounts" mode={mode} />
      <div className="@container min-w-0">
        <div role="table" aria-label={`Posts in ${longMonth(b.month)}`} className="flex flex-col">
          <div role="row" className={cn('grid items-end gap-x-4', POST_COLS, RULE.head, SCALE.head)}>
            <span role="columnheader">Brand</span>
            <span aria-hidden className="@max-[480px]:hidden" />
            <span role="columnheader" className="text-right">Posts</span>
          </div>
          {b.rows.map((r, i) => (
            <div key={r.audience} role="row" className={cn('grid min-h-11 items-center gap-x-4', POST_COLS, i === b.rows.length - 1 ? null : RULE.row)}>
              <span role="rowheader" className={cn('min-w-0 truncate', SCALE.row)}>{r.label}</span>
              <span aria-hidden className="relative block h-1.5 @max-[480px]:hidden">
                <span className="absolute inset-y-0 left-0 rounded-[2px] bg-comp" style={{ width: `${((r.posts / max) * 100).toFixed(1)}%` }} />
              </span>
              <span role="cell" data-copy="figure" className={cn(SCALE.num, 'font-semibold')}>{fmtInt(r.posts)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Claims({ b, mode }: { b: PostsBlock; mode: RenderMode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SubHead title="What they say about themselves" note="as they word it" mode={mode} />
      {b.claims.length === 0 ? <Line mode={mode} className="text-[14px] text-muted-foreground">{claimsNone(b)}</Line> : (
        <div role="table" aria-label="What they say about themselves" className="flex flex-col">
          <div role="row" className={cn('flex items-end justify-between gap-4', RULE.head, SCALE.head)}>
            <span role="columnheader">Brand and claim</span>
            <span role="columnheader">In posts</span>
          </div>
          {b.claims.map((c, i) => (
            <div key={c.id} role="row" className={cn('flex flex-col gap-1 py-3', i === b.claims.length - 1 ? null : RULE.row)}>
              <span className="flex items-baseline justify-between gap-4">
                <span role="rowheader" className="text-[15px] font-semibold text-foreground">{c.label}</span>
                <span role="cell" data-copy="level" className="whitespace-nowrap font-mono text-[13px] tabular-nums text-muted-foreground">{inPosts(c.posts)}</span>
              </span>
              <span role="cell" data-copy="stored" data-slot="pass_a_brand_claim" className="text-[14px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">{c.claim}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmailBody({ b }: { b: PostsBlock }) {
  return (
    <div>
      <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>Posts in {longMonth(b.month)} <span style={{ fontFamily: FONT.mono, fontWeight: 400, color: EMAIL.muted }}>· own accounts</span></div>
      {b.rows.map((r) => (
        <div key={r.audience} style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
          {r.label} · <span data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600 }}>{fmtInt(r.posts)}</span>
        </div>
      ))}
      <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink, marginTop: 16 }}>What they say about themselves</div>
      {b.claims.length === 0 ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted }}>{claimsNone(b)}</div> : b.claims.map((c) => (
        <div key={c.id} style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '6px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
          <strong>{c.label}</strong> <span data-copy="level" style={{ fontFamily: FONT.mono, color: EMAIL.muted }}>{inPosts(c.posts)}</span>
          <div data-copy="stored" data-slot="pass_a_brand_claim" style={{ color: EMAIL.ink2, marginTop: 2 }}>{c.claim}</div>
        </div>
      ))}
    </div>
  )
}

export const brandsPosts: Block<CompetitiveSurfaceData> = {
  key: competitiveOwnClaims.key,
  title: POSTS_TITLE,
  question: 'What do the brands post, and what do they say about themselves?',

  render(data, mode = 'app', ctx) {
    const b = data.brands?.posts
    if (!b) return competitiveOwnClaims.render(data, mode, ctx)
    const footer = openLink(mode, `${ctx.appUrl}${surface('settings').href}`, 'The accounts we track, in Settings →')
    const empty = postsEmpty(b)
    if (mode === 'email') {
      return <BlockFrame title={POSTS_TITLE} mode={mode} footer={footer}>{empty ? <InnerLine mode={mode}>{empty}</InnerLine> : <EmailBody b={b} />}</BlockFrame>
    }
    return (
      <BlockFrame title={POSTS_TITLE} mode={mode} footer={footer} roomy>
        {empty ? <InnerLine mode={mode}>{empty}</InnerLine> : (
          <div className="@container min-w-0">
            <div className="grid min-w-0 grid-cols-1 items-start gap-y-8 @min-[760px]:grid-cols-2 @min-[760px]:gap-x-12 @min-[900px]:gap-x-[88px]">
              <Posts b={b} mode={mode} />
              <Claims b={b} mode={mode} />
            </div>
          </div>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const b = data.brands?.posts
    if (!b) return competitiveOwnClaims.figures?.(data) ?? {}
    const out: FigureTable = {}
    for (const r of b.rows) {
      out[`posts_${r.audience.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`] = { value: r.posts, unit: 'videos', label: `${r.label}’s own posts in ${longMonth(b.month)}` }
    }
    return out
  },

  quotes(data) {
    return data.brands ? [] : competitiveOwnClaims.quotes?.(data) ?? []
  },

  emptyState(data) {
    const b = data.brands?.posts
    return b ? postsEmpty(b) : competitiveOwnClaims.emptyState(data)
  },
}
