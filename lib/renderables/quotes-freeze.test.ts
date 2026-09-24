import { describe, expect, it } from 'vitest'
import { collectQuoteRefs, freezeQuotes, isQuote, parseRef, quoteRef, resolveQuotes } from './quotes-freeze'
import { BRIEF_SURFACES, type BriefSurface } from '../reports/documents/sections'
import { overviewFixture } from '../../components/pages/overview/fixture'
import { subjectsFixture } from '../../components/pages/subjects/fixture'
import { voiceFixture } from '../../components/pages/voice-surface/fixture'
import { marketFixture } from '../../components/pages/market-surface/fixture'
import { competitiveFixture } from '../../components/pages/competitive-surface/fixture'
import { contentBriefFixture } from '../../components/blocks/content-brief/fixture'

const data = {
  title: 'Dashboard',
  count: 3,
  brief: {
    lead: { ref: 'e:aaa', text: 'first voice' },
    voices: [
      { ref: 'e:bbb', text: 'second voice' },
      { ref: 'c:ccc', text: 'third voice' },
    ],
  },
  items: [
    { id: 'x', quotes: [{ ref: 'v:vid', text: 'transcript line' }], notAQuote: { ref: 'nope', text: 'keep' } },
  ],
  nothing: null,
  when: 'later',
}

describe('quote freeze / resolve', () => {
  it('recognises quotes only by prefixed ref + text', () => {
    expect(isQuote({ ref: 'e:1', text: 'x' })).toBe(true)
    expect(isQuote({ ref: 'c:1', text: '' })).toBe(true)
    expect(isQuote({ ref: 'nope', text: 'x' })).toBe(false)
    expect(isQuote({ ref: 'e:1' })).toBe(false)
    expect(isQuote([{ ref: 'e:1', text: 'x' }])).toBe(false)
    expect(isQuote('e:1')).toBe(false)
  })

  it('freezes text to empty and collects distinct refs, leaving everything else intact', () => {
    const { data: frozen, refs } = freezeQuotes(data)
    expect(refs.sort()).toEqual(['c:ccc', 'e:aaa', 'e:bbb', 'v:vid'])
    expect(frozen.brief.lead).toEqual({ ref: 'e:aaa', text: '' })
    expect(frozen.brief.voices.map((q) => q.text)).toEqual(['', ''])
    expect(frozen.items[0].quotes[0]).toEqual({ ref: 'v:vid', text: '' })
    expect(frozen.items[0].notAQuote).toEqual({ ref: 'nope', text: 'keep' })
    expect(frozen.count).toBe(3)
    expect(frozen.nothing).toBeNull()
    // The original is untouched.
    expect(data.brief.lead.text).toBe('first voice')
  })

  it('resolves text back and drops what no longer resolves', () => {
    const { data: frozen } = freezeQuotes(data)
    const texts = new Map([
      ['e:aaa', 'first voice'],
      ['e:bbb', 'second voice'],
      // c:ccc erased; v:vid erased
    ])
    const thawed = resolveQuotes(frozen, texts)
    expect(thawed.brief.lead).toEqual({ ref: 'e:aaa', text: 'first voice' })
    expect(thawed.brief.voices).toEqual([{ ref: 'e:bbb', text: 'second voice' }])
    expect(thawed.items[0].quotes).toEqual([])
    expect(thawed.items[0].notAQuote).toEqual({ ref: 'nope', text: 'keep' })
  })

  it('nulls a standalone quote that does not resolve', () => {
    const { data: frozen } = freezeQuotes({ lead: { ref: 'e:gone', text: 'x' } })
    expect(resolveQuotes(frozen, new Map())).toEqual({ lead: null })
  })

  it('freeze → resolve with every ref present is the identity', () => {
    const { data: frozen } = freezeQuotes(data)
    const texts = new Map<string, string>()
    for (const ref of collectQuoteRefs(data)) {
      // gather the original text by ref
      const find = (n: unknown): string | undefined => {
        if (isQuote(n)) return n.ref === ref ? n.text : undefined
        if (Array.isArray(n)) for (const i of n) { const t = find(i); if (t) return t }
        else if (n && typeof n === 'object') for (const v of Object.values(n)) { const t = find(v); if (t) return t }
        return undefined
      }
      texts.set(ref, find(data)!)
    }
    expect(resolveQuotes(frozen, texts)).toEqual(data)
  })

  it('builds and parses refs', () => {
    expect(quoteRef.evidence('1')).toBe('e:1')
    expect(parseRef('c:abc')).toEqual({ kind: 'c', id: 'abc' })
    expect(parseRef('x:abc')).toBeNull()
    expect(quoteRef.hero('recommendations', 'r1')).toBe('h:recommendations:r1')
    expect(parseRef('h:recommendations:r1')).toEqual({ kind: 'h', table: 'recommendations', id: 'r1' })
    expect(isQuote({ ref: 'h:recommendations:r1', text: 'x' })).toBe(true)
    expect(isQuote({ ref: 'h:r1', text: 'x' })).toBe(false)
    expect(quoteRef.brandVoice('run-1', 2)).toBe('b:run-1:2')
    expect(parseRef('b:run-1:2')).toEqual({ kind: 'b', runId: 'run-1', index: 2 })
    expect(isQuote({ ref: 'b:run-1:2', text: 'x' })).toBe(true)
    expect(isQuote({ ref: 'b:run-1:x', text: 'x' })).toBe(false)
    expect(quoteRef.message('c9')).toBe('m:c9')
    expect(parseRef('m:c9')).toEqual({ kind: 'm', id: 'c9' })
    expect(isQuote({ ref: 'm:c9', text: 'x' })).toBe(true)
    expect(quoteRef.phrase('ls1')).toBe('p:ls1')
    expect(isQuote({ ref: 'p:ls1', text: 'x' })).toBe(true)
    // A claim SPOKEN on a post — the speaker's own words off their transcript,
    // which is why it cannot ride on `v:` (that resolves to a commenter's
    // excerpt on the video, so a frozen claim would come back as a stranger's
    // comment attributed to the brand).
    expect(quoteRef.claim('vc1')).toBe('k:vc1')
    expect(parseRef('k:vc1')).toEqual({ kind: 'k', id: 'vc1' })
    expect(isQuote({ ref: 'k:vc1', text: 'x' })).toBe(true)
    // The TEXT ON SCREEN in a video — `videos.ocr_text` by the video's uuid.
    // `k:`'s case and not a commenter's, and it cannot ride on `v:` for
    // `k:`'s reason. Added Block D wave 2 and asserted here in wave 3, at
    // `pipeline`'s request: its own fix named this kind in `citedEvidenceIds`
    // arm (c) and in AGENTS.md, and neither of those two files can carry the
    // assertion.
    expect(quoteRef.onScreen('v1')).toBe('t:v1')
    expect(parseRef('t:v1')).toEqual({ kind: 't', id: 'v1' })
    expect(isQuote({ ref: 't:v1', text: 'x' })).toBe(true)
  })
})

// ---- Item 8: the reading that travels with a quote (2026-09-18) ------------

// The freeze contract with item 8's two extra fields (2026-09-18). The rule the
// module has always kept — a stored artefact holds ids, never words — now has a
// second word-bearing field to keep out.

const quote = (ref: string, text: string, extra: Record<string, unknown> = {}) => ({ ref, text, ...extra })

describe('freezeQuotes strips the English rendering with the original', () => {
  it('leaves no trace of either in the frozen data', () => {
    const data = {
      cards: [quote('e:ev1', 'Me encanta esta pierna', { lang: 'es', english: 'I love this leg' })],
    }
    const { data: frozen, refs } = freezeQuotes(data)
    expect(refs).toEqual(['e:ev1'])
    expect(JSON.stringify(frozen)).not.toContain('I love this leg')
    expect(JSON.stringify(frozen)).not.toContain('Me encanta')
    expect(frozen.cards[0]).toEqual({ ref: 'e:ev1', text: '' })
  })

  it('drops the language label too — a label on words nobody can see says something about a person nobody can check', () => {
    const { data: frozen } = freezeQuotes({ q: quote('c:c1', 'hola', { lang: 'es' }) })
    expect('lang' in (frozen.q as object)).toBe(false)
  })

  it('keeps every other field a surface hung on the quote', () => {
    const { data: frozen } = freezeQuotes({ q: quote('e:ev1', 'hola', { lang: 'es', english: 'hello', platform: 'youtube' }) })
    expect(frozen.q).toEqual({ ref: 'e:ev1', text: '', platform: 'youtube' })
  })
})

describe('resolveQuotes puts back both', () => {
  it('accepts a bare string, as every caller before item 8 passed', () => {
    const { data: frozen } = freezeQuotes({ q: quote('e:ev1', 'hello') })
    expect(resolveQuotes(frozen, new Map([['e:ev1', 'hello']]))).toEqual({ q: { ref: 'e:ev1', text: 'hello' } })
  })

  it('accepts a resolution and re-attaches the reading', () => {
    const { data: frozen } = freezeQuotes({ q: quote('e:ev1', 'Me encanta esta pierna', { lang: 'es', english: 'I love this leg' }) })
    expect(resolveQuotes(frozen, new Map([['e:ev1', { text: 'Me encanta esta pierna', lang: 'es', english: 'I love this leg' }]])))
      .toEqual({ q: { ref: 'e:ev1', text: 'Me encanta esta pierna', lang: 'es', english: 'I love this leg' } })
  })

  it('renders the original alone when the cache has no reading for it', () => {
    const { data: frozen } = freezeQuotes({ q: quote('e:ev1', 'hola') })
    expect(resolveQuotes(frozen, new Map([['e:ev1', { text: 'hola' }]]))).toEqual({ q: { ref: 'e:ev1', text: 'hola' } })
  })

  it('records an English verdict as english: null, which is not the same as unread', () => {
    const { data: frozen } = freezeQuotes({ q: quote('e:ev1', 'it works') })
    const out = resolveQuotes(frozen, new Map([['e:ev1', { text: 'it works', lang: 'en', english: null }]])) as { q: { lang?: string; english?: string | null } }
    expect(out.q.lang).toBe('en')
    expect(out.q.english).toBeNull()
  })

  it('drops a quote whose original no longer resolves, rendering or not', () => {
    const { data: frozen } = freezeQuotes({ list: [quote('e:ev1', 'kept'), quote('e:ev2', 'erased')] })
    const out = resolveQuotes(frozen, new Map([
      ['e:ev1', { text: 'kept', lang: 'es', english: 'kept, in English' }],
      ['e:ev2', { text: '', lang: 'es', english: 'the rendering outlived the words' }],
    ])) as { list: unknown[] }
    expect(out.list).toHaveLength(1)
  })
})

describe('the structural recogniser', () => {
  it('still recognises a quote that has grown fields', () => {
    expect(isQuote({ ref: 'e:1', text: 'x', lang: 'es', english: 'y' })).toBe(true)
    expect(isQuote({ ref: 'nope', text: 'x' })).toBe(false)
  })

  it('collects refs from quotes carrying a reading', () => {
    expect(collectQuoteRefs({ a: quote('e:1', 'x', { lang: 'es' }), b: quote('c:2', 'y') }).sort()).toEqual(['c:2', 'e:1'])
  })
})

// ---- Every surface a snapshot can hold (Block D wave 3, V1) ---------------

// WHAT A STORED ARTEFACT IS ALLOWED TO HOLD, PINNED ONCE FOR ALL OF THEM.
//
// `components/pages/overview/page.test.tsx` pins this for Overview alone. It
// was written because two Overview fields carried a speaker's words as BARE
// STRINGS: `freezeQuotes` recognises a quote STRUCTURALLY, so a bare string is
// neither emptied nor collected into `report_snapshots.evidence_ids` — the
// column the erasure sweep searches. Those words are then served by
// `/r/<token>` and survive the deletion of the row they came from, which is
// the one thing the share shell's header promises cannot happen.
//
// Voice had the identical defect in the identical wave and was left out of
// that pin, so it is generalised here rather than copied a third time. Every
// surface a BRIEF can freeze reaches `report_snapshots.data` through
// `lib/reports/documents/load-reading.ts` → `composeDocument` →
// `createSnapshot` → `freezeQuotes`, and `BRIEF_SURFACES` is that list —
// asserted below, so a surface cannot join it without a row here.
//
// THE CHECK IS ON THE FIELD NAME, WHICH IS WHY IT NEEDS NO PER-SURFACE
// KNOWLEDGE. A field holding a person's words is indistinguishable at runtime
// from a field holding the product's own sentence — unless it says what it is,
// and these do: `quote`, `quotes`, `quoteOnScreen`, `onScreen`, `spoken`,
// `phrase`. So the walk finds every such key at any depth and requires its
// value to be a `Quote` (or a list of them, or null) and never a string. A
// key that is metadata ABOUT a quote — `quoteCite`, `quoteCites`,
// `quotePlatforms`, `quotesOf`, `quoteRef` — does not end in one of the words
// and is not matched, which is the whole reason the rule is on the suffix.
// Had this existed, `quoteOnScreen: (string | null)[]` would have failed the
// day it was written.

/** Keys whose value is a person's WORDS, by the name the field gave itself.
 *
 *  Matched on the key's LAST WORD, camelCase and snake_case normalised to one
 *  form — `quoteOnScreen` and `hero_quote` are speech, `quoteCites`,
 *  `quotePlatforms`, `quotesOf` and `quoteRef` are facts about it. Anchoring
 *  the suffix is the whole rule: it is what lets a field say what it holds
 *  without the test being told anything about the surface. */
const SPEECH_KEY = /(^|_)(quote|quotes|on_screen|spoken|said|phrase|phrases)$/
const speechKey = (key: string): boolean =>
  SPEECH_KEY.test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())

/** One field that names itself as speech and does not carry a ref. */
interface Unreffed { key: string; text: string }

/** Every speech-named field whose words are NOT a `Quote`, at any depth. */
function unreffedSpeech(node: unknown, key = '', out: Unreffed[] = []): Unreffed[] {
  if (Array.isArray(node)) {
    for (const n of node) unreffedSpeech(n, key, out)
    return out
  }
  if (typeof node === 'string') {
    if (speechKey(key) && node.trim()) out.push({ key, text: node })
    return out
  }
  if (node && typeof node === 'object') {
    if (isQuote(node)) return out
    const o = node as Record<string, unknown>
    // An object sitting in a speech-named slot that carries `text` and is not a
    // Quote is the same defect wearing a wrapper — `{ text, cite, href }`.
    if (speechKey(key) && typeof o.text === 'string' && o.text.trim()) {
      out.push({ key, text: o.text })
    }
    for (const k of Object.keys(o)) unreffedSpeech(o[k], k, out)
    return out
  }
  return out
}

/** Every quote's words, by the module's own structural recogniser. */
function spoken(node: unknown, out: string[] = []): string[] {
  if (isQuote(node)) { if (node.text.trim()) out.push(node.text); return out }
  if (Array.isArray(node)) for (const n of node) spoken(n, out)
  else if (node && typeof node === 'object') for (const v of Object.values(node)) spoken(v, out)
  return out
}

/** Every string in a structure, however deep. */
function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) for (const n of node) strings(n, out)
  else if (node && typeof node === 'object') for (const v of Object.values(node)) strings(v, out)
  return out
}

const SURFACES: Record<BriefSurface, {
  data: () => unknown
  /** Speech-named fields that carry no ref — each one a hole, each one named.
   *  Asserted to be STILL BROKEN, so the day one is fixed this test fails and
   *  its entry has to go: an exemption that passes once it is fixed is an
   *  exemption nobody removes. */
  unreffed: string[]
  /** The one surface that quotes nobody. Declared, never inferred. */
  quoteless?: true
}> = {
  overview: { data: overviewFixture, unreffed: [] },
  subjects: { data: subjectsFixture, unreffed: [] },
  voice: {
    data: voiceFixture,
    // OPEN, AND HANDED TO `pipeline`. `ThemeBlock.spoken` is the head of a
    // supporting video's TRANSCRIPT, and `videos.transcript` has no ref kind:
    // `t:` resolves `ocr_text`, `k:` a `video_claims` row, `v:` a COMMENTER's
    // excerpt on that video — resolving a transcript under any of them hands
    // back different words in the speaker's place. A sixth kind closes it and
    // AGENTS.md reserves that: a new kind joins `citedEvidenceIds`'s arm (c)
    // or a protected class, never neither, and both live in
    // `inngest/functions/pipeline.ts`. Block D wave 3 fixed the two OCR fields
    // beside it (`quoteOnScreen`, `onScreen`) and could not fix this one.
    unreffed: ['spoken'],
  },
  market: { data: marketFixture, unreffed: [] },
  competitive: { data: competitiveFixture, unreffed: [] },
  content: {
    data: contentBriefFixture,
    unreffed: [],
    // `ContentBriefData` is the playbook slide and the record slide — counts
    // and the product's own sentences, no voices. The day it carries one this
    // flag has to come off, which is the point of stating it.
    quoteless: true,
  },
}

describe('a snapshot of any surface a brief can freeze', () => {
  it('has a row here for every one of them, so a new surface cannot join in silence', () => {
    expect(Object.keys(SURFACES).sort()).toEqual([...BRIEF_SURFACES].sort())
  })

  it.each([...BRIEF_SURFACES])('%s: every field that names itself as speech carries a ref', (key) => {
    const found = unreffedSpeech(SURFACES[key].data()).map((u) => u.key)
    expect([...new Set(found)].sort(), `${key} carries a speaker's words with no ref to freeze them under`)
      .toEqual([...new Set(SURFACES[key].unreffed)].sort())
  })

  it.each([...BRIEF_SURFACES])('%s: no spoken sentence survives the freeze, and every one is addressable', (key) => {
    const data = SURFACES[key].data()
    const said = spoken(data)
    // A populated fixture with no voices in it is a fixture this cannot be
    // checked with, so each surface says which it is rather than the test
    // quietly checking nothing.
    expect(said.length > 0, `${key}: SURFACES says quoteless=${Boolean(SURFACES[key].quoteless)} and the fixture carries ${said.length} quotes`)
      .toBe(!SURFACES[key].quoteless)

    const { data: frozen, refs } = freezeQuotes(data)
    const text = strings(frozen).join(' | ')
    for (const s of said) expect(text, `${key} kept a speaker's words in the frozen data`).not.toContain(s)
    expect(refs.length, `${key} froze fewer refs than it had voices`).toBeGreaterThanOrEqual(new Set(said).size)
  })
})
