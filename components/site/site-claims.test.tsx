import { describe, it, expect } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import MarketingHome from '@/app/site/page'
import HowItWorks from '@/app/site/how-it-works/page'
import { SURFACES } from '@/lib/nav'
import { HOME_EXAMPLE_NOTE, EXAMPLE_NOTE } from '@/app/site/_data/sample'

// The public site read like a list of promises, and the persona test checked
// them against the app (finish-list item 25). These pin the claims to the
// product as it is: the pages the sidebar draws, counts in videos, no
// direction words, no weekly email, no Studio, no report cadence or format,
// and a made-up example labelled as one.

const pages = [
  ['home', () => MarketingHome()],
  ['how it works', () => HowItWorks()],
] as const

describe.each(pages)('the %s page', (_name, page) => {
  const text = renderText(page())

  it('says what the product reads: the bigger market a brand sells into', () => {
    expect(text).toMatch(/market you sell into/)
  })

  it('makes no promise the product has turned off', () => {
    for (const banned of [/\bgaining\b/i, /\bfading\b/i, /\bemerging\b/i, /sentiment/i, /\bstudio\b/i, /inbox/i, /digest/i, /schedul/i, /PDF attached/i, /[↑↓]/, /\d conversations/]) {
      expect(text, String(banned)).not.toMatch(banned)
    }
  })

  // Checked against the app's page code (CHECK, 29 Sep): This week has no
  // "what we'd do"; a group shows a line, where it talks, a count read to date
  // and one voice (no wants, stops or tips, no share of a month); Brands reads
  // what is done under a brand for rivals only; news is shown on none of the
  // nine pages; the short read lives only on a parked page.
  it('shows nothing the nine pages do not', () => {
    for (const banned of [/what we.d do/i, /short read/i, /news around it/i, /stops them/i, /tips them/i, /of the month.s [\d,]+ videos/i, /where yours does/i, /where you do/i]) {
      expect(text, String(banned)).not.toMatch(banned)
    }
  })

  it('never uses an em dash', () => {
    expect(text).not.toContain('—')
  })
})

describe('the example market', () => {
  it('is labelled on the home page where it starts, beside the one measured count', () => {
    const text = renderText(MarketingHome())
    expect(text).toContain(HOME_EXAMPLE_NOTE)
    expect(text).toContain('18,440 comments.')
    // Every mock panel says it is the example.
    expect(text.match(/Example market/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('is labelled on How it works', () => {
    expect(renderText(HowItWorks())).toContain(EXAMPLE_NOTE)
  })
})

describe('How it works lists the app as the sidebar draws it', () => {
  const html = render(HowItWorks())
  const listed = [...html.matchAll(/class="pg"><b>([^<]+)<\/b><span>([^<]+)<\/span>/g)].map((m) => [m[1], m[2]])

  it('the nine, in the sidebar\'s order, and nothing else', () => {
    // Before: Dashboard, Market, Voice, Consumer profile, Competitive,
    // Content, Analyst, Studio, Reports.
    expect(listed.map(([label]) => label)).toEqual(SURFACES.map((s) => s.label))
  })

  it.each(SURFACES.filter((s) => s.question).map((s) => [s.label, s]))('%s carries its one-line question', (_label, s) => {
    expect(listed.find(([label]) => label === s.label)?.[1].replace(/&#x27;/g, "'")).toBe(s.question)
  })
})
