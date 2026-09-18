import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockProportion } from '@/components/blocks/bars'
import { BlockQuote } from '@/components/blocks/quote'
import { BlockStat } from '@/components/blocks/stat'
import { PlatformIcon } from '@/components/charts/platform-icon'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { INTENT_PLURAL, INTENT_LABEL, type Intent } from '@/lib/content-tiles'
import { REPLIES_SHOWN, windowDays, type ReplyRow, type WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'

// WK §2 · Worth a reply (the mock's §2), moved here from the Content page in
// Block D wave 2.
//
// THE ONE SECTION OF THIS PAGE THAT IS A WORK QUEUE. Everything else here is a
// reading — a level, a band, a contribution to a month. These are four comments
// somebody can answer today, and the design has always said they belong on the
// page a content person opens on a Monday rather than on the page that is about
// to retire. The reading is `buildReplies` (lib/pages/week.ts); Content keeps
// its own copy of the same pick until it goes.
//
// A DATE, NOT AN AGE (D6/D9). Content prints "3d", which is measured from the
// clock at page load and moves while the reader reads. Every other figure on
// this page is dated by the days the update covered, so a row here carries the
// day the comment was written, in the same short form the quotes below it use.
//
// THE COUNT IS A CAP AND THE META SAYS SO (D10). The mock's header reads "12 of
// 312 videos this week", which is a level over a denominator these rows are not
// a share of: twelve COMMENTS picked out of a digest that takes at most three
// per category and twelve in all, against a count of VIDEOS. The two cannot be
// divided. What is printed instead is the pick and the rule that made it.
//
// AND THE MEMORY LINE IS NOT PRINTED (D14). "8 answered last week · 4 ignored"
// has no field behind it — nothing in this product records whether a surfaced
// comment was answered — and a footer that invents a reply history is the
// clearest possible case of copy claiming behaviour the code does not have.

/** The mock's chip colours, by intent — written out, never interpolated. */
const CHIP: Record<Intent, string> = {
  buying: 'bg-accent text-accent-foreground',
  question: 'bg-inner text-muted-foreground',
  objection: 'bg-negative/12 text-negative',
  misinformation: 'bg-foreground/10 text-foreground',
}

/** The same four, as the proportion bar's segment colours. */
const SEGMENT: Record<Intent, string> = {
  buying: 'var(--you)',
  question: 'var(--neutral-seg)',
  objection: 'var(--negative)',
  misinformation: 'var(--cat)',
}

export const weekReply: Block<WeekData> = {
  key: 'week.reply',
  title: 'Worth a reply',
  question: 'Which comments from these days can somebody answer today?',

  render(data, mode = 'app', ctx) {
    const r = data.replies
    const email = mode === 'email'
    const empty = weekReply.emptyState(data)
    const days = windowDays(r.window)
    // THE CONSTANT, NOT A 4 (code review C9). `REPLIES_SHOWN` is exported from
    // the loader with the reasoning for its value beside it and was read by
    // nothing, while this line hard-coded the same number — two places to
    // change, one of them documented and neither of them load-bearing.
    const shown = r.rows.slice(0, REPLIES_SHOWN)
    const more = r.rows.length - shown.length
    const href = `${ctx.appUrl}/dashboard/videos?detail=replies`

    return (
      <BlockFrame
        title={weekReply.title}
        question={weekReply.question}
        mode={mode}
        meta={r.rows.length > 0 ? `${fmtInt(r.total)} picked, at most three of a kind` : undefined}
        footer={r.rows.length > 0
          ? (email
            ? <a href={href} style={{ color: EMAIL.ink }}>{more > 0 ? `${fmtInt(more)} more →` : `All ${fmtInt(r.total)} in one list →`}</a>
            : <Link href={href} className="hover:underline">{more > 0 ? `${fmtInt(more)} more →` : `All ${fmtInt(r.total)} in one list →`}</Link>)
          : undefined}
        // THE BASIS, NOT A MEMORY. The days these comments were written in is
        // the one fact the footer can state about them, and it is the fact that
        // makes the queue checkable against §4's comment count.
        footerNote={r.rows.length > 0 ? (days ? `written ${days}` : undefined) : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}

        {r.rows.length > 0 ? (
          <>
            <Lead counts={r.counts} total={r.total} mode={mode} />
            <div className={email ? undefined : 'flex min-w-0 flex-col'}>
              {shown.map((row) => <Row key={row.id} row={row} mode={mode} />)}
            </div>
          </>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const r = data.replies
    if (r.rows.length === 0) return {}
    return {
      reply_picked: { value: r.total, unit: 'comments', label: 'comments picked as worth a reply' },
    }
  },

  quotes(data) {
    return data.replies.rows.map((r) => r.quote.ref)
  },

  emptyState(data) {
    const r = data.replies
    if (r.unread) return r.unread
    if (r.rows.length > 0) return null
    return 'Nothing in the days this update covered reads as a question, an objection or somebody ready to buy — so there is nothing here to answer.'
  },
}

/**
 * The mock's lead row: the count, the kinds and the bar across them.
 *
 * THE BAR IS A REAL PARTITION, which is why it is allowed here and refused on
 * the kind mixes elsewhere (D4). A comment has exactly one intent — `intentOf`
 * maps one insight category to one of four — so these segments divide the
 * picked set and nothing else, and the legend says what they are a division of.
 */
function Lead({ counts, total, mode }: { counts: readonly { intent: Intent; count: number }[]; total: number; mode: 'app' | 'print' | 'email' }) {
  // THE LOADER'S OWN COUNTS (code review C9). This rebuilt its own Map from
  // `rows` and took Map insertion order while `RepliesBlock.counts` — built by
  // `intentCounts`, ordered by `INTENT_ORDER`, and pinned by a test — was
  // rendered by nothing. Two implementations of one thing, agreeing by
  // accident.
  const segments = counts.map(({ intent, count }) => ({
    label: INTENT_PLURAL[intent],
    count,
    pct: Math.round((count / Math.max(1, total)) * 100),
    color: SEGMENT[intent],
  }))
  return (
    <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-2'}>
      <BlockStat
        mode={mode}
        value={fmtInt(total)}
        unit="worth a reply"
        base="picked from the comments written in the days this update covered"
      />
      {/* THE ARTBOARD'S COUNTED CHIPS, NOT A PERCENTAGE OF SIX (design review
          F14). "Buying signals 50% · Questions 33% · Objections 17%" over a
          pick of six is noise, and it is the one figure on a page that works
          this hard to keep every "of N" that reads as a score. The bar is the
          same bar: a comment has exactly one intent, so these segments divide
          the picked set and nothing else. */}
      <BlockProportion segments={segments} of="comments" mode={mode} legend="count" />
    </div>
  )
}

/** One row — the mock's four columns: the kind, the comment, why it surfaced,
 *  and where a reply lands. */
function Row({ row, mode }: { row: ReplyRow; mode: 'app' | 'print' | 'email' }) {
  const email = mode === 'email'
  const cite = (
    <>
      {platformLabel(row.platform)}
      {row.date ? ` · ${shortDate(row.date)}` : ''} · {row.context}
    </>
  )

  if (email) {
    return (
      <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '8px 0' }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          {INTENT_LABEL[row.intent]}
        </div>
        <BlockQuote quote={row.quote} cite={cite} mode={mode} />
        <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 3 }}>
          Why it surfaced: <span data-copy="stored" data-slot="pass_a_audience_insight">{row.reason}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 items-center gap-2 border-t border-border/70 py-2 xl:grid-cols-[124px_minmax(0,1fr)_150px_74px] xl:gap-4">
      <span className={`inline-flex h-[20px] w-fit shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap ${CHIP[row.intent]}`}>
        {INTENT_LABEL[row.intent]}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <BlockQuote quote={row.quote} mode={mode} />
        <span className="flex min-w-0 items-center gap-1.5 pl-3.5 font-mono text-[11px] text-muted-foreground">
          <PlatformIcon platform={row.platform} className="shrink-0" />
          <span className="truncate">{cite}</span>
        </span>
      </span>
      {/* WHY IT SURFACED, ON THE ROW AND NOT BEHIND A LINK. The words are the
          insight's own theme — a model's, written at Pass A and read back here,
          so it is `stored` and names the call that wrote it. */}
      <span className="min-w-0 truncate text-[11.5px] text-muted-foreground" title={row.reason}>
        <span data-copy="stored" data-slot="pass_a_audience_insight">{row.reason}</span>
      </span>
      {/* A REPLY LINK ONLY WHERE A REPLY CAN LAND. The row keeps its column
          either way, so the table does not reflow around a missing link. */}
      {mode === 'app' && row.href ? (
        <a
          href={row.href}
          target="_blank"
          rel="noopener noreferrer"
          className="justify-self-start text-[12px] font-medium text-foreground hover:underline xl:justify-self-end"
        >
          Reply →
        </a>
      ) : <span />}
    </div>
  )
}
