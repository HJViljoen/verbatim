import { describe, expect, it } from 'vitest'
import { render, renderText, markupText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { DeckSpark, movementLines } from './document-deck'
import type { DocumentSnapshotData } from '@/lib/reports/documents/types'
import type { DeltaVerdict } from '@/lib/report-bands'

// The two things P0 item 7 gave the deck: a series it can draw, and the
// product's own movement badge instead of a sentence writing its own
// direction word.

const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep']

describe('DeckSpark', () => {
  it('draws the line and names both ends of the axis', () => {
    const markup = render(<DeckSpark values={[18, 22, 19, 27]} months={MONTHS} />)
    expect(markup).toContain('<svg')
    const words = markupText(markup)
    expect(words).toContain('Jun')
    expect(words).toContain('Sep')
  })

  // mock-gap §6 D3: a chart is a direction claim too. Two points are a line
  // and not a direction, and a printed page has no hover to ask with.
  it('refuses to draw under three readings and names the months instead', () => {
    const markup = render(<DeckSpark values={[18, 22]} months={['Aug', 'Sep']} />)
    expect(markup).not.toContain('<svg')
    expect(markupText(markup)).toBe('Aug · Sep — too few months to draw a line')
  })

  it('counts READINGS, not slots — a gap is not a reading', () => {
    expect(render(<DeckSpark values={[18, null, null, 27]} months={MONTHS} />)).not.toContain('<svg')
    expect(render(<DeckSpark values={[18, null, 22, 27]} months={MONTHS} />)).toContain('<svg')
  })

  it('draws no direction word of its own', () => {
    assertCopyContract(render(<DeckSpark values={[18, 22, 19, 27]} months={MONTHS} />))
    assertCopyContract(render(<DeckSpark values={[18, 22]} months={['Aug', 'Sep']} />))
  })

  it('prints nothing about an axis it was given none of', () => {
    expect(renderText(<DeckSpark values={[1]} months={[]} />)).toBe('too few months to draw a line')
  })
})

const verdict = (state: DeltaVerdict['state'], change: number): DeltaVerdict =>
  ({ state, change, band: 2.4 } as DeltaVerdict)

const data = (delta: DocumentSnapshotData['delta']): DocumentSnapshotData =>
  ({ delta } as DocumentSnapshotData)

describe('movementLines', () => {
  const moved = data({
    prevRunDate: '2026-09-06',
    sentiment: { now: 27.1, prev: 23.4, verdict: verdict('moved', 3.7), nowJudged: 412, prevJudged: 380 },
    share: { now: { client: 31.2 } as never, prev: { client: 28.0 } as never, verdict: verdict('moved', 3.2) },
    newThemes: { count: 3, labels: ['Durability', 'Fit', 'Price'] },
    conversations: { now: 1388, prev: 1270 },
  })

  // The defect this replaced: "Moved up, 23.4% to 27.1% positive" — a
  // direction word earned from ONE banded comparison (mock-gap §6 D5),
  // hand-written on paper where no badge could contradict it.
  it('states the two levels and claims no direction of its own', () => {
    const lines = movementLines(moved)
    const tone = lines.find((l) => l.label === 'Tone')!
    expect(tone.value).toBe('23.4% to 27.1% positive')
    for (const l of lines) expect(l.value).not.toMatch(/\b(up|down|rose|fell|grew|moved)\b/i)
  })

  it('hands the claim about the difference to the verdict', () => {
    const lines = movementLines(moved)
    expect(lines.find((l) => l.label === 'Tone')!.verdict!.state).toBe('moved')
    expect(lines.find((l) => l.label === 'Share')!.verdict!.state).toBe('moved')
  })

  it('keeps the levels when the comparison refuses — they are measured either way', () => {
    const thin = data({ ...moved.delta!, sentiment: { now: 27.1, prev: 23.4, verdict: verdict('too_little_data', 3.7), nowJudged: 4, prevJudged: 3 } })
    const tone = movementLines(thin).find((l) => l.label === 'Tone')!
    expect(tone.value).toBe('23.4% to 27.1% positive')
    expect(tone.verdict!.state).toBe('too_little_data')
  })

  // Volume is our own gather cadence, not anything about the audience, so it
  // moves on no favourability axis.
  it('carries volume as a count on a neutral axis', () => {
    const vol = movementLines(moved).find((l) => l.label === 'Volume')!
    expect(vol.count).toBe(118)
    expect(vol.good).toBe('neutral')
    expect(vol.verdict).toBeUndefined()
  })

  it('says there is nothing to compare with rather than showing a zero', () => {
    expect(movementLines(data(null))).toEqual([{ label: 'Movement', value: 'No earlier update to compare with.' }])
  })

  it('prints a level nowhere without its evidence', () => {
    for (const l of movementLines(moved)) expect(copyViolations(`<span>${l.value}</span>`)).toEqual([])
  })
})
