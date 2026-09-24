import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { type ReplyRow, type WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'

// WK §8 · Flagged for awareness (the mock's §8), moved here from the Content
// page's reply drawer in Block D wave 2.
//
// AWARENESS, NEVER A PROMPT. These are claims about the space that do not hold
// up, and the rule they are drawn under — `buildReplies` never calls
// `engageDeepLink` for them — is that a reply under someone else's post is an
// argument in public, not an answer. The absence of a reply link is therefore
// structural: there is no `href` on the row to render, rather than a renderer
// choosing not to draw one.
//
// "PERSISTED 2 WEEKS" IS NOT PRINTED (D14). The mock's amber badge is a claim
// that one comment thread has been saying this for two updates, which is a
// two-reading movement claim about a single comment, with no band and no n —
// and nothing in this product records when a flagged claim was first heard.
// `grep -rn "persisted" app lib components` still finds nothing.
//
// AND THE MOCK'S "1 of 312 videos this week" IS NOT THE META (D10/D8). One
// COMMENT over a count of VIDEOS is two units on one line. The meta says how
// many were flagged and that none of them carries a reply link, which is what
// a reader needs to know before reading the words.

export const weekFlagged: Block<WeekData> = {
  key: 'week.flagged',
  title: 'Flagged for awareness',
  question: 'What is being said about this space that does not hold up?',

  render(data, mode = 'app') {
    const flagged = data.replies.flagged
    const empty = weekFlagged.emptyState(data)

    return (
      <BlockFrame
        title={weekFlagged.title}
        question={weekFlagged.question}
        mode={mode}
        meta={flagged.length > 0 ? `${fmtInt(flagged.length)} ${flagged.length === 1 ? 'claim' : 'claims'} · no reply link` : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {flagged.map((row) => <Row key={row.id} row={row} mode={mode} />)}
      </BlockFrame>
    )
  },

  figures(): FigureTable {
    // NO FIGURE TABLE. The only number here is how many claims were flagged,
    // and it is stated in the meta as a count of the rows printed under it —
    // declaring it would spend a page's budget on a number that is the length
    // of a list a reader can see.
    return {}
  },

  quotes(data) {
    return data.replies.flagged.map((r) => r.quote.ref)
  },

  emptyState(data) {
    if (data.replies.unread) return data.replies.unread
    if (data.replies.flagged.length > 0) return null
    return 'Nothing in the days this update covered was flagged as a claim about this space that does not hold up.'
  },
}

function Row({ row, mode }: { row: ReplyRow; mode: 'app' | 'print' | 'email' }) {
  const cite = (
    <>
      {platformLabel(row.platform)}
      {row.date ? ` · ${shortDate(row.date)}` : ''}
    </>
  )
  if (mode === 'email') {
    return (
      <div style={{ marginTop: 6 }}>
        <BlockQuote quote={row.quote} cite={cite} mode={mode} />
        <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 3 }}>
          Why it surfaced: <span data-copy="stored" data-slot="pass_a_audience_insight">{row.reason}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1 xl:flex-row xl:items-center xl:gap-5">
      <span className="min-w-0 flex-1">
        <BlockQuote quote={row.quote} cite={cite} mode={mode} />
      </span>
      <span className="shrink-0 text-[11.5px] text-muted-foreground">
        <span data-copy="stored" data-slot="pass_a_audience_insight">{row.reason}</span>
      </span>
    </div>
  )
}
