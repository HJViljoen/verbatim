
import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import { unansweredMeta, type SubjectsData, type UnansweredRow } from '@/lib/pages/subjects'

// SU3 · Questions on this subject your content never answers (design §3 SU3,
// the mock's (d)).
//
// COUNTS, AND NO SHARE. The k is taken from the current analysis — which videos
// carry a question insight on this subject — and every other n on this page is
// comment-dated. Those two are not two ends of one fraction, so the block
// prints the count, says what it counted in, and draws no band and no change.
// The design's example sentence carries a percentage; the smallest correct
// alternative is the sentence without one.
//
// THE GATE IS THE DESIGN'S. Under ten question videos on the subject and the
// block says how many there were rather than ranking three of them; three rows
// off a handful of videos is a ranking of noise with a heading that looks like
// a finding.

function Row({ row, mode }: { row: UnansweredRow; mode: RenderMode }) {
  const email = mode === 'email'
  return (
    <div
      className={email ? undefined : 'flex items-baseline justify-between gap-3 border-t border-border/70 py-1.5 text-[12.5px]'}
      style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}
    >
      <span className={email ? undefined : 'min-w-0 flex-1'}>{row.label}</span>
      <span data-copy="figure" className={email ? undefined : 'shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 12, color: EMAIL.muted } : undefined}>
        {fmtInt(row.videos)} videos
      </span>
    </div>
  )
}

export const subjectsUnanswered: Block<SubjectsData> = {
  key: 'subjects.unanswered',
  title: 'Questions your posts did not answer',
  question: 'What is the category asking that we have never addressed?',

  render(data, mode = 'app', ctx) {
    const u = data.selected?.unanswered ?? null
    const empty = subjectsUnanswered.emptyState(data)
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/reports`
    const footer = email
      ? null
      : openLink(mode, href, 'Open the content brief →')

    if (!u || empty) {
      return (
        <BlockFrame title={subjectsUnanswered.title} question={subjectsUnanswered.question} mode={mode} footer={footer}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    const small = (text: string) => (
      <p
        className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, paddingTop: 6 } : undefined}
      >
        {text}
      </p>
    )

    return (
      <BlockFrame
        title={subjectsUnanswered.title}
        question={subjectsUnanswered.question}
        mode={mode}
        meta={unansweredMeta(u.questionVideos, u.yourPosts)}
        footer={footer}
      >
        {u.lead ? (
          <p
            className={email ? undefined : 'm-0 text-[13px] leading-[1.45] text-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink } : undefined}
          >
            {u.lead}
          </p>
        ) : null}
        <div>{u.rows.map((r) => <Row key={r.id} row={r} mode={mode} />)}</div>
        {small(u.basis)}
        {u.claims ? small(u.claims) : null}
        {u.reddit ? small(u.reddit) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const u = data.selected?.unanswered
    if (!u || u.rows.length === 0) return {}
    const out: FigureTable = {}
    for (const r of u.rows) {
      out[`unanswered_${r.id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_videos`] = {
        value: r.videos,
        unit: 'videos',
        label: `videos asking “${r.label}”`,
      }
    }
    return out
  },

  emptyState(data) {
    if (data.list.notRecorded) return data.list.notRecorded
    const pane = data.selected
    if (!pane) {
      return data.list.proposed.length > 0
        ? 'Confirm a subject and this is where the questions you have not answered are listed.'
        : 'Name a subject and this is where the questions you have not answered are listed.'
    }
    const u = pane.unanswered
    if (u.refusal) return u.refusal
    if (u.rows.length === 0) return 'Your posts touch every question the category asks on this subject.'
    return null
  },
}
