import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { QUARTERLY_RULE, QUARTERLY_BLOCK_KEYS } from '@/lib/reports/quarterly'
import { isQuarterlyData } from '@/lib/reports/quarterly-build'
import { renderQuarterlyEmail, QUARTERLY_IMAGE_BLOCKS } from '@/lib/email/quarterly'
import { QUARTERLY_EMAIL_KEYS, QUARTERLY_EMAIL_WIDTH } from '@/components/email/quarterly'
import { QuarterlyDeck } from '@/components/print/quarterly-deck'
import { QuarterlyShareShell } from '@/components/share/quarterly-share-shell'
import { closedFixture, formingFixture, quarterlySnapshotFixture } from './fixture'

const APP = 'https://app.verbatimintel.com'
const snapshot = quarterlySnapshotFixture()
const forming = quarterlySnapshotFixture(formingFixture())

describe('the deck', () => {
  it('gives every page its own sheet, and counts them', () => {
    const markup = render(<QuarterlyDeck data={snapshot} date="16 Sep 2026" />)
    // A slide is a fixed box with overflow: hidden — two pages on one sheet
    // clips the second in silence, which is what WP17's first weekly deck did.
    expect((markup.match(/vb-slide/g) ?? []).length).toBeGreaterThanOrEqual(QUARTERLY_BLOCK_KEYS.length)
    expect(markup).toContain('8')
  })

  it('prints the rule on every sheet, because a PDF has no masthead to scroll back to', () => {
    const markup = render(<QuarterlyDeck data={snapshot} date="16 Sep 2026" />)
    expect((markup.split(QUARTERLY_RULE).length - 1)).toBeGreaterThanOrEqual(QUARTERLY_BLOCK_KEYS.length)
    // AND IT PRINTS THE WHOLE RULE. On one `truncate` line the clause ellipsed
    // on every sheet was the second sentence — the six-month gate, which is
    // why half the artefact's columns are empty.
    expect(markup).not.toContain('truncate font-mono')
    expect(QUARTERLY_RULE).toContain('six monthly readings stand behind both sides')
  })

  it('says so rather than throwing when it knows none of the stored keys', () => {
    const text = renderText(<QuarterlyDeck data={{ ...snapshot, keys: [] }} date="16 Sep 2026" />)
    expect(text).toContain('names no page this build knows how to draw')
  })

  it('keeps the copy contract on every state', () => {
    for (const data of [snapshot, forming, quarterlySnapshotFixture(closedFixture())]) {
      assertCopyContract(render(<QuarterlyDeck data={data} date="16 Sep 2026" />))
    }
  })
})

describe('the share link', () => {
  it('renders the eight pages in the app’s own mode, with the rule and the freeze note', () => {
    const text = renderText(<QuarterlyShareShell data={snapshot} appUrl={APP} />)
    expect(text).toContain(snapshot.title)
    expect(text).toContain(QUARTERLY_RULE)
    expect(text).toContain('quoted voices read live')
    assertCopyContract(render(<QuarterlyShareShell data={snapshot} appUrl={APP} />))
  })
})

describe('the email', () => {
  const email = renderQuarterlyEmail({ data: snapshot, shareUrl: `${APP}/r/tok`, appUrl: APP, attached: true })

  it('takes its subject from the frozen reading, not from the clock', () => {
    expect(email.subject).toBe(snapshot.subject)
  })

  it('carries the cover and the read, and says where the other six are', () => {
    expect(QUARTERLY_EMAIL_KEYS).toEqual(['quarterly.cover', 'quarterly.read'])
    expect(email.html).toContain('the other 6')
    expect(email.html).toContain('Open the full review')
    expect(email.html).toContain('The PDF is attached.')
  })

  it('is table markup at the artefact width, with no class and no CSS variable', () => {
    expect(email.html).toContain(String(QUARTERLY_EMAIL_WIDTH))
    expect(email.html).not.toMatch(/class="/)
    expect(email.html).not.toMatch(/var\(--/)
    expect(email.html).not.toMatch(/display:\s*(flex|grid)/)
  })

  it('asks the runner for no pictures, so an image-blocking client loses nothing', () => {
    expect(QUARTERLY_IMAGE_BLOCKS).toEqual([])
  })

  it('leaves no unsubstituted figure token, and has a plain-text mirror', () => {
    expect(email.html).not.toMatch(/\[\[[a-z_]+\]\]/)
    expect(email.text.length).toBeGreaterThan(200)
  })

  it('says in the subject line when the workspace’s own side is still forming', () => {
    const thin = renderQuarterlyEmail({ data: forming, shareUrl: null, appUrl: APP, attached: false })
    expect(thin.subject).toContain('your own side is still forming')
    // No share link and no PDF: the footer must not promise either.
    expect(thin.html).not.toContain('Open the full review')
    expect(thin.html).not.toContain('The PDF is attached.')
  })
})

describe('the snapshot', () => {
  it('is a report snapshot told apart by data.kind', () => {
    expect(isQuarterlyData(snapshot)).toBe(true)
    expect(snapshot.keys).toEqual([...QUARTERLY_BLOCK_KEYS])
  })

  it('freezes how many monthly readings stood behind it', () => {
    expect(snapshot.readings).toBe(8)
    expect(forming.readings).toBe(3)
  })
})
