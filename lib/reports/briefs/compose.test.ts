import { describe, expect, it } from 'vitest'

import type { WhoVideo } from '../../brands/attribution'
import { fact } from '../../written/test-fixtures'
import { allocateIdeas } from './allocate'
import { composeBrief, figuresFor, repeatsAcross, type ComposeInput } from './compose'
import { briefMarkdown } from './markdown'
import { QuotePool } from './quotes'
import { cite, point } from './test-fixtures'
import type { BriefRole, GroundedPoint } from './types'
import type { BriefOutput } from './write'

const CLIENT = '00000000-0000-0000-0000-00000000000b'
const SEP = '2026-09-01'

function setup(points: GroundedPoint[]) {
  const whoVideos = new Map<string, WhoVideo[]>(points.map((p) => [p.id, p.videoIds.map((id) => ({ id, audience: 'industry-other', named: [] }))]))
  const counted = new Map(points.map((p, i) => [p.id, [cite({ insight: p.insightIds[0], video: `qv${i}`, text: `Buyers say the route to buy and the price decided point ${p.id} for them, after they asked where to order.` })]]))
  return { whoVideos, quotes: new QuotePool(counted, { clientId: CLIENT, company: 'Acme', brandsOf: new Map() }) }
}

const part = (items: { title?: string; text: string; detail?: string; based_on: string[] }[], lead = '') =>
  ({ lead, items: items.map((i) => ({ title: i.title ?? '', text: i.text, detail: i.detail ?? '', based_on: i.based_on })) })

function input(role: BriefRole, written: BriefOutput, points: GroundedPoint[], over: Partial<ComposeInput> = {}): ComposeInput {
  const allocation = allocateIdeas([
    { headline: 'Buyers stall when the route to buy is hidden', basedOn: ['G1'], home: 'sales', second: null },
    { headline: 'Owners judge the brand by how it handles repairs', basedOn: ['G9'], home: 'leadership', second: null },
  ], points, { month: SEP })
  const { whoVideos, quotes } = setup(points)
  return {
    role, company: 'Acme', month: SEP, noun: null, allocation, points, whoVideos, quotes, written,
    rivals: ['Rival'], audiences: null, market: { videos: 900, comments: 20000 }, ownPosts: 5, playbook: null,
    model: 'test', costUsd: 0.1, ...over,
  }
}

const POINTS = [
  point('G1', 'sales', 12, { questionId: 'sales.settle', months: ['2026-08-01', SEP] }),
  point('G2', 'sales', 6, { questionId: 'sales.stops' }),
  point('G3', 'sales', 1, { questionId: 'sales.stops' }),
  point('G4', 'sales', 5, { questionId: 'sales.rivals', text: 'Buyers pick Rival for long trips and its warranty.' }),
  point('G5', 'sales', 5, { questionId: 'sales.rivals', text: 'Buyers compare packs on weight.' }),
  point('G9', 'leadership', 8, { questionId: 'leadership.risk' }),
]

const salesOut = (over: Partial<BriefOutput> = {}): BriefOutput => ({
  findings: [{ idea: 'I1', saw: 'Buyers ask where to order and who ships to them.\n\nThey ask before they ask the price.', means: 'The route to buy decides whether interest becomes a sale.', practice: ['A buyer who asks about shipping has already chosen the product.', 'Acme should list the shops.'] }],
  buyers: part([]),
  stops: part([{ title: 'The price', text: 'People hold back when the price is not shown.', based_on: ['G2'] }, { title: 'One voice', text: 'A single complaint about the zip.', based_on: ['G3'] }]),
  settle: part([]),
  triggers: part([]),
  rivals: part([{ title: 'Rival', text: 'Bought for long trips and its warranty.', based_on: ['G4'] }, { title: 'Osprey', text: 'Bought for comfort.', based_on: ['G5'] }]),
  care: part([]),
  in_short: 'Buyers want to know how to buy. They hold back on price. Compared with earlier months they now ask more.',
  ...over,
})

describe('composing one brief', () => {
  it('prints only the ideas homed in this brief, and names the others in one line each', () => {
    const { data } = composeBrief(input('sales', salesOut(), POINTS))
    expect(data.findings.map((f) => f.headline)).toEqual(['Buyers stall when the route to buy is hidden'])
    expect(data.inShort.also).toEqual([{ headline: 'Owners judge the brand by how it handles repairs', brief: 'leadership' }])
  })

  it('code writes the finding\'s evidence: its months, its videos and who they are about', () => {
    const f = composeBrief(input('sales', salesOut(), POINTS)).data.findings[0]
    expect(f.videos).toBe(12)
    expect(f.months.map((m) => m.month)).toEqual(['2026-08-01', SEP])
    expect(f.who).toEqual([{ about: 'market', videos: 12 }])
    expect(f.quotes.length).toBeGreaterThan(0)
    expect(f.quotes.every((q) => q.text === '')).toBe(true)
  })

  it('scrubs advice out of what it means and the time comparison out of the summary', () => {
    const { data } = composeBrief(input('sales', salesOut(), POINTS))
    expect(data.findings[0].practice).toEqual(['A buyer who asks about shipping has already chosen the product.'])
    expect(data.inShort.summary).toBe('Buyers want to know how to buy. They hold back on price.')
  })

  it('holds an item that rests on too few videos, and a rival no cited point names or the tenant does not track', () => {
    const { data } = composeBrief(input('sales', salesOut(), POINTS))
    const stops = data.sections.find((s) => s.key === 'sales.stops')!
    expect(stops.groups[0].items.map((i) => i.title)).toEqual(['The price'])
    const rivals = data.sections.find((s) => s.key === 'sales.rivals')!
    expect(rivals.groups[0].items.map((i) => i.title)).toEqual(['Rival'])
    expect(data.held.map((h) => h.reason)).toEqual(expect.arrayContaining(['too little behind it (1 videos)', 'not a tracked rival a cited point names']))
    expect(data.held.find((h) => h.what.includes('One voice'))).toBeDefined()
  })

  it('drops a section with nothing that stands, rather than printing it empty', () => {
    const { data } = composeBrief(input('sales', salesOut(), POINTS))
    expect(data.sections.map((s) => s.key)).toEqual(['sales.stops', 'sales.rivals'])
  })

  it('an item that is the brief\'s own finding again is held', () => {
    const out = salesOut({ stops: part([{ title: 'No route to buy', text: 'Buyers cannot find where to order.', based_on: ['G1'] }, { title: 'The price', text: 'People hold back when the price is not shown.', based_on: ['G2'] }]) })
    const { data } = composeBrief(input('sales', out, POINTS))
    expect(data.sections.find((s) => s.key === 'sales.stops')!.groups[0].items.map((i) => i.title)).toEqual(['The price'])
    expect(data.held).toContainEqual({ what: 'stops: No route to buy', reason: 'says what the finding "Buyers stall when the route to buy is hidden" says' })
  })

  it('names another brief\'s idea in a line where an item rests on it, and never argues it', () => {
    const allocation = allocateIdeas([
      { headline: 'Buyers stall when the route to buy is hidden', basedOn: ['G1'], home: 'sales', second: null },
      { headline: 'Price is weighed against years of use', basedOn: ['G2', 'G9'], home: 'leadership', second: null },
    ], POINTS, { month: SEP })
    const out = salesOut({ stops: part([{ title: 'The price', text: 'People hold back when the price is not shown. They compare it with cheaper bags.', detail: 'More detail.', based_on: ['G2'] }]) })
    const { data } = composeBrief(input('sales', out, POINTS, { allocation }))
    expect(data.sections.find((s) => s.key === 'sales.stops')!.groups[0].items[0]).toMatchObject({
      title: 'The price', text: 'People hold back when the price is not shown.', tag: 'Argued in the Leadership brief',
    })
    expect(data.sections.find((s) => s.key === 'sales.stops')!.groups[0].items[0].detail).toBeUndefined()
  })

  it('how the company is remembered must be talk about the company', () => {
    const pts = [...POINTS, point('G20', 'marketing', 3, { questionId: 'marketing.recall' }), point('G21', 'marketing', 3, { questionId: 'marketing.recall' })]
    const { whoVideos } = setup(pts)
    whoVideos.set('G21', pts.find((p) => p.id === 'G21')!.videoIds.map((id) => ({ id, audience: 'client', named: [] })))
    const out: BriefOutput = {
      findings: [], believe: part([]), doubt: part([]), words: part([]), rivals: part([]), say_hear: [],
      recall: part([{ title: 'Held against it', text: 'Customers report slow replies.', based_on: ['G20'] }, { title: 'Remembered for', text: 'People praise the clean-up days.', based_on: ['G21'] }]),
      in_short: '',
    }
    const { data } = composeBrief({ ...input('marketing', out, pts), whoVideos })
    const recall = data.sections.find((s) => s.key === 'marketing.recall')!
    expect(recall.groups.map((g) => g.label)).toEqual(['Remembered for'])
    expect(data.held).toContainEqual({ what: 'recall: Held against it', reason: 'none of its videos is about Acme' })
  })

  it('an item may only cite points the writer was shown', () => {
    const out = salesOut({ stops: part([{ title: 'Leadership\'s point', text: 'Owners judge repairs.', based_on: ['G9'] }]) })
    const { data } = composeBrief(input('sales', out, POINTS))
    expect(data.sections.find((s) => s.key === 'sales.stops')).toBeUndefined()
  })
})

describe('leadership: where the market stands', () => {
  const out: BriefOutput = {
    findings: [{ idea: 'I2', saw: 'Owners describe the repair service in detail.', means: 'Repairs carry the brand\'s name with owners.', practice: [] }],
    stand: part([]), weigh: part([]), stay: part([]), move: part([]), risks: part([]), decisions: part([]),
    subjects: [{ subject: 'S1', sentence: 'People talk about the fit of the socket through a long day.' }, { subject: 'S2', sentence: 'People compare running blades.' }],
    in_short: 'Repairs matter.',
  }
  it('a calibrated subject prints its level; an uncalibrated one prints what people say and no figure; a failed one its name', () => {
    const subjects = [
      { id: 'S1', fact: fact({ subjectId: 's1', name: 'Fit & comfort', calibration: 'provisional', level: null, rank: 0 }) },
      { id: 'S2', fact: fact({ subjectId: 's2', name: 'Function', calibration: 'ready', level: { k: 90, n: 400 }, rank: 1 }) },
      { id: 'S3', fact: fact({ subjectId: 's3', name: 'Look & style', calibration: 'failed', level: null }) },
    ]
    const { data } = composeBrief(input('leadership', out, POINTS, { subjects }))
    const market = data.sections.find((s) => s.key === 'leadership.market')!
    expect(market.groups[0].items).toEqual([
      { title: 'Function', text: 'People compare running blades.', detail: '23% of September\'s videos in the market, the biggest subject.' },
      { title: 'Fit & comfort', text: 'People talk about the fit of the socket through a long day.' },
    ])
    expect(market.lines).toEqual(['Also following: Look & style.'])
  })

  it('shares: the company beside each rival with videos enough, the rest of the market in one line', () => {
    const audiences = [
      { audience: 'client', videos: 19, comments: 150 },
      { audience: 'competitor:Rival', videos: 42, comments: 650 },
      { audience: 'competitor:Tiny', videos: 1, comments: 3 },
      { audience: 'industry-other', videos: 388, comments: 10500 },
    ]
    const { data } = composeBrief(input('leadership', out, POINTS, { audiences, rivals: ['Rival', 'Tiny'] }))
    const shares = data.sections.find((s) => s.key === 'leadership.shares')!
    expect(shares.groups[0].items.map((i) => i.title)).toEqual(['Rival', 'Acme'])
    expect(shares.groups[0].lines?.[0]).toBe('Of Acme and the rival beside it, Acme draws the second largest share of September\'s comments.')
    expect(data.findings.map((f) => f.ideaId)).toEqual(['I2'])
  })
})

describe('the figures In short prints', () => {
  it('the market for every reader, then the reader\'s own: never a figure for an uncalibrated subject', () => {
    const subjects = [{ id: 'S1', fact: fact({ subjectId: 's1', name: 'Cost & access', calibration: 'provisional', level: null, rank: 0 }) }]
    const base = { company: 'Össur', month: SEP, market: { videos: 430, comments: 11000 }, subjects, ownPosts: 19, playbook: null, audiences: null }
    expect(figuresFor({ ...base, role: 'sales' })).toEqual([{ value: '430', label: 'videos in your market in September, with 11,000 comments' }])
    expect(figuresFor({ ...base, role: 'marketing' })[1]).toEqual({ value: '19', label: 'posts Össur published in September' })
  })
})

describe('the self-check across a set', () => {
  it('finds two briefs resting on the same research', () => {
    const { data: sales } = composeBrief(input('sales', salesOut(), POINTS))
    const marketing = { ...sales, role: 'marketing' as const, findings: [], sections: [{ key: 'marketing.believe' as const, title: 'x', groups: [{ items: [{ text: 'Same', basedOn: ['G2'] }] }] }] }
    expect(repeatsAcross([sales, marketing])).toEqual([{ a: 'sales sales.stops "The price"', b: 'marketing marketing.believe "Same"', overlap: 1 }])
  })
})

describe('the reading copy', () => {
  it('prints the words, where and whose, and every number from code', () => {
    const c = input('sales', salesOut(), POINTS)
    const { data } = composeBrief(c)
    const md = briefMarkdown(data, (ref) => c.quotes.textOf(ref), null)
    expect(md).toContain('# Sales brief · Acme · September 2026')
    expect(md).toContain('**Also this month, in the other briefs**')
    expect(md).toContain('- Leadership brief: Owners judge the brand by how it handles repairs')
    expect(md).toContain('_Heard in August and September, on 12 videos, others in your market._')
    expect(md).toMatch(/> "Buyers say the route to buy and the price decided point G1/)
    expect(md).toMatch(/> YouTube · 12 Sep · others in your market/)
    expect(md).not.toMatch(/—/)
  })
})
