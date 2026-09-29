import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONTACT_EMAIL } from './legal'

// Finish-list item 12 (29 Sep 2026): the legal pages printed a personal Gmail
// address, and Privacy's processor list left out the transcription service the
// pipeline has used first since 9 Sep.
const page = (p: string) => readFileSync(new URL(`../app/site/${p}/page.tsx`, import.meta.url), 'utf8')

describe('the legal pages’ contact', () => {
  it('is the Verbatim mailbox, on both pages, and no personal address is left', () => {
    expect(CONTACT_EMAIL).toBe('heinrichviljoen@verbatimintel.com')
    for (const p of ['terms', 'privacy']) {
      const src = page(p)
      expect(src).toContain('CONTACT_EMAIL')
      expect(src).not.toMatch(/@gmail\.com/)
    }
  })

  it('names AssemblyAI among the processors', () => {
    expect(page('privacy')).toMatch(/AssemblyAI \(speech-to-text\)/)
  })
})
