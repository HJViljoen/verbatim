import { Quotes, type QuoteItem } from '@/components/quotes'
import { CARD_FRAME, LBL, TAG, TAG_TONE } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import type { ClaimResult, Judgement, Verdict } from '@/lib/ask/types'

// A document, annotated — the agent's other face.
//
// THE ONE RULE THAT DIFFERS FROM QUESTION MODE: silence here is clean space.
// The question box may offer the nearest thing it does have, because someone
// asked one thing and wants help. Here the agent walks EVERY claim in a
// campaign, and if each silent one got an adjacent-thing consolation a
// nine-claim brief would become nine tangents — and the summary line would stop
// meaning anything. Heinrich, 2026-08-22: "if nothing relates to something,
// just stay silent."
//
// So an untested claim shows its claim and its tag and then stops. No
// explanation, no filler. The blank is the information.
//
// SINCE THE AUDIT DESIGN (7 Nov, Agent-Thread.dc.html): each claim a ruled
// row with its number, its claim as an h3 and its verdict as a tag
// (Contradicted the caution pair, Untested the track, Supported the pale
// yellow); "In summary" a sentence-case label; its videos and conversations
// ("At least 22 videos behind it, from these conversations: A, B, C"; the
// board says "22 conversations: A, B, C", but the number is videos, 9 Nov).
// The counts by verdict are the figures row's
// (`planCheckStats`), and "What I'd take from that" is its own tile under the
// two (`PlanJudgement`). This file sits in the split's client bundle, so its
// styles come from the kit's import-free `look.ts`.

const VERDICT_META: Record<Verdict, { label: string; tone: keyof typeof TAG_TONE }> = {
  echoes: { label: 'Supported', tone: 'tint' },
  contradicts: { label: 'Contradicted', tone: 'hi' },
  // Same visual weight as the other two. It is the verdict that keeps the
  // product honest, and shrinking it would quietly turn "we don't know" into
  // "nothing to see".
  silent: { label: 'Untested', tone: 'mid' },
}

export function AgentDocumentView({
  claims,
  quotesByClaim,
  activeRef = null,
  anchored,
  onSelect,
}: {
  claims: ClaimResult[]
  /** Each claim's quotes WITH their reading, so a non-English voice prints
   *  its English under it (sweep 2026-09-24: this path printed raw text). */
  quotesByClaim: Map<string, (string | QuoteItem)[]>
  /** Set when the split view is driving selection from the document side. */
  activeRef?: string | null
  /** Refs whose span was found in the document. A claim NOT in here was never
   *  written down — worth saying out loud rather than leaving as a silent
   *  absence of a shading. */
  anchored?: Set<string>
  onSelect?: (ref: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {claims.map((c, i) => {
        const meta = VERDICT_META[c.verdict]
        const quotes = quotesByClaim.get(c.ref) ?? []
        const labels = (c.themeRefs ?? []).map((t) => t.label).filter(Boolean)
        return (
          <article
            key={c.ref}
            data-ref={c.ref}
            data-claim=""
            onClick={onSelect ? () => onSelect(c.ref) : undefined}
            className={cn(
              'flex flex-col gap-3 rounded-[10px] border px-[22px] py-5 transition-colors max-sm:px-4 max-sm:py-4',
              activeRef === c.ref ? 'border-foreground/40 ring-1 ring-foreground/30' : 'border-track',
              onSelect ? 'cursor-pointer' : null,
            )}
          >
            <div className="flex items-start gap-3.5 max-sm:gap-3">
              <span className="w-[22px] shrink-0 pt-px text-[15px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
              {/* The tag beside the claim from 640, under it on a phone. */}
              <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3.5">
                <h3 className="m-0 min-w-0 text-[16.5px] font-semibold leading-[1.45] text-foreground">{c.claim}</h3>
                <span data-tag={meta.tone} className={cn(TAG, TAG_TONE[meta.tone], 'shrink-0')}>{meta.label}</span>
              </div>
            </div>

            {/* A claim the document never states. Not a failure of the check —
                a plan resting on something it never says out loud is worth
                knowing before money is spent on it. */}
            {anchored && !anchored.has(c.ref) && (
              <p className="m-0 pl-9 text-[13.5px] text-muted-foreground max-sm:pl-0">Not stated directly in the document.</p>
            )}

            {/* Untested stops here. Deliberately. */}
            {c.verdict !== 'silent' && (
              <div className="flex flex-col gap-2 pl-9 max-sm:pl-0">
                {/* The voices lead. The sentence under them is a reading OF
                    them, and saying so is the difference between evidence and
                    a sentence that merely sounds like evidence. */}
                {quotes.length > 0 && <Quotes items={quotes} />}
                {c.theySay && (
                  <>
                    <h4 className={cn('m-0', LBL)}>In summary</h4>
                    <p className="m-0 text-[15px] leading-[1.6] text-foreground">{c.theySay}</p>
                  </>
                )}
                {/* The count is VIDEOS: `conversationCount` is the distinct
                    videos behind the claim's quotes (lib/ask/verdicts.ts), a
                    floor, which Your moves prints as "at least N videos behind
                    it". The names are the conversations it was read against.
                    Printed as "1 conversation:" over five names until 9 Nov. */}
                <p className="m-0 text-[13.5px] leading-[1.55] text-secondary-foreground">
                  <span className="font-semibold text-foreground">
                    At least <span data-copy="figure" className="tabular-nums">{c.conversationCount}</span> {c.conversationCount === 1 ? 'video' : 'videos'} behind it{labels.length > 0 ? `, from ${labels.length === 1 ? 'this conversation' : 'these conversations'}:` : '.'}
                  </span>
                  {labels.length > 0 ? <> {labels.join(', ')}</> : null}
                </p>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

/** A proposal's first sentence, in bold over the rest (the board's), where
 *  it has more than one; null where it is one sentence. Pure. */
export function leadSentence(text: string): { lead: string; rest: string } | null {
  const m = /^(.+?[.!?])\s+(?=[A-Z"“‘(])/.exec(text)
  if (!m) return null
  const rest = text.slice(m[0].length)
  return rest ? { lead: m[1], rest } : null
}

/**
 * "What I'd take from that": the plan check's own tile under its two tiles
 * (the board's), two proposals to a row from 768, each ruled at the top, its
 * first sentence in bold, then the claims it reasons from.
 */
export function PlanJudgement({ claims, judgement }: { claims: ClaimResult[]; judgement: Judgement[] }) {
  if (judgement.length === 0) return null
  const numberOf = new Map(claims.map((c, i) => [c.ref, i + 1]))
  return (
    <section aria-labelledby="plan-take-title" data-plan-judgement="" className={cn(CARD_FRAME, 'gap-4')}>
      <h2 id="plan-take-title" className="m-0 text-[21px] font-semibold leading-[1.3] text-foreground">What I&rsquo;d take from that</h2>
      <div className="grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2">
        {judgement.map((j, i) => {
          const cites = (j.basedOnRefs ?? [])
            .map((ref) => numberOf.get(ref))
            .filter((n): n is number => Boolean(n))
            .sort((a, b) => a - b)
          const split = leadSentence(j.text)
          return (
            <div key={i} className="flex flex-col gap-1.5 border-t border-track pt-4">
              <p className="m-0 text-[15.5px] leading-[1.6] text-foreground">
                {split ? <><span className="font-semibold">{split.lead}</span> {split.rest}</> : j.text}
              </p>
              <p className="m-0 text-[13.5px] text-muted-foreground">
                {cites.length > 0
                  ? `Reasoning from ${cites.length === 1 ? 'claim' : 'claims'} ${cites.join(', ')} above.`
                  : 'Not drawn from any single claim above. This one is inference.'}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
