import type { ReactNode } from 'react'
import Link from 'next/link'
import { fmtInt, shortDate } from '@/lib/format'
import type { AskBasis } from '@/lib/agent/basis'
import type { AskPlanChip } from '@/lib/pages/agent-thread'
import { Tile } from '@/components/shell/tile'
import { ClaimChip } from './marks'

// The ask box, as a TILE (Block D wave 2, E-ask · `ask.box.*`, `ask.plan.chip`).
//
// WHAT CHANGED, AND WHY IT IS THE TILE THAT MATTERS. The built page was a
// non-scrolling stage: a crowd backdrop, a standing figure, one centred pill
// and a sentence under it. The artboard draws a tile with the page's own
// anatomy — an uppercase eyebrow left, a mono meta right, the control, then a
// hairline footer rail carrying the attached plan. That is not decoration: the
// meta is where "3 monthly readings searchable" moves TO, out of the centred
// sentence under the box, and the footer rail is where the plan chip becomes
// visible at all. Ask has been able to check a plan since August and no
// surface has ever shown a reader that they had one.
//
// THE META IS THE READINGS COUNT AND NOT THE WHOLE BASIS LINE. `askBasisLine`
// carries four facts and the bar's context line already prints them; the
// artboard's meta carries ONE, and it is the one a question is about to be
// answered against. The others are a click away in the record.

/** The plan chip's own footer rail: what was checked, when, and how its claims
 *  read on the newest re-reading. */
function PlanRail({ plan }: { plan: AskPlanChip }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-2.5">
      <span className="text-[12px] font-medium text-foreground">{plan.title}</span>
      <span className="font-mono text-[11px] text-muted-foreground">
        uploaded <span data-copy="figure">{shortDate(plan.uploadedOn)}</span> ·{' '}
        <span data-copy="figure">{fmtInt(plan.claims)}</span> {plan.claims === 1 ? 'claim' : 'claims'}
      </span>
      {/* ABSENT RATHER THAN ZERO, which is this package's own discipline —
          `NotAnsweredTile`'s meta argues it in its own comment and `askDraws`
          / `askRecordLines` distinguish "not recorded" from "none" throughout.
          All three chips rendered unconditionally, so a plan whose claims all
          held drew a red-tinted "0 contradicted" beside a grey "0 untested":
          a negative tint firing where nothing is wrong, on the one rail a
          reader checks to see whether their campaign still stands up. The
          three counts partition the claims, so a plan with any claim in it
          still draws at least one chip, and the claim count beside them is
          the total either way. */}
      {plan.summary.supported > 0 && <ClaimChip tone="supported">{fmtInt(plan.summary.supported)} supported</ClaimChip>}
      {plan.summary.contradicted > 0 && <ClaimChip tone="contradicted">{fmtInt(plan.summary.contradicted)} contradicted</ClaimChip>}
      {plan.summary.untested > 0 && <ClaimChip tone="untested">{fmtInt(plan.summary.untested)} untested</ClaimChip>}
      <Link href={plan.href} className="ml-auto shrink-0 text-[12px] font-medium text-foreground hover:underline">
        The plan check →
      </Link>
    </div>
  )
}

export function AskBoxTile({
  basis: _basis,
  plan,
  composer,
  row = 2,
}: {
  basis: AskBasis
  plan: AskPlanChip | null
  /** The control itself, as a slot — see `AnswerTile.composer` for why a block
   *  in the render tier may not construct a client component. */
  composer?: ReactNode
  row?: number
}) {
  return (
    <Tile col={12} row={row} eyebrow="Ask the conversation">
      {composer}
      {plan ? (
        <PlanRail plan={plan} />
      ) : (
        // NOT A BLANK RAIL. A workspace with no plan is the common case and the
        // rail is where a reader would learn that checking one is possible at
        // all — the control beside the box says "Check a plan" and this says
        // what happens when they do.
        <p className="border-t border-border/70 pt-2.5 text-[12px] text-muted-foreground">
          No plan has been checked yet. Bring a campaign brief with &ldquo;Check a plan&rdquo; and its claims are
          re-read against every update.
        </p>
      )}
    </Tile>
  )
}
