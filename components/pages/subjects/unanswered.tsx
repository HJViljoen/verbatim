
import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import { HORIZON_LABEL } from '@/lib/reading/horizon'
import { unansweredMeta, type SubjectsData, type UnansweredBlock, type UnansweredRow } from '@/lib/pages/subjects'

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
    return (
      <BlockFrame
        title={subjectsUnanswered.title}
        question={subjectsUnanswered.question}
        mode={mode}
        // THE PERIOD, WHERE THE MOCK PUTS THE MONTH. The mock stamps this
        // tile "Sep"; this block follows the HORIZON control, not the month
        // heading, and a month stamped on a twelve-month read is the
        // mis-dating `unansweredLead` was already fixed for once. The full
        // sentence goes on paper and in an email, which have the width and no
        // rail beside them to state the gate's number in.
        //
        // AND IT IS THE CONTROL'S OWN WORDS, NOT A CAPITALISED FRAGMENT OF THE
        // BASIS SENTENCE (fix pass). "In the last 12 months" is `periodPhrase`
        // mid-sentence with a capital bolted on; at 21 characters it did not
        // fit beside this block's long title in the 354px header of the narrow
        // half of the mock's 1.35:1 pair, so the TITLE wrapped and left
        // "ANSWER" alone on a second line with the tile's header 18px below
        // its neighbour's. `HORIZON_LABEL` is what the four pills at the top
        // of the page are labelled with — "Last 12 months" — so the tile is
        // stamped with the period in the same words the reader chose it in,
        // and it is seven characters shorter. `periodPhrase` still writes the
        // lead sentence, where a fragment is what a sentence needs.
        meta={mode === 'app' ? HORIZON_LABEL[data.horizon] : unansweredMeta(u.questionVideos, u.yourPosts)}
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
          // THE MODEL'S VALUE IS MARKED, NOT THE ROW IT SITS IN. The whole
          // sentence carried `data-copy="figure"`, which declared a Pass B
          // theme label to be one of code's figures. The label is a `subject`
          // node naming its own slot, the count is a `figure`, and the sentence
          // around them is code's and unmarked — where rule (c) still sweeps
          // it, which is what "unmarked is not exempt" is for.
          <p
            className={email ? undefined : 'm-0 text-[12px] leading-[1.4] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}
          >
            Questions grouped as “<span data-copy="subject" data-slot="pass_b_theme">{u.lead.label}</span>” came up in{' '}
            <span data-copy="figure">{fmtInt(u.lead.videos)}</span> of the videos we have read: {u.lead.posts}.
          </p>
        ) : null}
        <div>{u.rows.map((r) => <Row key={r.id} row={r} of={askedOf(u)} mode={mode} />)}</div>
        {/* ONE PARAGRAPH OF BASIS, NOT THREE. The artboard's tile is a lead and
            three rows; this one was a lead, two rows and three more paragraphs.
            What it read as is a tile arguing with itself. The two sentences
            that are both about WHERE the count came from are one paragraph; the
            claims caveat, which is about a half we could not read at all, keeps
            its own. */}
        {/* The Reddit cap is said once, in Settings › How to read (ruling H). */}
        {small(u.basis)}
        {u.claims ? small(u.claims) : null}
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
