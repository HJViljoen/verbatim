import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { provenanceLine } from '@/components/pages/overview/sentence'
import { EMAIL, FONT } from '@/lib/email/theme'
import { longMonth, shortDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import { nextMonthlyParts } from '@/lib/reports/monthly'
import type { LedgerRow } from '@/lib/pages/overview'
import type { MonthlyData } from '@/lib/pages/monthly'
import { sectionFooter, type MonthlyBlock } from './adapt'
import { Body, Inner } from './email'

/**
 * 10 · What to decide (market-first WP2.1; the email artboard's last section).
 *
 * THE CURRENT RECOMMENDATION AND THE NEXT MONTHLY, AND NOTHING WRITTEN BY A
 * MODEL. The standing advice is the front page's ledger row (the current
 * recommendation first, WP1.9): its title as stored, how often it was made and
 * what it rests on (`provenanceLine`, the page's own line), and the decision
 * on it. Under it, when the next monthly comes: "Next: “October in your
 * market”, read to the 8 Nov update, on Mon 9 Nov." (decision J). Version 1's
 * interpretation slot and the brief's link are not in the approved preview
 * and are gone: the build calls no model (plan WP2.1, "Cost").
 */

const TITLE = 'What to decide'

/** "You marked it Working on it on 15 Sep", or where it stands undecided. */
export function decisionLine(l: LedgerRow): string {
  return l.decidedAt
    ? `You marked it ${l.statusLabel} on ${shortDate(l.decidedAt)}`
    : `No decision recorded; it stands at ${l.statusLabel}`
}

function Recommendation({ row, mode }: { row: LedgerRow; mode: RenderMode }) {
  const provenance = provenanceLine(row)
  if (mode === 'email') {
    return (
      <Inner marginTop={0}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.muted }}>The current recommendation</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 18, lineHeight: '26px', fontWeight: 600, letterSpacing: '-.01em', color: EMAIL.ink, marginTop: 8 }}>
          <span data-copy="stored" data-slot="pass_d_b_recommendation">{row.title}</span>
        </div>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.muted, marginTop: 8 }}>
          {provenance ? <>{cap(provenance)}<br /></> : null}
          {decisionLine(row)}
        </div>
      </Inner>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-md bg-inner p-6">
      <span className="text-[13px] text-muted-foreground">The current recommendation</span>
      <span data-copy="stored" data-slot="pass_d_b_recommendation" className="text-[18px] font-semibold leading-[1.45] tracking-[-0.01em] text-foreground">{row.title}</span>
      <span className="text-[13px] leading-[1.55] text-muted-foreground">
        {provenance ? <>{cap(provenance)}<br /></> : null}
        {decisionLine(row)}
      </span>
    </div>
  )
}

const cap = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

function Next({ data, mode }: { data: MonthlyData; mode: RenderMode }) {
  const next = data.decide.next
  if (!next) return null
  const p = nextMonthlyParts(next)
  if (mode === 'email') {
    return (
      <Body marginTop={data.decide.ledger ? 24 : 0}>
        {p.lead}<strong style={{ fontWeight: 600, color: EMAIL.ink }}>{p.title}</strong>{p.tail}
      </Body>
    )
  }
  return (
    <p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground">
      {p.lead}<strong className="font-semibold text-foreground">{p.title}</strong>{p.tail}
    </p>
  )
}

export const monthlyDecide: MonthlyBlock = {
  key: 'monthly.decide',
  title: TITLE,
  question: 'What does this month ask of us?',

  render(data, mode, ctx) {
    const page = surface('market')
    const footer = sectionFooter(mode, ctx, { href: page.href, label: `Open ${page.label} →` })
    const empty = monthlyDecide.emptyState(data)
    let body: ReactNode
    if (empty) body = <BlockEmpty mode={mode}>{empty}</BlockEmpty>
    else {
      const row = data.decide.ledger
      body = mode === 'email'
        ? <>{row ? <Recommendation row={row} mode={mode} /> : null}<Next data={data} mode={mode} /></>
        : <div className="flex flex-col gap-6">{row ? <Recommendation row={row} mode={mode} /> : null}<Next data={data} mode={mode} /></div>
    }
    return <BlockFrame title={TITLE} mode={mode} footer={footer} roomy card={mode === 'email'}>{body}</BlockFrame>
  },

  emptyState(data) {
    if (data.decide?.ledger || data.decide?.next) return null
    return `No recommendation stands for ${longMonth(data.month)}.`
  },
}
