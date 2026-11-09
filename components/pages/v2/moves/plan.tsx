import { CARD, CardHead, EmptyBox, GoLink, Label, STACK, STACK_CELL, STACK_HEAD, TBL, TD, TH } from '@/components/v2'
import { PLAN_EMPTY, type PlanCheckCard, type PlanClaimRow } from '@/lib/ask/plan-cards'
import { NOBODY_RAISES_IT } from '@/lib/ask/untested'
import { fmtInt, shortDate } from '@/lib/format'
import { CHECK_A_PLAN_HREF, PLAN_TITLE, READ_FAILED, leadClaims } from '@/lib/pages/v2/moves'
import { cn } from '@/lib/utils'

// "Your plan, checked against the market" (board E6-Moves; since the audit
// design, 7 Nov, Moves.dc.html): the newest plan the Agent has re-read (its
// name and its two days as a list), its claims supported out of all of them,
// the three counts as one bar (a partition: every claim carries exactly one
// verdict) with its key, what changed since it was uploaded, and its lead
// claims as a table.
//
// A CLAIM IS THE CLIENT'S OWN DOCUMENT (`quote`). Its count is a FLOOR, never
// a share (lib/ask/plan-cards.ts `PLAN_CLAIM_BASIS`): at least this many videos
// we can show a comment from. The board's per-claim figures ("44% new
// amputees and caregivers", "22 of 38 knee videos are about paying") are
// computed nowhere: what moved is stored as the verdict it moved from and to,
// and the date. No quote here (no quotes at level 1).

const SEG = [
  { key: 'supported', label: 'Supported', fill: 'bg-you' },
  { key: 'contradicted', label: 'Contradicted', fill: 'bg-caution' },
  { key: 'untested', label: 'Untested', fill: 'bg-border' },
] as const

/** What changed since upload, printed here; the rest are claim by claim. */
export const PLAN_MOVED_SHOWN = 3

/** A claim's read, in its tone: contradicted in the caution ink (decision
 *  12.3), supported in ink, untested muted. */
const VERDICT_TONE: Record<string, string> = {
  echoes: 'font-semibold text-foreground',
  contradicts: 'font-semibold text-caution',
  silent: 'text-muted-foreground',
}

/** "Moved 13 Sep. 6 readings have carried it since.": a moved claim's day
 *  and how long it has held, as a sentence (the stored line joins them with
 *  a middle dot, which the quarterly and the legacy blocks print as it is;
 *  the screen re-words it here, lib untouched). */
export function movedWords(on: string): string {
  const s = on.replace(/\s*\u00B7\s*/g, '. ').trim()
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}`
}

/** A claim's row on a phone (decision 14, the app's own phone layout): the
 *  claim beside its read, then the videos behind it across. */
const CLAIM_PHONE_ROW = 'max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1 max-sm:border-t max-sm:border-track max-sm:py-3.5'

function ClaimRow({ c }: { c: PlanClaimRow }) {
  return (
    <tr className={CLAIM_PHONE_ROW}>
      <td className={cn(TD, STACK_CELL)}><span data-copy="quote">“{c.claim}”</span></td>
      <td className={cn(TD, STACK_CELL, 'max-sm:text-right', VERDICT_TONE[c.verdict] ?? 'text-foreground')}>{c.verdictLabel}</td>
      <td className={cn(TD, 'whitespace-nowrap pr-0 text-right', STACK_CELL, 'max-sm:col-span-2 max-sm:text-[14px] max-sm:text-secondary-foreground')}>
        {c.verdict === 'silent' ? <span className="whitespace-normal text-muted-foreground">{c.untested ?? NOBODY_RAISES_IT}</span> : <>at least <span data-copy="figure" className="tabular-nums">{fmtInt(c.value.k)}</span><span className="sm:hidden"> videos</span></>}
      </td>
    </tr>
  )
}

/** The three counts' key: a swatch, the word, the count. */
function Key({ counts }: { counts: PlanCheckCard['summary'] }) {
  return (
    <dl className="m-0 mt-2.5 flex flex-wrap gap-x-[22px] gap-y-1.5 text-[14px]">
      {SEG.map((x) => (
        <div key={x.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('inline-block size-2.5 rounded-[2px]', x.fill)} />
          <dt>{x.label}</dt>
          <dd data-copy="figure" className="m-0 font-semibold tabular-nums">{fmtInt(counts[x.key])}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * THE BOARD'S PLAN CARD WITH NO PLAN TO DRAW: its head and ONE line for the
 * one gap, in the dashed box (decision 4: no empty bar): none checked (the
 * Agent's own words, `PLAN_EMPTY`, with the way to check one under it), or the
 * read failed on this load (never "none checked" beside a count of plans).
 * No count is drawn: nothing was read, which is not zero.
 */
function NoPlan({ className, failed }: { className?: string; failed: boolean }) {
  return (
    <section aria-labelledby="plan-title" data-plan-empty="" className={cn(CARD, 'gap-[18px]', className)}>
      <CardHead id="plan-title" size="lg" title={PLAN_TITLE} />
      <EmptyBox>{failed ? `Your plan ${READ_FAILED}.` : PLAN_EMPTY}</EmptyBox>
      {failed ? null : <GoLink href={CHECK_A_PLAN_HREF} className="self-start">Check a plan</GoLink>}
    </section>
  )
}

export function PlanCard({ plan, className, failed = false }: { plan: PlanCheckCard | null; className?: string; failed?: boolean }) {
  if (!plan || failed) return <NoPlan className={className} failed={failed} />
  const s = plan.summary
  const total = s.supported + s.contradicted + s.untested
  const claims = leadClaims(plan)
  return (
    <section aria-labelledby="plan-title" className={cn(CARD, 'gap-[18px]', className)}>
      <div>
        <CardHead id="plan-title" size="lg" title={PLAN_TITLE} />
        <dl className="m-0 mt-3 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 text-[14.5px] max-sm:grid-cols-1 max-sm:gap-2.5">
          <div className="min-w-0"><dt className="text-[13px] text-muted-foreground">Plan</dt><dd className="m-0 mt-1 [overflow-wrap:anywhere]"><span data-copy="quote">{plan.title}</span></dd></div>
          <div><dt className="text-[13px] text-muted-foreground">Uploaded</dt><dd className="m-0 mt-1">{shortDate(plan.uploadedOn)}</dd></div>
          <div><dt className="text-[13px] text-muted-foreground">Re-read</dt><dd className="m-0 mt-1">{plan.checkedOn ? shortDate(plan.checkedOn) : 'Not since upload'}</dd></div>
        </dl>
      </div>
      {total > 0 ? (
        <div>
          <div data-copy="level" className="flex items-baseline gap-2">
            <span className="text-[34px] font-bold leading-none tabular-nums text-foreground">{fmtInt(s.supported)}</span>
            <span className="text-[16px] text-secondary-foreground">of {fmtInt(total)} {total === 1 ? 'claim' : 'claims'} supported</span>
          </div>
          <div role="img" aria-label={`${fmtInt(s.supported)} supported, ${fmtInt(s.contradicted)} contradicted, ${fmtInt(s.untested)} untested`} className="mt-3.5 flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
            {SEG.map((x) => (s[x.key] > 0 ? <div key={x.key} className={x.fill} style={{ width: `${(100 * s[x.key]) / total}%` }} /> : null))}
          </div>
          <Key counts={s} />
        </div>
      ) : <EmptyBox>No claim in it has been read yet.</EmptyBox>}
      {plan.moved.length > 0 ? (
        <div className="rounded-[10px] bg-inner px-5 py-[18px]">
          <Label as="h3">Changed since you uploaded it</Label>
          <ul className="m-0 mt-2.5 flex list-none flex-col gap-3 p-0 text-[15px] leading-[1.55]">
            {plan.moved.slice(0, PLAN_MOVED_SHOWN).map((m) => (
              <li key={`${m.claim}:${m.to}`}>
                <span data-copy="quote">“{m.claim}”</span> is now <strong>{m.to.toLowerCase()}</strong>, from {m.from.toLowerCase()}.<br />
                <span className="text-[13.5px] text-muted-foreground">{movedWords(m.on)}</span>
              </li>
            ))}
          </ul>
          {plan.moved.length > PLAN_MOVED_SHOWN ? (
            <p className="m-0 mt-3 text-[14px] text-secondary-foreground">
              And <span data-copy="figure">{fmtInt(plan.moved.length - PLAN_MOVED_SHOWN)}</span> more, claim by claim.
            </p>
          ) : null}
        </div>
      ) : null}
      {plan.empty ? <p className="m-0 text-[14px] text-muted-foreground">{plan.empty}</p> : null}
      {claims.length > 0 ? (
        <div className="min-w-0 overflow-x-auto">
          <table className={cn(TBL, STACK, 'text-[14.5px]')}>
            <thead className={STACK_HEAD}>
              <tr>
                <th scope="col" className={TH}>Claim</th>
                <th scope="col" className={TH}>Read</th>
                <th scope="col" className={cn(TH, 'whitespace-nowrap pr-0 text-right')}>Videos behind it</th>
              </tr>
            </thead>
            <tbody className={STACK}>{claims.map((c, i) => <ClaimRow key={`${c.claim}:${i}`} c={c} />)}</tbody>
          </table>
        </div>
      ) : null}
      {plan.notice ? <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">{plan.notice}</p> : null}
      <GoLink href={plan.href} className="self-start">Go claim by claim</GoLink>
    </section>
  )
}
