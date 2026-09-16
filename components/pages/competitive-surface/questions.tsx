import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { fmtInt, platformLabel } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import { mixLine, type CompetitiveSurfaceData, type QuestionRow } from '@/lib/pages/competitive-surface'

// CO5 · What the category asks under their content (design §3 CO5).
//
// THE COMPETITIVE READ THAT NEEDS NO HANDLE CONFIGURED, and on this data the
// best block on the surface: 33 of Ottobock's videos carried a question over
// the last three months, 18 of Cotopaxi's, and every one of those questions has
// at least one quote behind it.
//
// LISTED AS ASKED, NOT GROUPED. `audience_insights.theme` is a raw per-insight
// slug and it fragments — `bag_features`, `bag_features_and_design`,
// `product_features` and `product_details` are four slugs for one question — so
// grouping on it prints a list of ones wearing the clothes of a ranking
// (Ottobock's top question theme over six months is `location_inquiry`, n = 3).
// The block says why it is not grouped rather than grouping badly.
//
// THE SUBREDDITS ARE LISTED WITH IT, which is the design's own platform note: a
// question asked in a community is a different artefact from a question typed
// under a video, and on Sealand 9 of Cotopaxi's 22 question-videos are Reddit
// threads — 41% of the block, not a footnote.
//
// A QUESTION IS DATED BY THE COMMENT BEHIND IT. See the loader's header: an
// insight's `created_at` is a run's clock, and this product dates a period by
// the comment.
//
// THE QUESTION'S WORDS ARE `stored`, NAMING `pass_a_audience_insight`. They are
// Pass A's, and this block is what made the product notice that Pass A was
// never in the prose-policy table at all (lib/prose/scrub.ts) — so these words
// have been adjudicated by NOTHING, and the marker says so rather than
// pretending a render-time regex is the adjudication. On this data the
// difference is every question naming a model number: "3r85 or 3r80",
// "Cotopaxi Allpa 32L", "Gregory Terros 28".

function Question({ row, mode }: { row: QuestionRow; mode: RenderMode }) {
  const email = mode === 'email'
  const cite = row.platform ? platformLabel(row.platform) : null

  if (email) {
    return (
      <div style={{ padding: '6px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div data-copy="stored" data-slot="pass_a_audience_insight" style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink }}>{row.text}</div>
        {cite ? <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{cite}</div> : null}
        {row.quotes.map((q) => <BlockQuote key={q.ref} quote={q} mode={mode} />)}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-border/70 pt-2">
      <p data-copy="stored" data-slot="pass_a_audience_insight" className="m-0 text-[12.5px]">{row.text}</p>
      {cite ? <span className="text-[11px] text-muted-foreground">{cite}</span> : null}
      {row.quotes.map((q) => <BlockQuote key={q.ref} quote={q} mode={mode} />)}
    </div>
  )
}

export const competitiveQuestions: Block<CompetitiveSurfaceData> = {
  key: 'competitive.questions',
  title: 'What the category asks under their content',
  question: 'What do people want to know when they meet this rival?',

  render(data, mode = 'app') {
    const q = data.questions
    const email = mode === 'email'
    const empty = competitiveQuestions.emptyState(data)
    const more = q.insights - q.rows.length

    return (
      <BlockFrame
        title={competitiveQuestions.title}
        question={competitiveQuestions.question}
        mode={mode}
        meta={q.rival ?? undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {q.videos > 0 ? (
          <p
            className={email ? undefined : 'm-0 text-[12px]'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink } : undefined}
          >
            <span data-copy="figure">{fmtInt(q.insights)}</span> {q.insights === 1 ? 'question' : 'questions'} under{' '}
            <span data-copy="figure">{fmtInt(q.videos)}</span> of {q.rival}’s videos, with{' '}
            <span data-copy="figure">{fmtInt(q.quotes)}</span> {q.quotes === 1 ? 'comment' : 'comments'} behind them
            {Object.keys(q.platformMix).length > 0 ? <> · {mixLine(q.platformMix)}</> : null}.
          </p>
        ) : null}

        <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
          {q.rows.map((row) => <Question key={row.id} row={row} mode={mode} />)}
        </div>

        {more > 0 ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}
          >
            <span data-copy="figure">{fmtInt(more)}</span> more were asked in this window.
          </p>
        ) : null}

        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}
        >
          {q.groupingNote}
        </p>
        {q.subjectsNote ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            {q.subjectsNote}
          </p>
        ) : null}
        {q.subreddits.length > 0 ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            A question asked in a community is a different thing from a question typed under a video. The communities watched for you: {q.subreddits.map((s) => `r/${s}`).join(' · ')}.
          </p>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const q = data.questions
    if (q.videos === 0) return {}
    return {
      question_videos: { value: q.videos, unit: 'videos', label: `${q.rival ?? 'the rival'}’s videos carrying a question in this window` },
      // The unit vocabulary is closed (lib/reading/verdicts.ts) and a question
      // is counted in comments, which is what an insight of this kind is drawn
      // from — one question insight per cluster of comments asking it.
      question_insights: { value: q.insights, unit: 'comments', label: 'questions asked under them' },
    }
  },

  quotes(data) {
    return data.questions.rows.flatMap((r) => r.quotes.map((q) => q.ref))
  },

  emptyState(data) {
    return data.questions.empty
  },
}
