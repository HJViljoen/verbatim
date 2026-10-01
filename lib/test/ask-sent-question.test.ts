import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ASK_SENT_MAX, sentQuestion } from '../agent/scope'

// A QUESTION ANOTHER PAGE SENDS REACHES THE BOX, EVERY TIME (WP3.9). Subjects'
// and Conversation's "Ask about this" and Ask's own starter cards all link to
// /dashboard/agent?ask=…, and the box takes the question as its first value
// only (components/agent-composer.tsx). Arriving from another page mounts a
// new box; a starter card is a link to the same page, which re-renders in
// place, so the box kept its old (empty) value and the card's question never
// reached it. The page keys the box by the sent question.

const ROOT = join(__dirname, '..', '..')
const page = readFileSync(join(ROOT, 'app/dashboard/agent/page.tsx'), 'utf8')

describe('the question another page sends to Ask', () => {
  it('is the first value, trimmed and cut to the box, and none when blank', () => {
    expect(sentQuestion('What does my market say about Looks & style?')).toBe('What does my market say about Looks & style?')
    expect(sentQuestion('  What does my market say about Price?  ')).toBe('What does my market say about Price?')
    expect(sentQuestion(['What makes people ready to buy?', 'What does my market wish for?'])).toBe('What makes people ready to buy?')
    expect(sentQuestion('x'.repeat(ASK_SENT_MAX + 40))).toHaveLength(ASK_SENT_MAX)
    expect(sentQuestion('   ')).toBeUndefined()
    expect(sentQuestion(undefined)).toBeUndefined()
    expect(sentQuestion([])).toBeUndefined()
  })

  it('is what the Ask index reads, and it keys the box, so a starter card refills it', () => {
    expect(page).toMatch(/const ask = sentQuestion\(sp\.ask\)/)
    // The Agent's box since the pages rebuild (1 Oct): `AskCard`, keyed the same way.
    expect(page).toMatch(/<AskCard\s+(?:\/\/[^\n]*\n\s*)*key=\{ask \?\? ''\}/)
    // The window switch keeps the question, so it keeps the key and the box.
    expect(page).toMatch(/if \(ask\) q\.set\('ask', ask\)/)
  })
})
