import Link from 'next/link'
import { CircleQuestionMark } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { TileColumns } from '@/components/shell/page-grid'
import { TrackThisSubject } from '@/components/subjects/track-this'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, fullDate, monthName } from '@/lib/format'
import { DIRECTION_RUN_LABEL, type Direction } from '@/lib/reading/bands'
import { gapBasisLine, gapLine } from '@/lib/reading/gap'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { sideCaption, sideEyebrow, sideFigures, type SubjectSide, type SubjectsData } from '@/lib/pages/subjects'
import { CALIBRATING_LINE } from '@/lib/subjects/types'

// SU2 · One subject, in full — the hero (design §3 SU2, the mock's (a) header).
//
// THREE SIDES AND ONE RULE ABOUT THEM. You, your rivals and the category each
// print a LEVEL with the count under it, because a level is real on every side.
// Only the sides whose own n clears the floor print a CHANGE — on the paying
// tenant that is the category and nobody else — and the axis note says which
// those are, once, above the reading rather than under each dot.
//
// AND TWO THINGS A READER CAN DO. Track this declares a move (the button the
// design makes primary); Ask about this opens the subject in Ask. Both are
// app-only: a button in a PDF is a picture of a button.
//
// ---- what wave 2 changed, and why -------------------------------------------
//
// THE LEAD IS THE GAP, AND IT IS `gapLine` (D1). The mock's biggest sentence is
// "Durability — you 31% · Freitag 44% · gap 13 points, narrowed from 19 in
// June", and two halves of it are claims the product will not make: a
// difference between two audiences is not a `Verdict` and takes its own band,
// and "narrowed" is a direction over three readings that nothing here has
// earned. `gapLine` prints both levels with both denominators and the banded
// difference, and `gapBasisLine` prints the EARLIER gap as its own dated,
// banded reading beside it — the mock's information, with the claim the mock
// makes about it removed. On this month's n it reads "too few to compare",
// which is the same refusal the badge one cell away prints, and that agreement
// is the point.
//
// AND NO "flat, 3 months" (D5 / D11). `directionWord` returns `flat` when three
// readings exist and disagree — that is "no direction was earned", not a word a
// reader should be shown, and "flat" is not in this product's vocabulary at
// all. `DirectionWord` prints `growing` and `fading` and nothing else.

/**
 * The direction word, and the only node allowed to print one.
 *
 * Earned by `directionWord` over three consecutive months in one regime, each
 * clearing both floors — never read off a single comparison. Marked `verdict`
 * so the copy contract can see there is a reading behind it (rule (c)).
 *
 * `flat` PRINTS NOTHING. It is `directionWord`'s answer for "three readings
 * exist and do not agree", which is the absence of a direction rather than a
 * direction; and the word itself is one the product retired (`MOVEMENT_WORDS`
 * has no "flat", mock-gap §6 D11). The build printed "flat, 3 months" beside
 * Freitag's "no clear change" — two non-answers, one of them dressed as a
 * finding.
 */
export function DirectionWord({ direction, mode = 'app' }: { direction: Direction | null; mode?: RenderMode }) {
  if (!direction || direction === 'flat') return null
  if (mode === 'email') {
    return <span data-copy="verdict" style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}>{direction}, {DIRECTION_RUN_LABEL}</span>
  }
  return (
    <span data-copy="verdict" className="inline-block whitespace-nowrap rounded-full bg-inner px-2 py-0.5 text-[12px] font-medium text-muted-foreground">
      {direction}, {DIRECTION_RUN_LABEL}
    </span>
  )
}

/**
 * Does this column still owe its reader the month before?
 *
 * ONLY WHERE NO MAGNITUDE WAS DRAWN, which is the artboard's own rule and the
 * fix for a row whose three columns did not close on one edge. Columns 1 and 2
 * carry a NON-ANSWER — "too few to compare", "no clear change" — and for them
 * the previous month's level is the only way to see where the side stood, so
 * it prints, inline, and the column is four lines. Column 3 carries "▲ 5.5 pts
 * · band 3.1" AND a "growing, 3 months" pill, and at 1440 "Aug 19%" no longer
 * fit beside them: it wrapped onto a line of its own and made the third column
 * ~28px taller than the two next to it — the same datum inline twice and
 * stacked once, in one row, breaking the row's bottom edge.
 *
 * Nothing is lost by dropping it there. `▲ 5.5 pts` IS the distance from that
 * month and the badge names the basis; the prior level beside a stated change
 * is the same fact twice. The artboard's third column carries no prior-month
 * figure for exactly this reason.
 */
function priorMonth(side: SubjectSide): boolean {
  return side.previous?.pct != null && side.verdict?.state !== 'moved'
}

/**
 * One side's column: the level, its count, the change where one was drawn.
 *
 * TOP-ALIGNED, NOT CENTRED (fix pass). The three columns carry different
 * numbers of lines — the category's badge row wraps and it also has a previous
 * month — so `justify-center` lifted its eyebrow about 12px above the row the
 * other two establish, and the artboard's three eyebrows share one baseline.
 * A column of figures that starts at three different heights is read as three
 * unrelated readings.
 */
function Side({ side, brand, mode }: { side: SubjectSide; brand: string; mode: RenderMode }): ReactNode {
  const email = mode === 'email'
  const eyebrow = sideEyebrow(side, brand)
  const label = (
    <span
      className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}
      style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}
    >
      {eyebrow}
    </span>
  )
  if (!side.observed || side.pct == null) {
    return (
      <div className={email ? undefined : 'flex min-w-0 flex-col justify-start gap-1'} style={email ? { padding: '4px 0' } : undefined}>
        {label}
        <span className={email ? undefined : 'text-[12px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}>{side.silence === 'no_reading' ? 'no reading yet' : 'not tracked'}</span>
      </div>
    )
  }
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col justify-start gap-1'} style={email ? { padding: '4px 0' } : undefined}>
      {label}
      {/* THE FIGURE AND THE POPULATION IT IS A SHARE OF, ON ONE LINE. The
          artboard's stat is ~24px mono against the build's 20px, and the unit
          word beside it ("of your videos") is what stops the three columns
          reading as three shares of one denominator. */}
      <span className={email ? undefined : 'inline-flex items-baseline gap-1.5'}>
        <span
          data-copy="figure"
          className={email ? undefined : 'font-mono text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums'}
          style={email ? { fontFamily: FONT.mono, fontSize: 20, fontWeight: 600, color: EMAIL.ink } : { color: side.kind === 'you' ? 'var(--you)' : undefined }}
        >
          {fmtPct(side.pct)}
        </span>{' '}
        <span className={email ? undefined : 'text-[12px] font-medium text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}>
          {sideCaption(side)}
        </span>
      </span>
      <span data-copy="level" className={email ? undefined : 'font-mono text-[11px] tabular-nums text-muted-foreground decoration-dotted underline-offset-[3px] [text-decoration-line:underline]'} style={email ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted } : undefined}>
        {fmtInt(side.k ?? 0)} of {fmtInt(side.n ?? 0)} videos
      </span>
      <span className={email ? undefined : 'flex flex-wrap items-center gap-2'}>
        <BlockMovement verdict={side.verdict} unit="pts" mode={mode} />
        <DirectionWord direction={side.direction} mode={mode} />
        {priorMonth(side) ? (
          <span className={email ? undefined : 'whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground/80'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
            {monthName(side.previous!.month).split(' ')[0]} <span data-copy="figure">{fmtPct(side.previous!.pct!)}</span>
          </span>
        ) : null}
      </span>
    </div>
  )
}

/** The mock's secondary pill — a control, not a 12.5px text link. */
const PILL = 'inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-full bg-tile px-3.5 text-[12px] font-medium text-secondary-foreground ring-1 ring-border transition-colors hover:bg-inner'

export const subjectsSubject: Block<SubjectsData> = {
  key: 'subjects.subject',
  title: 'This subject',
  // NOT THE PAGE'S OWN SUBTITLE. `lib/nav.ts` prints "How are we seen on this
  // subject?" under the page title, and this block printed the identical string
  // as its question line 90px below it — twice on the no-selection arm, with one
  // tile between them. Every block carries a question line (§7 keeps them); a
  // literal repeat of the page's is the one that has to give way, and this
  // block's own question is the three-sided comparison it draws.
  question: 'How do we compare with the rivals we track?',

  render(data, mode = 'app', ctx) {
    const pane = data.selected
    const email = mode === 'email'
    const empty = subjectsSubject.emptyState(data)
    if (!pane || empty) {
      return (
        <BlockFrame title={subjectsSubject.title} question={subjectsSubject.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    // THE SUBJECT TRAVELS WITH THE READER. `?subject=<id>` was read by nothing
    // — the Agent page took no params at all — so the button landed a client on
    // a blank composer. A subject id is not a question either; the question is.
    const href = `${ctx.appUrl}/dashboard/agent?ask=${encodeURIComponent(`How are we seen on ${pane.name}?`)}`
    const meta = `named ${fullDate(pane.namedAt)} · ${fmtInt(pane.index)} of ${fmtInt(pane.of)} subjects`
    // THE EARLIER GAP PRINTS ONLY WHERE ONE OF THE TWO IS AN ANSWER. Where
    // both refuse, "too few to compare. Too few to compare in August." is the
    // same non-answer twice, and a sentence that repeats itself reads as a
    // rendering fault rather than as a refusal.
    const answered = (state: string) => state === 'apart' || state === 'level'
    const basis = pane.gap && (answered(pane.gap.state) || answered(pane.gap.basis?.state ?? ''))
      ? gapBasisLine(pane.gap)
      : null
    const lead = pane.gap ? `${pane.name}: ${gapLine(pane.gap)}${basis ? `; ${basis}` : ''}.` : null

    // THE LINK, IN THE RIGHT MARKUP FOR EACH READER. Print draws none — a PDF
    // and a `/r/<token>` page have no session to open a filtered catalogue
    // with. The email arm is a plain inline-styled `<a>`, not a `next/link`
    // carrying Tailwind classes into an Outlook table; the app keeps the
    // dotted rule that says "this figure has rows behind it".
    const behindLabel = (
      <>the <span data-copy="figure">{fmtInt(pane.behind?.videos ?? 0)}</span> videos behind your figure →</>
    )
    const behind = !pane.behind || mode === 'print'
      ? null
      : email
        ? <a href={`${ctx.appUrl}${pane.behind.href}`} style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink }}>{behindLabel}</a>
        : (
          <Link href={`${ctx.appUrl}${pane.behind.href}`} className="font-medium text-foreground decoration-dotted underline-offset-[3px] [text-decoration-line:underline] hover:decoration-solid">
            {behindLabel}
          </Link>
        )

    return (
      <BlockFrame
        title={pane.name}
        question={subjectsSubject.question}
        mode={mode}
        meta={meta}
        heading={mode !== 'email'}
        // THE LEAD IS A FIGURE NODE, NOT PROSE. Every digit in it is code's —
        // `gapLine` composes it from the two sides' own k and n — so rule (a)
        // is satisfied by provenance rather than by tokenisation.
        lead={lead ? <span data-copy="level">{lead}</span> : undefined}
        actions={mode === 'app' ? (
          <>
            <TrackThisSubject subjectId={pane.id} subjectName={pane.name} move={pane.move} />
            <Link href={href} className={PILL}>
              <CircleQuestionMark className="size-3.5" aria-hidden />
              Ask about this
            </Link>
          </>
        ) : undefined}
        footer={behind}
        // The mock's right-hand note: the category's last three readings, so
        // the reader can see the series the chart below draws without reading
        // the chart. Levels, dated, in the category's own n.
      >
        {pane.notRecorded ? <BlockEmpty mode={mode}>{pane.notRecorded}</BlockEmpty> : null}

        {/* CALIBRATING: THE SHARE IS HIDDEN, AND SAID ONCE (the 24 Sep ruling).
            The loader has already taken every figure of the subject out of the
            pane (withheldPane); this is the sentence in their place, rather
            than three empty cells a reader would take for "no reading". */}
        {pane.calibration !== 'ready' ? (
          <BlockEmpty mode={mode}>{CALIBRATING_LINE}</BlockEmpty>
        ) : email ? (
          <div>{pane.sides.map((s) => <Side key={s.audience} side={s} brand={data.brand} mode={mode} />)}</div>
        ) : (
          // THE MOCK'S VERTICAL HAIRLINES, from the primitive that owns them
          // (P0 item 3). Three hand-rolled `grid-cols-3`s is how a product ends
          // up with four gutters.
          // ONLY THE SIDES THAT CARRY A READING GET A CELL (absence sweep,
          // 2026-09-24). A side with nothing read printed a whole cell saying
          // "not tracked" — five of ten on Sealand — and the note under the
          // grid then said the same five names again. The note is the one
          // place an absent side is named.
          <TileColumns of={3} className="gap-x-4 [&>*]:px-4 [&>*:first-child]:pl-0 [&>*:last-child]:pr-0">
            {pane.sides.filter((s) => s.observed && s.pct != null).map((s) => <Side key={s.audience} side={s} brand={data.brand} mode={mode} />)}
          </TileColumns>
        )}

        {/* The axis note and the provisional line are no longer printed (Heinrich,
            2026-09-24): each cell already says "too few to compare". */}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return sideFigures(data.selected)
  },

  verdicts(data): Verdict[] {
    if (data.selected?.calibration !== 'ready') return []
    return data.selected.sides.map((s) => s.verdict).filter((v): v is Verdict => v != null)
  },

  emptyState(data) {
    // NOT THE RAIL'S SENTENCE. Every other block on this page answers the
    // unreadable set with `list.notRecorded`, and that is right for a tile the
    // page DROPS in that state — but this one is drawn, directly beside the
    // rail that has just said it. The same sentence twice, 90px apart, reads
    // as a rendering fault rather than as one refusal.
    if (data.list.notRecorded) return 'Until the set can be read, there is no subject to open in full.'
    if (!data.selected) {
      return data.list.proposed.length > 0
        ? 'Confirm a subject and this is where it is read in full.'
        : 'Name a subject and this is where it is read in full.'
    }
    return null
  },
}
