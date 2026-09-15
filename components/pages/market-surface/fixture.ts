import type { MarketSurfaceData } from '@/lib/pages/market-surface'
import {
  ADVICE_EMPTY, ADVICE_UNLOCK, CLAIMS_CAVEAT, MOVES_EMPTY_MK4, MOVES_UNRECORDED,
  actedLine, moveLedgerLine, repeatLine, unlockRows, waysOfMoving,
} from '@/lib/pages/market-surface'
import { MOVES_MASTHEAD, MOVES_UNLOCK } from '@/lib/pages/overview'

// Market's block fixtures (Phase 1 WP14).
//
// TWO STATES, BOTH REAL. `marketFixture()` is the surface with everything it
// can have — conclusions, a ledger with a decision on it, a dated move, advice
// to accept. `unrecordedFixture()` is PRODUCTION on the day this shipped: M4 is
// not applied, so there is no `moves` table to list from and nothing has been
// dated; the ledger is 64 identities of which the client has decided one.
//
// Every block is rendered in both, in all three modes, because the second is
// the reading a client meets first.

const NOW = '2026-09-18T09:00:00.000Z'

export function marketFixture(over: Partial<MarketSurfaceData> = {}): MarketSurfaceData {
  const adviceRows = [
    {
      lineageId: 'L-old',
      recommendationId: 'r-old',
      title: 'Lead with repairability, not recycling, in the next campaign',
      reasoning: 'The conversation keeps returning to how long a bag lasts.',
      kind: 'positioning_messaging',
      firstMade: '2026-06-28',
      timesMade: 1,
      monthsRepeated: 1,
      repeatedWithinMonth: false,
      status: 'acted_on' as const,
      statusLabel: 'Done',
      decidedAt: '2026-09-02T10:00:00.000Z',
    },
    {
      lineageId: 'L-twice',
      recommendationId: 'r-twice',
      title: 'Make every core bag easy to buy in one visit',
      reasoning: 'Buyers ask where to buy under half the posts we read.',
      kind: 'customer_experience',
      firstMade: '2026-09-10',
      timesMade: 2,
      monthsRepeated: 1,
      repeatedWithinMonth: true,
      status: 'new' as const,
      statusLabel: 'New',
      decidedAt: null,
    },
  ]

  const acceptable = { lineageId: 'L-twice', recommendationId: 'r-twice', title: adviceRows[1].title }

  return {
    brand: 'Sealand',
    month: '2026-09-01',
    monthStatus: 'filling',
    readingAt: NOW,
    horizon: 'this_month',
    masthead: MOVES_MASTHEAD,
    conclusions: {
      rows: [
        {
          id: 'mi-1',
          title: 'Comfort and personalisation remain the real proof of value',
          description: 'People describe the fit before they describe the price, and they describe it in their own words.',
          kind: 'unmet_need',
          tier: 'confirmed',
          videos: 157,
          themes: [{ slug: 'comfort_and_fit', label: 'Comfort and fit' }, { slug: 'personalisation', label: null }],
        },
        {
          id: 'mi-2',
          title: 'The conversation is being shaped outside your own content',
          description: 'What the category believes about you is being decided somewhere you are not posting.',
          kind: 'platform_pattern',
          tier: 'early_signal',
          videos: 0,
          themes: [],
        },
        {
          id: 'mi-3',
          title: 'A read we are showing you and not counting',
          description: 'Below the evidence bar, labelled rather than hidden.',
          kind: 'industry_signal',
          tier: 'archive',
          videos: 2,
          themes: [],
        },
      ],
      counts: { confirmed: 1, early: 1, archive: 1 },
      belowBar: 1,
      sortedBy: 'strongest evidence first, then by how many videos are behind it',
      empty: null,
    },
    advice: {
      rows: adviceRows,
      total: 64,
      acted: 1,
      actedLine: actedLine(1, 64),
      repeatLine: repeatLine(adviceRows),
      recorded: true,
      unlock: ADVICE_UNLOCK,
      empty: null,
    },
    moves: {
      rows: [
        {
          id: 'm-1',
          title: 'Say less about recycling',
          kind: 'subject',
          on: 'on the subject Durability',
          declaredAt: '2026-09-14',
          line: moveLedgerLine({ title: 'Say less about recycling', declared_at: '2026-09-14' }, 'on the subject Durability'),
        },
      ],
      masthead: MOVES_MASTHEAD,
      unlock: MOVES_UNLOCK,
      recorded: true,
      empty: null,
    },
    ways: {
      ways: waysOfMoving(acceptable),
      claims: [
        { id: 'c0', youSay: 'Our bags are made from rescued sailcloth.', theySay: 'People ask what happens when a seam goes.', gap: 'durability', audience: 'contradicts', verdictLabel: 'Pushed back' },
        { id: 'c1', youSay: 'Every bag is one of a kind.', theySay: 'Commenters repeat it back in their own words.', gap: '', audience: 'echoes', verdictLabel: 'Echoed' },
        { id: 'c2', youSay: 'We are a B Corp.', theySay: null, gap: '', audience: 'silent', verdictLabel: 'Not taken up' },
      ],
      claimsLine: '3 claims of yours, read against what the conversation said back.',
      claimsCaveat: CLAIMS_CAVEAT,
      acceptable,
      empty: null,
    },
    unlocks: { rows: unlockRows() },
    record: {
      line: 'your 3rd monthly reading · 3 updates · 2,359 videos · 27% of what was said on camera was not in English',
      lines: ['3 updates delivered in this month.', 'Nothing was refused this reading.'],
      href: '/dashboard/settings',
    },
    ...over,
  }
}

/** Production on the day this shipped: `moves` is not applied, nothing is
 *  dated, and one of 64 pieces of advice has been decided on. */
export function unrecordedFixture(): MarketSurfaceData {
  const base = marketFixture()
  return {
    ...base,
    moves: { rows: [], masthead: MOVES_MASTHEAD, unlock: MOVES_UNLOCK, recorded: false, empty: MOVES_UNRECORDED },
    ways: { ...base.ways, ways: waysOfMoving(null), acceptable: null, claims: [], claimsLine: 'Nothing you have said in your own posts has been read against the conversation this update.' },
  }
}

/** The state where the ledger itself is empty and nothing has been dated: a
 *  tenant one update old, and the only state in which MK2 and MK4 both print
 *  their empty sentence. */
export function firstUpdateFixture(): MarketSurfaceData {
  const base = marketFixture()
  return {
    ...base,
    advice: { rows: [], total: 0, acted: 0, actedLine: actedLine(0, 0), repeatLine: repeatLine([]), recorded: true, unlock: ADVICE_UNLOCK, empty: ADVICE_EMPTY },
    moves: { rows: [], masthead: MOVES_MASTHEAD, unlock: MOVES_UNLOCK, recorded: true, empty: MOVES_EMPTY_MK4 },
    ways: { ...base.ways, ways: waysOfMoving(null), acceptable: null },
  }
}
