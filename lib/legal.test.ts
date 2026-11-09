import { describe, expect, it } from 'vitest'
import { CONTACT_EMAIL } from './legal'

// Finish-list item 12 (29 Sep 2026): the legal pages printed a personal Gmail
// address. The pages are off the site since 9 Nov 2026 (proxy.ts, LEGAL_OFF),
// and their two source-read cases went with them; the mailbox stays.

describe('the contact mailbox', () => {
  it('is the Verbatim mailbox, not a personal address', () => {
    expect(CONTACT_EMAIL).toBe('heinrichviljoen@verbatimintel.com')
    expect(CONTACT_EMAIL).not.toMatch(/@gmail\.com/)
  })
})
