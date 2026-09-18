import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { BlockStat } from '@/components/blocks/stat'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { platformMixLine } from '@/lib/reading/record'
import {
  contributionLine,
  crossingLine,
  newThemesLine,
  windowDays,
  type CameInBlock,
  type RivalPost,
  type WeekData,
} from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'

// WK §4 · What came in (design §3 WK5; the mock's §4 and §5).
//
// THE SECTION THAT HAS TO KEEP THREE PAIRS OF NUMBERS APART, and production
// breaks all three if it does not:
//
//   GATHERED vs ANALYSED. Össur's newest update discovered 618 videos and
//   analysed 508 of them; Sealand's discovered 1,098 and analysed 253. Every
//   reading on this product is drawn from the analysed set, so printing the
//   first as "what came in" would put a number in front of a reader that
//   nothing else on the page is a share of.
//
//   COMMENTS GATHERED vs COMMENTS IN THE WINDOW. A newly discovered YouTube
//   video arrives with its whole back-thread: Össur's update gathered 6,932
//   comments of which 5,134 were written inside the days it covered, the rest
//   reaching back to March. This block prints the window's own, because the
//   window is what the page is about.
//
//   POSTS BY A RIVAL vs POSTS ABOUT ONE. Össur has zero competitor-owned
//   videos in production and 92 posts about Ottobock. "Notable rival posts"
//   unqualified would read as "Ottobock posted nothing this week", which is
//   false; what is true is that we cannot see their own posts, and the row says
//   so with the readiness owner named.
//
// AND THE CONTRIBUTION LINE, WHICH IS WHY THE SECTION EXISTS. Every count above
// is of a window, and a window is not a period. Handing each one back to the
// month it fell in — "this update's contribution to September so far: 205 of
// 449" — is what stops a reader treating the update as a period of its own.

export const weekCameIn: Block<WeekData> = {
  key: 'week.came-in',
  title: 'What came in',
  question: 'What did this update read, and whose conversation was it?',

  render(data, mode = 'app', ctx) {
    const c = data.cameIn
    const email = mode === 'email'
    const empty = weekCameIn.emptyState(data)
    const days = windowDays(c.window)

    return (
      <BlockFrame
        title={weekCameIn.title}
        question={weekCameIn.question}
        mode={mode}
        meta={days ?? 'this update covered no window'}
        footer={email
          ? <a href={`${ctx.appUrl}${c.playbookHref}`} style={{ color: EMAIL.ink }}>Open Market →</a>
          : <Link href={`${ctx.appUrl}${c.playbookHref}`} className="hover:underline">Open Market →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}

        {c.rows.length > 0 ? (
          <>
            <BlockStat
              mode={mode}
              value={fmtInt(c.analysed)}
              unit="videos analysed"
              // "ANALYSED" AND "NEWLY FOUND" ARE TWO SETS, NOT A PART AND A
              // WHOLE, so the line never says "of". A video discovered by an
              // earlier update and re-analysed by this one is in the first and
              // not the second, which is why production reads "Ottobock — 96
              // analysed · 92 newly found": an "of" there is arithmetic that
              // does not hold.
              base={`${fmtInt(c.gathered)} newly found${c.windowComments != null ? ` · ${fmtInt(c.windowComments)} comments written in these days` : ''}`}
            />
            {c.contribution ? (
              <Note mode={mode}>{contributionLine(data.month, c.contribution.videos, c.contribution.of)}</Note>
            ) : (
              <Note mode={mode}>
                The month’s own reading is not available here, so this update’s contribution to it cannot be stated.
              </Note>
            )}
            {c.crossesInto ? <Note mode={mode}>{crossingLine(data.month, c.crossesInto)}</Note> : null}
            <Audiences rows={c.rows} mode={mode} month={data.month} />
          </>
        ) : null}

        <Themes block={c} mode={mode} />
        <Rivals block={c} mode={mode} />
        <Quotes block={c} mode={mode} />
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const c = data.cameIn
    const out: FigureTable = {
      came_in_analysed: { value: c.analysed, unit: 'videos', label: 'videos this update analysed' },
      came_in_gathered: { value: c.gathered, unit: 'videos', label: 'videos this update found' },
    }
    if (c.windowComments != null) {
      out.came_in_comments = { value: c.windowComments, unit: 'comments', label: 'comments written in the days this update covered' }
    }
    if (c.contribution) {
      out.month_so_far = { value: c.contribution.of, unit: 'videos', label: 'videos in the month so far' }
      out.month_from_this_update = { value: c.contribution.videos, unit: 'videos', label: 'of them from this update' }
    }
    return out
  },

  quotes(data) {
    return data.cameIn.quotes.map((q) => q.quote.ref)
  },

  emptyState(data) {
    if (data.cameIn.rows.length > 0) return null
    return data.cameIn.window
      ? 'This update found no videos in the days it covered.'
      : 'This update covered no window, so there is nothing to say came in during it.'
  },
}

/** One row per audience. Analysed leads, found follows, and the platform mix
 *  is of the ANALYSED videos — the set every reading is drawn from. */
function Audiences({ rows, mode, month }: { rows: CameInBlock['rows']; mode: 'app' | 'print' | 'email'; month: string }) {
  const email = mode === 'email'
  if (email) {
    return (
      <div style={{ marginTop: 8 }}>
        {rows.map((r) => (
          <div key={r.audience} style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, padding: '3px 0' }}>
            {r.label} — <span data-copy="figure">{fmtInt(r.analysed)}</span> analysed · {fmtInt(r.gathered)} newly found · {platformMixLine(r.platformMix) || 'no platform recorded'}
            {r.contribution ? (
              <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>
                {contributionLine(month, r.contribution.videos, r.contribution.of)}
              </div>
            ) : null}
            {r.share.n > 0 ? (
              <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>
                <span data-copy="level">{fmtInt(r.share.k)} of {fmtInt(r.share.n)} videos this update analysed</span>
                {r.comments != null
                  ? <> · <span data-copy="figure">{fmtInt(r.comments)}</span> {r.comments === 1 ? 'comment' : 'comments'} written in these days</>
                  : ' · comments in these days are not recorded for this workspace yet'}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {rows.map((r) => (
        <p key={r.audience} className="m-0 text-[12px]">
          <span className="font-medium">{r.label}</span> — <span data-copy="figure">{fmtInt(r.analysed)}</span>{' '}
          <span className="text-muted-foreground">analysed · {fmtInt(r.gathered)} newly found · {platformMixLine(r.platformMix) || 'no platform recorded'}</span>
          {/* ONE PER AUDIENCE, which is what the plan's WK5 bullet asks for and
              what makes this block's point ON EVERY ROW: each count above is of
              a WINDOW, and a window is not a period, whoever's conversation it
              was. It costs no extra read — the windowed RPC already comes back
              per audience, and so do the stored month rows. */}
          {r.contribution ? (
            <span className="block text-[11.5px] text-muted-foreground">
              {contributionLine(month, r.contribution.videos, r.contribution.of)}
            </span>
          ) : null}
          <AudienceShare row={r} />
        </p>
      ))}
    </div>
  )
}

/**
 * The share bar's own numbers and the row's comments — the mock's two missing
 * columns (`week.camein.col.share`, `week.camein.col.comments`).
 *
 * BOTH SIDES OF THE SHARE, NEVER A BARE PERCENTAGE. "360 of 508" is a
 * measurement; "71%" on its own is the score this product does not print. And
 * the denominator named is the UPDATE's analysed total — the one thing on this
 * block every row is genuinely a part of — not the month's and not the
 * category's.
 *
 * THE COMMENTS ARE WINDOW-DATED AND ABSENT MEANS ABSENT. Null is "the windowed
 * reading is not installed here", which is a different sentence from a zero,
 * and a zero here is a real zero: this audience drew no comment in the days the
 * update covered.
 */
function AudienceShare({ row }: { row: CameInBlock['rows'][number] }) {
  if (row.share.n <= 0) return null
  return (
    <span className="block text-[11.5px] text-muted-foreground">
      <span data-copy="level">{fmtInt(row.share.k)} of {fmtInt(row.share.n)} videos this update analysed</span>
      {row.comments != null
        ? <> · <span data-copy="figure">{fmtInt(row.comments)}</span> {row.comments === 1 ? 'comment' : 'comments'} written in these days</>
        : ' · comments in these days are not recorded for this workspace yet'}
    </span>
  )
}

/**
 * One rival post, by the only identity a post in this product has
 * (`week.rivalposts.col.post` / `.col.comments`).
 *
 * THE CAPTION AND THE ACCOUNT ARE SOMEBODY ELSE'S WORDS, so they are marked as
 * a quote: rule (c) may not police them, for the reason the copy contract
 * already gives about a commenter — a rival whose caption says "growing" has
 * not made a direction claim on this product's behalf. Everything code says
 * about the post sits outside those nodes.
 */
function Post({ post, mode }: { post: RivalPost; mode: 'app' | 'print' | 'email' }) {
  const email = mode === 'email'
  return (
    <span
      className={email ? undefined : 'block pl-3 text-[11.5px] text-muted-foreground'}
      style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, paddingLeft: 10 } : undefined}
    >
      {platformLabel(post.platform)}
      {post.account ? <> · <span data-copy="quote">{post.account}</span></> : null}
      {/* THE POST'S OWN DATE, and the only figure on this row that is not
          window-dated: `videos.upload_date` is the video's clock. The comments
          beside it are dated by the days the update covered, which is why the
          two are worded differently and never joined by a comma. */}
      {post.postedOn ? ` · posted ${shortDate(post.postedOn)}` : ''}
      {post.caption ? <> · <span data-copy="quote">{post.caption}</span></> : null}
      {' · '}<span data-copy="figure">{fmtInt(post.comments)}</span> {post.comments === 1 ? 'comment' : 'comments'} under it in these days
    </span>
  )
}

function Themes({ block, mode }: { block: CameInBlock; mode: 'app' | 'print' | 'email' }) {
  return (
    <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-1'} style={mode === 'email' ? { marginTop: 10 } : undefined}>
      <Heading mode={mode}>Heard for the first time</Heading>
      <Note mode={mode}>{newThemesLine(block.newThemesSeen, block.newThemes.length)}</Note>
      {block.newThemes.map((t) => (
        <p
          key={t.id}
          className={mode === 'email' ? undefined : 'm-0 text-[12px]'}
          style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, padding: '2px 0' } : undefined}
        >
          {t.label} — <span data-copy="figure">{fmtInt(t.videos)}</span> videos this month
        </p>
      ))}
    </div>
  )
}

function Rivals({ block, mode }: { block: CameInBlock; mode: 'app' | 'print' | 'email' }) {
  if (block.rivals.length === 0) return null
  return (
    <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-1'} style={mode === 'email' ? { marginTop: 10 } : undefined}>
      <Heading mode={mode}>Rival posts this update</Heading>
      {block.rivals.map((r) => (
        <p
          key={r.audience}
          className={mode === 'email' ? undefined : 'm-0 text-[12px]'}
          style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, padding: '2px 0' } : undefined}
        >
          <span className={mode === 'email' ? undefined : 'font-medium'}>{r.label}</span>{' '}
          <span className={mode === 'email' ? undefined : 'text-muted-foreground'}>
            — <span data-copy="figure">{fmtInt(r.aboutThem)}</span> {r.aboutThem === 1 ? 'post' : 'posts'} about them
            {r.ownPostsUnread
              // THE READINESS GAP, NAMED WHERE IT BITES. This workspace has
              // never captured a post of this rival's, so a zero here would be
              // read as "they went quiet" when what is true is that their own
              // posts are not being read at all.
              ? ' · their own posts are not read yet — Verbatim engineering'
              : `, ${fmtInt(r.byThem)} ${r.byThem === 1 ? 'post' : 'posts'} of their own`}
          </span>
          {/* THE POSTS THEMSELVES, AND WHAT THE COLUMN IS A COLUMN OF. Three of
              ninety-four, said out loud: the comment count beside the rival is
              the sum over the posts NAMED and not that rival's week, which is
              the claim a bare total would make. */}
          {r.posts.length > 0 ? (
            <>
              <span className={mode === 'email' ? undefined : 'block text-[11.5px] text-muted-foreground'} style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
                {/* THE RULE, NOT JUST THE RATIO. The pick is two stages — the
                    widest-reaching few, then the most-commented of those — and
                    "3 of 94" alone would describe a rule this did not follow. */}
                <span data-copy="figure">{fmtInt(r.posts.length)}</span> shown: the most commented on in these days of the <span data-copy="figure">{fmtInt(r.postsConsidered)}</span> widest-reaching of <span data-copy="figure">{fmtInt(r.postsTotal)}</span>; <span data-copy="figure">{fmtInt(r.comments)}</span> {r.comments === 1 ? 'comment' : 'comments'} under them in these days
              </span>
              {r.posts.map((post, i) => <Post key={`${post.platform}:${post.href ?? i}`} post={post} mode={mode} />)}
            </>
          ) : null}
        </p>
      ))}
    </div>
  )
}

function Quotes({ block, mode }: { block: CameInBlock; mode: 'app' | 'print' | 'email' }) {
  if (block.quotesUnread) {
    return (
      <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-1'} style={mode === 'email' ? { marginTop: 10 } : undefined}>
        <Heading mode={mode}>New on your subjects</Heading>
        <Note mode={mode}>{block.quotesUnread}</Note>
      </div>
    )
  }
  if (block.quotes.length === 0) return null
  return (
    <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-2'} style={mode === 'email' ? { marginTop: 10 } : undefined}>
      <Heading mode={mode}>New on your subjects</Heading>
      {block.quotesTotal != null ? (
        <Note mode={mode}>
          <span data-copy="figure">{fmtInt(block.quotesTotal)}</span> comments on your subjects were written in these days; {block.quotes.length === 1 ? 'one is' : `${block.quotes.length} are`} below in full.
        </Note>
      ) : null}
      {block.quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={`${q.subject} · ${q.cite}`} mode={mode} />)}
    </div>
  )
}

function Heading({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{children}</div>
  }
  return <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{children}</h3>
}

function Note({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 3 }}>{children}</div>
  }
  return <p className="m-0 text-[11.5px] text-muted-foreground">{children}</p>
}
