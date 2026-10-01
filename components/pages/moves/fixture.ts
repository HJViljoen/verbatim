import { READING_VERSION, type StatementReading, type StatementsBlockData } from '@/lib/statements/types'
import type { AdviceRow } from '@/lib/pages/market-surface'
import { marketFixture } from '@/components/pages/market-surface/fixture'
import { markupText } from '@/lib/test/render'

// Your moves' fixtures, from the artboard's own real Sealand numbers
// (pages_rev_data.json, read 1 Oct): the anti-waste claim in 125 of 852
// September market videos (74 back it, 2 doubt it, 7 ask), Protect Our Paths
// under 5 of Sealand's own posts (3 back it), the B Corp line heard nowhere,
// and one statement not yet measured.

const SEPT = '2026-09-01'

function reading(over: Partial<StatementReading>): StatementReading {
  return {
    version: READING_VERSION,
    month: SEPT,
    complete: true,
    market: { videos: 0, base: 852 },
    own: { videos: 0 },
    stance: null,
    says: null,
    who: [],
    members: 0,
    ...over,
  }
}

export const ANTI_WASTE = reading({
  market: { videos: 125, base: 852 },
  stance: { of: 'market', base: 125, backs: 74, doubts: 2, asks: 7 },
  says: 'People love upcycling ideas and anti-waste design, but they also ask what materials are used, where they come from, and whether an upcycling claim is genuine.',
  who: [{ about: 'market', videos: 125 }],
  members: 140,
})

export const PROTECT_OUR_PATHS = reading({
  own: { videos: 5 },
  stance: { of: 'own', base: 5, backs: 3, doubts: 0, asks: 0 },
  says: 'People respond to Sealand as a community-rooted label, praising the cleanup work and expressing interest in showing up for events.',
  who: [{ about: 'client', videos: 5 }],
  members: 6,
})

export const B_CORP = reading({})

export const MIXED = reading({
  market: { videos: 115, base: 852 },
  own: { videos: 5 },
  stance: { of: 'market', base: 115, backs: 60, doubts: 4, asks: 9 },
  says: 'People like the idea of gear kept in use, and ask how the take-back works.',
  who: [{ about: 'market', videos: 105 }, { about: 'rival:Patagonia', videos: 10 }],
  members: 90,
})

export function statementsFixture(over: Partial<StatementsBlockData> = {}): StatementsBlockData {
  return {
    month: SEPT,
    complete: true,
    base: 852,
    brand: 'Sealand',
    canEdit: true,
    statements: [
      { id: '11111111-1111-4111-8111-111111111111', text: 'Every Sealand product is a small act of defiance against waste', reading: ANTI_WASTE },
      { id: '22222222-2222-4222-8222-222222222222', text: 'Protect Our Paths has cared for Cape Town’s natural spaces since 2022', reading: PROTECT_OUR_PATHS },
      { id: '33333333-3333-4333-8333-333333333333', text: 'We’re an award-winning B Corp', reading: B_CORP },
      { id: '44444444-4444-4444-8444-444444444444', text: 'Made from upcycled, recycled and responsibly sourced materials', reading: null },
    ],
    ...over,
  }
}

/** The artboard's five pieces of advice (recommendations of the 27 Sep run). */
export function consideringFixture(): AdviceRow[] {
  const base = marketFixture().advice.rows[0]
  const row = (i: number, priority: string, kind: string, title: string, why: string): AdviceRow => ({
    ...base,
    lineageId: `L-${i}`,
    recommendationId: `r-${i}`,
    number: i,
    status: 'new',
    statusLabel: 'New',
    decidedAt: null,
    priority,
    kind,
    title,
    why,
    quote: null,
  })
  return [
    row(1, 'high', 'customer_experience', 'Install a proof-first product standard on every bag page, retail touchpoint, and creator brief',
      'Shoppers want to picture exactly how a bag works before they buy: laptop fit, pocket layout, dimensions in plain language, packed shape, and whether it works as a personal item or carry-on.'),
    row(2, 'medium', 'product', 'Run a carry-comfort redesign on hero silhouettes and publish fit notes by body type and load',
      'Comfort is part of perceived quality, not an extra. The evidence points to specific friction points: strap pressure near the neck, slouch when the bag is partly packed, and bottle storage that steals internal space.'),
    row(3, 'medium', 'positioning_messaging', 'Pair Sealand’s purpose story with visible material provenance, repair support, and lifespan proof',
      'Mission-led storytelling earns warmth, but premium consideration depends on whether people can inspect what the bag is made from and trust it to last.'),
    row(4, 'low', 'partnerships', 'Turn community events and local partners into hands-on try-on, pack-check, and repair moments',
      'Sealand already holds a distinctive place around belonging, local action, and events. Use that position as a conversion advantage by adding product evaluation to cleanups, pop-ups, and partner spaces.'),
    row(5, 'low', 'content_communication', 'Brief utility-led creators to explain Sealand in shopping language where bag comparisons already happen',
      'People are learning what to ask about bags from category and competitor voices before Sealand enters the conversation.'),
  ]
}

/** The design bans and rule 1, over a block's markup: what it breaks, if
 *  anything. No em dash, no left stripe, no emoji, no process talk. */
export function bansBroken(markup: string): string[] {
  const text = markupText(markup)
  const out: string[] = []
  if (text.includes('—')) out.push('em dash')
  if (/border-l(?:-|\b)|border-left/.test(markup)) out.push('left border')
  if (/\p{Extended_Pictographic}/u.test(text)) out.push('emoji')
  const process = text.toLowerCase().match(/measuring|calibrat|coverage|our search|we read|as at /)
  if (process) out.push(`process talk: ${process[0]}`)
  return out
}
