import Link from 'next/link'
import type { Block, BlockContext } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { TileColumns } from '@/components/shell/page-grid'
import { BlockQuote } from '@/components/blocks/quote'
import { BlockStat } from '@/components/blocks/stat'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, shortDate } from '@/lib/format'
import { platformMixLine } from '@/lib/reading/record'
import {
  audienceContributionLine,
  contributionLine,
  crossedIntoLine,
  crossingLine,
  newThemesLine,
  windowDays,
  type CameInBlock,
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
//   so with the readiness owner named. THAT PAIR NOW LIVES IN ITS OWN TILE
//   (`components/pages/week/rival-posts.tsx`, Block D wave 2, the mock's §5) —
//   the data is still `CameInBlock.rivals`, read once here, because the two
//   readings are one read and splitting the read would be two chances to count
//   a rival's week two ways.
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
    // WHAT THE COLUMN BELOW ACTUALLY ADDS TO. The rows are built from the
    // videos THIS update fetched; `windowComments` is every audience the
    // windowed read returned, and that read counts videos of ANY update that
    // carry a comment dated in these days. So an audience with comments in the
    // window under videos an earlier update found contributes to the total and
    // gets no row — and the column a reader can sum then falls short of the
    // number printed above it, on the one surface whose discipline is that a
    // stated number is checkable. Null where any row's comments are unknown,
    // because a partial sum is not a sum.
    const rowedComments = c.rows.every((r) => r.comments != null)
      ? c.rows.reduce((t, r) => t + (r.comments ?? 0), 0)
      : null

    // THE MOCK'S LEFT COLUMN: the audience table, with the stat and the
    // contribution lines the table's numbers are stated against.
    const left = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
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
              // does not hold. The mock's single "Videos" column collapses
              // that distinction; this table keeps two columns.
              base={`${fmtInt(c.gathered)} newly found${c.windowComments != null ? ` · ${fmtInt(c.windowComments)} comments written in these days` : ''}`}
            />
            {c.contribution ? (
              <Note mode={mode}>{contributionLine(data.month, c.contribution.videos, c.contribution.of)}</Note>
            ) : (
              <Note mode={mode}>
                The month’s own reading is not available here, so this update’s contribution to it cannot be stated.
              </Note>
            )}
            {c.windowComments != null && rowedComments != null && rowedComments < c.windowComments ? (
              <Note mode={mode}>
                The rows below account for <span data-copy="figure">{fmtInt(rowedComments)}</span> of those comments; the rest were written in these days under videos an earlier update found, in audiences this update read no video of.
              </Note>
            ) : null}
            {/* THE CROSSING QUALIFIES THE CONTRIBUTION, so where there is no
                contribution it is said alone: "the contribution above counts
                only its September days" under "this update's contribution to
                it cannot be stated" is the block contradicting itself. */}
            {c.crossesInto ? (
              <Note mode={mode}>
                {c.contribution ? crossingLine(data.month, c.crossesInto) : crossedIntoLine(c.crossesInto)}
              </Note>
            ) : null}
            <Audiences block={c} mode={mode} month={data.month} />
          </>
        ) : null}
      </div>
    )
    const right = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-3'}>
        <Themes block={c} mode={mode} />
        <Quotes block={c} mode={mode} ctx={ctx} />
      </div>
    )

    return (
      <BlockFrame
        title={weekCameIn.title}
        question={weekCameIn.question}
        mode={mode}
        meta={days ?? 'this update covered no window'}
        footer={email
          ? <a href={`${ctx.appUrl}${c.playbookHref}`} style={{ color: EMAIL.ink }}>Open Market →</a>
          : <Link href={`${ctx.appUrl}${c.playbookHref}`} className="hover:underline">Open Market →</Link>}
        // THE MOCK'S RIGHT-HAND NOTE, which is the one sentence that says what
        // the window's comment count is a count OF.
        footerNote="videos with an analysed comment written in these days"
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {email ? <>{left}{right}</> : <TileColumns of={2}>{left}{right}</TileColumns>}
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

/**
 * The mock's audience table (`week.camein.col.audience` / `.col.share` /
 * `.col.videos` / `.col.comments`).
 *
 * FIVE COLUMNS, NOT THE MOCK'S FOUR, and the extra one is the distinction this
 * block exists to keep: ANALYSED and NEWLY FOUND are two sets and not a part
 * and a whole, so they get a column each rather than being collapsed into one
 * "Videos". The share bar is analysed over the UPDATE's own analysed total —
 * the one thing every row is genuinely a part of — with both sides printed
 * under it, because a bare percentage is the score this product does not show.
 *
 * AND THE CONTRIBUTION LINE STAYS, PER ROW, under the bar. Every count in this
 * table is of a window, and a window is not a period, whoever's conversation it
 * was. It costs no extra read.
 */
function Audiences({ block, mode, month }: { block: CameInBlock; mode: 'app' | 'print' | 'email'; month: string }) {
  const rows = block.rows
  const email = mode === 'email'
  const byAudience = audienceContributionLine(month, rows)
  if (email) {
    return (
      <div style={{ marginTop: 8 }}>
        {rows.map((r) => (
          <div key={r.audience} style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, padding: '3px 0' }}>
            {r.label} — <span data-copy="figure">{fmtInt(r.analysed)}</span> analysed · {fmtInt(r.gathered)} newly found · {platformMixLine(r.platformMix) || 'no platform recorded'}
            {r.trackedSince ? (
              <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>
                tracked since {shortDate(r.trackedSince)}, so its line is shorter than the rows above it
              </div>
            ) : null}
            {/* NO PER-ROW CONTRIBUTION HERE EITHER (design review F11): the
                block states it once, above, in every mode. A block renders
                three modes and they state the same reading. */}
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
        {byAudience ? (
          <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 }}>{byAudience}</div>
        ) : null}
      </div>
    )
  }
  const rowedComments = rows.every((r) => r.comments != null)
    ? rows.reduce((t, r) => t + (r.comments ?? 0), 0)
    : null
  // A COLUMN WHOSE EVERY CELL WOULD READ "NOT RECORDED" IS NOT DRAWN, and the
  // sentence under the table is what says so (review W1). `NotRecorded` was
  // `whitespace-nowrap` in a FIXED 64px track — a fixed track does not give,
  // so the words ran left out of their cell and printed over the Found column:
  // measured on the absent arm at 1440 (which is what BOTH tenants render
  // today, M3 being unapplied), the Found cell's right edge is x=750 and the
  // text's left edge x=748, so the page read "933not recorded", "138not
  // recorded", "27not recorded" and, on the total row, "1,098not recorded" —
  // the update's own video count as one unparseable token. Where the reading
  // is absent EVERYWHERE, the column carries nothing a reader can use and the
  // sentence below already states the absence in full. Where it is absent for
  // SOME rows only, the column stays (the total is a real number) and the two
  // words wrap inside their track instead of overflowing it.
  const anyComments = block.windowComments != null || rows.some((r) => r.comments != null)
  const TRACKS = anyComments
    ? 'xl:grid-cols-[112px_minmax(0,1fr)_58px_50px_64px]'
    : 'xl:grid-cols-[112px_minmax(0,1fr)_58px_50px]'
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={`hidden items-end gap-2.5 border-b border-border/70 pb-1 xl:grid ${TRACKS}`}>
        <Head>Audience</Head>
        <Head>Share of this update</Head>
        <Head right>Analysed</Head>
        <Head right>Found</Head>
        {anyComments ? <Head right>Comments</Head> : null}
      </div>
      {rows.map((r) => (
        <div key={r.audience} className={`grid grid-cols-1 items-start gap-1 xl:gap-2.5 ${TRACKS}`}>
          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: audienceColor(r.audience) }} aria-hidden />
            <span className="truncate" title={r.label}>{r.label}</span>
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-inner">
              <span
                className="block h-full rounded-full"
                style={{ width: `${r.share.n > 0 ? Math.max(1, (r.share.k / r.share.n) * 100) : 0}%`, background: audienceColor(r.audience) }}
              />
            </span>
            {r.share.n > 0 ? (
              // BOTH SIDES OF THE SHARE, NEVER A BARE PERCENTAGE, and the
              // denominator named is the update's own analysed total.
              <span data-copy="level" className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                {fmtInt(r.share.k)} of {fmtInt(r.share.n)} videos this update analysed
              </span>
            ) : null}
            {/* THE CONTRIBUTION IS THE BLOCK'S, NOT EVERY ROW'S (design review
                F11). It was printed under every bar, so a row was three lines
                instead of one, the bars stopped reading as a comparable column
                and the sentence wrapped mid-phrase ("144 of / 398") in a
                284px cell. The rule is that every window count this page states
                is restated as a contribution to its month — it is stated, in
                full, at the top of this column for the table's own total, and
                four more copies of it under four bars is four times what the
                rule asks for. The row's own level keeps both sides of its
                share, which is the number the bar draws. */}
            {/* THE MOCK'S "POLER SINCE 3 SEP", on the row it is about rather
                than in the total row. It is printed only where the rival's line
                starts inside the months this page compares — `first_seen_at`
                (M1) — because a rival tracked from before them has the same
                history as every row above it. */}
            {r.trackedSince ? (
              <span className="font-mono text-[10.5px] text-muted-foreground">
                tracked since {shortDate(r.trackedSince)} — a shorter line than the rows above it
              </span>
            ) : null}
          </span>
          <Cell label="Analysed"><FigureCell value={fmtInt(r.analysed)} align="right" mode={mode} /></Cell>
          <Cell label="Found"><FigureCell value={fmtInt(r.gathered)} align="right" mode={mode} /></Cell>
          {anyComments ? (
            <Cell label="Comments">
              {r.comments != null
                ? <FigureCell value={fmtInt(r.comments)} align="right" mode={mode} />
                : <NotRecorded />}
            </Cell>
          ) : null}
        </div>
      ))}
      {/* THE MOCK'S TOTAL ROW. It adds the two video columns, which do add —
          they are counts of this update's own videos, split by audience — and
          the comments column only where every row carries one, because a
          partial sum is not a sum. */}
      <div className={`grid grid-cols-1 items-center gap-1 border-t border-border/70 pt-1.5 xl:gap-2.5 ${TRACKS}`}>
        <span className="text-[12.5px] font-medium text-secondary-foreground">All audiences</span>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {block.window ? 'this update’s own videos, split by whose conversation they were' : ''}
        </span>
        <Cell label="Analysed"><FigureCell value={fmtInt(block.analysed)} align="right" mode={mode} /></Cell>
        <Cell label="Found"><FigureCell value={fmtInt(block.gathered)} align="right" mode={mode} /></Cell>
        {anyComments ? (
          <Cell label="Comments">
            {block.windowComments != null
              ? <FigureCell value={fmtInt(block.windowComments)} align="right" mode={mode} />
              : <NotRecorded />}
          </Cell>
        ) : null}
      </div>
      {rowedComments != null && block.windowComments != null && rowedComments < block.windowComments ? (
        <span className="font-mono text-[10.5px] text-muted-foreground">
          the rows above account for {fmtInt(rowedComments)} of them
        </span>
      ) : null}
      {/* EVERY ROW'S WINDOW, HANDED BACK TO ITS MONTH — once, for the table
          (design review F11). See `audienceContributionLine`. */}
      {byAudience ? <span className="text-[11px] text-muted-foreground">{byAudience}</span> : null}
      {/* ABSENT MEANS ABSENT, AND IT IS SAID IN WORDS ONCE. An em dash in the
          column would read as a zero; a zero here would be a measurement. The
          windowed reading is M3 and is installed on neither tenant today, which
          is the arm this sentence is written for. */}
      {block.windowComments == null ? (
        <span className="text-[11px] text-muted-foreground">
          Comments in these days are not recorded for this workspace yet.
        </span>
      ) : null}
    </div>
  )
}

/** The comments cell for a row whose count is absent while the table still
 *  has one. An em dash would read as a zero and a zero would be a measurement,
 *  so the words stay.
 *
 *  AND THEY WRAP (review W1). They were `whitespace-nowrap`, on the reasoning
 *  that "the column's own width is what gives" — but the column is a FIXED
 *  64px track and a fixed track gives nothing: the words ran out of their cell
 *  and printed over the Found column's digits. Two lines of 10.5px mono inside
 *  the track is the honest shape; it is why the table's leading edges are
 *  `items-start`. Where NO row has a count the column is not drawn at all and
 *  this never renders — see `anyComments`. */
function NotRecorded() {
  return <span className="font-mono text-[10.5px] leading-[1.3] text-muted-foreground xl:block xl:text-right">not recorded</span>
}

/** Colour follows the ENTITY, never the rank: you green, a rival orange, the
 *  category grey (MASTER §Visual identity, and `components/charts/ranked-bar`'s
 *  own rule). */
function audienceColor(audience: string): string {
  if (audience === 'client') return 'var(--you)'
  if (audience.startsWith('competitor:')) return 'var(--comp)'
  return 'var(--cat)'
}

function Head({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <span className={`text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground${right ? ' text-right' : ''}`}>
      {children}
    </span>
  )
}

/**
 * A numeric cell that carries its own column name where the header cannot
 * (design review F10).
 *
 * The header row is `hidden … xl:grid`, because below `xl` the page is ONE
 * stacked column and a five-column header has nothing to sit over. But the
 * cells carried no label either, so at 1024 an audience row ended in three
 * unlabelled stacked numbers — 360 / 429 / 3,600, with nothing saying which is
 * analysed, which found and which comments. That is every laptop under 1280,
 * not an edge case. The label prints below `xl` and disappears under it, where
 * the header takes over.
 */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5 xl:block xl:justify-self-end">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground xl:hidden">{label}</span>
      {children}
    </span>
  )
}

/**
 * "Heard for the first time" — the mock's chip row.
 *
 * THE FLOOR SENTENCE STAYS UNDER IT. A clustering is re-made over the whole
 * corpus every update and labels churn about 88% run to run, so production
 * writes 303 first-seen themes on Össur and 592 on Sealand in ONE update;
 * `newThemesLine` says how many were heard and why only the ones carrying ten
 * videos this month are named. The mock has no room for that sentence, which is
 * exactly why a port must keep it.
 */
function Themes({ block, mode }: { block: CameInBlock; mode: 'app' | 'print' | 'email' }) {
  const email = mode === 'email'
  if (email) {
    return (
      <div style={{ marginTop: 10 }}>
        <Heading mode={mode}>Heard for the first time</Heading>
        <Note mode={mode}>{newThemesLine(block.newThemesSeen, block.newThemes.length)}</Note>
        {block.newThemes.map((t) => (
          <p key={t.id} style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, padding: '2px 0' }}>
            {/* MARKED IN THIS ARM TOO (code review C10). The app arm marks the
                same string `stored` / `pass_b_theme`; here it was bare, so a
                label carrying a direction word would have passed on screen and
                failed the contract in the inbox — a confusing way to find out
                which arm is stricter. */}
            <span data-copy="stored" data-slot="pass_b_theme">{t.label}</span> — <span data-copy="figure">{fmtInt(t.videos)}</span> videos this month
          </p>
        ))}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[4px] bg-inner px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Heading mode={mode}>
          {block.newThemes.length > 0 ? `${fmtInt(block.newThemes.length)} heard for the first time` : 'Heard for the first time'}
        </Heading>
        {block.newThemes.map((t) => (
          <span key={t.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-tile px-2.5 py-0.5 text-[12px] font-medium text-secondary-foreground ring-1 ring-border">
            {/* The theme's LABEL is a model's words (`pass_b_theme`, policy
                'none'), so it is marked as stored prose and names the call. */}
            <span data-copy="stored" data-slot="pass_b_theme" className="truncate">{t.label}</span>
            <span data-copy="figure" className="font-mono font-semibold tabular-nums">{fmtInt(t.videos)}</span>
          </span>
        ))}
      </div>
      <Note mode={mode}>{newThemesLine(block.newThemesSeen, block.newThemes.length)}</Note>
    </div>
  )
}

/**
 * "New on your subjects" — the mock's two-up quote grid.
 *
 * THE COUNT LEADS AND SAYS WHAT IT COUNTS. "41 comments on your subjects were
 * written in these days" is a count of comments, not of videos, and the four
 * below it are named as four of that number rather than as a sample of
 * something unstated.
 */
function Quotes({ block, mode, ctx }: { block: CameInBlock; mode: 'app' | 'print' | 'email'; ctx: BlockContext }) {
  const email = mode === 'email'
  if (block.quotesUnread) {
    return (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'} style={email ? { marginTop: 10 } : undefined}>
        <Heading mode={mode}>New on your subjects</Heading>
        <Note mode={mode}>{block.quotesUnread}</Note>
      </div>
    )
  }
  if (block.quotes.length === 0) return null
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'} style={email ? { marginTop: 10 } : undefined}>
      <div className={email ? undefined : 'flex items-baseline justify-between gap-3'}>
        <Heading mode={mode}>New on your subjects</Heading>
        {!email && block.quotesTotal != null ? (
          <Link href={`${ctx.appUrl}/dashboard/subjects`} className="flex-none text-[12px] font-medium hover:underline">
            See all {fmtInt(block.quotesTotal)} new quotes →
          </Link>
        ) : null}
      </div>
      {block.quotesTotal != null ? (
        <Note mode={mode}>
          <span data-copy="figure">{fmtInt(block.quotesTotal)}</span> comments on your subjects were written in these days; {block.quotes.length === 1 ? 'one is' : `${block.quotes.length} are`} below in full.
        </Note>
      ) : null}
      <div className={email ? undefined : 'grid grid-cols-1 gap-x-5 gap-y-3 xl:grid-cols-2'}>
        {block.quotes.map((q, i) => (
          <div key={i} className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
            {!email ? (
              <span className="inline-flex w-fit items-center rounded-full bg-inner px-2 py-px text-[10.5px] font-semibold text-muted-foreground">{q.subject}</span>
            ) : null}
            <BlockQuote quote={q.quote} cite={email ? `${q.subject} · ${q.cite}` : q.cite} mode={mode} />
          </div>
        ))}
      </div>
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
