import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { fmtInt } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { ClaimRow, MarketSurfaceData, WayRow } from '@/lib/pages/market-surface'
import { AcceptAdviceButton } from './accept-button'

// MK5 · How a move is made (design §3 MK5).
//
// FIVE WAYS, TWO OF THEM LIVE, AND THE OTHER THREE SAY WHY NOT. The design
// describes this section as "the explanation and the buttons", holding no
// numbers except the per-month verdict on a registered claim — which is the one
// number it cannot produce, so it prints none.
//
// "Track this" is live but NOT HERE: it needs a subject or a theme in hand and
// Market has neither, so its one click is the link to the surface that does.
// "Accept this advice" is the button on this page that writes, and it writes a
// move against the ledger's oldest undecided row.
//
// THE CLAIMS ARE A CURRENT READING, NOT A VERDICT PER MONTH. Measured on
// production, 6 of the 8 say-vs-hear claims that have ever recurred have
// already flipped their verdict — the same coin-flip MK6 is withheld for, on
// the same data. MK6's rule is "only when a verdict has held for two
// consecutive updates" and MK5 carries no such rule in the design, so this
// block prints the latest update's reading and says that is what it is.

function Way({ way, mode, appUrl }: { way: WayRow; mode: RenderMode; appUrl: string }) {
  const email = mode === 'email'
  const title = way.href && !email
    ? <Link href={`${appUrl}${way.href}`} className="hover:underline">{way.title} →</Link>
    : way.href && email
      ? <a href={`${appUrl}${way.href}`} style={{ color: EMAIL.ink }}>{way.title} →</a>
      : way.title

  if (email) {
    return (
      <div style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: EMAIL.ink }}>{title}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 2 }}>{way.how}</div>
        {way.unlock ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>{way.unlock}</div> : null}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-t border-border/70 pt-2">
      <p className="m-0 text-[12.5px] font-medium">{title}</p>
      <p className="m-0 text-[12px] text-secondary-foreground">{way.how}</p>
      {way.unlock ? <p className="m-0 text-[11.5px] text-muted-foreground">{way.unlock}</p> : null}
    </div>
  )
}

function Claim({ claim, mode }: { claim: ClaimRow; mode: RenderMode }) {
  const email = mode === 'email'
  const verdict = email
    ? <span style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, color: EMAIL.ink2 }}>{claim.verdictLabel}</span>
    : <span className="rounded-full bg-inner px-2 py-px text-[10.5px] font-medium text-secondary-foreground">{claim.verdictLabel}</span>

  if (email) {
    return (
      <div style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div data-copy="prose" style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink }}>{claim.youSay}</div>
        <div style={{ marginTop: 2 }}>{verdict}</div>
        {claim.theySay ? <div data-copy="prose" style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 2 }}>{claim.theySay}</div> : null}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-t border-border/70 pt-2">
      <p data-copy="prose" className="m-0 text-[12.5px]">{claim.youSay}</p>
      <span className="flex flex-wrap items-center gap-2">{verdict}</span>
      {claim.theySay ? <p data-copy="prose" className="m-0 text-[12px] text-secondary-foreground">{claim.theySay}</p> : null}
    </div>
  )
}

export const marketWays: Block<MarketSurfaceData> = {
  key: 'market.ways',
  title: 'How a move is made',
  question: 'How do we tell you what we are doing about it?',

  render(data, mode = 'app', ctx) {
    const w = data.ways
    const email = mode === 'email'
    const live = w.ways.filter((x) => x.live).length

    return (
      <BlockFrame
        title={marketWays.title}
        question={marketWays.question}
        mode={mode}
        meta={`${fmtInt(live)} of ${fmtInt(w.ways.length)} ways work today`}
      >
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
          {w.ways.map((way) => <Way key={way.key} way={way} mode={mode} appUrl={ctx.appUrl} />)}
        </div>
        {/* THE BUTTON IS APP-ONLY. On paper and in an email the way above says
            what it does; a control in an export is a control nobody can press. */}
        {mode === 'app' && w.acceptable ? (
          <div className="flex min-w-0 flex-col gap-1">
            <p className="m-0 text-[12px] text-secondary-foreground">The oldest piece of advice you have not decided on: {w.acceptable.title}</p>
            <AcceptAdviceButton lineageId={w.acceptable.lineageId} title={w.acceptable.title} />
          </div>
        ) : null}

        <p
          className={email ? undefined : 'm-0 text-[12px]'}
          style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, marginTop: 8 } : undefined}
        >
          {w.claimsLine}
        </p>
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
          {w.claims.map((claim) => <Claim key={claim.id} claim={claim} mode={mode} />)}
        </div>
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}
        >
          {w.claimsCaveat}
        </p>
      </BlockFrame>
    )
  },

  // NO FIGURES, and the design says so itself: this section "holds no numbers
  // except the per-month verdict on a registered claim", which is the number it
  // cannot produce.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.ways.empty
  },
}
