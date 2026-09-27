import { describe, expect, it } from 'vitest'

import { lineClaims } from './market-line'
import type { ClaimSubjects } from './market-surface'

// The hero's pure pieces. The sentences on Sealand's and Össur's real months
// are tested with the page's fixtures, in components/pages/market-surface/
// line.test.tsx.

/** The approved preview's claims line, filed in full (stg): "Of your 120
 *  claims read to date · 45 material origin · 33 community · 13 local or
 *  handmade · 7 durability · 0 waterproofing". */
const PREVIEW_CLAIMS: ClaimSubjects = {
  claims: 120,
  subjects: [
    { subjectId: 's-origin', name: 'Material origin', k: 45 },
    { subjectId: 's-community', name: 'Community', k: 33 },
    { subjectId: 's-local', name: 'Local or handmade', k: 13 },
    { subjectId: 's-durability', name: 'Durability', k: 7 },
    { subjectId: 's-water', name: 'Waterproofing', k: 0 },
  ],
  unfiled: 0,
  state: 'checked',
}

describe('lineClaims', () => {
  it('names the two subjects your claims are most about, once every claim is filed', () => {
    expect(lineClaims(PREVIEW_CLAIMS)).toEqual({ claims: 120, lead: { name: 'Material origin', k: 45 }, second: { name: 'Community', k: 33 } })
  })

  it('says nothing while any claim is unfiled: a partial count is a floor', () => {
    expect(lineClaims({ ...PREVIEW_CLAIMS, unfiled: 12, state: 'partial' })).toBeNull()
    expect(lineClaims({ ...PREVIEW_CLAIMS, subjects: PREVIEW_CLAIMS.subjects.map((x) => ({ ...x, k: 0 })), unfiled: 120, state: 'unchecked' })).toBeNull()
    expect(lineClaims(null)).toBeNull()
  })

  it('names the second subject only where it stands clear of the third', () => {
    const [a, b, ...rest] = PREVIEW_CLAIMS.subjects
    expect(lineClaims({ ...PREVIEW_CLAIMS, subjects: [a, { ...b, k: 13 }, ...rest] })?.second).toBeNull()
    // A tie at the top with a clear second pair names both.
    expect(lineClaims({ ...PREVIEW_CLAIMS, subjects: [{ ...a, k: 33 }, b, ...rest] })?.second?.name).toBe('Community')
    // A three-way tie at the top names neither.
    expect(lineClaims({ ...PREVIEW_CLAIMS, subjects: [{ ...a, k: 13 }, { ...b, k: 13 }, ...rest] })).toBeNull()
    expect(lineClaims({ ...PREVIEW_CLAIMS, subjects: PREVIEW_CLAIMS.subjects.map((x) => ({ ...x, k: 0 })) })).toBeNull()
  })
})
