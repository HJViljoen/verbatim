import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { buildQuestions, type ClaimSubjects, type MarketSurfaceData } from '@/lib/pages/market-surface'
import { headlineParts, marketLine as readLine, partsText, supportParts } from '@/lib/pages/market-line'
import { marketLine } from './line'
import { marketFixture, ossurMovesFixture, sealandMovesFixture, unrecordedFixture } from './fixture'

// In one line, on real months. Sealand's September is plan §2.2's production
// print (airline bag sizes 21 · buying and shipping 20 · bag materials 11, of
// 626 category videos); the claims by subject are the approved preview's
// staging line (120 claims read to date: 45 material origin, 33 community, 13
// local or handmade, 7 durability, 0 waterproofing); Össur's September is
// staging's (prosthetic function 28, price and availability 14, of 338; no
// maker rule).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

const words = (data: MarketSurfaceData) => {
  const line = readLine(data)
  return line ? { head: partsText(headlineParts(line)), support: partsText(supportParts(line)) } : null
}

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

const filed = (): MarketSurfaceData => {
  const data = sealandMovesFixture()
  return { ...data, ways: { ...data.ways, claimSubjects: PREVIEW_CLAIMS } }
}

describe('In one line: the words', () => {
  it('says what Sealand’s market asked most in September, and that no move is dated yet (the preview’s words)', () => {
    expect(words(sealandMovesFixture())).toEqual({
      head: 'In September people in the market you sell into asked most about airline bag sizes, buying and shipping, and bag materials. No move is dated yet.',
      support: 'Questions on those three came up in 21, 20 and 11 of the 626 category videos, in themes not led by makers.',
    })
  })

  it('adds what your own posts talk about most once the judge has filed every claim', () => {
    expect(words(filed())?.support).toBe(
      'Questions on those three came up in 21, 20 and 11 of the 626 category videos, in themes not led by makers. '
      + 'Your own posts, read to date, talk most about material origin (45 of your 120 claims) and community (33).',
    )
  })

  it('says nothing about your claims before the judge has filed them (staging: 98 claims, none filed)', () => {
    expect(sealandMovesFixture().ways.claimSubjects?.state).toBe('unchecked')
    expect(words(sealandMovesFixture())?.support).not.toContain('claims')
  })

  it('reads Össur: two question themes, no maker rule, so nothing said about makers', () => {
    expect(words(ossurMovesFixture())).toEqual({
      head: 'In September people in the market you sell into asked most about prosthetic function, and about price and availability. No move is dated yet.',
      support: 'Questions on those two came up in 28 and 14 of the 338 category videos.',
    })
  })

  it('names the latest dated move, and how many are dated', () => {
    // marketFixture's two declared moves: 14 Sep and 12 Aug.
    expect(words(marketFixture())?.head).toMatch(/ Two moves are dated, the latest “Say less about recycling”, 14 Sep\.$/)
    const base = marketFixture()
    expect(words({ ...base, moves: { ...base.moves, rows: base.moves.rows.slice(1) } })?.head)
      .toMatch(/ One move is dated: “Push repairability”, 12 Aug\.$/)
  })

  it('says nothing about moves where moves are not recorded here', () => {
    expect(words(unrecordedFixture())?.head).toBe('In September people in the market you sell into asked most about airline bag sizes, buying and shipping, and bag materials.')
  })

  it('says so where no question reached the floor', () => {
    const base = sealandMovesFixture()
    const quiet = { ...base, questions: buildQuestions({ month: '2026-09-01', themes: [], segments: 'measured', n: 626, brandNames: ['Sealand'], posts: null, subjects: [], filings: null }) }
    expect(words(quiet)).toEqual({ head: 'In September no question asked in the market you sell into reached 10 videos. No move is dated yet.', support: '' })
  })

  it('draws nothing from a copy stored before the questions were read', () => {
    expect(readLine({ ...sealandMovesFixture(), questions: undefined })).toBeNull()
  })
})

describe('In one line: the block', () => {
  const STATES = [sealandMovesFixture(), filed(), ossurMovesFixture(), marketFixture(), unrecordedFixture(), { ...sealandMovesFixture(), questions: undefined }]

  it('keeps the copy contract in every state and mode', () => {
    for (const data of STATES) for (const mode of MODES) assertCopyContract(render(marketLine.render(data, mode, ctx)))
  })

  it('marks each figure, each theme’s words and each move title as its own node', () => {
    const app = render(marketLine.render(filed(), 'app', ctx))
    for (const n of ['21', '20', '11', '626', '45', '120', '33']) expect(app).toContain(`data-copy="figure" class="font-mono font-semibold tabular-nums text-foreground">${n}<`)
    expect(app).toContain('<span data-copy="subject" data-slot="pass_b_theme">airline bag sizes</span>')
    const moved = render(marketLine.render(marketFixture(), 'app', ctx))
    expect(moved).toContain('<span data-copy="quote">Say less about recycling</span>')
  })

  it('is the title alone over the answer, and a link alone under it (25 Sep rulings)', () => {
    const text = renderText(marketLine.render(sealandMovesFixture(), 'app', ctx))
    expect(text.startsWith('In one line In September people in the market you sell into asked most about')).toBe(true)
    expect(text.endsWith('Open Conversation →')).toBe(true)
    // Print has no link to follow.
    expect(renderText(marketLine.render(sealandMovesFixture(), 'print', ctx))).not.toContain('Open Conversation')
  })

  it('sets the answer at the preview’s weight', () => {
    const app = render(marketLine.render(sealandMovesFixture(), 'app', ctx))
    expect(app).toContain('sm:text-[28px]')
    expect(app).toContain('text-[17px] leading-[1.6] text-secondary-foreground')
  })

  it('says why it is empty on a stored copy, and declares no figures of its own', () => {
    const stored = { ...sealandMovesFixture(), questions: undefined }
    expect(renderText(marketLine.render(stored, 'app', ctx))).toContain('In one line is read on this page as it is built today, not on this copy.')
    expect(marketLine.figures?.(filed())).toEqual({})
  })
})
