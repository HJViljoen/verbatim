import Link from 'next/link'
import { CircleQuestionMark } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { PairChip } from '@/components/blocks/pair-chip'
import { sharedPairNote } from '@/lib/calibration'
import { TileColumns } from '@/components/shell/page-grid'
import { TrackThisSubject } from '@/components/subjects/track-this'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, fullDate, longMonth, monthName } from '@/lib/format'
import { DIRECTION_RUN_LABEL, type Direction } from '@/lib/reading/bands'
import { gapBasisLine, gapLine } from '@/lib/reading/gap'
import type { FigureTable, Verdict, VerdictPairNote } from '@/lib/reading/verdicts'
import { allRedescribed, marketTrail, monthsReadOf, paneMarketLead, paneSides, sideCaption, sideEyebrow, sideFigures, SUBJECTS_ALL_REDESCRIBED, type SubjectPane, type SubjectSide, type SubjectsData } from '@/lib/pages/subjects'
import type { FoundSplit } from '@/lib/pages/overview-market/provenance'
import { openLink } from '@/components/blocks/open-link'
import { marketLevel } from '@/lib/pages/overview-market/kinds'
import { CalibrationTag } from '@/components/blocks/calibration-tag'
import { calibrationWord, printsClient } from '@/lib/subjects/calibration-state'

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
function Side({ side, brand, mode, shared = null }: { side: SubjectSide; brand: string; mode: RenderMode; shared?: VerdictPairNote | null }): ReactNode {
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
        <BlockMovement verdict={side.verdict} unit="pts" mode={mode} sharedRefusal={shared} priorShown={priorMonth(side)} />
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
    // THE MARKET'S PANE (WP2.2): every pane the loader builds; a pane stored
    // before it renders its Phase 1 brand comparison, as sent (below).
    if (data.list.base !== undefined && (!pane || isMarketPane(pane))) {
      return <MarketPane data={data} mode={mode} appUrl={ctx.appUrl} empty={empty} />
    }
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
    const named = `named ${fullDate(pane.namedAt)} · ${fmtInt(pane.index)} of ${fmtInt(pane.of)} subjects`
    // THE CALIBRATION WORD SITS BESIDE THE NAME IT QUALIFIES (design pass):
    // first in the heading's own mono line, "Community & purpose  provisional
    // · named 24 Sep 2026 · 7 of 7 subjects", which is the rail's face for the
    // same word. On a line of its own between the heading row and the cells it
    // floated 30px from each, a caption belonging to neither. The email arm
    // has no heading row (its title is the eyebrow), so there it stays at the
    // top of the body.
    // A SUBJECT THE MONTH WAS NOT READ FOR says "no reading yet" in the
    // word's place (default M-a), as its rail row does, never "provisional".
    const word = pane.unread || calibrationWord(pane.calibration)
    const meta = word && !email
      ? <><CalibrationTag calibration={pane.calibration} unread={pane.unread} mode={mode} /> · {named}</>
      : named
    // THE EARLIER GAP PRINTS ONLY WHERE ONE OF THE TWO IS AN ANSWER. Where
    // both refuse, "too few to compare. Too few to compare in August." is the
    // same non-answer twice, and a sentence that repeats itself reads as a
    // rendering fault rather than as a refusal.
    // DECISION C (WP1.1): a provisional subject has no "you" side, so neither
    // the gap (you against a rival) nor "the videos behind your figure" prints,
    // and no side carries a verdict. The loader already builds it that way; a
    // pane stored with the two-state `'calibrating'` is read the same way here.
    const client = printsClient(pane.calibration)
    const sides = paneSides(pane)
    const gapShown = client ? pane.gap : null
    const answered = (state: string) => state === 'apart' || state === 'level'
    const basis = gapShown && (answered(gapShown.state) || answered(gapShown.basis?.state ?? ''))
      ? gapBasisLine(gapShown)
      : null
    const gapLead = gapShown ? `${pane.name}: ${gapLine(gapShown)}${basis ? `; ${basis}` : ''}.` : null
    // THE HEADLINE FIGURE IS THE MARKET'S, ON THE RAIL'S BASE (default M-b):
    // "29 of 654" on the row the reader clicked and "28 of 625" in the pane's
    // headline was two bases on one screen. The market sentence leads; the
    // Phase 1 brand comparison (the gap line, then the sides) stays below it,
    // unchanged. A stored pane carries no market figure and leads with its gap
    // line, as sent.
    const marketLead = paneMarketLead(pane, data.month)
    const lead = marketLead ?? gapLead
    const comparison = marketLead ? gapLead : null
    // ONE REFUSAL, SAID ONCE (deploy 1 review): the hero's cells each printed
    // the same refusal under their figure. Refused for one pair, each says
    // "not compared" and the chip under the cells says why.
    const shared = sharedPairNote(sides.filter((s) => s.observed && s.pct != null).map((s) => s.verdict))

    // THE LINK, IN THE RIGHT MARKUP FOR EACH READER. Print draws none — a PDF
    // and a `/r/<token>` page have no session to open a filtered catalogue
    // with. The email arm is a plain inline-styled `<a>`, not a `next/link`
    // carrying Tailwind classes into an Outlook table; the app keeps the
    // dotted rule that says "this figure has rows behind it".
    const behindLabel = (
      <>the <span data-copy="figure">{fmtInt(pane.behind?.videos ?? 0)}</span> videos behind your figure →</>
    )
    const behind = !pane.behind || !client || mode === 'print'
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
        // A stored pane leads with its gap line, as sent, in the frame's lead;
        // the market's headline is drawn first in the body, in the artboard's
        // face (below).
        lead={lead && !marketLead ? <span data-copy="level">{lead}</span> : undefined}
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
        {/* The row tag, over the cells: "provisional" (decision C). Email
            only: the app and print arms carry it in the heading line. */}
        {email ? <CalibrationTag calibration={pane.calibration} unread={pane.unread} mode={mode} block /> : null}
        {/* THE MARKET'S HEADLINE IN THE ARTBOARD'S FACE (deploy 2 review):
            the Subjects artboard sets "Looks & style came up in 104 of 626
            …" as a large sans sentence with its figures in mono, and MASTER.md
            keeps IBM Plex Serif for quotes alone; the frame's lead set it in
            17px serif, under the Phase 1 cells' 24px figures. */}
        {!email && marketLead ? <PaneHeadline text={marketLead} /> : null}
        {/* The email has no heading row, so no lead: the market's figure is
            the first line of its body (default M-b). */}
        {email && marketLead ? (
          <p data-copy="level" style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink, margin: '4px 0 8px' }}>{marketLead}</p>
        ) : null}
        {/* The brand comparison's own line, below the market's headline. */}
        {comparison && !email ? (
          <p data-copy="level" className="m-0 text-[13px] leading-[1.45] text-foreground [text-wrap:pretty]">{comparison}</p>
        ) : null}

        {email ? (
          <div>{sides.map((s) => <Side key={s.audience} side={s} brand={data.brand} mode={mode} shared={shared} />)}</div>
        ) : (
          // THE MOCK'S VERTICAL HAIRLINES, from the primitive that owns them
          // (P0 item 3). Three hand-rolled `grid-cols-3`s is how a product ends
          // up with four gutters.
          // ONLY THE SIDES THAT CARRY A READING GET A CELL (absence sweep,
          // 2026-09-24). A side with nothing read printed a whole cell saying
          // "not tracked" — five of ten on Sealand — and the note under the
          // grid then said the same five names again. The note is the one
          // place an absent side is named.
          // EVERY ROW STARTS ON THE SAME EDGE (design pass). The padding keyed
          // on the first CHILD, so the second row's first cell (The North
          // Face, on five sides) kept its 16px and stood indented under
          // Cotopaxi. It keys on the first cell of each ROW now, as
          // `TileColumns`' own rule does (3n+1), and only at xl, where the
          // columns are; the stacked column and paper (whose rule CSS pads
          // the leading edge itself) keep one left edge. The gutter is the
          // padding at xl, so a hairline has 16px on each side.
          <TileColumns of={3} className="gap-x-4 xl:gap-x-0 xl:[&>*]:px-4 xl:[&>*:nth-child(3n+1)]:pl-0 xl:[&>*:nth-child(3n)]:pr-0 xl:[&>*:last-child]:pr-0">
            {sides.filter((s) => s.observed && s.pct != null).map((s) => <Side key={s.audience} side={s} brand={data.brand} mode={mode} shared={shared} />)}
          </TileColumns>
        )}
        <PairChip note={shared} mode={mode} className="mt-3" />

        {/* The axis note and the provisional line are no longer printed (Heinrich,
            2026-09-24): each cell already says "too few to compare". */}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const pane = data.selected
    if (pane && isMarketPane(pane)) return marketPaneFigures(pane)
    return sideFigures(pane)
  },

  verdicts(data): Verdict[] {
    // The market's pane prints no verdict: its one refusal is a chip.
    if (data.selected && isMarketPane(data.selected)) return []
    return (data.selected ? paneSides(data.selected) : []).map((s) => s.verdict).filter((v): v is Verdict => v != null)
  },

  emptyState(data) {
    // NOT THE RAIL'S SENTENCE. Every other block on this page answers the
    // unreadable set with `list.notRecorded`, and that is right for a tile the
    // page DROPS in that state — but this one is drawn, directly beside the
    // rail that has just said it. The same sentence twice, 90px apart, reads
    // as a rendering fault rather than as one refusal.
    if (data.list.notRecorded) return 'Until the set can be read, there is no subject to open in full.'
    if (!data.selected) {
      if (allRedescribed(data)) return SUBJECTS_ALL_REDESCRIBED
      return data.list.proposed.length > 0
        ? 'Confirm a subject and this is where it is read in full.'
        : 'Name a subject and this is where it is read in full.'
    }
    return null
  },
}

/** The pane's market headline, "Waterproofing came up in 29 of 654 September
 *  videos in your market (4%).", as the Subjects artboard sets it: a large sans
 *  sentence, each figure (a count, a base, a share) in mono. The words are
 *  `paneMarketLead`'s; only their face is set here. */
function PaneHeadline({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,]*(?:\.\d+)?%?)/)
  return (
    <p data-copy="level" className="m-0 max-w-[660px] text-[22px] font-medium leading-[1.3] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[28px]">
      {parts.map((p, i) => (i % 2 === 1
        ? <span key={i} className="font-mono font-semibold tabular-nums tracking-[-0.04em]">{p}</span>
        : p))}
    </p>
  )
}

// ---- WP2.2 · the pane on the market ---------------------------------------------

/** Was this pane built on the market (WP2.2)? The loader sets `monthStates` on
 *  every pane since; a stored pane has none. */
export const isMarketPane = (pane: SubjectPane): boolean => pane.monthStates !== undefined

/** The pane's title (the preview's "This subject in your market"). */
export const MARKET_PANE_TITLE = 'This subject in your market'

/** The figures the market's pane prints, under their own keys. */
export function marketPaneFigures(pane: SubjectPane): FigureTable {
  const out = sideFigures({ ...pane, sides: [] })
  for (const p of monthsReadOf(pane.marketLine)) {
    if (p.k == null || p.videos == null) continue
    const month = monthName(p.month).split(' ')[0].toLowerCase()
    out[`subject_market_${month}_videos`] = { value: p.k, unit: 'videos', label: `${pane.name}, videos in your market in ${monthName(p.month)}` }
  }
  if (pane.makers) out.subject_makers_videos = { value: pane.makers.k, unit: 'videos', label: `${pane.name}, makers' videos in your market this month` }
  if (pane.found) {
    out.subject_found_before_videos = { value: pane.found.before, unit: 'videos', label: `${pane.name}, videos on searches we ran before this month` }
    out.subject_found_added_videos = { value: pane.found.added, unit: 'videos', label: `${pane.name}, videos found only on searches we added this month` }
    if (pane.found.unrecorded > 0) out.subject_found_unrecorded_videos = { value: pane.found.unrecorded, unit: 'videos', label: `${pane.name}, videos with no record of the search that found them` }
  }
  return out
}

/**
 * "Where we found them" (the approved preview's pane): the subject's videos
 * this month on searches we ran before the month, against those found only on
 * searches we added in it (the front page's added-only rule, `foundSplit`),
 * each a count on the subject's own videos, as the preview prints them. A
 * third part, the videos with no record of the search that found them, is
 * drawn only where there is one (none on staging's September). The words name
 * the month, not a day: a search's first run is its first gather (9, 13 and
 * 20 Sep on staging), which is not the day the change log dates it (17 Sep).
 */
function WhereFound({ found, month, mode }: { found: FoundSplit; month: string; mode: RenderMode }) {
  const m = longMonth(month)
  const parts = [
    { key: 'before', k: found.before, words: `on searches we ran before ${m}`, fill: 'bg-foreground' },
    { key: 'added', k: found.added, words: `only on searches we added in ${m}`, fill: 'bg-neutral-seg' },
    { key: 'unrecorded', k: found.unrecorded, words: 'with no record of the search that found them', fill: 'border border-muted-foreground/60' },
  ].filter((p) => p.key !== 'unrecorded' || p.k > 0)
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 6 }}>
        Where we found them: {parts.map((p, i) => (
          <span key={p.key}>{i > 0 ? ' · ' : ''}<span data-copy="figure">{fmtInt(p.k)}</span> {p.words}</span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[14px] text-secondary-foreground">Where we found them</span>
      {/* Each part's length is its share of the videos, the gaps aside. */}
      <span aria-hidden className="flex h-3.5 w-full gap-[3px]">
        {parts.filter((p) => p.k > 0).map((p) => (
          <span key={p.key} className={`block h-full min-w-[2px] rounded-[2px] ${p.fill}`} style={{ flex: `${p.k} 1 0%` }} />
        ))}
      </span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[14px] text-secondary-foreground">
        {parts.map((p) => (
          <span key={p.key}><span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(p.k)}</span> {p.words}</span>
        ))}
      </span>
    </div>
  )
}

/** "Who posted them": the makers' part and everyone else's, each a level on
 *  the subject's own videos (a share where it carries one, else a count). */
function WhoPosted({ makers, mode }: { makers: { k: number; of: number }; mode: RenderMode }) {
  const rest = Math.max(0, makers.of - makers.k)
  const label = (k: number) => {
    const l = marketLevel(k, makers.of)
    return l ?? { text: fmtInt(k), kind: 'count' as const }
  }
  const m = label(makers.k)
  const r = label(rest)
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 6 }}>
        Who posted them: <span data-copy="figure">{m.text}</span> makers’ videos · <span data-copy="figure">{r.text}</span> everyone else
      </div>
    )
  }
  const w = makers.of > 0 ? (makers.k / makers.of) * 100 : 0
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[14px] text-secondary-foreground">Who posted them</span>
      <span aria-hidden className="flex h-3.5 w-full gap-[3px]">
        {makers.k > 0 ? (
          <span
            className="block h-full rounded-[2px] border border-muted-foreground/60"
            style={{ width: `${w}%`, backgroundImage: 'repeating-linear-gradient(135deg, var(--muted-foreground) 0 1.5px, transparent 1.5px 6px)', opacity: 0.75 }}
          />
        ) : null}
        {rest > 0 ? <span className="block h-full flex-1 rounded-[2px] bg-foreground" /> : null}
      </span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[14px] text-secondary-foreground">
        <span><span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{m.text}</span> makers’ videos</span>
        <span><span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{r.text}</span> everyone else</span>
      </span>
    </div>
  )
}

/**
 * THE SUBJECT IN YOUR MARKET (WP2.2, §2.3 S2; the approved preview's pane).
 * The headline on the rail's own base (default M-b), then one mono line: the
 * calibration word and the months read as levels, side by side, never a
 * direction ("provisional · Aug 11% · Sep 16%"); the pair's one chip; then
 * two inner blocks, who posted its videos (makers against everyone else,
 * decision F) and how many months have been read. No gap line and no brand
 * cells: the brand comparison left the hero (WP2.2).
 */
function MarketPane({ data, mode, appUrl, empty }: { data: SubjectsData; mode: RenderMode; appUrl: string; empty: string | null }) {
  const pane = data.selected
  const email = mode === 'email'
  if (!pane || empty) {
    return (
      <BlockFrame title={MARKET_PANE_TITLE} question={subjectsSubject.question} mode={mode} roomy>
        <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
      </BlockFrame>
    )
  }
  const ask = `${appUrl}/dashboard/agent?ask=${encodeURIComponent(`What does my market say about ${pane.name}?`)}`
  const footer = openLink(mode, ask, 'Ask about this →')
  const lead = paneMarketLead(pane, data.month)
  const trail = marketTrail(pane.marketLine)
  const read = monthsReadOf(pane.marketLine).length
  const word = pane.unread || calibrationWord(pane.calibration)
  const current = trail.length > 0 ? trail[trail.length - 1].month : null
  const trailLine = word || trail.length > 0 ? (
    email ? (
      <div data-copy="level" style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.muted, marginTop: 4 }}>
        {[word, ...trail.map((t) => `${monthName(t.month).split(' ')[0]} ${t.text} ${t.of}`)].filter(Boolean).join(' · ')}
      </div>
    ) : (
      <span data-copy="level" className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px] tabular-nums text-muted-foreground">
        {word ? <CalibrationTag calibration={pane.calibration} unread={pane.unread} mode={mode} className="text-[13px] text-secondary-foreground" /> : null}
        {trail.map((t, i) => (
          <span key={t.month} className="inline-flex items-baseline gap-2">
            {i > 0 || word ? <span aria-hidden>·</span> : null}
            <span>{monthName(t.month).split(' ')[0]} <span className={t.month === current ? 'font-semibold text-foreground' : undefined}>{t.text}</span> {t.of}</span>
          </span>
        ))}
      </span>
    )
  ) : null
  const k = pane.market?.k ?? null
  const inner = (children: ReactNode) => (email
    ? <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '10px 12px', marginTop: 8 }}>{children}</div>
    : <div className="flex flex-col gap-5 rounded-md bg-inner p-6">{children}</div>)
  // Where we found them only over the headline's own videos (the loader
  // builds it on them; a mismatch is not printed).
  const found = pane.found && pane.found.of === k ? pane.found : null
  const itsVideos = (pane.makers || found) && k != null && k > 0 ? inner(
    <>
      <span className={email ? undefined : 'text-[15px] font-semibold text-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink } : undefined}>
        Its <span data-copy="figure">{fmtInt(k)}</span> {longMonth(data.month)} videos
      </span>
      {found ? <WhereFound found={found} month={data.month} mode={mode} /> : null}
      {pane.makers ? <WhoPosted makers={pane.makers} mode={mode} /> : null}
    </>,
  ) : null
  const monthsRead = read > 0 ? inner(
    <span className={email ? undefined : 'flex items-baseline gap-3'} style={email ? { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2 } : undefined}>
      <span data-copy="figure" className={email ? undefined : 'font-mono text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground'}>{fmtInt(read)}</span>
      <span className={email ? undefined : 'text-[15px] text-secondary-foreground'}>{read === 1 ? ' month read' : ' months read'}</span>
    </span>,
  ) : null

  return (
    <BlockFrame title={MARKET_PANE_TITLE} question={subjectsSubject.question} mode={mode} footer={footer} roomy>
      <div className="flex flex-col gap-4">
        {email ? (
          lead ? <p data-copy="level" style={{ fontFamily: FONT.sans, fontSize: 15, color: EMAIL.ink, margin: '4px 0' }}>{lead}</p>
            : <p style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: EMAIL.ink, margin: '4px 0' }}>{pane.name}</p>
        ) : lead ? <PaneHeadline text={lead} /> : (
          <p className="m-0 text-[22px] font-medium leading-[1.3] tracking-[-0.02em] text-foreground sm:text-[28px]">{pane.name}</p>
        )}
        {trailLine}
      </div>
      {pane.chip ? <PairChip words={pane.chip} mode={mode} /> : null}
      {pane.notRecorded ? <BlockEmpty mode={mode}>{pane.notRecorded}</BlockEmpty> : null}
      {itsVideos}
      {monthsRead}
    </BlockFrame>
  )
}
