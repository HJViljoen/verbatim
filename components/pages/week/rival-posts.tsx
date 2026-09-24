import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { FigureCell } from '@/components/blocks/frame'
import { PlatformIcon } from '@/components/charts/platform-icon'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { OWN_POSTS_UNREAD, OWN_POSTS_UNREAD_OUTSIDE } from '@/lib/reading/own-posts'
import { windowDays, type RivalPost, type RivalPosts, type WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'

// WK §5 · Notable rival posts (the mock's §5), its own tile since Block D
// wave 2 — it was three prose lines inside §4 before.
//
// THE MOCK DRAWS FOUR COLUMNS AND THREE OF THEM HAVE A FIELD. Rival, the post,
// and the comments under it in these days are all read (`buildCameIn`'s
// two-stage pick, and one head count per weighed post). "What the audience
// asked under it" is NOT: the nearest built thing is Competitive's CO5, which
// reads the questions asked under one RIVAL's content, not under one post of
// theirs, and there is no per-post question reading anywhere in this product.
// The layout keeps the mock's table and the fourth column's answer is a link to
// the page that does hold that reading, said once in the footer rather than
// repeated down a column.
//
// A POST HAS NO TITLE, SO THIS IS WHAT A POST IS: the platform, the account,
// the day it went up and its caption cut to a line. `videos` has no title
// column, and a row that invented one would be the only fabricated field on
// this page.
//
// THE COMMENT COUNT IS WINDOW-DATED AND IS A COUNT UNDER THAT ONE POST. Not
// `videos.comments_count`, which is the platform's own current number and
// drifts upward between updates; not the rival's week, which nothing here
// counted. The rule that picked the three is printed, because "three of
// ninety-four" picked two different ways is two different claims.
//
// BUT THE RULE IS THE TILE'S, AND ONLY THE COUNTS ARE THE RIVAL'S (review
// W6). It was a full sentence under every rival's rows — twice in one tile on
// the thin arm — and a set of ONE has no "most", so a single-post rival read
// "1 shown: the most commented on in these days of the 1 widest-reaching of
// 27". The pick rule is one rule for every rival on the tile, so it is stated
// once, under the header; what differs per rival is four numbers, and four
// numbers is what each rival's foot now carries.

export const weekRivalPosts: Block<WeekData> = {
  key: 'week.rival-posts',
  title: 'Notable rival posts',
  question: 'Which of your rivals’ posts drew the conversation in these days?',

  render(data, mode = 'app', ctx) {
    const rivals = data.cameIn.rivals
    const email = mode === 'email'
    const empty = weekRivalPosts.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/competitive`
    const days = windowDays(data.cameIn.window)

    return (
      <BlockFrame
        title={weekRivalPosts.title}
        question={weekRivalPosts.question}
        mode={mode}
        meta={days ?? 'this update covered no window'}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Competitive →</a>
          : <Link href={href} className="hover:underline">Open Competitive →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {/* THE PICK RULE, ONCE FOR THE TILE. Two stages, because on production
            the widest-reaching posts carry no window comments at all
            (Freitag's two 2.2M-view TikToks: zero). */}
        {rivals.length > 0 ? (
          <div className={email ? undefined : 'flex min-w-0 flex-col'}>
            {!email ? (
              <div className="hidden items-end gap-4 border-b border-border/70 pb-1.5 xl:grid xl:grid-cols-[170px_minmax(0,1fr)_88px]">
                <Head>Rival</Head>
                <Head>The post</Head>
                <Head right>Comments</Head>
              </div>
            ) : null}
            {rivals.map((r) => <RivalRow key={r.audience} rival={r} mode={mode} />)}
          </div>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const r of data.cameIn.rivals) {
      // The posts ABOUT a rival are §4's number and are declared there; what
      // this block adds is what was under the posts it named.
      out[`rival_${r.audience}_post_comments`] = {
        value: r.comments,
        unit: 'comments',
        label: `${r.label} — comments under the posts named, in the days this update covered`, // em-dash-ok: FigureTable label (a record key, never printed)
      }
    }
    return out
  },

  emptyState(data) {
    if (data.cameIn.rivals.length > 0) return null
    return 'No rival is tracked for this workspace yet, so there are no rival posts to read the conversation under.'
  },
}

function Head({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <span className={`text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground${right ? ' text-right' : ''}`}>
      {children}
    </span>
  )
}

/** One rival: who they are, what we can see of them, and the posts we named. */
function RivalRow({ rival, mode }: { rival: RivalPosts; mode: 'app' | 'print' | 'email' }) {
  const email = mode === 'email'
  // THE RULE THAT PICKED THE POSTS, IN THE ROW'S OWN WORDS. Two stages: the
  // widest-reaching few by the platform's own view count, then the most
  // commented on of those inside the window.
  // AND THE SUM OVER THE POSTS NAMED, never the rival's week: three of
  // ninety-four is a claim about three posts, and `postsTotal` beside it is
  // what keeps the two apart.
  const rule = rival.posts.length > 0
    ? `${fmtInt(rival.posts.length)} of ${fmtInt(rival.postsTotal)} · ${fmtInt(rival.comments)} ${rival.comments === 1 ? 'comment' : 'comments'}`
    : null
  // POSTS ABOUT THEM vs POSTS OF THEIRS, which is the pair this tile inherited
  // from §4 when it moved out of it. Össur has zero competitor-owned videos and
  // 92 posts about Ottobock; "0 posts of their own" would read as a quiet week
  // rather than as a readiness gap, so the second half names the gap. NOT "is a
  // handle configured" — that is a setting, and a setting is not evidence.
  //
  // AND IT NAMES THE PAGE, NOT THE OWNER (the vocabulary ruling, taking
  // `OWN_POSTS_UNREADABLE`'s rule — design review nit 25, subjects R1 — on the
  // last surface that had not). This clause ended "— Verbatim engineering": a
  // readiness OWNER, right on /dashboard/settings/readiness where the row it
  // belongs to is drawn, and an internal team name in the middle of a client's
  // rivals table anywhere else.
  //
  // THE IN-APP SENTENCE MAY NAME THE PAGE, and here one genuinely exists —
  // `rivalAccounts` is the FIRST row Readiness computes (lib/readiness/
  // compute.ts), and it separates configured from captured from read, which is
  // exactly the state this clause is reporting. A reader OUTSIDE the workspace
  // has no Settings to open, so print and email get the absence with no
  // pointer, which is what `OWN_POSTS_UNREADABLE_OUTSIDE` is for on Overview.
  const about = `${fmtInt(rival.aboutThem)} ${rival.aboutThem === 1 ? 'post' : 'posts'} about them`
  const seen = rival.ownPostsUnread
    ? `${about} · ${mode === 'app' ? OWN_POSTS_UNREAD : OWN_POSTS_UNREAD_OUTSIDE}`
    : `${about}, ${fmtInt(rival.byThem)} ${rival.byThem === 1 ? 'post' : 'posts'} of their own`

  if (email) {
    return (
      <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '8px 0' }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.ink }}>{rival.label}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{seen}</div>
        {rule ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{rule}</div> : null}
        {rival.posts.map((post, i) => (
          <div key={`${post.platform}:${post.href ?? i}`} style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2, marginTop: 4 }}>
            <PostWords post={post} />
            {' · '}<span data-copy="figure">{fmtInt(post.comments)}</span> {post.comments === 1 ? 'comment' : 'comments'} under it in these days
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="border-t border-border/70 py-2">
      {/* ONE TABLE, NOT THREE LOOSE GROUPS (design review F13). The rival's
          name used to take a row of its own with the pick sentence beside it
          and the posts on rows underneath, which left a ~35px hole between a
          rival and its first post and made three rivals read as three stacked
          cards rather than as three rows of one table. The artboard puts the
          post in the rival's row, so the first post sits beside the name and
          the rest continue under it — the rival cell empty, the hairline
          between rivals still doing the grouping. */}
      {(rival.posts.length > 0 ? rival.posts : [null]).map((post, i) => (
        <div
          key={post ? `${post.platform}:${post.href ?? i}` : 'none'}
          className={`grid grid-cols-1 items-start gap-1 xl:grid-cols-[170px_minmax(0,1fr)_88px] xl:gap-4${i > 0 ? ' pt-1.5' : ''}`}
        >
          {i === 0 ? (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--comp)' }} aria-hidden />
                {rival.label}
              </span>
              <span className="font-mono text-[10.5px] leading-[1.35] text-muted-foreground">{seen}</span>
            </span>
          ) : <span className="hidden xl:block" />}
          {post ? (
            <span className="flex min-w-0 items-center gap-1.5 text-[12px]">
              <PlatformIcon platform={post.platform} className="shrink-0 text-secondary-foreground" />
              <span className="min-w-0 truncate"><PostWords post={post} /></span>
            </span>
          ) : (
            <span className="text-[11.5px] text-muted-foreground">
              No post of theirs was read in the days this update covered.
            </span>
          )}
          {post ? (
            // THE COLUMN'S NAME TRAVELS WITH THE NUMBER BELOW `xl` (design
            // review F10), where the header row is hidden and the cell would
            // otherwise be a bare count at the end of a stacked row.
            <span className="flex items-baseline gap-1.5 xl:block xl:justify-self-end">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground xl:hidden">Comments</span>
              {/* NO "of N", DELIBERATELY. A count of the comments under one post
                  is not a share of anything on this page — not of the update's
                  videos, which are a different unit, and not of the rival's
                  week, which nothing counted. `FigureCell`'s own contract is
                  that omitting the denominator is a statement; the days they
                  were counted in are in the block's meta. */}
              <FigureCell value={fmtInt(post.comments)} align="right" mode={mode} />
            </span>
          ) : <span />}
        </div>
      ))}
      {/* THE RIVAL'S OWN FOUR NUMBERS, UNDER THE POSTS THEY ARE ABOUT. They
          are about the set and not about any one row, so they sit at the foot
          of the rival's rows rather than beside its name, where they used to
          push the first post a row down. The rule the numbers are of is the
          tile's and is stated once, above. The same `pt-1.5` as a continued
          post row, so a rival with one post and a rival with three space the
          same way. */}
      {rule ? (
        <div className="grid grid-cols-1 gap-1 pt-1.5 xl:grid-cols-[170px_minmax(0,1fr)_88px] xl:gap-4">
          <span className="hidden xl:block" />
          <span className="font-mono text-[10.5px] leading-[1.35] text-muted-foreground xl:col-span-2">{rule}</span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The post itself.
 *
 * THE ACCOUNT AND THE CAPTION ARE SOMEBODY ELSE'S WORDS, so they are marked as
 * a quote: rule (c) may not police them, for the same reason it may not police
 * a commenter's — a rival whose caption says "growing" has not made a direction
 * claim on this product's behalf. Everything code says about the post sits
 * outside those nodes.
 */
function PostWords({ post }: { post: RivalPost }) {
  return (
    <>
      {platformLabel(post.platform)}
      {post.account ? <> · <span data-copy="quote">{post.account}</span></> : null}
      {/* THE POST'S OWN DATE, and the only figure on this row that is not
          window-dated: `videos.upload_date` is the video's clock. The comments
          beside it are dated by the days the update covered, which is why the
          two are worded differently and never joined by a comma. */}
      {post.postedOn ? ` · posted ${shortDate(post.postedOn)}` : ''}
      {post.caption ? <> · <span data-copy="quote">{post.caption}</span></> : null}
    </>
  )
}
