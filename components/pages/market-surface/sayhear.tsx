import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { fmtInt } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { ClaimRow, MarketSurfaceData } from '@/lib/pages/market-surface'

// MK5b · Say vs hear — its own card in the artboard's moves row (Block D wave
// 2).
//
// SPLIT OUT OF `market.ways`, WHICH IS WHERE IT WAS LIVING. The claims were a
// tail on the bottom of the five-ways block, under that block's own heading and
// meta, so a reader met "how a move is made" and then, with no break, three
// claims of their own read back at them. The artboard gives them a card, and
// they are a different question from the one the buttons answer.
//
// THE ARTBOARD'S COUNTS ARE NOT PRINTED, AND THE REASON IS A MISSING FIELD.
// "echoed 14 videos · pushed back 3" needs a count per claim, and
// `SayVsHearEntry` (lib/pipeline/schemas.ts) carries `you_say`, `your_quote`,
// `audience`, `they_say`, `gap` and `supporting_theme_ids` — no count at all.
// The schema is `lib/pipeline/`, which this package may not touch, so the
// counts are named in the status note as not done rather than derived here from
// the supporting themes: a count over the themes behind a claim is a count of
// the RETRIEVAL, and printing it as "echoed 14 videos" would be the shape of
// mistake `PLAN_CLAIM_BASIS` and `CONCLUSIONS_CORPUS_LINE` both exist to stop.
//
// WHAT IS PRINTED INSTEAD IS THE VERDICT AND ITS HOLD. `CLAIMS_CAVEAT` carries
// the measurement behind the refusal — 6 of the 8 say-vs-hear claims that have
// ever recurred have already flipped their verdict — so the card says this is
// the latest update's reading and does not dress it as a series.
//
// THE CLAIM IS THE CLIENT'S OWN VOICE AND THE ANSWER IS THE MODEL'S. `you_say`
// is lifted off the client's own transcript and prints as a quotation; the
// audience's line is Pass D-a's and is marked `stored` under
// `pass_d_a_say_vs_hear`, which is the slot that adjudicated it at write time.

/** The artboard's dot, in the colour the verdict earns. */
const DOT: Record<string, string> = {
  echoes: 'var(--you)',
  contradicts: 'var(--negative)',
  silent: 'var(--border)',
}

function Claim({ claim, mode }: { claim: ClaimRow; mode: RenderMode }) {
  const email = mode === 'email'
  if (email) {
    return (
      <div style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div data-copy="quote" style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink }}>“{claim.youSay}”</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.ink2, marginTop: 2 }}>{claim.verdictLabel}</div>
        {claim.theySay ? <div data-copy="stored" data-slot="pass_d_a_say_vs_hear" style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 2 }}>{claim.theySay}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p data-copy="quote" className="m-0 text-[12.5px]">“{claim.youSay}”</p>
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: DOT[claim.audience] ?? 'var(--border)' }} />
        {claim.verdictLabel}
      </span>
      {claim.theySay ? <p data-copy="stored" data-slot="pass_d_a_say_vs_hear" className="m-0 text-[12px] leading-[1.4] text-secondary-foreground">{claim.theySay}</p> : null}
    </div>
  )
}

export const marketSayHear: Block<MarketSurfaceData> = {
  key: 'market.sayhear',
  title: 'Say vs hear',
  question: 'What do we claim, and what does the conversation say back?',

  render(data, mode = 'app', ctx) {
    const w = data.ways
    const email = mode === 'email'
    const empty = marketSayHear.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/voice`

    return (
      <BlockFrame
        title={marketSayHear.title}
        question={marketSayHear.question}
        mode={mode}
        meta={w.claims.length > 0 ? `${fmtInt(w.claims.length)} ${w.claims.length === 1 ? 'claim' : 'claims'} · your audience` : undefined}
        footer={w.claims.length > 0
          ? email
            ? <a href={href} style={{ color: EMAIL.ink }}>Hear these voices →</a>
            : <Link href={href} className="hover:underline">Hear these voices →</Link>
          : undefined}
        // THE UPDATE, NOT THE MONTH. The artboard's note reads "September",
        // which would date these verdicts by the comment; they are the latest
        // UPDATE's reading of a cumulative corpus, and `CLAIMS_CAVEAT` under
        // them says so at length.
        footerNote={w.claims.length > 0 ? 'this update’s reading' : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'flex min-h-0 flex-1 flex-col justify-between gap-2.5'}>
          {w.claims.map((claim) => <Claim key={claim.id} claim={claim} mode={mode} />)}
        </div>
        {/* No "What a verdict here is worth" disclosure: the footer note
            "this update's reading" carries the caveat (copy de-clutter B72). */}
      </BlockFrame>
    )
  },

  // NO FIGURES, and the design says so itself: this reading "holds no numbers
  // except the per-month verdict on a registered claim", which is the number it
  // cannot produce.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.ways.claims.length === 0 ? data.ways.claimsLine : null
  },
}
