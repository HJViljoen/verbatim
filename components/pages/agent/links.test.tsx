import { describe, expect, it } from 'vitest'

import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { namedObjects } from '@/lib/agent/answer'
import { objectReading, type MarketPoint } from '@/lib/agent/movement'
import { sentQuestion } from '@/lib/agent/scope'
import { starterQuestions } from '@/lib/agent/starters'
import { readCalibration } from '@/lib/subjects/calibration-state'
import { marketTrail } from '@/lib/pages/subjects'
import { pairOn } from '@/lib/reading/pairs'
import { sealandJudge } from '@/lib/test/sealand-pairs'
import { subjectsSubject } from '@/components/pages/subjects/subject'
import { marketSubjectsFixture } from '@/components/pages/subjects/fixture'
import { voiceTheme } from '@/components/pages/voice-surface/theme'
import { ossurVoiceFixture, voiceFixture } from '@/components/pages/voice-surface/fixture'
import { AboutReadings } from './answer'

// WP3.9 END TO END: "Ask about this" on Subjects and on Conversation, from the
// link each page draws to what Ask reads off it.
//
//   the page's link → `?ask=` → the Ask index's `sentQuestion` (the box's
//   first value) → the question's own words (`namedObjects`) → the named
//   object's reading on the market → the "In your market" block
//
// Real figures: Sealand's September on staging, 27 Sep. The Subjects fixture
// is Looks & style at 103 of 654 (38 of 377 in August), the figure the probe
// read off staging for both the Subjects pane and Ask's reader; the frame's
// subjects and rivals are staging's.

const ctx = blockContext('', EMAIL)
const ON_2_OCT = '2026-10-02T06:00:00.000Z'
const judge = pairOn(sealandJudge(ON_2_OCT))

/** Sealand's frame on staging: its active subjects with their state, and the
 *  seven tracked brands (ids stand in for the competitor rows). */
const FRAME = {
  subjects: [
    { id: 's-water', name: 'Waterproofing', calibration: 'ready' as const },
    { id: 's-repair', name: 'Repair & warranty', calibration: 'failed' as const },
    { id: 's-looks', name: 'Looks & style', calibration: 'ready' as const },
    { id: 's-durability', name: 'Durability', calibration: 'ready' as const },
    { id: 's-price', name: 'Price', calibration: 'ready' as const },
    { id: 's-comfort', name: 'Comfort', calibration: 'ready' as const },
    { id: 's-community', name: 'Community & purpose', calibration: 'provisional' as const },
  ],
  rivals: ['Cotopaxi', 'Freedom of Movement', 'Freitag', 'Old School', 'Patagonia', 'Rareform', 'The North Face'].map((name) => ({ id: `c-${name}`, name })),
}

/** The one Ask link a block draws, as the Ask index reads it. */
function askedFrom(markup: string): string {
  const hrefs = [...markup.matchAll(/href="([^"]*\/dashboard\/agent\?[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
  expect(hrefs).toHaveLength(1)
  const url = new URL(hrefs[0], 'https://app.verbatimintel.com')
  expect(url.pathname).toBe('/dashboard/agent')
  const q = sentQuestion(url.searchParams.getAll('ask'))
  expect(q).toBeDefined()
  return q as string
}

describe('Subjects: "Ask about this" lands on the subject’s own figure and trail', () => {
  const data = marketSubjectsFixture()
  const pane = data.selected!
  const question = askedFrom(render(subjectsSubject.render(data, 'app', ctx)))

  it('sends the question Ask’s own starter card writes for the same subject', () => {
    expect(question).toBe('What does my market say about Looks & style?')
    const starters = starterQuestions({ subjects: [{ label: pane.name, calibration: readCalibration(pane.calibration), market: pane.market, makerShare: null }] })
    expect(starters.map((s) => s.question)).toContain(question)
  })

  it('names that subject and nothing else', () => {
    expect(namedObjects(question, FRAME)).toEqual([{ kind: 'subject', id: 's-looks', label: 'Looks & style', calibration: 'ready' }])
  })

  it('reads the pane’s own number: 103 of 654, and neither prints the refused August beside it', () => {
    const [object] = namedObjects(question, FRAME)
    const points: MarketPoint[] = (pane.marketLine?.points ?? []).map((p) => ({ month: p.month, k: p.k, n: p.videos }))
    const reading = objectReading({ object, points }, '2026-09-01', judge, ON_2_OCT)
    expect(reading.curr).toEqual({ month: '2026-09-01', k: pane.market?.k, n: pane.market?.n })
    const paneText = renderText(subjectsSubject.render(data, 'app', ctx)).replace(/\s+/g, ' ')
    // T0a (the one condition): the Aug→Sep pair is refused on both surfaces,
    // so the trail is September's level alone ("Aug 10% of 377 · Sep 16% of
    // 654" was the comparison the judge refused), with no sentence about it.
    const trail = marketTrail(pane.marketLine).map((t) => `${t.month === '2026-08-01' ? 'Aug' : 'Sep'} ${t.text} ${t.of}`).join(' · ')
    expect(trail).toBe('Sep 16% of 654')
    expect(paneText).toContain(trail)
    expect(paneText).not.toContain('of 377')
    const askText = renderText(<AboutReadings readings={[reading]} />).replace(/\s+/g, ' ')
    expect(askText).toContain('103 of 654 videos')
    expect(askText).not.toContain('of 377')
    expect(askText).not.toContain('Not read as a change')
    expect(askText).not.toMatch(/\bmoved\b/)
    assertCopyContract(<AboutReadings readings={[reading]} />)
  })
})

describe('Conversation: "Ask about this" asks what Ask’s own starter asks about the theme', () => {
  it('Sealand’s lead, "Price and sale questions": the lead’s starter card, word for word', () => {
    const data = voiceFixture()
    const question = askedFrom(render(voiceTheme.render(data, 'app', ctx)))
    expect(question).toBe('What does my market say about price and sale?')
    const lead = data.board.rows.find((r) => r.registryId === data.theme.id)!
    const starters = starterQuestions({ hero: { kind: 'themes', lead } as never })
    expect(starters.map((s) => s.question)).toEqual([question])
    // Price is a name, read wherever it stands; nothing names a kind.
    expect(namedObjects(question, FRAME)).toEqual([{ kind: 'subject', id: 's-price', label: 'Price', calibration: 'ready' }])
  })

  it('Össur’s lead names nothing on its own market, and no month', () => {
    const question = askedFrom(render(voiceTheme.render(ossurVoiceFixture(), 'app', ctx)))
    expect(question).toMatch(/^What does my market (ask|say) about [^?]+\?$/)
    expect(question).not.toMatch(/September|August|this month/)
    expect(namedObjects(question, { subjects: [], rivals: [{ id: 'c-ottobock', name: 'Ottobock' }] })).toEqual([])
  })
})
