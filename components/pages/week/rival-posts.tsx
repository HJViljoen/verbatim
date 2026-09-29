import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, monthName, platformLabel, shortDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import { OWN_POSTS_UNREAD, OWN_POSTS_UNREAD_OUTSIDE } from '@/lib/reading/own-posts'
import type { RivalPost, RivalPosts, WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'
import { RULE, SCALE } from '@/components/pages/overview/market'

// "What brands you track posted" (market-first WP3.7, `week.rival-posts`; the
// approved preview's This week): per brand you track, how many posts of its
// own this update found and how many videos about it, and its own
// most-commented post of the update with the comments written under it in the
// update's days.
//
// A BRAND'S NAME MEASURED AS MOSTLY ANOTHER WORD IS NOT COUNTED (the approved
// preview's Freitag; lib/brands/precision.ts): once production's hand check
// finds it noise, its "videos about them" prints "·" and the row says why.
// Unmeasured, the count prints plainly (the lead's R2 of 26 Sep).
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings):
// the window is the page bar's, and the footer names the brands' page by its
// CURRENT sidebar label (§4.0).

export const BRANDS_POSTED_TITLE = 'What brands you track posted'

/** The brand's own post that drew the most comments in the update's days. */
export const topOwnPost = (r: RivalPosts): RivalPost | null => r.posts.find((p) => p.own !== false) ?? null

/** Does this brand's "naming them" count print no figure: its name measured
 *  as another word, or not counted yet (lib/pages/week-brands.ts)? */
const notCounted = (r: RivalPosts): boolean => r.nameNote != null || r.aboutNote != null

/** "tracked since 17 Sep", or Settings' "by 28 Jun" as "tracked by 28 Jun";
 *  a stored copy with no label prints the identity row's date. */
export function trackedLine(r: RivalPosts): string | null {
  if (r.since) return r.since.startsWith('by ') ? `tracked ${r.since}` : `tracked since ${r.since}`
  return r.trackedSince ? `tracked since ${shortDate(r.trackedSince)}` : null
}

/** "of 7 in Sep": the month's figure the update's count sits inside, the
 *  Brands page's "in all". Null where there is none to print, or it is 0 (a
 *  bare 0 says it). */
export function namingMonthLine(r: RivalPosts, month: string): string | null {
  if (notCounted(r) || r.aboutMonth == null || r.aboutMonth === 0) return null
  return `of ${fmtInt(r.aboutMonth)} in ${monthName(month).split(' ')[0]}`
}

/** The brands in the preview's order: by the comments under their top post,
 *  the brands whose name is not counted after them. */
export function brandsPostedOrder(rows: readonly RivalPosts[]): RivalPosts[] {
  const key = (r: RivalPosts) => (notCounted(r) ? 1 : 0)
  return [...rows].sort((a, b) => key(a) - key(b) || (topOwnPost(b)?.comments ?? -1) - (topOwnPost(a)?.comments ?? -1) || a.label.localeCompare(b.label))
}

function PostCell({ r, mode }: { r: RivalPosts; mode: RenderMode }) {
  const post = topOwnPost(r)
  const found = r.foundByName ?? r.aboutThem
  const note = r.nameNote
    ? `${fmtInt(found)} ${found === 1 ? 'video' : 'videos'} matched the name, ${r.nameNote}`
    : r.aboutNote ? `Videos naming them: ${r.aboutNote}` : null
  const words = post
    ? <><span className="block truncate text-[15px] text-foreground" title={post.caption}>“<span data-copy="quote">{post.caption || post.account}</span>”</span><span className="block font-mono text-[12px] text-muted-foreground">{platformLabel(post.platform)}{post.postedOn ? ` · ${shortDate(post.postedOn)}` : ''}</span></>
    : <span className="block text-[13px] text-muted-foreground">{r.ownPostsUnread ? (mode === 'app' ? OWN_POSTS_UNREAD : OWN_POSTS_UNREAD_OUTSIDE) : 'No post of their own in these days.'}</span>
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {words}
      {note ? <span className="block font-mono text-[12px] text-muted-foreground">{note}</span> : null}
    </span>
  )
}

export const weekRivalPosts: Block<WeekData> = {
  key: 'week.rival-posts',
  title: BRANDS_POSTED_TITLE,
  question: 'What did the brands you track post in these days, and what drew the talk?',

  render(data, mode = 'app', ctx) {
    const nav = surface('competitive')
    const footer = openLink(mode, `${ctx.appUrl}${nav.href}`, `Open ${nav.label} →`)
    const empty = weekRivalPosts.emptyState(data)
    if (empty) return <BlockFrame title={BRANDS_POSTED_TITLE} mode={mode} footer={footer} roomy card><BlockEmpty mode={mode}>{empty}</BlockEmpty></BlockFrame>
    const rows = brandsPostedOrder(data.cameIn.rivals)
    const max = Math.max(1, ...rows.map((r) => topOwnPost(r)?.comments ?? 0))

    if (mode === 'email') {
      const cell = { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '8px 8px 8px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
      const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const }
      const head = { ...cell, borderTop: 0, fontSize: 11, color: EMAIL.muted }
      return (
        <BlockFrame title={BRANDS_POSTED_TITLE} mode={mode} footer={footer} roomy card>
          <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={{ ...head, textAlign: 'left' }}>Brand</th><th style={{ ...head, textAlign: 'right' }}>Own posts</th><th style={{ ...head, textAlign: 'right' }}>Videos naming them</th><th style={{ ...head, textAlign: 'right' }}>Comments on their top post</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const post = topOwnPost(r)
                return (
                  <tr key={r.audience}>
                    <td style={cell}>{r.label}</td>
                    <td style={num}>{r.ownPostsUnread ? '·' : <span data-copy="figure">{fmtInt(r.byThem)}</span>}</td>
                    <td style={num}>{notCounted(r) ? '·' : <span data-copy="figure">{fmtInt(r.aboutThem)}</span>}</td>
                    <td style={num}>{post ? <span data-copy="figure">{fmtInt(post.comments)}</span> : '·'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </BlockFrame>
      )
    }

    const cols = 'grid-cols-[minmax(0,1fr)_56px_64px] gap-x-4 @min-[900px]:grid-cols-[minmax(160px,0.9fr)_72px_80px_minmax(0,2.2fr)_minmax(120px,0.6fr)]'
    return (
      <BlockFrame title={BRANDS_POSTED_TITLE} mode={mode} footer={footer} roomy card>
        <div className="@container">
          <div role="table" className="flex min-w-0 flex-col">
            <div role="row" className={`grid ${cols} items-end ${RULE.head}`}>
              <span role="columnheader" className={SCALE.head}>Brand</span>
              <span role="columnheader" className={`text-right ${SCALE.head}`}>Own posts</span>
              <span role="columnheader" className="flex flex-col items-end text-right leading-[1.35]"><span className="text-[13px] font-medium text-muted-foreground">Videos</span><span className="font-mono text-[12px] text-muted-foreground">naming them</span></span>
              <span role="columnheader" className={`@max-[900px]:hidden ${SCALE.head}`}>Their most-commented post</span>
              <span role="columnheader" className={`@max-[900px]:hidden text-right ${SCALE.head}`}>Comments on it</span>
            </div>
            {rows.map((r) => {
              const post = topOwnPost(r)
              return (
                <div key={r.audience} role="row" className={`grid ${cols} items-center gap-y-2 py-3 ${RULE.row}`}>
                  <span role="rowheader" className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-semibold text-foreground">{r.label}</span>
                    {trackedLine(r) ? <span className="font-mono text-[12px] text-muted-foreground">{trackedLine(r)}</span> : null}
                  </span>
                  <span className={`${SCALE.num} font-semibold`}>{r.ownPostsUnread ? <span className="font-normal text-muted-foreground">·</span> : <span data-copy="figure">{fmtInt(r.byThem)}</span>}</span>
                  <span className={`flex flex-col items-end ${SCALE.prev}`}>
                    {notCounted(r) ? '·' : <span data-copy="figure">{fmtInt(r.aboutThem)}</span>}
                    {namingMonthLine(r, data.month) ? <span className="whitespace-nowrap font-mono text-[12px] text-muted-foreground">{namingMonthLine(r, data.month)}</span> : null}
                  </span>
                  <span className="min-w-0 @max-[900px]:col-span-full"><PostCell r={r} mode={mode} /></span>
                  <span className="flex items-center justify-end gap-3 @max-[900px]:col-span-full @max-[900px]:justify-start">
                    {post ? (
                      <>
                        <span aria-hidden className="block h-1.5 rounded-[2px] bg-comp" style={{ width: `${Math.max(2, Math.round((post.comments / max) * 104))}px` }} />
                        <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground"><span data-copy="figure">{fmtInt(post.comments)}</span></span>
                      </>
                    ) : <span className="font-mono text-[15px] text-muted-foreground">·</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const r of data.cameIn.rivals) {
      const post = topOwnPost(r)
      if (post) out[`brand_${r.audience}_top_post_comments`] = { value: post.comments, unit: 'comments', label: `${r.label}: comments under their most-commented post, in the days this update covered` }
      if (!r.ownPostsUnread) out[`brand_${r.audience}_own_posts`] = { value: r.byThem, unit: 'videos', label: `${r.label}: posts of their own this update` }
    }
    return out
  },

  emptyState(data) {
    if (data.cameIn.rivals.length > 0) return null
    return 'No brand is tracked for this workspace, so there are no brands’ posts to read.'
  },
}
