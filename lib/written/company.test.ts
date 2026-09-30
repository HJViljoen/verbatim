import { describe, expect, it } from 'vitest'

import { companyLines, COMPANY_CLAIMS_MAX, ownClaimsOf, postPeriods, type CompanyContext } from './company'
import { SEP } from './test-fixtures'

// The company as the writer needs it for "What it means for {company}" (the
// lead's ruling, 30 Sep): pure parts. The loader is the product's own readers
// (tracking_configs, loadBrandClaims, the own-post census) and is not mocked.

const brandClaim = (claim: string, voice: 'own' | 'about' = 'own') => ({ competitor: null, claim, quote: `VERBATIM TRANSCRIPT: ${claim}`, voice })

describe('ownClaimsOf', () => {
  it("keeps the company's own voice only, the paraphrase and never the transcript's words, once per wording, newest first", () => {
    const out = ownClaimsOf({
      client: [
        brandClaim('Bags are made from upcycled materials.'),
        brandClaim('A reviewer says the bag is sturdy.', 'about'),
        brandClaim('Bags are made from  upcycled materials'),
        brandClaim('Each bag is made locally in Cape Town.'),
      ],
    })
    expect(out).toEqual(['Bags are made from upcycled materials.', 'Each bag is made locally in Cape Town.'])
    expect(out.join(' ')).not.toContain('VERBATIM')
  })

  it(`shows at most ${COMPANY_CLAIMS_MAX}`, () => {
    expect(ownClaimsOf({ client: Array.from({ length: 20 }, (_, i) => brandClaim(`Claim ${'abcdefghijklmnopqrst'[i]}.`)) })).toHaveLength(COMPANY_CLAIMS_MAX)
  })
})

describe('postPeriods', () => {
  it("dates the census by the post: the week's days and the month to date, both to the window's end", () => {
    expect(postPeriods({ from: '2026-09-20T04:02:57.874+00:00', to: '2026-09-27T04:03:42.768+00:00' })).toEqual({
      week: { from: '2026-09-20', to: '2026-09-27' },
      month: { from: '2026-09-01', to: '2026-09-27' },
    })
  })
})

describe('companyLines', () => {
  const ctx: CompanyContext = {
    sells: { noun: 'bags', description: null, keywords: ['backpack', 'travel bag'] },
    claims: ['Bags are made from upcycled materials.', 'Each bag is made locally.'],
    posts: { week: 3, month: 0 },
  }

  it('says what it sells, what it claims and whether it posted, in words, as its own voice and not the market', () => {
    const text = companyLines('Sealand', ctx, SEP)
    expect(text).toContain('About Sealand (context for "What it means for Sealand"; none of this is what the market said):')
    expect(text).toContain('- What Sealand sells: Sealand sells bags. Its market is followed by these words: backpack, travel bag.')
    expect(text).toContain('- What Sealand says about itself in its own videos (its claims, in paraphrase):\n  - Bags are made from upcycled materials.\n  - Each bag is made locally.')
    expect(text).toContain('Sealand published posts of its own this week. Sealand published no post of its own in September so far.')
    // It has no numbers: the census is yes or none.
    expect(text).not.toMatch(/\d/)
  })

  it('leaves out what was not read, and says so where nothing is claimed', () => {
    const bare = companyLines('Sealand', { sells: { noun: null, description: null, keywords: [] }, claims: [], posts: { week: null, month: null } }, SEP)
    expect(bare).toBe('About Sealand (context for "What it means for Sealand"; none of this is what the market said):\n- What Sealand says about itself: nothing recorded.')
    expect(companyLines('Sealand', null, SEP)).toBe('')
  })
})
