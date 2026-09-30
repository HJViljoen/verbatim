
import Link from 'next/link'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import { HORIZON_LABEL } from '@/lib/reading/horizon'
import { allRedescribed, periodPhrase, QUESTIONS_PARAM, selectedNotReady, SUBJECTS_ALL_REDESCRIBED, UNANSWERED_GATE, unansweredMeta, type SubjectsData, type UnansweredBlock, type UnansweredRow } from '@/lib/pages/subjects'
import { RULE, SCALE } from '@/components/pages/overview/market'
import { UNCHECKED_TAIL } from '@/components/pages/market-surface/questions'

/** The other subjects' list's head: which subjects people asked about most,
 *  not this subject's questions (finish-list item 9). */
export const ASKED_MOST_HEAD = 'Subjects asked about most, last 3 months'

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
    // A SUBJECT THAT IS NOT READY DRAWS NOTHING HERE, WHOEVER RENDERS THE
    // BLOCK (T0a, ruling U6; review finding 3): the page leaves it out, and so
    // does an export or a stored section (`selectedNotReady`).
    if (selectedNotReady(data)) return null
    // QUESTIONS PEOPLE ASK ON IT (WP2.2): a pane the loader builds; one stored
    // before WP2.2 prints its Phase 1 gap list, as sent (below).
    if (data.list.base !== undefined && (!data.selected || data.selected.monthStates !== undefined)) {
      return <QuestionsOnIt data={data} mode={mode} appUrl={ctx.appUrl} />
    }
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
        // its neighbour's. `HORIZON_LABEL` is the period's own name — "Last
        // 12 months", the words a link that asks for a period (`?questions=`)
        // opens the pane on — and it is seven characters shorter.
        // `periodPhrase` still writes the lead sentence, where a fragment is
        // what a sentence needs.
        meta={mode === 'app' ? HORIZON_LABEL[data.questionsHorizon ?? data.horizon] : unansweredMeta(u.questionVideos, u.yourPosts)}
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
    // Nothing declared for a subject that is not ready: nothing prints.
    if (!u || u.rows.length === 0 || selectedNotReady(data)) return {}
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
      if (allRedescribed(data)) return SUBJECTS_ALL_REDESCRIBED
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

// ---- WP2.2 · questions people ask on it ------------------------------------------

export const QUESTIONS_TITLE = 'Questions people ask on it'

/**
 * The count line every subject prints (decision B: a count inside a drawn
 * block, never a hidden card; §2.3 S4): "16 videos asked about Waterproofing
 * in the last 3 months." Counted over the period the reader chose, each video
 * placed by the day it was posted (How to read says so, not a note here).
 */
export function questionsCountLine(u: Pick<UnansweredBlock, 'questionVideos'>, name: string, period: string): { k: number; words: string } {
  const k = u.questionVideos
  return k === 0
    ? { k, words: `No video asked about ${name} ${period}.` }
    : { k, words: `${k === 1 ? 'video' : 'videos'} asked about ${name} ${period}.` }
}

/** The line under the list: which of your posts shared two or more of a
 *  question's words (`answeredBy`), or that none did. */
export function questionsPostsLine(u: Pick<UnansweredBlock, 'rows' | 'yourPosts'>, period: string): string {
  const touched = u.rows.filter((r) => r.answered).length
  if (u.yourPosts === 0) return `You published nothing ${period}.`
  const posts = `${fmtInt(u.yourPosts)} post${u.yourPosts === 1 ? '' : 's'}`
  if (touched === 0) return `None of your ${posts} shared two or more of its words.`
  return `Your posts shared two or more words with ${fmtInt(touched)} of these questions.`
}

/**
 * THE APP'S LINE UNDER THE LIST (sw-2 item 2): whether your posts in the
 * period touched the subject, counted as Your moves and Your market count it
 * (`questionTouch`: two or more words shared with one of the questions shown,
 * or the post-and-claim judge filed the post as about the subject), in their
 * words, "touched on it". The email keeps `questionsPostsLine`, as sent.
 * Without a touch (a stored pane) it is that line too.
 */
export function questionsTouchLine(u: Pick<UnansweredBlock, 'rows' | 'yourPosts' | 'touch'>, period: string): string {
  const t = u.touch
  if (!t || t.state === 'unread' || t.posts == null) return questionsPostsLine(u, period)
  if (t.posts === 0) return `You published nothing ${period}.`
  const posts = `${fmtInt(t.posts)} post${t.posts === 1 ? '' : 's'} ${period}`
  const k = t.matched.length
  if (k > 0) return `${fmtInt(k)} of your ${posts} touched on it.`
  if (t.state === 'unchecked') return `None of your ${posts} touched on it so far: ${UNCHECKED_TAIL}.`
  return `None of your ${posts} touched on it.`
}

function QuestionsOnIt({ data, mode, appUrl }: { data: SubjectsData; mode: RenderMode; appUrl: string }) {
  const pane = data.selected
  const email = mode === 'email'
  const footer = email ? null : openLink(mode, `${appUrl}/dashboard/reports`, 'Open the content brief →')
  const empty = subjectsUnanswered.emptyState(data)
  if (!pane) {
    return (
      <BlockFrame title={QUESTIONS_TITLE} question={subjectsUnanswered.question} mode={mode} footer={footer} roomy>
        <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
      </BlockFrame>
    )
  }
  const u = pane.unanswered
  // The month by its full name ("in September"), the other periods in the
  // control's own words ("in the last 3 months").
  const horizon = data.questionsHorizon ?? data.horizon
  const period = horizon === 'this_month' ? `in ${longMonth(data.month)}` : periodPhrase(horizon, data.month)
  const count = questionsCountLine(u, pane.name, period)
  const listed = u.questionVideos >= UNANSWERED_GATE && u.rows.length > 0
  const countBlock = email ? (
    <div style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, background: EMAIL.inner, borderRadius: 6, padding: '10px 12px' }}>
      {count.k > 0 ? <><span data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink }}>{fmtInt(count.k)}</span> {count.words}</> : count.words}
    </div>
  ) : (
    <div className="flex flex-col gap-2 rounded-md bg-inner p-6">
      {count.k > 0 ? (
        <>
          <span className="flex items-baseline gap-2.5">
            <span data-copy="figure" className="font-mono text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">{fmtInt(count.k)}</span>
            <span className="text-[15px] text-secondary-foreground">{count.k === 1 ? 'video' : 'videos'}</span>
          </span>
          <span className="text-[15px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">asked about {pane.name} {period}.</span>
        </>
      ) : <span className="text-[15px] leading-[1.5] text-secondary-foreground">{count.words}</span>}
    </div>
  )
  const list = listed ? (
    email ? (
      <div>
        {u.rows.map((r) => (
          <div key={r.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
            <span data-copy="subject" data-slot="pass_b_theme">{r.label}</span> · <span data-copy="figure">{fmtInt(r.videos)}</span>
          </div>
        ))}
        <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, paddingTop: 6 }}>{questionsPostsLine(u, period)}</div>
      </div>
    ) : (
      <div className="flex min-w-0 flex-col">
        <div className={`flex items-baseline justify-between gap-4 ${RULE.head}`}>
          <span className="text-[15px] font-semibold">Asked most</span>
          <span className={SCALE.head}>videos</span>
        </div>
        {u.rows.map((r) => (
          <div key={r.id} className={`flex min-h-11 items-center justify-between gap-4 ${RULE.row} last:border-b-0`}>
            <span className="flex min-w-0 flex-col">
              <span className={`min-w-0 ${SCALE.row}`}><span data-copy="subject" data-slot="pass_b_theme">{r.label}</span></span>
              {/* A question row's touch is the word check alone, as Your
                  moves reads a question theme; said in the same words. */}
              {r.answered ? <span className={SCALE.tag}>your posts touched on it</span> : null}
            </span>
            <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(r.videos)}</span></span>
          </div>
        ))}
        <p className="m-0 pt-3 text-[14px] leading-[1.5] text-secondary-foreground">{questionsTouchLine(u, period)}</p>
      </div>
    )
  ) : null
  // THE SUBJECTS ASKED ABOUT MOST OVER THE LAST 3 MONTHS (the preview), where
  // this subject's own list does not open: where the questions are. SAID TO
  // BE OTHER SUBJECTS (finish-list item 9): headed "Asked most" under "4
  // videos asked about Comfort", "Buying & delivery 79, Price 17, Comfort 9"
  // read as Comfort's own questions.
  const most = !listed ? (data.askedMost ?? []) : []
  const askedMost = most.length > 0 ? (
    email ? (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>{ASKED_MOST_HEAD}</div>
        {most.map((a) => (
          <div key={a.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
            {a.name} · <span data-copy="figure">{fmtInt(a.videos)}</span>
          </div>
        ))}
      </div>
    ) : (
      // At the tile's foot, as the preview sets it (d3 polish): the pair's
      // taller tile gives its spare height above the list, not under it.
      <div className="mt-auto flex min-w-0 flex-col">
        <div className={`flex items-baseline justify-between gap-4 ${RULE.head}`}>
          <span className="text-[15px] font-semibold">{ASKED_MOST_HEAD}</span>
          <span className={SCALE.head}>videos</span>
        </div>
        {most.map((a) => (
          <div key={a.id} className={`flex min-h-11 items-center justify-between gap-4 ${RULE.row} last:border-b-0`}>
            {mode === 'app'
              ? <Link href={`${appUrl}/dashboard/subjects?item=${encodeURIComponent(a.id)}&${QUESTIONS_PARAM}=last_3`} className={`min-w-0 ${SCALE.row} underline decoration-neutral-seg underline-offset-[5px] hover:decoration-foreground`}>{a.name}</Link>
              : <span className={`min-w-0 ${SCALE.row}`}>{a.name}</span>}
            <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(a.videos)}</span></span>
          </div>
        ))}
      </div>
    )
  ) : null
  return (
    <BlockFrame title={QUESTIONS_TITLE} question={subjectsUnanswered.question} mode={mode} footer={footer} roomy>
      {countBlock}
      {list}
      {askedMost}
    </BlockFrame>
  )
}
