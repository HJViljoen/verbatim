import Link from 'next/link'

import { FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { Tile } from '@/components/shell/tile'
import { fmtInt, fmtPct, longMonth } from '@/lib/format'
import type { QuarterlyCard } from '@/lib/pages/reports-card'
import { quarterUnlocked } from '@/lib/reports/quarterly'

/**
 * The quarterly card on /dashboard/reports (Block D wave 2, package E-reports;
 * `reports.quarterly.card` · `.figures` · `.chart` · `.note` · `.footer`).
 *
 * THE ARTEFACT EXISTED AND THE CARD DID NOT — `lib/pages/reports-card.ts` says
 * so at length and this is the other half of it. A workspace that has a
 * quarterly review could not see that it has one; now the page carries the
 * quarter under review, one banded row per subject, the bars behind them, the
 * caveat and the gate.
 *
 * FIVE THINGS THE ARTBOARD DRAWS THAT THIS DOES NOT, each for a rule:
 *
 *  · "Ready 1 Oct". D12 and `lib/schedules/due.ts`: the quarterly fires on the
 *    first UPDATE of a new calendar quarter, not on a wall-clock date, and
 *    `QuarterlyCard.ready` is `null` and stays `null`. Where the gate is what
 *    stops the card the pill carries the GATE WORD and the footnote carries
 *    the artefact's own gate sentence — and where the gate is open, or where
 *    the gate is not the reason, neither is printed (`pillWord` below).
 *  · "▲ 5 pts" and "▼ 3 pts" on a card whose own footer says three readings of
 *    six. Below `QUARTER_UNLOCKS_AT` every `quarterChange` answers
 *    `baseline_forming`, so every badge here reads "not enough months yet" —
 *    which is what the mock's own footer implies and its badges contradict.
 *  · "too few to compare" hand-written into one row. The badge's words are
 *    `MOVEMENT_WORDS` and `state` is a token, never copy.
 *  · "16% → 21%" with no denominator. D10: the level prints its "of N"
 *    (`FigureCell`), and the side it is compared WITH prints its own beneath
 *    the row — a verdict carries both sides' counts and the card shows them,
 *    so the claim is checkable rather than asserted.
 *  · "your audience" as a second series. The card reads the CATEGORY alone
 *    (`CARD_AUDIENCE`, the only side with the n to carry a banded quarter
 *    comparison on today's corpus); the artefact still prints both columns.
 *    The legend names the one series drawn rather than promising two.
 *
 * AND THE BARS ARE LEVELS, NOT A DIRECTION CLAIM. Each bar is this quarter's
 * share, scaled against the largest on the card, with a tick at the quarter
 * before it — the same two numbers the verdict beside it divides. A chart is a
 * direction claim too (AGENTS.md), and nothing here draws a line through time:
 * two readings, side by side, with the band between them printed as a word.
 */
export function QuarterlyCardTile({
  card, col = 7, row = 2,
}: {
  card: QuarterlyCard
  col?: number
  row?: number
}) {
  const unlocked = quarterUnlocked(card.readings)
  // WHETHER A COMPARISON WAS DRAWN AT ALL, which is a different question from
  // whether the gate is open. `buildQuarterlyCard` answers with no rows and no
  // series in two states — M3/M4 unapplied, and no subject carrying a reading
  // on both sides — and in neither of them is the READING COUNT what stops the
  // card. The note in the body names the real cause; the pill and the footnote
  // below take their lead from this rather than from `readings`.
  const drawn = card.series.length > 0
  const max = Math.max(...card.series.map((s) => share(s.value.k, s.value.n)), 1)
  const baselineOf = (label: string) => card.rows.find((r) => r.label === label)?.verdict.baseline ?? null

  return (
    <Tile
      col={col}
      row={row}
      eyebrow="The quarterly review"
      meta={`${card.quarter.label} · ${monthSpan(card.quarter.from, card.quarter.to)} · ${readingWord(card.readings)}`}
      distribute="between"
      className="xl:min-h-[248px]"
      footer={<Link href={card.href} className="underline underline-offset-2">See what it will cover</Link>}
      // `quarterGateSentence` verbatim — the artefact's own gate, on the card
      // that advertises it, so the two cannot come to say different numbers —
      // BUT ONLY WHERE THE GATE IS WHAT BITES. Printed unconditionally it made
      // a card with nine readings behind it footer "needs six months — you
      // have 9", and a card held up by an unapplied migration blame the
      // reading count for it. A refusal under a card that is not refusing
      // teaches a reader to stop reading the footnote.
      footerNote={drawn && !unlocked ? card.gate : undefined}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-block flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${
            drawn && unlocked ? 'bg-inner text-secondary-foreground' : 'bg-warning/15 text-warning'
          }`}
        >
          {pillWord(card.readings, drawn)}
        </span>
        <span className="min-w-0 text-[12.5px] text-foreground">
          {card.quarter.label} set against the quarter before it, and built with the first update after it closes.
        </span>
      </div>

      {card.series.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          {card.series.map((s) => {
            const pct = share(s.value.k, s.value.n)
            const base = baselineOf(s.label)
            const verdict = card.rows.find((r) => r.label === s.label)?.verdict ?? null
            return (
              <div key={s.label} className="flex min-w-0 flex-col gap-px">
                {/* THE ROW WRAPS RATHER THAN CLIPPING. Bar + level + verdict are
                    356px of fixed track, and a tile is `overflow-hidden`: on a
                    phone that took the verdict word off the edge with
                    `scrollWidth === clientWidth`, so no horizontal-scroll check
                    could see it. Under `sm` the label takes its own line, the
                    measurement takes the next, and the BAR — which is
                    `aria-hidden` decoration of the level printed beside it —
                    is the one thing dropped, because it is the only part that
                    says nothing a reader cannot read in the figures. */}
                <div className="flex min-w-0 flex-col gap-0.5 leading-[1.3] sm:flex-row sm:items-center sm:gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="size-1.5 flex-none rounded-full" style={{ background: 'var(--cat)' }} aria-hidden />
                    <span className="min-w-0 truncate text-[12.5px]">{s.label} · the category</span>
                  </span>
                  <span className="flex flex-none items-center gap-2 pl-3.5 sm:pl-0">
                    <span className="hidden sm:flex">
                      <QuarterBar pct={(pct / max) * 100} baseline={base ? (share(base.k, base.n) / max) * 100 : null} />
                    </span>
                    <span className="w-[104px] flex-none">
                      <FigureCell value={fmtPct(pct, 1)} of={`${fmtInt(s.value.k)} of ${fmtInt(s.value.n)}`} align="right" />
                    </span>
                    <span className="flex w-[132px] flex-none justify-end text-right">
                      <BlockMovement verdict={verdict} unit="pts" />
                    </span>
                  </span>
                </div>
                {base && (
                  <p className="m-0 pl-3.5 font-mono text-[10.5px] text-muted-foreground">
                    the quarter before · {fmtPct(share(base.k, base.n), 1)} · {fmtInt(base.k)} of {fmtInt(base.n)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {card.series.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: 'var(--cat)' }} aria-hidden />
              bars: {card.quarter.label}, the category
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2.5 w-0.5 rounded-[1px] bg-muted-foreground" aria-hidden />
              the quarter before
            </span>
          </div>
        )}
        <p className="m-0 text-[12px] text-muted-foreground">
          {card.series.length > 0 ? 'Share of the videos read in the category. ' : ''}
          {card.note ?? ''}
        </p>
      </div>
    </Tile>
  )
}

/** One level, scaled against the largest on the card, with a tick where the
 *  quarter before it sat. No axis and no time: two readings beside each
 *  other. */
function QuarterBar({ pct, baseline }: { pct: number; baseline: number | null }) {
  return (
    <span className="relative flex h-2.5 w-[120px] flex-none items-center" aria-hidden>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-inner">
        <span className="block h-full rounded-full" style={{ width: `${clamp(pct)}%`, background: 'var(--cat)' }} />
      </span>
      {baseline != null && (
        <span
          className="absolute top-0 h-2.5 w-0.5 rounded-[1px] bg-muted-foreground"
          style={{ left: `calc(${clamp(baseline)}% - 1px)` }}
        />
      )}
    </span>
  )
}

const clamp = (n: number): number => Math.max(1.5, Math.min(100, n))
const share = (k: number, n: number): number => (n > 0 ? (k / n) * 100 : 0)

/** "Jul–Sep", from the quarter's own bounds. */
export function monthSpan(from: string, to: string): string {
  const a = longMonth(from).slice(0, 3)
  const b = longMonth(to).slice(0, 3)
  return a === b ? a : `${a}–${b}`
}

/** "3 monthly readings" — the count the gate sentence is about, said once at
 *  the top so the footer's "you have 3" is not the first a reader hears of
 *  it. */
export function readingWord(readings: number): string {
  return `${readings} monthly reading${readings === 1 ? '' : 's'}`
}

/**
 * The pill above the rows, and it says only what the card can stand behind.
 *
 * IT USED TO BE THE CONSTANT AND NOT THE COUNT. "Six readings stand behind it"
 * is the gate (`QUARTER_READINGS_NEEDED`), hand-typed, and it was printed on
 * every unlocked card — so a card whose own meta said "9 monthly readings" and
 * whose footer said "you have 9" claimed six between them. On the one page
 * whose argument is that a figure is checkable beside its basis, that is the
 * defect the argument exists to prevent.
 *
 * AND WHERE NOTHING WAS DRAWN, THE READING COUNT IS NOT THE CAUSE. With no
 * series the card is refusing because the window reading is not recorded, or
 * because no subject carried one on both sides — the note in the body names
 * which. "not enough months yet" there sends a reader off to wait for months
 * that will not, on their own, change anything.
 */
export function pillWord(readings: number, drawn: boolean): string {
  if (!drawn) return 'nothing to compare yet'
  return quarterUnlocked(readings) ? `${readingWord(readings)} stand behind it` : MOVEMENT_WORDS.baseline_forming
}


/**
 * What stands where the card cannot be built at all (Block D wave 2, package
 * E-reports).
 *
 * `loadQuarterlyCard` answers null for exactly one reason — no subject is
 * ACTIVE for this workspace (`loadActiveSubjects` filters `status = 'active'`,
 * and a tenant with no `subjects` table at all reaches the same place through
 * its own catch) — and the page then rendered nothing, so the surface whose
 * question is "Which document do I need?" said nothing whatever about the
 * artefact this package exists to advertise. That is the state BOTH live
 * workspaces are in today.
 *
 * It names the subject and not the migration: what a reader can act on is
 * naming one, and "the subject tables are not applied" is our bookkeeping, not
 * theirs. No date, no count, and nothing about a quarter we have not read.
 */
export function QuarterlyAbsentTile({ col = 7, row = 2 }: { col?: number; row?: number }) {
  return (
    <Tile
      col={col}
      row={row}
      eyebrow="The quarterly review"
      meta="not yet"
      distribute="between"
      className="xl:min-h-[248px]"
      footer={<Link href="/dashboard/settings" className="underline underline-offset-2">Name a subject in Settings</Link>}
    >
      <p className="m-0 text-[12.5px] leading-[1.45] text-foreground">
        The quarterly review reads the subjects you track, and none is confirmed for this workspace yet — so there is no
        quarter to set against the one before it.
      </p>
      <p className="m-0 text-[12px] text-muted-foreground">
        Name and confirm a subject and it appears here, with the quarter under review and what stands behind it.
      </p>
    </Tile>
  )
}