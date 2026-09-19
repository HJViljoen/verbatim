import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { QUARTERLY_RULE, QUARTERLY_BLOCK_KEYS } from '@/lib/reports/quarterly'
import { isQuarterlyData } from '@/lib/reports/quarterly-build'
import { renderQuarterlyEmail, QUARTERLY_IMAGE_BLOCKS } from '@/lib/email/quarterly'
import { QUARTERLY_CANVAS_GUTTER, QUARTERLY_CARD_WIDTH, QUARTERLY_EMAIL_KEYS, QUARTERLY_EMAIL_WIDTH } from '@/components/email/quarterly'
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
    expect(text).toContain('None of this review’s sections can be drawn here')
    // IN THE READER'S WORDS. This sheet goes to a client's board; "this build"
    // and "block" are the calibration's own pipeline jargon, and the
    // calibrated sentence for the neighbouring fact sits in the same
    // expression (`staleQuarterlySnapshot`).
    expect(text).not.toContain('this build')
  })

  it('prints a sentence, not a stack trace, over a snapshot written before block D', () => {
    // `quarterly-build.ts` existed at 017fc6e, so a v1 row can be in
    // `report_snapshots` — and `reading.rivals.saidAbout` is `.filter`ed three
    // components in. The deck asks before it dereferences anything.
    const text = renderText(<QuarterlyDeck data={{ ...snapshot, version: 1 }} date="16 Sep 2026" />)
    expect(text).toContain('older version of Verbatim')
    expect(text).not.toContain(snapshot.reading.cover.stamp)
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

  // A share link is opened by someone with no account and no support channel.
  it('answers a pre-block-D snapshot with the sentence, and still names the review', () => {
    const text = renderText(<QuarterlyShareShell data={{ ...snapshot, version: 1 }} appUrl={APP} />)
    expect(text).toContain(snapshot.title)
    expect(text).toContain('older version of Verbatim')
    expect(text).not.toContain(QUARTERLY_RULE)
  })
})

describe('the email', () => {
  const email = renderQuarterlyEmail({ data: snapshot, shareUrl: `${APP}/r/tok`, appUrl: APP, attached: true })

  it('takes its subject from the frozen reading, not from the clock', () => {
    expect(email.subject).toBe(snapshot.subject)
  })

  // An email cannot be recalled: a send over a row this build cannot redraw
  // carries the sentence and the link rather than failing the render.
  it('carries the sentence and no pages over a pre-block-D snapshot', () => {
    const old = renderQuarterlyEmail({ data: { ...snapshot, version: 1 }, shareUrl: `${APP}/r/tok`, appUrl: APP, attached: true })
    expect(old.subject).toBe(snapshot.subject)
    expect(old.html).toContain('older version of Verbatim')
    expect(old.html).toContain('Open the full review')
    expect(old.html).not.toContain('The PDF is attached.')
    expect(old.html).not.toContain(snapshot.reading.cover.stamp)
  })

  it('carries the cover and the read, and says where the other six are', () => {
    expect(QUARTERLY_EMAIL_KEYS).toEqual(['quarterly.cover', 'quarterly.read'])
    expect(email.html).toContain('the other 6')
    expect(email.html).toContain('Open the full review')
    expect(email.html).toContain('The PDF is attached.')
  })

  it('names the pages it is not carrying FROM the arrangement, not from fixed text', () => {
    // A stored arrangement of four keys used to read "the other 1 — your
    // subjects, the category, the rivals, your moves, how the quarter was read
    // and what we could not settle — are in the review itself."
    const four = renderQuarterlyEmail({
      data: { ...snapshot, keys: ['quarterly.cover', 'quarterly.read', 'quarterly.subjects', 'quarterly.method'] },
      shareUrl: null,
      appUrl: APP,
      attached: false,
    })
    expect(four.html).toContain('the other 2 — your subjects and how the quarter was read — are in the review itself')
    expect(four.html).not.toContain('the rivals')
    const three = renderQuarterlyEmail({
      data: { ...snapshot, keys: ['quarterly.cover', 'quarterly.read', 'quarterly.unsettled'] },
      shareUrl: null,
      appUrl: APP,
      attached: false,
    })
    expect(three.html).toContain('the other one — what we could not settle — is in the review itself')
  })

  // AND IT NAMES THE PAGES IT IS CARRYING, for the same reason. "the first 2
  // pages" is true only of an arrangement that happens to store the cover and
  // the read first; one that stored the cover third described itself wrongly.
  it('names the pages it IS carrying, whatever position the arrangement gave them', () => {
    expect(email.html).toContain('This note carries the quarter and our read')
    expect(email.html).not.toContain('the first 2 pages')
    const reordered = renderQuarterlyEmail({
      data: { ...snapshot, keys: ['quarterly.subjects', 'quarterly.method', 'quarterly.cover'] },
      shareUrl: null,
      appUrl: APP,
      attached: false,
    })
    expect(reordered.html).toContain('This note carries the quarter;')
    expect(reordered.html).not.toContain('the first 1 pages')
  })

  it('is table markup at the artefact width, with no class and no CSS variable', () => {
    // THE CARD IS 600 ON A 20px GUTTER, and 640 is their sum. This asserted
    // the sum and the card carried it, so every measured line ran 40px longer
    // than the column the type ramp was set for — `monthly` and `weekly` both
    // split theirs and weekly's docblock hands this one over by name. The
    // markup carries the two; `QUARTERLY_EMAIL_WIDTH` is still the outer
    // figure and is still what this artefact is 640 wide by.
    expect(QUARTERLY_EMAIL_WIDTH).toBe(640)
    expect(email.html).toContain(`max-width:${QUARTERLY_CARD_WIDTH}px`)
    expect(email.html).toContain(`padding:${QUARTERLY_CANVAS_GUTTER}px ${QUARTERLY_CANVAS_GUTTER}px 24px`)
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
