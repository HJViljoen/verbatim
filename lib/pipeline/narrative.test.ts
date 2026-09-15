import { describe, it, expect } from 'vitest'
import { validateBrief, FIGURE_TOKEN } from './narrative'
import type { ExecutiveBrief } from './schemas'

// validateBrief is the write-time guard for Pass D-a's executive_brief: the model
// authors number-framing prose but must never type a number itself (it leaves a
// [[n]] token). These cover the leak modes a reasoning model actually produces.

const brief = (partial: Partial<ExecutiveBrief>): ExecutiveBrief => ({
  headline_finding: 'Buyers keep returning to how the strap feels in daily use.',
  narrative: [],
  ...partial,
})

describe('validateBrief', () => {
  it('passes a clean brief through untouched', () => {
    const raw = brief({
      narrative: [
        { metric: 'top_theme', text: `Strap comfort is the thread buyers return to, heard across ${FIGURE_TOKEN}.` },
        { metric: 'sentiment', text: `Feeling about the brand runs to ${FIGURE_TOKEN} across rated conversations.` },
      ],
    })
    const out = validateBrief(raw)
    expect(out.leaked).toBe(false)
    expect(out.brief?.narrative).toHaveLength(2)
    expect(out.brief?.narrative[0].text).toContain(FIGURE_TOKEN)
  })

  it('re-anchors a mistyped figure to the token and flags the leak', () => {
    const out = validateBrief(brief({
      narrative: [{ metric: 'sentiment', text: 'Sentiment sits at 71% here.' }],
    }))
    expect(out.leaked).toBe(true)
    expect(out.brief?.narrative[0].text).toBe(`Sentiment sits at ${FIGURE_TOKEN} here.`)
  })

  it('scrubs a figure the model typed BEFORE the token, and flags it', () => {
    const out = validateBrief(brief({
      narrative: [{ metric: 'top_theme', text: `Complaints outnumber praise 3 to 1, across ${FIGURE_TOKEN}.` }],
    }))
    expect(out.leaked).toBe(true)
    expect(out.brief?.narrative[0].text).not.toMatch(/\d/)
    expect(out.brief?.narrative[0].text).toContain(FIGURE_TOKEN)
  })

  it('strips a banned magnitude word', () => {
    const out = validateBrief(brief({
      narrative: [{ metric: 'top_theme', text: `Comfort is overwhelmingly the theme, across ${FIGURE_TOKEN}.` }],
    }))
    expect(out.leaked).toBe(true)
    expect(out.brief?.narrative[0].text).not.toMatch(/overwhelmingly/i)
    expect(out.brief?.narrative[0].text).toContain(FIGURE_TOKEN)
  })

  it('keeps only the first beat per metric', () => {
    const out = validateBrief(brief({
      narrative: [
        { metric: 'top_theme', text: `First, across ${FIGURE_TOKEN}.` },
        { metric: 'top_theme', text: `Duplicate, across ${FIGURE_TOKEN}.` },
        { metric: 'sentiment', text: `Feeling runs to ${FIGURE_TOKEN}.` },
      ],
    }))
    expect(out.brief?.narrative.map((b) => b.metric)).toEqual(['top_theme', 'sentiment'])
    expect(out.dropped).toBe(1)
  })

  it('strips figures and tokens out of the headline', () => {
    const out = validateBrief(brief({
      headline_finding: `Across ${FIGURE_TOKEN}, 3 in 4 buyers raise the strap.`,
      narrative: [{ metric: 'top_theme', text: `heard across ${FIGURE_TOKEN}.` }],
    }))
    expect(out.leaked).toBe(true)
    expect(out.brief?.headline_finding).not.toContain(FIGURE_TOKEN)
    expect(out.brief?.headline_finding).not.toMatch(/\d/)
  })

  it('returns a null brief when nothing usable survives', () => {
    expect(validateBrief(null).brief).toBeNull()
    expect(validateBrief(brief({ headline_finding: '', narrative: [] })).brief).toBeNull()
    // A beat that is only a token has no prose — dropped, leaving no beats.
    expect(validateBrief(brief({ narrative: [{ metric: 'sentiment', text: FIGURE_TOKEN }] })).brief).toBeNull()
  })
})

describe('validateBrief — the direction rule (item 9)', () => {
  // The live probe: today this headline comes back verbatim, two direction
  // words and no verdict behind either.
  it('drops a headline that names a direction nothing earned', () => {
    const out = validateBrief({
      headline_finding: 'Attention is fading while price talk is rising.',
      narrative: [{ metric: 'top_theme', text: 'Durability is the thread buyers return to, heard across [[n]].' }],
    })
    expect(out.brief).toBeNull()
    expect(out.leaked).toBe(true)
  })

  it('drops a beat that names one, and keeps the rest', () => {
    const out = validateBrief({
      headline_finding: 'Buyers want the fit settled before they will consider the price.',
      narrative: [
        { metric: 'top_theme', text: 'Durability is growing, heard across [[n]].' },
        { metric: 'sentiment', text: 'People speak warmly about the fit, across [[n]].' },
      ],
    })
    expect(out.brief?.narrative).toHaveLength(1)
    expect(out.brief?.narrative[0].metric).toBe('sentiment')
    expect(out.dropped).toBe(1)
  })

  // The other measured class: `up` as a verb particle in exactly this register.
  // Two of the 51 stored beats read this way and both are correct prose.
  it('keeps "shows up", which is the false positive a naive list deletes', () => {
    const out = validateBrief({
      headline_finding: 'Category discovery happens outside Össur unless it shows up earlier.',
      narrative: [{ metric: 'top_theme', text: 'Fit is the thread, heard across [[n]].' }],
    })
    expect(out.brief?.headline_finding).toBe('Category discovery happens outside Össur unless it shows up earlier.')
  })
})
