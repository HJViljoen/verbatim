import Link from 'next/link'
import { BrandClaim } from '@/components/blocks/brand-claim'
import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { TileBlock } from '@/components/shell/tile'
import { Derivation } from './derivation'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { PlanCheckCard, PlanClaimRow } from '@/lib/ask/plan-cards'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'

// MK6 · Plans re-checked — the artboard's third card in the moves row (Block D
// wave 2).
//
// THE FEATURE EXISTED ON ANOTHER SURFACE AND MARKET NAMED IT AS MISSING. A
// campaign brief is uploaded on Ask, stored as a `plan_checks` row and re-read
// against every update by `lib/ask/reevaluate.ts`; `loadPlanChecks` (wave 1) is
// the shared loader, and this block is Market reading the result back. The
// loader is READ ONLY from here — Ask owns it, and two reads that disagree
// about which plan is "the" plan would be worse than not printing it.
//
// THE SEGMENTED BAR IS A PARTITION AND IS ALLOWED TO BE ONE. D4 refuses a bar
// whose segments are independent shares of one denominator dressed as a whole;
// these three are not that. Every claim in a plan carries exactly one verdict —
// supported, contradicted or untested — so the three counts sum to the claims
// and the bar is what the counts are. Each segment still prints its own count
// beside its own word, because a bar nobody can read numbers off is decoration.
//
// A CLAIM IS THE CLIENT'S OWN DOCUMENT, so it is a `quote` node. Several real
// claims carry a digit ("we grew 40% on price alone") and rule (a) may not
// police a quotation. The commenter's words beneath a contradicted claim are a
// SEPARATE quote with its own ref — the original leads and the machine
// translation sits under it, which is `BlockQuote`'s rule, not this block's.
//
// THE DATE IS THE RE-READING'S, AND THE ARTBOARD'S "held 2 updates" IS NOT
// PRINTED. Since the walkthrough (item 5) a verdict IS held — it changes only
// when the evidence behind it does (`holdVerdicts`, lib/ask/verdicts.ts, and
// the card's `caveat` says so) — but the card has no per-claim count of
// updates to print. What makes the chips checkable is `checkedOn`: the update
// these verdicts were last read on, printed as the footer note.

const SEGMENT: { key: 'supported' | 'contradicted' | 'untested'; label: string; colour: string }[] = [
  { key: 'supported', label: 'Supported', colour: 'var(--you)' },
  { key: 'contradicted', label: 'Contradicted', colour: 'var(--negative)' },
  { key: 'untested', label: 'Untested', colour: 'var(--border)' },
]

const CHIP_TONE: Record<string, string> = {
  echoes: 'bg-accent text-accent-foreground',
  contradicts: 'bg-negative/12 text-negative',
  silent: 'bg-inner text-muted-foreground',
}

/** The artboard's contradicted row: the claim, its chip, and the comment that
 *  earned the verdict. */
function Claim({ claim, mode }: { claim: PlanClaimRow; mode: RenderMode }) {
  const email = mode === 'email'
  if (email) {
    return (
      <div style={{ padding: '4px 0' }}>
        <BrandClaim mode={mode} copy="quote">{claim.claim}</BrandClaim>{' '}
        <span style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.ink2 }}>{claim.verdictLabel}</span>
        {claim.quote ? <BlockQuote quote={claim.quote} mode={mode} /> : null}
      </div>
    )
  }
  return (
    <TileBlock className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2.5">
        <BrandClaim mode={mode} copy="quote">{claim.claim}</BrandClaim>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${CHIP_TONE[claim.verdict] ?? 'bg-inner text-muted-foreground'}`}>
          {claim.verdictLabel}
        </span>
      </div>
      {claim.quote ? <BlockQuote quote={claim.quote} mode={mode} /> : null}
      {/* THE COUNT WITH ITS POPULATION, or the count alone where the corpus
          could not be read — `basis` under the card says which of the two this
          is, and `n === 0` means there is no denominator rather than a share of
          nothing. */}
      <span data-copy={claim.value.n > 0 ? 'level' : 'figure'} className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {claim.value.n > 0
          ? `${fmtInt(claim.value.k)} of ${fmtInt(claim.value.n)} videos we can show you a comment from`
          : `${fmtInt(claim.value.k)} videos we can show you a comment from`}
      </span>
    </TileBlock>
  )
}

/** The claim the card opens on: the contradicted one, else the first that
 *  earned a verdict at all. Pure, so the choice is testable. */
export function leadClaim(card: PlanCheckCard): PlanClaimRow | null {
  return card.claims.find((c) => c.verdict === 'contradicts')
    ?? card.claims.find((c) => c.verdict !== 'silent')
    ?? card.claims[0]
    ?? null
}

/** The plan's one line: when it was uploaded, which of how many it is, and
 *  the update its verdicts were re-read on. */
export function planLine(card: { uploadedOn: string; checkedOn: string | null }, plans: number): string {
  return [
    `uploaded ${shortDate(card.uploadedOn)}`,
    plans > 1 ? `newest of ${fmtInt(plans)} checked` : null,
    card.checkedOn ? `as re-read on ${shortDate(card.checkedOn)}` : 'not re-read since upload',
  ].filter(Boolean).join(' · ')
}

export const marketPlans: Block<MarketSurfaceData> = {
  key: 'market.plans',
  title: 'Plans re-checked',
  question: 'What did we plan, and does the conversation bear it out?',

  render(data, mode = 'app', ctx) {
    const card = data.plans[0] ?? null
    const email = mode === 'email'
    const empty = marketPlans.emptyState(data)
    if (!card) {
      return (
        <BlockFrame title={marketPlans.title} question={marketPlans.question} mode={mode} roomy>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    const total = card.summary.supported + card.summary.contradicted + card.summary.untested
    const lead = leadClaim(card)
    const href = `${ctx.appUrl}${card.href}`

    return (
      <BlockFrame
        title={marketPlans.title}
        question={marketPlans.question}
        mode={mode}
        roomy
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>See the claim-by-claim verdicts →</a>
          : <Link href={href} className="hover:underline">See the claim-by-claim verdicts →</Link>}
      >
        {/* THE CARD IS ONE OF A LIST AND SAYS SO, and THE DATE THAT MAKES THE
            CHIPS CHECKABLE: one mono line under the file, as the preview draws
            it ("uploaded 10 Sep · 14 claims"), not header meta or a footer
            note (25 Sep rulings, WP3.6). */}
        <p
          className={email ? undefined : 'm-0 font-mono text-[12px] leading-[1.4] text-muted-foreground'}
          style={email ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, margin: '0 0 4px' } : undefined}
        >
          {planLine(card, data.plans.length)}
        </p>
        {card.empty ? <BlockEmpty mode={mode}>{card.empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'flex min-h-0 flex-1 flex-col justify-between gap-2.5'}>
          <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
            <div className={email ? undefined : 'flex items-baseline justify-between gap-3'}>
              <span className={email ? undefined : 'min-w-0 truncate text-[12.5px] font-medium'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: EMAIL.ink } : undefined}>{card.title}</span>
              <span data-copy="figure" className={email ? undefined : 'shrink-0 font-mono text-[11.5px] tabular-nums text-secondary-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted } : undefined}>
                {fmtInt(total)} {total === 1 ? 'claim' : 'claims'}
              </span>
            </div>
            {/* THE BAR IS THE THREE COUNTS AND NOTHING ELSE — see the header on
                why a partition is allowed here where D4 refuses one. */}
            {!email && total > 0 ? (
              <span className="flex h-2.5 w-full flex-none gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {SEGMENT.map((s) => (card.summary[s.key] > 0
                  ? <span key={s.key} style={{ width: `${(card.summary[s.key] / total) * 100}%`, background: s.colour }} />
                  : null))}
              </span>
            ) : null}
            <div className={email ? undefined : 'flex flex-wrap gap-x-3 gap-y-1'}>
              {SEGMENT.map((s) => (
                <span
                  key={s.key}
                  data-copy="level"
                  className={email ? undefined : 'flex items-center gap-1.5 text-[11px] text-muted-foreground'}
                  style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginRight: 10 } : undefined}
                >
                  {!email ? <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.colour }} /> : null}
                  {s.label} {fmtInt(card.summary[s.key])} of {fmtInt(total)}
                </span>
              ))}
            </div>
          </div>

          {lead ? <Claim claim={lead} mode={mode} /> : null}

          {card.moved.length > 0 ? (
            <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
              <span className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, color: EMAIL.ink2 } : undefined}>
                Moved since upload
              </span>
              {card.moved.map((m) => (
                <span key={`${m.claim}:${m.to}`} className={email ? undefined : 'flex min-w-0 flex-col gap-px'} style={email ? { display: 'block', fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2 } : undefined}>
                  <span className={email ? undefined : 'min-w-0 text-[12px] text-secondary-foreground'}>
                    <span data-copy="quote">{m.claim}</span>: {m.from} → {m.to}
                  </span>
                  {/* THE DATE IT MOVED, never "held N updates" — see the
                      header. `PlanMovedRow.on` is that dated sentence. */}
                  <span className={email ? undefined : 'font-mono text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted } : undefined}>{m.on}</span>
                </span>
              ))}
            </div>
          ) : null}

          {/* THE NOTICE IS A FACT ABOUT THIS PLAN and stays on the page; the
              basis, the floor and the hold caveat are how the counts were
              made and sit one press from them. */}
          {card.notice ? (
            <p
              className={email ? undefined : 'm-0 text-[11px] leading-[1.35] text-muted-foreground'}
              style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 6 } : undefined}
            >
              {card.notice}
            </p>
          ) : null}
          <Derivation mode={mode} label="How these verdicts are counted">
            {card.basis} {card.floorLine} {card.caveat}
          </Derivation>
        </div>
      </BlockFrame>
    )
  },

  // NO FIGURES. A claim's count is a FLOOR over the videos we can show a
  // comment from, bounded by the agent's own retrieval rather than by the
  // conversation (`PLAN_CLAIM_BASIS`) — so it is evidence, not a reading of a
  // period, and the budget counts readings.
  figures(): FigureTable {
    return {}
  },

  // THE COMMENT UNDER THE LEAD CLAIM, by ref — the same claim `leadClaim`
  // chooses to draw, so a freeze resolves exactly the words the page prints
  // and no others.
  quotes(data): QuoteRef[] {
    const card = data.plans[0] ?? null
    const lead = card ? leadClaim(card) : null
    return lead?.quote ? [lead.quote.ref] : []
  },

  emptyState(data) {
    return data.plans.length === 0 ? data.plansEmpty : null
  },
}
