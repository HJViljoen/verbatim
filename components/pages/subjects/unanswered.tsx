
import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import { UNANSWERED_CLAIMS_UNREADABLE, UNANSWERED_CLAIMS_UNREADABLE_OUTSIDE, periodPhrase, unansweredMeta, type SubjectsData, type UnansweredBlock, type UnansweredRow } from '@/lib/pages/subjects'

// SU3 · Questions on this subject your content never answers (design §3 SU3,
// the mock's (d)).
//
// COUNTS, AND NO SHARE OF THE MONTH. The k is taken from the current analysis —
// which videos carry a question insight on this subject — and every month
// denominator on this page is comment-dated. Those two are not two ends of one
// fraction, so the block prints the count, says what it counted in, and draws
// no band and no change.
//
// WHAT THE ROW *CAN* BE A SHARE OF (wave 2, D10). The mock writes "130 of
// 1,388", where 1,388 is the CATEGORY's comment-dated video count — the mixing
// above, and mock-gap's deviation 2. But there is a denominator on the same
// clock as the numerator and counted by the same read: the videos that asked
// anything at all about this subject in this period, which is the gate's own
// number and was already loaded and printed on the meta line. "130 of 214
// videos that asked about this subject" is one fraction with both ends on one
// clock, and it is the mock's layout with a denominator the data can support.
//
// AND NO DIRECTION WORD AND NO BADGE (D5). The mock's "▲ 2.6 pts · growing, 3rd
// month" is a change over months this block does not have: the rows are not a
// monthly series, they are one read over the drawn window. The row states its
// level; nothing states a movement it never measured.
//
// THE GATE IS THE DESIGN'S. Under ten question videos on the subject and the
// block says how many there were rather than ranking three of them; three rows
// off a handful of videos is a ranking of noise with a heading that looks like
// a finding.

function Row({ row, of, mode }: { row: UnansweredRow; of: number; mode: RenderMode }) {
  const email = mode === 'email'
  return (
    <div
      className={email ? undefined : 'flex items-baseline justify-between gap-3 border-t border-border/70 py-1.5 text-[12.5px]'}
      style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}
    >
      <span className={email ? undefined : 'min-w-0 flex-1 font-medium'}>{row.label}</span>
      <FigureCell value={fmtInt(row.videos)} of={`of ${fmtInt(of)} videos`} align="right" mode={mode} />
    </div>
  )
}

/** The population the rows are a share of: the videos that asked anything about
 *  this subject in the drawn window. Falls back to the largest row where the
 *  gate's own number is somehow smaller — a fraction over one is never shown. */
function askedOf(u: UnansweredBlock): number {
  return Math.max(u.questionVideos, ...u.rows.map((r) => r.videos), 0)
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
    // THE PERIOD, WHERE THE MOCK PUTS THE MONTH. The mock stamps this tile
    // "Sep"; this block follows the HORIZON control, not the month heading, and
    // a month stamped on a twelve-month read is the mis-dating `unansweredLead`
    // was already fixed for once.
    const period = periodPhrase(data.horizon, data.month)

    return (
      <BlockFrame
        title={subjectsUnanswered.title}
        question={subjectsUnanswered.question}
        mode={mode}
        // THE PERIOD IN THE APP, WHERE THE MOCK PUTS "Sep"; the full sentence
        // on paper and in an email, which have the width and no rail beside
        // them to state the gate's number in.
        meta={mode === 'app' ? `${period[0].toUpperCase()}${period.slice(1)}` : unansweredMeta(u.questionVideos, u.yourPosts)}
        footer={footer}
        // ONE LINE, CLIPPED RATHER THAN WRAPPED. This tile is the narrow half of
        // the mock's 1.35:1 pair and its footer note is long; without it "Open
        // the content brief →" sets one word per line.
        truncateFooter
        // The mock's "9 posts". The gate's own 214 is not dropped — it is the
        // denominator under every row, which is where a reader needs it.
        // `figure`, NOT `level`: a count of your own posts is not a share of
        // anything — that is the whole basis this block states — so there is
        // no "of N" to print and rule (b) would be asking for one that does
        // not exist.
        footerNote={<span data-copy="figure">{fmtInt(u.yourPosts)} posts of yours</span>}
      >
        {u.lead ? (
          <p
            data-copy="figure"
            className={email ? undefined : 'm-0 text-[12px] leading-[1.4] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}
          >
            {u.lead}
          </p>
        ) : null}
        <div>{u.rows.map((r) => <Row key={r.id} row={r} of={askedOf(u)} mode={mode} />)}</div>
        {small(u.basis)}
        {u.claims ? small(u.claims === UNANSWERED_CLAIMS_UNREADABLE && mode === 'print' ? UNANSWERED_CLAIMS_UNREADABLE_OUTSIDE : u.claims) : null}
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
