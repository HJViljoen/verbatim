import { describe, expect, it } from 'vitest'

import type { PairComparability } from '../../reading/comparability'
import type { AdviceRow } from '../market-surface'
import { adviceNamed } from './moves-levels-load'
import {
  ADVICE_QUOTES, NO_OTHER_COMMENT, RECORD_GONE_SHOWN, SAME_IDEA_NOTE,
  adviceConversationsOf, adviceCrumbs, adviceMenu, adviceNumbersOf, adviceQuotesOf, argumentParts, decisionWord, hubDecisionLine,
  moveCrumbs, moveEvidenceOf, moveFactsOf, moveMenu, moveReadWords, movesDatedLine, movesOnAdvice, noMoveOnItInvite, recordCrumbs,
  recordGroupsOf, recordState, restsOnNote, streakWords, whyParagraphs, wouldMoveLineOf, type AdviceConversation, type LevelCitation,
} from './moves-levels'
import type { ConvEvidenceRow, ConvVideoRow } from './market'
import type { RecordRow } from './moves'
import { MOVE_CARDS } from './moves-fixture'

// YOUR MOVES' LEVEL PAGES, THE PURE HALF (levels as pages, 17 Oct; the G6
// boards): what each builder decides prints, from the reads the loader makes.

const SEPT = '2026-09-01'
const NOW = '2026-10-13T08:00:00.000Z'

describe('the argument: its first sentence leads the hub, the rest is "Why"', () => {
  it('splits off the first sentence and sets the rest two sentences to a paragraph', () => {
    expect(argumentParts('One leads. Two. Three. Four.')).toEqual({ lead: 'One leads.', rest: ['Two. Three.', 'Four.'] })
    expect(argumentParts('Only one.')).toEqual({ lead: 'Only one.', rest: [] })
    expect(argumentParts(null)).toEqual({ lead: null, rest: [] })
    expect(whyParagraphs('One. Two. Three.')).toEqual(['One. Two.', 'Three.'])
  })
})

describe('the conversations behind a piece of advice (data 1)', () => {
  const registry = new Map([['i1', ['t1']], ['i2', ['t1', 't2']], ['i3', ['t2']], ['i4', ['t3']], ['i5', []]])
  const videos = new Map<string, string | null>([['i1', 'v1'], ['i2', 'v2'], ['i3', 'v2'], ['i4', 'v3'], ['i5', 'v4']])
  const build = (target: string | null = 't2') => adviceConversationsOf({
    evidence: ['i1', 'i2', 'i3', 'i4', 'i5', 'i1'], registryByInsight: registry, videoByInsight: videos,
    labels: new Map([['t1', 'Price and location'], ['t2', 'Cost frustration'], ['t3', ' ']]), descriptions: new Map([['t1', 'Where to get one.']]),
    level: (id) => (id === 't1' ? { k: 11, n: 521 } : null), target, month: SEPT,
  })

  it('counts each conversation in the advice\'s own videos, a video once, most first, the target first on a tie', () => {
    const c = build()
    expect(c.videos).toBe(4)
    expect(c.rows.map((r) => [r.id, r.videos, r.target])).toEqual([['t2', 1, true], ['t1', 2, false]].sort((a, b) => (b[1] as number) - (a[1] as number)))
    expect(c.rows[0]).toMatchObject({ id: 't1', description: 'Where to get one.', level: { k: 11, n: 521 }, href: '/dashboard/market/conversations/t1?period=month&month=2026-09' })
  })

  it('leaves out a conversation Market could not name (no label), and a video in no conversation counts in the base alone', () => {
    const c = build(null)
    expect(c.rows.map((r) => r.id)).not.toContain('t3')
    expect(c.rows.every((r) => !r.target)).toBe(true)
  })
})

describe('the would-move line (data 4)', () => {
  const levels: Record<string, number> = { '2026-07-01': 9, '2026-08-01': 13, '2026-09-01': 19 }
  const ns: Record<string, number> = { '2026-07-01': 455, '2026-08-01': 612, '2026-09-01': 839 }
  const base = { themeId: 't1', label: 'Insurance refusals', month: SEPT, monthLabel: 'the last full month', now: NOW, level: (m: string) => levels[m] ?? null, n: (m: string) => ns[m] ?? null }

  it('the reading month and the two before, each drawn, and where a move on it is read', () => {
    const line = wouldMoveLineOf(base)
    expect(line.slots.map((s) => [s.month, s.point?.k ?? null, s.why])).toEqual([['2026-07-01', 9, null], ['2026-08-01', 13, null], ['2026-09-01', 19, null]])
    expect(line.note).toBe('September is the last full month. A move dated on this advice is read on this line, from two months before it.')
    expect(line.href).toBe('/dashboard/market/conversations/t1?period=month&month=2026-09')
  })

  it('a month with no reading is an empty slot, never 0, and says so (G6-Moves-Advice-Thin)', () => {
    const line = wouldMoveLineOf({ ...base, level: (m) => (m === SEPT ? 11 : null), n: (m) => (m === SEPT ? 521 : null) })
    expect(line.slots.map((s) => s.why)).toEqual(['unread', 'unread', null])
    expect(line.note).toBe('July and August have no reading. September is the last full month. A move dated on this advice is read on this line.')
  })

  it('a month read another way is left off, with the record\'s reason (the one condition)', () => {
    const pair = (prevMonth: string, month: string): PairComparability => (prevMonth === '2026-07-01'
      ? { prevMonth, month, mode: 'refuse', row: null, reasons: [{ kind: 'searches', changeId: 'c', share: 0.3, changedAt: '2026-08-12T00:00:00Z', surface: null }] }
      : { prevMonth, month, mode: 'comparable', row: null, reasons: [] })
    const line = wouldMoveLineOf({ ...base, monthLabel: null, joined: (prev) => prev !== '2026-07-01', pair })
    expect(line.slots.map((s) => s.why)).toEqual(['cut', null, null])
    expect(line.slots[0].reason).toBe('tracking_change')
    expect(line.note).toMatch(/^July is left off the line: /)
    expect(line.note).not.toContain('last full month')
  })
})

const video = (id: string, platform: string, videoId: string, over: Partial<ConvVideoRow> = {}): ConvVideoRow => ({
  id, platform, video_id: videoId, video_url: `https://x/${videoId}`, account_name: `@${videoId}`, caption: 'A caption', comments_count: 50,
  upload_date: '2026-10-01', is_client: false, is_competitor: false, competitor_name: null, hashtags: [], topics: [], source: 'discovered', ...over,
})
const cite = (id: string, insight: string, comment: string, videoId: string, quote: string, over: Partial<ConvEvidenceRow> = {}): ConvEvidenceRow => ({
  evidenceId: id, insightId: insight, commentId: comment, quote, rank: 1, redacted: false,
  comment: { date: '2026-10-02T10:00:00.000Z', platform: 'tiktok', videoId, author: `author-${comment}` }, ...over,
})

describe('the advice\'s numbers, all time (data 3, decision 5)', () => {
  const v1 = video('V1', 'tiktok', 'n1')
  const v2 = video('V2', 'instagram', 'n2', { is_client: true })
  it('each block "of" its videos: who raises it, who it is about, what people did, where', () => {
    const n = adviceNumbersOf({
      lineageId: 'L1', title: 'Help desk', month: SEPT, now: NOW,
      evidence: ['i1', 'i2', 'i3'], videoByInsight: new Map([['i1', 'V1'], ['i2', 'V2'], ['i3', 'V2']]),
      kindByInsight: new Map([['i1', 'question'], ['i2', 'question'], ['i3', 'pain_point']]),
      videos: new Map([['V1', v1], ['V2', v2]]),
      citations: [{ ...cite('e1', 'i1', 'c1', 'n1', 'Where?'), video: 'V1' }, { ...cite('e2', 'i2', 'c2', 'n2', 'How?', { comment: { date: '2026-10-02T10:00:00Z', platform: 'instagram', videoId: 'n2', author: 'a' } }), video: 'V2' }] as LevelCitation[],
      personas: [{ key: 'new', name: 'New amputees', insightIds: ['i1'] }, { key: 'none', name: 'Nobody', insightIds: ['zz'] }],
      mentions: [{ comment_id: 'c1', video_id: 'V1', name: 'Össur' }], brands: 'counted', brand: 'Össur', noun: null,
      audienceOf: (v) => (v.is_client ? 'client' : 'industry-other'),
    })
    expect(n.n).toBe(2)
    expect(n.doing.map((d) => [d.kind, d.k, d.n])).toEqual([['question', 2, 2], ['pain_point', 1, 2]])
    expect(n.where?.rows.map((r) => [r.platform, r.videos])).toEqual([['instagram', 1], ['tiktok', 1]])
    expect(n.groups?.map((g) => [g.name, g.videos])).toEqual([['New amputees', 1]])
    expect(n.who?.parts).toEqual([{ about: 'client', videos: 2 }])
  })

  it('brands not counted: no split, and the state says why; no group holding insights: Pass E\'s names alone', () => {
    const n = adviceNumbersOf({
      lineageId: 'L1', title: 'Help desk', month: SEPT, now: NOW, evidence: ['i1'], videoByInsight: new Map([['i1', 'V1']]), kindByInsight: new Map(),
      videos: new Map([['V1', v1]]), citations: [], personas: [{ key: 'k', name: 'Group' }], mentions: [], brands: 'not_counted', brand: 'Össur', noun: null,
      audienceOf: () => 'industry-other',
    })
    expect(n.who).toBeNull()
    expect(n.brands).toBe('not_counted')
    expect(n.groups).toBeNull()
  })
})

describe('in their words: three comments, each from its conversation (data 2)', () => {
  const conv = (id: string, label: string): AdviceConversation => ({ id, label, description: null, videos: 1, level: null, target: false, href: `/m/${id}` })
  const videos = new Map([['V1', video('V1', 'tiktok', 'n1')], ['V2', video('V2', 'tiktok', 'n2')], ['V3', video('V3', 'tiktok', 'n3')]])
  const citations: LevelCitation[] = [
    { ...cite('e1', 'i1', 'c1', 'n1', 'My insurance refused the powered knee and the appeal is still open.'), video: 'V1' },
    { ...cite('e2', 'i2', 'c2', 'n2', 'Where can I get a powered knee fitted, and who pays for it?'), video: 'V2' },
    { ...cite('e3', 'i3', 'c3', 'n3', 'lol'), video: 'V3' },
  ]
  const gate = () => ({})

  it('one comment a conversation, biggest first, each labelled, cited by platform and day; one that cannot be read prints none', () => {
    const quotes = adviceQuotesOf({
      conversations: [conv('t1', 'Insurance refusals'), conv('t2', 'Price and location'), conv('t3', 'Noise')],
      membersOf: new Map([['t1', new Set(['i1'])], ['t2', new Set(['i2'])], ['t3', new Set(['i3'])]]),
      citations, videos, translations: new Map(), gate, named: new Map(), brand: 'Össur', brands: 'not_read',
    })
    expect(quotes.map((q) => q.conv?.label)).toEqual(['Insurance refusals', 'Price and location'])
    expect(quotes[0]).toMatchObject({ text: 'My insurance refused the powered knee and the appeal is still open.', cite: 'TikTok · 2 Oct', about: null })
    expect(ADVICE_QUOTES).toBe(3)
    expect(NO_OTHER_COMMENT).toMatch(/^No other comment/)
  })

  it('a comment two conversations share prints once; a comment under the video\'s own account never prints', () => {
    const shared = adviceQuotesOf({
      conversations: [conv('t1', 'Insurance refusals'), conv('t2', 'Appeals')],
      membersOf: new Map([['t1', new Set(['i1'])], ['t2', new Set(['i1'])]]),
      citations, videos, translations: new Map(), gate, named: new Map(), brand: 'Össur', brands: 'not_read',
    })
    expect(shared).toHaveLength(1)
    const own = adviceQuotesOf({
      conversations: [conv('t1', 'Insurance refusals')], membersOf: new Map([['t1', new Set(['i1'])]]),
      citations: [{ ...citations[0], comment: { ...citations[0].comment, author: '@n1' } }], videos, translations: new Map(), gate, named: new Map(), brand: 'Össur', brands: 'not_read',
    })
    expect(own).toEqual([])
  })

  it('who a comment\'s video is about: a brand its comments name, else its audience, so a rival\'s own post is the rival\'s', () => {
    const rivals = new Map([['V1', video('V1', 'tiktok', 'n1', { is_competitor: true, competitor_name: 'Ottobock' })], ['V2', video('V2', 'tiktok', 'n2')]])
    const quotes = adviceQuotesOf({
      conversations: [conv('t1', 'Insurance refusals'), conv('t2', 'Price and location')],
      membersOf: new Map([['t1', new Set(['i1'])], ['t2', new Set(['i2'])]]),
      citations, videos: rivals, translations: new Map(), gate, named: new Map(), brand: 'Össur', brands: 'counted',
    })
    expect(quotes.map((q) => q.about)).toEqual(['rival:Ottobock', null])
  })
})

describe('the moves made on a piece of advice (data 5)', () => {
  it('by `moves.lineage_id`, advice moves only', () => {
    const cards = MOVE_CARDS
    const on = movesOnAdvice(cards, [{ id: cards[0].id, lineage_id: 'L1', kind: 'advice' }, { id: cards[1].id, lineage_id: 'L1', kind: 'subject' }], 'L1')
    expect(on.map((c) => c.id)).toEqual([cards[0].id])
    expect(movesDatedLine(0)).toBe('no move dated on it')
    expect(movesDatedLine(1)).toBe('1 move dated on it')
    expect(noMoveOnItInvite('Insurance refusals')).toBe('Accept it and date the change you make, and the move gets its own page, read month by month on Insurance refusals.')
  })
})

const row = (n: number, over: Partial<RecordRow> = {}): RecordRow => ({
  lineageId: `L${n}`, title: `Advice ${n}`, kind: 'content', firstMade: '2026-08-01', updates: 1, status: 'new', statusLabel: 'New', decidedAt: null, current: false, ...over,
})

describe('the advice record, grouped by what was decided (decision 1)', () => {
  const rows = [
    row(1, { current: true }), row(2, { current: true }), row(3, { current: true }),
    row(4, { status: 'acted_on', statusLabel: 'Done', decidedAt: '2026-09-02T10:00:00Z' }),
    row(5, { status: 'dismissed', statusLabel: 'Dismissed', decidedAt: '2026-09-28T10:00:00Z' }),
    ...Array.from({ length: 9 }, (_, i) => row(10 + i)),
  ]

  it('every piece once: the advice waiting (the one count), the same idea folded under it, decided newest first, the rest', () => {
    const g = recordGroupsOf(rows, ['L2', 'L1'])
    expect(g.map((x) => x.key)).toEqual(['waiting', 'decided', 'gone'])
    expect(g[0].rows.map((r) => [r.lineageId, r.note ?? null])).toEqual([['L2', null], ['L1', null], ['L3', SAME_IDEA_NOTE]])
    expect(g[1].rows.map((r) => r.lineageId)).toEqual(['L5', 'L4'])
    expect(g[2].rows).toHaveLength(RECORD_GONE_SHOWN)
    expect(g[2].hidden).toBe(9 - RECORD_GONE_SHOWN)
    const all = recordGroupsOf(rows, ['L2', 'L1'], true)
    expect(all[2]).toMatchObject({ hidden: 0 })
    expect(all.reduce((s, x) => s + x.rows.length, 0)).toBe(rows.length)
  })

  it('names a decision by the control that made it', () => {
    expect(decisionWord({ status: 'acted_on', statusLabel: 'Done' })).toBe('Accepted')
    expect(decisionWord({ status: 'dismissed', statusLabel: 'Dismissed' })).toBe('Not for us')
    expect(decisionWord({ status: 'in_progress', statusLabel: 'Working on it' })).toBe('Working on it')
    expect(recordState({ status: 'acted_on', statusLabel: 'Done', decidedAt: '2026-09-28T10:00:00Z' })).toBe('Accepted since 28 Sep')
    expect(recordState({ status: 'new', statusLabel: 'New', decidedAt: null })).toBe('not decided')
    expect(hubDecisionLine({ firstMade: '2026-07-20', status: 'dismissed', statusLabel: 'Dismissed', decidedAt: '2026-08-02T10:00:00Z' })).toBe('First suggested 20 Jul. Not for us since 2 Aug.')
  })
})

describe('the crumbs and the switchers', () => {
  const adviceRow = (id: string, priority: string): AdviceRow => ({ lineageId: id, title: `Advice ${id}`, why: null, priority } as unknown as AdviceRow)

  it('the advice switcher: the advice waiting with each priority in words, the record under a hairline; one opened from the record above, ticked (decision 2)', () => {
    const waiting = [adviceRow('A', 'high'), adviceRow('B', 'medium')]
    const menu = adviceMenu({ waiting, current: { lineageId: 'A', title: 'Advice A' }, total: 23 })
    expect(menu.wide).toBe(true)
    expect(menu.above).toEqual([])
    expect(menu.items.map((i) => [i.label, i.note, i.current, i.href])).toEqual([['Advice A', 'High priority', true, '/dashboard/moves/advice/A'], ['Advice B', 'Medium priority', false, '/dashboard/moves/advice/B']])
    expect(menu.below).toEqual([{ key: 'record', label: 'The advice record, all 23', href: '/dashboard/moves/advice', current: false, note: 'every piece, and what you decided' }])
    const fromRecord = adviceMenu({ waiting, current: { lineageId: 'Z', title: 'An older piece' }, total: 23 })
    expect(fromRecord.above).toEqual([{ key: 'Z', label: 'An older piece', href: '/dashboard/moves/advice/Z', current: true, slot: 'pass_d_b_recommendation' }])
    expect(fromRecord.items.every((i) => !i.current)).toBe(true)
  })

  it('"Your moves / {page}": the advice and a move with a chevron, the record with none', () => {
    expect(adviceCrumbs({ title: 'Help desk' }, null)).toEqual([{ label: 'Your moves', href: '/dashboard/moves' }, { label: 'Help desk', href: null, slot: 'pass_d_b_recommendation', menu: null }])
    expect(adviceCrumbs({ title: 'A piece of advice with no title', untitled: true }, null)[1].slot).toBeNull()
    const m = moveMenu(MOVE_CARDS, MOVE_CARDS[0].id)!
    expect(m.items.map((i) => [i.current, i.note, i.slot])).toEqual(MOVE_CARDS.map((c, i) => [i === 0, c.status === 'active' ? 'Active' : c.status === 'done' ? 'Done' : 'Stopped', 'quote']))
    expect(moveCrumbs(MOVE_CARDS[0], m)[1]).toMatchObject({ label: MOVE_CARDS[0].title, slot: 'quote' })
    expect(moveMenu([], 'x')).toBeNull()
    expect(recordCrumbs()).toEqual([{ label: 'Your moves', href: '/dashboard/moves' }, { label: 'The advice record', href: null }])
  })
})

describe('a move\'s evidence: what people said after it (data 6, decision 6)', () => {
  const vids = [video('V1', 'tiktok', 'n1', { comments_count: 10 }), video('V2', 'tiktok', 'n2', { comments_count: 99 })]
  const ev = [
    cite('e1', 'm1', 'c1', 'n1', 'My first run on the blade after the clinic was the best day this year.'),
    cite('e2', 'm1', 'c2', 'n1', 'Where can I find a running clinic like this near me?'),
    cite('e3', 'm1', 'c3', 'n2', 'The clinic made me want to try running again after years.'),
    cite('e4', 'x9', 'c4', 'n2', 'A citation by an insight outside the set, never printed.'),
  ]
  const build = (p: { video?: string | null; videos?: boolean } = {}) => moveEvidenceOf({
    moveId: 'M1', claim: 'Community', videoIds: ['V1', 'V2'], commentIds: new Set(['c1', 'c2', 'c3', 'c4']), members: new Set(['m1']),
    videos: vids, evidence: ev, translations: new Map(), named: new Map(), brand: 'Össur', brands: 'not_read', gate: {}, p,
  })

  it('most comments about it first; each card its comments, its total and its own address', () => {
    const e = build()
    expect(e.total).toBe(2)
    expect(e.videos.map((v) => [v.id, v.aboutCount, v.total])).toEqual([['V1', 2, 10], ['V2', 2, 99]].sort((a, b) => (b[1] as number) - (a[1] as number) || (b[2] as number) - (a[2] as number)))
    const v1 = e.videos.find((v) => v.id === 'V1')!
    expect(v1.href).toBe('/dashboard/moves/M1?video=V1#video-V1')
    expect(JSON.stringify(e)).not.toContain('outside the set')
    expect(e.more).toBeNull()
  })

  it('who each video is about: a brand its counted comments name, else its audience, as the facts count it (a rival\'s own post is the rival\'s)', () => {
    const e = moveEvidenceOf({
      moveId: 'M1', claim: 'Community', videoIds: ['V1', 'V2'], commentIds: new Set(['c1', 'c2', 'c3']), members: new Set(['m1']),
      videos: [video('V1', 'tiktok', 'n1', { is_competitor: true, competitor_name: 'Ottobock' }), vids[1]], evidence: ev,
      translations: new Map(), named: new Map([['V2', ['Össur']]]), brand: 'Össur', brands: 'counted', gate: {}, p: {},
    })
    expect(Object.fromEntries(e.videos.map((v) => [v.id, v.about]))).toEqual({ V1: 'rival:Ottobock', V2: 'client' })
    // Brands not counted: no video says who it is about.
    expect(build().videos.every((v) => v.about === null)).toBe(true)
  })

  it('`?video=` opens only its own video; a foreign or unknown id names nothing', () => {
    expect(build({ video: 'V1' }).videos.find((v) => v.id === 'V1')).toMatchObject({ open: true, href: '/dashboard/moves/M1' })
    for (const id of ['V9', 'not-an-id']) expect(build({ video: id }).videos.every((v) => !v.open)).toBe(true)
  })

  it('the facts: of the same videos since the day; what people did by the citing insights\' kinds', () => {
    const f = moveFactsOf({
      moveId: 'M1', title: 'Clinic', day: '2026-09-14', now: NOW, month: SEPT, videos: vids, citations: ev.slice(0, 3),
      kindByInsight: new Map([['m1', 'praise']]), members: new Set(['m1']), personas: [], mentions: [], brands: 'not_read', brand: 'Össur', noun: null,
      audienceOf: () => 'industry-other',
    })
    expect(f.n).toBe(2)
    expect(f.doing.map((d) => [d.kind, d.k, d.n])).toEqual([['praise', 2, 2]])
    expect(f.where?.rows.map((r) => [r.platform, r.videos])).toEqual([['tiktok', 2]])
    expect(f.groups).toBeNull()
  })

  it('"read July to September, the last full month": the months its line draws', () => {
    expect(moveReadWords(MOVE_CARDS[0], 'the last full month', SEPT)).toBe('read July to September, the last full month')
    expect(moveReadWords({ points: [] }, null, SEPT)).toBeNull()
  })
})

describe('the words of the hub', () => {
  it('what it rests on, counted in words, and why a conclusion counts no videos', () => {
    expect(restsOnNote([{ kind: 'market', videos: 286 }, { kind: 'market', videos: 45 }, { kind: 'rival', videos: null }])).toBe('Two conclusions about your market and one finding about a rival. The finding opens in Voices.')
    expect(restsOnNote([{ kind: 'market', videos: 203 }, { kind: 'market', videos: null }])).toBe('Two conclusions about your market. A conclusion drawn from rival findings alone counts no videos.')
    expect(restsOnNote([])).toBeNull()
  })
  it('the streak figure (G6: "updates in a row have raised it", "update has raised it")', () => {
    expect(streakWords({ streak: 9, since: '2026-07-20', dates: [] })).toEqual({ value: 9, label: 'updates in a row have raised it', sub: 'since 20 Jul' })
    expect(streakWords({ streak: 1, since: '2026-10-12', dates: ['2026-10-12'] })).toEqual({ value: 1, label: 'update has raised it', sub: 'first raised 12 Oct' })
    expect(streakWords({ streak: 0, since: null, dates: ['2026-08-01', '2026-08-08'] })).toEqual({ value: 2, label: 'updates raised it', sub: 'not raised by the latest update' })
  })
})

describe('an address names a piece of advice among the tenant\'s own only', () => {
  const rows = [{ lineageId: 'L1', recommendationId: 'r-new' }] as AdviceRow[]
  const copies = [{ id: 'r-old', lineage_id: 'L1' }, { id: 'r-new', lineage_id: 'L1' }]
  it('by lineage, by its newest copy, by an older copy (an old `?rec=`); nothing else', () => {
    expect(adviceNamed(rows, copies, 'L1')?.lineageId).toBe('L1')
    expect(adviceNamed(rows, copies, 'r-new')?.lineageId).toBe('L1')
    expect(adviceNamed(rows, copies, ' r-old ')?.lineageId).toBe('L1')
    for (const id of ['', 'foreign-lineage', 'r-foreign']) expect(adviceNamed(rows, copies, id)).toBeNull()
  })
})
