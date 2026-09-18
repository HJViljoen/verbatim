import { describe, it, expect } from 'vitest'
import { freezeQuotes, collectQuoteRefs } from '@/lib/renderables/quotes-freeze'
import { overviewFixture, refusedFixture, cardFixture } from './fixture'

// WHAT A SNAPSHOT OF OVERVIEW IS ALLOWED TO HOLD (code review C1).
//
// `components/pages/overview/page.tsx` registers `overview` in the page
// catalogue, so `/api/export` now calls `loadOverview` → `createSnapshot` →
// `freezeQuotes`, and everything the loader returns lands in
// `report_snapshots.data` — served by `/r/<token>`, and reachable by the
// erasure sweep only through the refs it collects. `freezeQuotes` recognises a
// quote STRUCTURALLY, so a third party's words carried as a BARE STRING are
// not frozen, are not collected, and are not erasable. Two fields on this page
// were exactly that shape: the card's claim rows (`video_claims`) and each
// voice's on-screen line (`videos.ocr_text`).
//
// This file is the pin. It walks the frozen data as text and asserts that no
// sentence a speaker said survives the freeze — which is a stronger statement
// than "the two fields we fixed are objects now", because it also fails the day
// a third field arrives carrying words with no ref.

/** Every string in a structure, however deep. */
function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) for (const n of node) strings(n, out)
  else if (node && typeof node === 'object') for (const v of Object.values(node)) strings(v, out)
  return out
}

describe('an Overview snapshot', () => {
  it('freezes the card’s claims: the ref travels, the words do not', () => {
    const card = cardFixture()
    const said = card.claimRows.map((r) => r.quote?.text).filter((t): t is string => Boolean(t))
    expect(said.length).toBeGreaterThan(0)

    const { data, refs } = freezeQuotes({ card })
    const text = strings(data).join(' | ')
    for (const s of said) expect(text).not.toContain(s)
    // Each one is reachable by its own `k:<video_claims.id>` ref instead.
    for (const r of card.claimRows) if (r.quote) expect(refs).toContain(r.quote.ref)
  })

  it('freezes each voice’s on-screen line under its video’s ref', () => {
    const data = overviewFixture()
    const onScreen = data.sentence.voices.map((v) => v.onScreen).filter((q): q is NonNullable<typeof q> => Boolean(q))
    expect(onScreen.length).toBeGreaterThan(0)
    for (const q of onScreen) expect(q.ref).toMatch(/^t:/)

    const frozen = freezeQuotes(data)
    const text = strings(frozen.data).join(' | ')
    for (const q of onScreen) {
      expect(text).not.toContain(q.text)
      expect(frozen.refs).toContain(q.ref)
    }
  })

  it('leaves no spoken sentence anywhere in the frozen page', () => {
    const data = overviewFixture()
    // Every quote the populated fixture holds, gathered before the freeze.
    const before = collectQuoteRefs(data)
    expect(before.length).toBeGreaterThan(0)

    const frozen = freezeQuotes(data)
    const text = strings(frozen.data).join(' | ')
    const spoken = [
      ...data.sentence.voices.map((v) => v.quote.text),
      ...data.sentence.voices.flatMap((v) => (v.onScreen ? [v.onScreen.text] : [])),
      ...(data.moves.card?.claimRows ?? []).flatMap((r) => (r.quote ? [r.quote.text] : [])),
    ].filter((t) => t.trim().length > 0)
    expect(spoken.length).toBeGreaterThan(0)
    for (const s of spoken) expect(text).not.toContain(s)
    // And every one of them is still addressable.
    expect(frozen.refs.length).toBeGreaterThanOrEqual(spoken.length)
  })

  it('freezes the refused state without inventing a quote', () => {
    const { refs } = freezeQuotes(refusedFixture())
    expect(refs).toEqual([])
  })
})
