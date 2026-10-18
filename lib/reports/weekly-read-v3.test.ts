import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { fixtureAsked, fixtureContentTop, fixtureMovesTop, fixtureProductsTop, fixtureVoicesTop } from '../pages/v2/home-fixture'
import { TOP_LABELS, topProductsOf } from '../pages/v2/products'
import { PRODUCTS_FIXTURES } from '../pages/v2/products-fixture'
import { fakeDb } from '../test/fake-db'
import { levelOneRead, sealandFlag, sealandRead, sealandUnusual } from '../test/weekly-read-fixture'
import { knee, monthEndRead, ossurRead, sealandOctRead } from '../test/weekly-read-v3-fixture'
import type { StoredLongRun } from '../written/store'
import type { SubjectRead, WeekReadDataV2 } from '../written/types'
import { loadWeeklyReadParts } from './weekly-read-lines-load'
import { ALSO_TALKED, FIRST_TIME, firstSentenceOf, MOST_TALKED, NEW_THIS_WEEK, NOTHING_NEW, PRODUCTS_NAMED, stoodOutOf, weekFigureWords, weeklyV3View } from './weekly-read-v3'
import { contentPart, monthClosePart, movesPart, productsPart, replyDays, streakFigure, subjectsPart, voicesPart } from './weekly-read-v3-build'

// The weekly read, version 3: what a build freezes beside the read, from each
// page's own reader (the Dashboard's tops) and the stored read; and the view
// the renderers read. Pure, offline.

const chip = () => 'Unusual this week'

describe('Voices: the group in the most videos, the brands named most only where they are counted', () => {
  it('the tile\'s group, the other groups by name, the two brands named most unprompted', () => {
    const part = voicesPart(fixtureVoicesTop())!
    expect(part.group).toMatchObject({ name: 'Long-time users upgrading', videos: 86, href: '/dashboard/voices/groups/long-time-users' })
    expect(part.videos).toBe(318)
    expect(part.others).toEqual(['New amputees in their first year', 'Active and athletic users', 'Caregivers and family', 'Clinicians and prosthetists'])
    expect(part.named.map((b) => [b.label, b.k, b.n])).toEqual([['Össur', 41, 318], ['Ottobock', 37, 318]])
    expect(part.monthWords).toBe('October so far')
    expect(part.monthLabel).toBeNull()
  })
  it('brands not counted (Össur today): no brand at all, the group still prints', () => {
    const part = voicesPart(fixtureVoicesTop({ named: false }))!
    expect(part.named).toEqual([])
    expect(part.group?.name).toBe('Long-time users upgrading')
    // Counted but the state is not ready: none either.
    expect(voicesPart({ ...fixtureVoicesTop(), brandsState: 'unread' })!.named).toEqual([])
  })
  it('a whole-month reading of another month carries its label (decision 3)', () => {
    expect(voicesPart(fixtureVoicesTop({ september: true }))).toMatchObject({ month: '2026-09-01', monthWords: 'September', monthLabel: 'the last full month' })
  })
  it('no group, an unread one or none with videos: no part', () => {
    expect(voicesPart(null)).toBeNull()
    expect(voicesPart({ ...fixtureVoicesTop(), group: null })).toBeNull()
    expect(voicesPart({ ...fixtureVoicesTop(), groupsState: 'unread' })).toBeNull()
  })
})

describe('Your products: how many came up, up to five with their categories, the shelf\'s first-time mark', () => {
  it('from the page\'s own shelf, most videos first, each with its category and its page, the categories after', () => {
    const d = PRODUCTS_FIXTURES.ossur()
    const top = topProductsOf(d, d.standouts.filter((s) => s.kind === 'first') as never)
    const part = productsPart(top)!
    expect(part.cameUp).toBe(d.header!.cameUp)
    expect(part.products).toBe(d.header!.products)
    expect(part.videos).toBe(d.header!.videos)
    expect(part.month).toBe(d.month)
    expect(part.top.length).toBeLessThanOrEqual(PRODUCTS_NAMED)
    expect(part.top.length).toBeGreaterThan(0)
    const shelf = d.shelf.flatMap((c) => c.products.map((p) => ({ ...p, category: c.name })))
    for (const p of part.top) {
      const on = shelf.find((s) => s.id === p.id)!
      // The same product, videos and page as the shelf; the mark is the
      // shelf's own first-month flag.
      expect([p.name, p.category, p.videos, p.href, p.first]).toEqual([on.name, on.category, on.videos, on.href, on.flag != null])
    }
    for (let i = 1; i < part.top.length; i++) expect(part.top[i].videos).toBeLessThanOrEqual(part.top[i - 1].videos)
    expect(part.categories.map((c) => c.videos)).toEqual([...part.categories.map((c) => c.videos)].sort((a, b) => b - a))
    // The top five are the five with the most videos on the whole shelf.
    const most = shelf.filter((s) => (s.videos ?? 0) > 0).map((s) => s.videos as number).sort((a, b) => b - a).slice(0, PRODUCTS_NAMED)
    expect(part.top.map((p) => p.videos)).toEqual(most)
  })
  it('switched off (Sealand, and Össur until it is on), unread, failed, no catalogue: no part, no placeholder', () => {
    expect(productsPart(topProductsOf(PRODUCTS_FIXTURES['not-on']()))).toBeNull()
    expect(productsPart(topProductsOf(PRODUCTS_FIXTURES.sealand()))).toBeNull()
    expect(productsPart(topProductsOf(PRODUCTS_FIXTURES['not-applied']()))).toBeNull()
    expect(productsPart(fixtureProductsTop('quiet', { note: 'failed' }))).toBeNull()
    expect(productsPart(null)).toBeNull()
  })
  it('the first-time mark reads as Your products\' own label', () => {
    expect(FIRST_TIME).toBe(TOP_LABELS.first)
  })
})

describe('Content: this week\'s ideas, else the question asked most; Worth a reply always, never a count', () => {
  const read = { window: { from: '2026-10-04T04:02:00.000Z', to: '2026-10-11T04:02:00.000Z' } }
  it('every idea of the set, in rank order, scrubbed, the days they read and the medical line where the market is medical', () => {
    const top = { ...fixtureContentTop('ready', { medical: true }), ideas: [
      { id: 'a', rank: 1 as const, title: 'How long a liner lasts, and when it is time to replace one', href: '/dashboard/content/ideas/a' },
      { id: 'b', rank: 2 as const, title: 'What 3 things to check in a new socket', href: '/dashboard/content/ideas/b' },
      { id: 'c', rank: 3 as const, title: 'Why a foot feels different on stairs', href: '/dashboard/content/ideas/c' },
    ] }
    const part = contentPart(top, fixtureAsked(), read)
    // The digit the model typed drops the title whole (the week_read scrub).
    expect(part.ideas.map((x) => x.id)).toEqual(['a', 'c'])
    expect(part.read).toBe('14 Sep to 11 Oct')
    expect(part.medical).toBe(true)
    // An idea prints: the stand-in question is not read into the issue.
    expect(part.asked).toBeNull()
    expect(part.replies).toEqual({ href: '/dashboard/content#worth-a-reply', days: '5 to 11 Oct' })
    expect(contentPart({ ...top }, null, read).medical).toBe(true)
    expect(contentPart(fixtureContentTop('ready', { medical: false }), null, read).medical).toBe(false)
  })
  it('a top from before the list carries its one idea', () => {
    const part = contentPart(fixtureContentTop(), null, read)
    expect(part.ideas.map((x) => x.title)).toEqual(['How long a liner lasts, and when it is time to replace one'])
  })
  it('no idea for this week (switched off, none written, an older week): the tile\'s stand-in question, its week beside its month, no medical line', () => {
    for (const top of [fixtureContentTop('not_on'), fixtureContentTop('none'), fixtureContentTop('older')]) {
      const part = contentPart(top, fixtureAsked(), read)
      expect(part.ideas).toEqual([])
      expect(part.medical).toBe(false)
      expect(part.asked).toEqual({ label: 'How long a liner lasts', week: 23, month: 35, weekWords: 'this week', monthWords: 'in October so far', href: fixtureAsked().href })
    }
    // Neither: Worth a reply alone.
    const bare = contentPart(null, null, read)
    expect([bare.ideas, bare.asked, bare.replies.days]).toEqual([[], null, '5 to 11 Oct'])
  })
  it('the reply list\'s days are the week\'s, as Content names them', () => {
    expect(replyDays({ window: { from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' } })).toBe('28 Sep to 4 Oct')
  })
})

describe('Your moves: how many wait, the first in Your moves\' order, the move\'s one comparison', () => {
  it('the tile\'s advice and count; the list where the top carries one', () => {
    const top = fixtureMovesTop('full')
    const part = movesPart(top)!
    expect(part.waiting).toBe(3)
    expect(part.advice[0]).toMatchObject({ title: top.advice!.title, href: top.advice!.href, figure: streakFigure(top.advice!.history) })
    expect(part.advice[0].figure).toMatch(/^\d+ update/)
    const listed = movesPart({ ...top, list: [1, 2, 3, 4, 5].map((i) => ({ lineageId: `l${i}`, title: `Advice ${'abcde'[i - 1]}`, href: `/dashboard/moves/advice/l${i}`, history: top.advice!.history })) })!
    expect(listed.advice.map((a) => a.title)).toEqual(['Advice a', 'Advice b', 'Advice c', 'Advice d'])
  })
  it('a move whose comparison may print: its two months in Your moves\' words and its verdict', () => {
    const top = fixtureMovesTop('full')
    const part = movesPart(top)!
    expect(part.move).toMatchObject({ title: top.move!.title, before: { k: top.move!.compare.before.k }, after: { k: top.move!.compare.after.k } })
    expect(part.move!.months.before).toMatch(/, the month before$/)
    expect(part.move!.verdict).toBe(top.move!.compare.verdict)
    expect(movesPart(fixtureMovesTop('no_move'))!.move).toBeNull()
  })
  it('nothing waiting and no move: no part', () => {
    expect(movesPart({ ...fixtureMovesTop('no_advice'), move: null })).toBeNull()
    expect(movesPart(null)).toBeNull()
  })
})

describe('the subjects: every READY subject\'s own stored read, in Market\'s order (ruling U6)', () => {
  const sub = (subjectId: string, name: string, over: Partial<SubjectRead> = {}): SubjectRead => ({ subjectId, name, status: 'ready', saying: ['What people said.'], means: `What ${name} means.`, headline: `${name} decides it`, basedOn: [], ...over })
  const withReads = (subjects: SubjectRead[], month = '2026-10-01'): WeekReadDataV2 => ossurRead({
    subjectReads: { version: 1, promptVersion: 'subject_read_v3', month, read: { from: `${month}T00:00:00Z`, to: '2026-10-18T04:02:00Z' }, status: 'ready', model: 'x', costUsd: 0, subjects },
  })
  it('in the order handed in, each its headline and meaning, a thin read its stored line, each opening its page for the month', () => {
    const read = withReads([sub('b', 'Comfort'), sub('a', 'Price', { status: 'thin', saying: ['In October so far, talk about Price sat in one place.'], means: '', headline: undefined }), sub('c', 'Durability', { headline: undefined })])
    const out = subjectsPart({ order: [{ id: 'a', name: 'Price' }, { id: 'b', name: 'Comfort' }, { id: 'c', name: 'Durability' }], read, readsOn: true })
    expect(out.map((s) => [s.id, s.status, s.headline, s.means, s.line])).toEqual([
      ['a', 'thin', null, null, 'In October so far, talk about Price sat in one place.'],
      ['b', 'ready', 'Comfort decides it', 'What Comfort means.', null],
      ['c', 'ready', null, 'What Durability means.', null],
    ])
    expect(out[0].href).toBe('/dashboard/market/subjects/a?period=month&month=2026-10')
  })
  it('never an unready subject\'s words: only the ready order is handed in, and a held or failed read prints nothing', () => {
    const read = withReads([sub('open', 'Comfort'), sub('ready', 'Fit'), sub('held', 'Look', { status: 'held' }), sub('fail', 'Cost', { status: 'failed' })])
    const out = subjectsPart({ order: [{ id: 'ready', name: 'Fit' }, { id: 'held', name: 'Look' }, { id: 'fail', name: 'Cost' }], read, readsOn: true })
    expect(out.map((s) => s.id)).toEqual(['ready'])
    expect(JSON.stringify(out)).not.toContain('Comfort')
  })
  it('the reads switched off for the tenant, or written for another month: none', () => {
    const read = withReads([sub('a', 'Fit')])
    expect(subjectsPart({ order: [{ id: 'a', name: 'Fit' }], read, readsOn: false })).toEqual([])
    expect(subjectsPart({ order: [{ id: 'a', name: 'Fit' }], read: withReads([sub('a', 'Fit')], '2026-09-01'), readsOn: true })).toEqual([])
    expect(subjectsPart({ order: [{ id: 'a', name: 'Fit' }], read: sealandRead(), readsOn: true })).toEqual([])
  })
})

describe('the month-closing line: the run that closes a month, its long-run read published', () => {
  const longRun = (month: string, ideas = 1): StoredLongRun => ({
    month, created_at: '2026-11-01T08:00:00Z',
    data: { version: 1, kind: 'longrun', promptVersion: 'longrun_read_v1', month, months: ['2026-09-01', '2026-10-01'], inShort: 'Held.', ideas: Array.from({ length: ideas }, (_, i) => ({ headline: `Idea ${i}`, body: ['Body.'], videos: 3, months: [{ month, videos: 3 }], who: [], basedOn: [] })), held: [], model: 'x', costUsd: 0 } as never,
  })
  it('names the closed month\'s read and opens it on Market › This month', () => {
    expect(monthClosePart(monthEndRead().window, longRun('2026-10-01'))).toEqual({
      month: '2026-10-01', title: 'What holds across September and October', href: '/dashboard/market?period=month&month=2026-10#long-run',
    })
  })
  it('only where it exists: not a closing run, no read, a read of another month, or one with nothing to print', () => {
    expect(monthClosePart(ossurRead().window, longRun('2026-10-01'))).toBeNull()
    expect(monthClosePart(monthEndRead().window, null)).toBeNull()
    expect(monthClosePart(monthEndRead().window, longRun('2026-09-01'))).toBeNull()
    expect(monthClosePart(monthEndRead().window, longRun('2026-10-01', 0))).toBeNull()
  })
})

describe('the build\'s reads (loadWeeklyReadParts)', () => {
  const admin = fakeDb({}).client as SupabaseClient
  it('hands each reader its own question; the stand-in is read only where no idea for this week prints; the long-run read only on a closing run', async () => {
    const asked = vi.fn(async () => fixtureAsked())
    const longRun = vi.fn(async () => null)
    const parts = await loadWeeklyReadParts(admin, { clientId: 'c1', runId: 'r', read: ossurRead() }, {
      tops: async () => ({ voices: fixtureVoicesTop(), products: null, content: fixtureContentTop(), moves: fixtureMovesTop('member') }),
      asked, order: async () => [], longRun,
    })
    expect(asked).not.toHaveBeenCalled()
    expect(longRun).not.toHaveBeenCalled()
    expect(parts.pages.content?.ideas).toHaveLength(1)
    expect(parts.pages.products).toBeNull()
    expect(parts.monthClose).toBeNull()
    const closing = await loadWeeklyReadParts(admin, { clientId: 'c1', runId: 'r', read: monthEndRead() }, {
      tops: async () => ({ content: fixtureContentTop('not_on') }), asked, order: async () => [], longRun,
    })
    expect(asked).toHaveBeenCalledTimes(1)
    expect(longRun).toHaveBeenCalledWith(expect.anything(), 'c1', '2026-10-01')
    expect(closing.pages.content?.asked?.label).toBe('How long a liner lasts')
  })
  it('a reader that throws loses its part and nothing else', async () => {
    const boom = async () => { throw new Error('connection reset') }
    const parts = await loadWeeklyReadParts(admin, { clientId: 'c1', runId: 'r', read: monthEndRead() }, { tops: boom, asked: boom, order: boom, longRun: boom })
    expect(parts.subjects).toEqual([])
    expect(parts.monthClose).toBeNull()
    expect(parts.pages.voices).toBeNull()
    expect(parts.pages.content?.replies.days).toBe('26 Oct to 1 Nov')
  })
  it('on a database with none of the pages\' tables, nothing throws', async () => {
    const parts = await loadWeeklyReadParts(fakeDb({}).client as SupabaseClient, { clientId: 'c1', runId: 'r', read: sealandOctRead() })
    expect(parts.subjects).toEqual([])
    expect(parts.pages.products).toBeNull()
  })
})

describe('what stood out, in Market\'s eyebrows', () => {
  it('the biggest leads under "Most talked about this week", the next two "Also talked about"', () => {
    const rows = stoodOutOf(ossurRead(), chip)
    expect(rows.map((r) => [r.eyebrow?.text, r.label])).toEqual([
      [MOST_TALKED, 'Praise for resilience and courage'],
      [ALSO_TALKED, 'How the prosthesis works'],
      [ALSO_TALKED, 'Insurance barriers and delays'],
    ])
    expect(weekFigureWords(rows[0].figure as never)).toBe('19 videos this week · 54 in October so far')
    // A set-apart conversation never stands out.
    expect(rows.some((r) => r.label.startsWith('Clinics'))).toBe(false)
  })
  it('a flag leads with the check\'s own chip and no band sentence; the biggest is then "Most talked about this week"', () => {
    const rows = stoodOutOf(monthEndRead(), chip)
    expect(rows[0]).toMatchObject({ chip: 'Unusual this week', eyebrow: null, label: knee().label, figure: { kind: 'flag', k: 19, n: 241, usual: { k: 38, n: 1089, months: 'June, July and August' } } })
    expect(rows.slice(1).map((r) => r.eyebrow?.text)).toEqual([MOST_TALKED, ALSO_TALKED])
    // A crossing week is restated against the month it started in, in full.
    expect(weekFigureWords(rows[1].figure as never)).toBe('19 videos this week · 54 in October')
    expect(JSON.stringify(rows)).not.toMatch(/band|points/)
  })
  it('a new conversation leads under "New this week" (a verdict\'s words)', () => {
    const read = levelOneRead({ unusual: sealandUnusual([]), newThisWeek: [{ themeId: 't7', label: 'Laptop sleeves that fit a 16-inch machine', body: 'Sleeves.', videos: { week: 5, month: 5 }, evidence: '' }] })
    const rows = stoodOutOf(read, chip)
    expect(rows[0]).toMatchObject({ eyebrow: { text: NEW_THIS_WEEK, verdict: true }, label: 'Laptop sleeves that fit a 16-inch machine' })
    expect(rows[1].eyebrow?.text).toBe(MOST_TALKED)
  })
  it('the full read\'s third card says "Nothing new this week" over what else was talked about, only where nothing was new', () => {
    const full = stoodOutOf(ossurRead(), chip, true)
    expect(full[2]).toMatchObject({ eyebrow: { text: NOTHING_NEW, verdict: true }, sub: ALSO_TALKED, label: 'Insurance barriers and delays' })
    const fresh = levelOneRead({ unusual: sealandUnusual([]), newThisWeek: [{ themeId: 't7', label: 'x', body: 'Sleeves.', videos: { week: 5, month: 5 }, evidence: '' }] })
    expect(stoodOutOf(fresh, chip, true).some((r) => r.eyebrow?.text === NOTHING_NEW)).toBe(false)
  })
  it('two flags: the second is a row with its own chip', () => {
    const second = sealandFlag({ objectKind: 'kind', objectId: 'question', label: 'Questions', rank: 2 })
    const rows = stoodOutOf(levelOneRead({ unusual: sealandUnusual([sealandFlag(), second]) }), chip)
    expect(rows.map((r) => [r.chip, r.label])).toEqual([['Unusual this week', 'Asking for the bag in more colours'], ['Unusual this week', 'Questions'], [null, 'Comparing named bags by trip fit']])
  })
})

describe('the view', () => {
  it('what it means in first sentences for the email, in full for the full read; the month group and the numbers\' month', () => {
    const v = weeklyV3View({ read: ossurRead(), chipOf: chip })
    expect(v.meansFirst).toEqual([
      'The residual limb is where wearers place the risk of a prosthetic leg.',
      'Insurance and replacement timing sit inside the buying question for knees, feet and full sets.',
      'For upper limb devices, finger movement and grip strength are the named proof points.',
    ])
    expect(v.means[0]).toMatch(/Bruising, swelling/)
    expect([v.monthGroup, v.monthCell, v.where, v.dates]).toEqual(['October so far', 'October so far', 'in October so far', '12 to 18 October'])
    const end = weeklyV3View({ read: monthEndRead(), chipOf: chip })
    expect([end.monthGroup, end.monthCell, end.where, end.dates]).toEqual(['October', 'October in total', 'in October', '26 October to 1 November'])
    expect(v.numbers).toEqual({ week: { videos: 146, comments: 4180 }, month: { videos: 434, comments: 11178 } })
    expect(weeklyV3View({ read: ossurRead({ market: null }), chipOf: chip }).numbers).toBeNull()
  })
  it('a first sentence is whole: never cut inside a sentence', () => {
    expect(firstSentenceOf('One thing. Another.')).toBe('One thing.')
    expect(firstSentenceOf('No stop at all')).toBe('No stop at all')
    expect(firstSentenceOf('It is 3.5 times. Then.')).toBe('It is 3.5 times.')
  })
})
