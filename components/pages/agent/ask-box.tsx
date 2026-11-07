import type { ReactNode } from 'react'
import Link from 'next/link'
import { fmtInt, shortDate } from '@/lib/format'
import type { AskBasis } from '@/lib/agent/basis'
import type { StarterQuestion } from '@/lib/agent/starters'
import { ASK_WINDOW_WORDS, type AskWindowChoice } from '@/lib/agent/scope'
import type { AskPlanChip } from '@/lib/pages/agent-thread'
import { CARD, GoLink, Tag } from '@/components/v2'
import { SEG, SEG_ITEM, SEG_ON } from '@/components/v2/look'
import { cn } from '@/lib/utils'

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
 *  read on the newest re-reading (since the audit design, 7 Nov: the claims as
 *  the plan check's tags, the day and the count in commas, the link words with
 *  no arrow). */
function PlanRail({ plan }: { plan: AskPlanChip }) {
  return (
    // Two even lines (the P8-9 review: one wrapping row left "2 untested"
    // alone under the rest): the plan and its day, then how its claims read
    // with the link at the right.
    <div className="flex flex-col gap-2 border-t border-track pt-3.5">
      <p className="m-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[14px] font-semibold text-foreground">{plan.title}</span>
        <span className="text-[13.5px] text-muted-foreground">
          uploaded <span data-copy="figure">{shortDate(plan.uploadedOn)}</span>,{' '}
          <span data-copy="figure">{fmtInt(plan.claims)}</span> {plan.claims === 1 ? 'claim' : 'claims'}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
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
        {plan.summary.supported > 0 && <Tag tone="tint">{fmtInt(plan.summary.supported)} supported</Tag>}
        {plan.summary.contradicted > 0 && <Tag tone="hi">{fmtInt(plan.summary.contradicted)} contradicted</Tag>}
        {plan.summary.untested > 0 && <Tag tone="mid">{fmtInt(plan.summary.untested)} untested</Tag>}
        <GoLink href={plan.href} className="ml-auto shrink-0">The plan check</GoLink>
      </div>
    </div>
  )
}

/** The window switch's two links and where each points. */
export interface AskWindowSwitch {
  current: AskWindowChoice
  href: Record<AskWindowChoice, string>
  /** The first year a comment was read into, "2020", or null. */
  reachesBack: string | null
}

/**
 * "Window: Last 90 days | All time" (WP3.9; plan §2.8). Two links, not a
 * control: the window is in the URL, so each option is an address, and the
 * composer posts the one the page is on.
 */
function WindowSwitch({ w }: { w: AskWindowSwitch }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-[14px] text-secondary-foreground">Window</span>
      <span role="group" aria-label="Window" className={SEG}>
        {(['days90', 'all'] as const).map((c) => (
          <Link key={c} href={w.href[c]} aria-current={w.current === c ? 'true' : undefined} className={cn(SEG_ITEM, w.current === c && SEG_ON)}>
            {ASK_WINDOW_WORDS[c]}
          </Link>
        ))}
      </span>
      {w.reachesBack && <span className="text-[13.5px] text-muted-foreground">comments reach back to <span data-copy="figure">{w.reachesBack}</span></span>}
    </div>
  )
}

/** Where a starter card sends the reader: Ask, with the question in the box
 *  (`?ask=`). Nothing is asked, and nothing spent, until they press Ask. A
 *  reader who switched to all time stays on it (`?window=all`), so the
 *  question is asked over the window the page said. */
export const starterHref = (question: string, window: AskWindowChoice = 'days90'): string =>
  `/dashboard/agent?ask=${encodeURIComponent(question)}${window === 'all' ? '&window=all' : ''}`

/**
 * "Start from what your market talked about" (WP3.9; the approved preview).
 *
 * THE QUESTIONS ARE CODE'S AND THE COUNTS ARE THE FRONT PAGE'S
 * (lib/agent/starters.ts). Each card names the objects it was written from,
 * with their videos, and the tags the front page prints beside the same rows.
 */
export function StarterCards({ starters, source, window = 'days90' }: { starters: readonly StarterQuestion[]; source: string | null; window?: AskWindowChoice }) {
  if (starters.length === 0) return null
  return (
    <section className="flex flex-col gap-3 border-t border-border/70 pt-4" aria-label="Start from what your market talked about">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-[14px] font-semibold text-foreground">Start from what your market talked about</h3>
        {source && <span className="text-[13px] text-muted-foreground">{source}</span>}
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
        {starters.map((c) => (
          <li key={c.question}>
            <Link href={starterHref(c.question, window)} className="flex h-full flex-col gap-3 rounded-lg bg-inner p-4 hover:bg-inner/70">
              <span className="text-[14px] font-semibold leading-[1.4] text-foreground">{c.question}</span>
              <span className="flex flex-col gap-1.5 border-t border-border/70 pt-3">
                {c.rows.map((r) => (
                  <span key={r.label} className="flex flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-3 text-[12.5px] text-muted-foreground">
                      {/* A theme label is model prose written elsewhere and
                          replayed here, so it names its slot; a subject's name
                          is the client's own. */}
                      {r.kind === 'theme'
                        ? <span data-copy="subject" data-slot="pass_b_theme" className="min-w-0">{r.label}</span>
                        : <span className="min-w-0">{r.label}</span>}
                      <span className="flex-none text-foreground">
                        <span data-copy="figure" className="font-semibold tabular-nums">{fmtInt(r.k)}</span> {r.k === 1 ? 'video' : 'videos'}
                      </span>
                    </span>
                    {r.tags.length > 0 && (
                      <span className="text-[13px] text-muted-foreground">{r.tags.join(', ')}</span>
                    )}
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AskBoxTile({
  basis: _basis,
  plan,
  composer,
  window,
  asked,
  starters,
}: {
  basis: AskBasis
  plan: AskPlanChip | null
  /** The control itself, as a slot — see `AnswerTile.composer` for why a block
   *  in the render tier may not construct a client component. */
  composer?: ReactNode
  /** The window switch, on the index (WP3.9). Absent on a thread, whose
   *  answers were read over the window they were asked on. */
  window?: AskWindowSwitch
  /** "3 of 40 questions asked this month": the wall-clock budget. */
  asked?: { asked: number; cap: number } | null
  /** The starter cards, on the index. */
  starters?: ReactNode
}) {
  return (
    // The Agent page's tile (Agent.dc.html): its question as the heading, the
    // "Ask your market" eyebrow over it folded in (the audit design's rule).
    <section aria-labelledby="ask-box-title" className={cn(CARD, 'gap-[18px] max-sm:gap-4')}>
      <h2 id="ask-box-title" className="m-0 text-[24px] font-bold leading-[1.25] tracking-[-0.01em] text-foreground max-sm:text-[21px]">What does your market say about this?</h2>
      {composer}
      {(window || asked) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {window ? <WindowSwitch w={window} /> : <span />}
          {asked && (
            <span className="text-[14px] tabular-nums text-secondary-foreground">
              <span data-copy="figure">{fmtInt(asked.asked)}</span> of <span data-copy="figure">{fmtInt(asked.cap)}</span> questions asked this month
            </span>
          )}
        </div>
      )}
      {starters}
      {plan ? <PlanRail plan={plan} /> : null}
    </section>
  )
}
