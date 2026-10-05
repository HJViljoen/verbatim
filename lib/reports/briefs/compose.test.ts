import { describe, expect, it } from 'vitest'

import type { WhoVideo } from '../../brands/attribution'
import { fact } from '../../written/test-fixtures'
import { allocateIdeas } from './allocate'
import { composeBrief, figuresFor, namedAcross, repeatsAcross, summaryAgainstPrinted, type ComposeInput } from './compose'
import { briefMarkdown } from './markdown'
import { Meaning } from './meaning'
import { QuotePool } from './quotes'
import { cite, point } from './test-fixtures'
import type { BriefRole, GroundedPoint, MonthlyBriefData } from './types'
import type { BriefOutput } from './write'

const CLIENT = '00000000-0000-0000-0000-00000000000b'
const SEP = '2026-09-01'
const words = () => new Meaning(new Map(), 'words')

/** Videos about whom, per point: the market by default. */
function setup(points: GroundedPoint[], about: Record<string, string> = {}) {
  const whoVideos = new Map<string, WhoVideo[]>(points.map((p) => [p.id, p.videoIds.map((id) => ({ id, audience: about[p.id] ?? 'industry-other', named: [] }))]))
  const counted = new Map(points.map((p, i) => [p.id, [
    cite({ insight: p.insightIds[0], video: `qa${i}`, text: `Buyers said ${p.text.toLowerCase()} and that it decided the purchase for them.`, description: p.text }),
    cite({ insight: p.insightIds[0], video: `qb${i}`, text: `Another buyer wrote that ${p.text.toLowerCase()} in their own words here.`, description: p.text }),
  ]]))
  return { whoVideos, quotes: new QuotePool(counted, { clientId: CLIENT, company: 'Acme', brandsOf: new Map(), meaning: words() }) }
}

const part = (items: { title?: string; text: string; detail?: string; based_on: string[] }[], lead = '') =>
  ({ lead, items: items.map((i) => ({ title: i.title ?? '', text: i.text, detail: i.detail ?? '', based_on: i.based_on })) })

const POINTS = [
  point('G1', 'sales', 12, { questionId: 'sales.settle', months: ['2026-08-01', SEP], text: 'Buyers ask where to order and who ships the pack to them.' }),
  point('G2', 'sales', 6, { questionId: 'sales.stops', text: 'People hold back when the price of the pack is not shown.' }),
  point('G3', 'sales', 1, { questionId: 'sales.stops', usable: false, text: 'One owner says the zip broke.' }),
  point('G4', 'sales', 5, { questionId: 'sales.rivals', text: 'Rival is chosen for long trips and its warranty.' }),
  point('G5', 'sales', 5, { questionId: 'sales.rivals', text: 'Buyers compare packs on weight.' }),
  point('G6', 'sales', 4, { questionId: 'sales.rivals', text: 'Rival owners complain that the pack price is high.' }),
  point('G9', 'leadership', 8, { questionId: 'leadership.risk', text: 'Owners judge the brand by how it handles repairs.' }),
  point('G10', 'leadership', 6, { questionId: 'leadership.risk', text: 'Owners worry that repairs take months.' }),
]
const RIVAL_ABOUT = { G4: 'competitor:Rival' }

function input(role: BriefRole, written: BriefOutput, points: GroundedPoint[], over: Partial<ComposeInput> = {}, about: Record<string, string> = RIVAL_ABOUT): ComposeInput {
  const allocation = allocateIdeas([
    { headline: 'Buyers stall when the route to buy is hidden', basedOn: ['G1'], home: 'sales', second: null },
    { headline: 'Owners judge the brand by how it handles repairs', basedOn: ['G9'], home: 'leadership', second: null },
  ], points, { month: SEP })
  const { whoVideos, quotes } = setup(points, about)
  return {
    role, company: 'Acme', month: SEP, noun: null, allocation, points, whoVideos, quotes, meaning: words(), written,
    rivals: ['Rival'], audiences: null, market: { videos: 900, comments: 20000 }, ownPosts: 5, giveaway: null, playbook: null,
    brandsCounted: { client: true, rivals: ['Rival', 'Tiny'] },
    model: 'test', costUsd: 0.1, ...over,
  }
}

const salesOut = (over: Partial<BriefOutput> = {}): BriefOutput => ({
  findings: [{ idea: 'I1', saw: 'Buyers ask where to order and who ships to them. People under Acme\'s posts ask for the price.\n\nThey ask about delivery too.', means: 'The route to buy decides whether interest becomes an order.', practice: ['A buyer who asks about shipping has chosen the product.', 'Acme should list the shops.'] }],
  buyers: part([]), deciders: part([]),
  stops: part([{ title: 'The price', text: 'People hold back when the price of the pack is not shown.', based_on: ['G2'] }, { title: 'One voice', text: 'One owner says the zip broke.', based_on: ['G3'] }]),
  settle: part([]),
  triggers: part([]),
  rivals: part([
    { title: 'Rival', text: 'Rival is chosen for long trips and its warranty.', detail: 'Rival owners complain the pack price is high.', based_on: ['G4', 'G6'] },
    { title: 'Osprey', text: 'Chosen for comfort.', based_on: ['G5'] },
  ]),
  care: part([]),
  in_short: 'Buyers ask where to order the pack. People hold back on the price of the pack. The market now reads as more demanding.',
  ...over,
})

describe('composing one brief', () => {
  it('prints only the ideas homed in this brief, and names the others in one line each', () => {
    const { data } = composeBrief(input('sales', salesOut(), POINTS))
    expect(data.findings.map((f) => f.headline)).toEqual(['Buyers stall when the route to buy is hidden'])
    expect(data.inShort.also).toEqual([{ headline: 'Owners judge the brand by how it handles repairs', brief: 'leadership' }])
  })

  it('code writes the finding\'s evidence, and its two quotes come from two videos', () => {
    const f = composeBrief(input('sales', salesOut(), POINTS)).data.findings[0]
    expect(f.videos).toBe(12)
    expect(f.months.map((m) => m.month)).toEqual(['2026-08-01', SEP])
    expect(f.quotes).toHaveLength(2)
    expect(f.quotes.every((q) => q.text === '')).toBe(true)
  })

  it('scrubs advice out of what it means, and records every sentence it drops with the rule', () => {
    const { data, scrubbed } = composeBrief(input('sales', salesOut(), POINTS))
    expect(data.findings[0].practice).toEqual(['A buyer who asks about shipping has chosen the product.'])
    // What was heard about a brand rests on videos about it.
    expect(data.findings[0].saw).toEqual(['Buyers ask where to order and who ships to them.', 'They ask about delivery too.'])
    expect(scrubbed).toContainEqual({ field: 'I1.saw', sentence: 'People under Acme\'s posts ask for the price.', rule: 'names Acme on 0 videos about it' })
    expect(scrubbed).toContainEqual(expect.objectContaining({ field: 'in_short', rule: 'now reads as' }))
  })

  it('holds an item on an unusable point and a rival not tracked; a rival entry rests on talk about that rival alone', () => {
    const { data } = composeBrief(input('sales', salesOut(), POINTS))
    const stops = data.sections.find((s) => s.key === 'sales.stops')!
    expect(stops.groups[0].items.map((i) => i.title)).toEqual(['The price'])
    // Rival rests on G4 (about Rival) only: G6 is market talk, so its
    // pushback line, which only G6 carries, does not print against Rival.
    const rivals = data.sections.find((s) => s.key === 'sales.rivals')!
    expect(rivals.groups[0].items[0]).toMatchObject({ title: 'Rival', text: 'Rival is chosen for long trips and its warranty.', videos: 5, basedOn: ['G4'] })
    expect(rivals.groups[0].items[0].detail).toBeUndefined()
    expect(data.held.find((h) => h.what === 'rivals: Osprey')).toBeDefined()
    const out = salesOut({ rivals: part([{ title: 'Osprey', text: 'Buyers compare packs on weight.', based_on: ['G5'] }]) })
    expect(composeBrief(input('sales', out, POINTS)).data.held).toContainEqual({ what: 'rivals: Osprey', reason: 'not a tracked rival a cited point names' })
  })

  it('a rival entry needs three videos about that rival', () => {
    const pts = POINTS.map((p) => (p.id === 'G4' ? { ...p, videoIds: ['r1', 'r2'], monthVideoIds: { [SEP]: ['r1', 'r2'] } } : p))
    const { data } = composeBrief(input('sales', salesOut(), pts))
    expect(data.sections.find((s) => s.key === 'sales.rivals')).toBeUndefined()
    expect(data.held).toContainEqual({ what: 'rivals: Rival', reason: 'only 2 of its videos are about Rival' })
  })

  it('an item that names a brand with too few videos about it is held', () => {
    const out = salesOut({ stops: part([{ title: 'Price', text: 'People say Acme holds back on the price of the pack.', based_on: ['G2'] }]) })
    const { data } = composeBrief(input('sales', out, POINTS))
    expect(data.held).toContainEqual({ what: 'stops: Price', reason: 'only 0 of its videos are about Acme' })
  })

  it('an item must say what the points it cites say, and may cite only its own part\'s questions', () => {
    const out = salesOut({ stops: part([
      { title: 'Repairs', text: 'Owners judge repairs.', based_on: ['G9'] },
      { title: 'Colour', text: 'Buyers want brighter colours.', based_on: ['G2'] },
    ]) })
    const { data } = composeBrief(input('sales', out, POINTS))
    expect(data.held).toContainEqual({ what: 'stops: Repairs', reason: 'it cites no point its part is written from' })
    expect(data.held).toContainEqual({ what: 'stops: Colour', reason: 'it says nothing the points it cites say' })
  })

  it('an item that is the brief\'s own finding again is held', () => {
    const out = salesOut({ stops: part([{ title: 'No route to buy', text: 'Buyers ask where to order and who ships the pack.', based_on: ['G1'] }]) })
    const { data } = composeBrief(input('sales', out, POINTS))
    expect(data.held).toContainEqual({ what: 'stops: No route to buy', reason: 'says what the finding "Buyers stall when the route to buy is hidden" says' })
  })

  it('a label the scrub drops takes its item to held, with the rule', () => {
    const out = salesOut({ stops: part([{ title: 'Still the price', text: 'People hold back when the price of the pack is not shown.', based_on: ['G2'] }]) })
    const { data } = composeBrief(input('sales', out, POINTS))
    expect(data.held).toContainEqual({ what: 'stops: Still the price', reason: 'its label broke a rule (time word)' })
  })

  it('names another brief\'s idea in a line where an item rests on it, and never argues it', () => {
    const allocation = allocateIdeas([
      { headline: 'Buyers stall when the route to buy is hidden', basedOn: ['G1'], home: 'sales', second: null },
      { headline: 'Price is weighed against years of use', basedOn: ['G2', 'G9'], home: 'leadership', second: null },
    ], POINTS, { month: SEP })
    const out = salesOut({ stops: part([{ title: 'The price', text: 'People hold back when the price of the pack is not shown. They compare it with cheaper packs.', detail: 'More detail.', based_on: ['G2'] }]) })
    const { data } = composeBrief(input('sales', out, POINTS, { allocation }))
    expect(data.sections.find((s) => s.key === 'sales.stops')!.groups[0].items[0]).toMatchObject({
      title: 'The price', text: 'People hold back when the price of the pack is not shown.', tag: 'Argued in the Leadership brief',
    })
  })
})

describe('leadership', () => {
  const out: BriefOutput = {
    findings: [{ idea: 'I2', saw: 'Owners describe the repair service in detail.', means: 'Repairs carry the brand\'s name with owners.', practice: [] }],
    stand: part([]), weigh: part([]), stay: part([]), move: part([]),
    // The writer put the question in the title of an untitled part.
    decisions: part([
      { title: 'How does Acme handle repairs for owners?', text: '', based_on: ['G9'] },
      { title: 'How long do owners wait for repairs?', text: '', based_on: ['G10'] },
    ]),
    risks: part([{ title: 'Repair waits', text: 'Owners worry that repairs take months.', based_on: ['G10'] }]),
    subjects: [{ subject: 'S1', sentence: 'People talk about the fit of the socket through a long day.' }, { subject: 'S2', sentence: 'People compare running blades.' }],
    in_short: 'Repairs matter.',
  }
  it('a calibrated subject prints its level, an uncalibrated one what people say and no figure, and a subject with nothing said nothing at all', () => {
    const subjects = [
      { id: 'S1', fact: fact({ subjectId: 's1', name: 'Fit & comfort', calibration: 'provisional', level: null, rank: 0 }) },
      { id: 'S2', fact: fact({ subjectId: 's2', name: 'Function', calibration: 'ready', level: { k: 90, n: 400 }, rank: 1 }) },
      { id: 'S3', fact: fact({ subjectId: 's3', name: 'Look & style', calibration: 'failed', level: null }) },
      { id: 'S4', fact: fact({ subjectId: 's4', name: 'Cost & access', calibration: 'provisional', level: null, rank: 0 }) },
    ]
    const { data } = composeBrief(input('leadership', out, POINTS, { subjects }))
    const market = data.sections.find((s) => s.key === 'leadership.market')!
    expect(market.groups[0].items).toEqual([
      // The level as a measure too: the deck draws its bar from it.
      { title: 'Function', text: 'People compare running blades.', detail: '23% of September\'s videos in the market, the biggest subject.', measure: { pct: 23 } },
      { title: 'Fit & comfort', text: 'People talk about the fit of the socket through a long day.' },
    ])
    expect(market.lines).toBeUndefined()
    expect(market.base).toMatch(/^Share of the [\d,]+ videos in your market in September$/)
    expect(data.held.map((h) => h.what)).toEqual(expect.arrayContaining(['subject: Cost & access', 'subject: Look & style']))
    // A question may rest on the finding; one that only asks the risk above
    // it again, on its videos, is held.
    expect(data.sections.find((s) => s.key === 'leadership.decisions')?.groups[0].items.map((i) => i.text)).toEqual(['How does Acme handle repairs for owners?'])
    expect(data.held).toContainEqual({ what: 'decisions: How long do owners wait for repairs?', reason: 'says what "Repair waits" says' })
  })

  it('talk about each brand: rivals as a share of the market, the company\'s own posts as a count with any giveaway named, and no rank', () => {
    const audiences = [
      { audience: 'client', videos: 10, comments: 256 },
      { audience: 'competitor:Rival', videos: 42, comments: 650 },
      { audience: 'competitor:Tiny', videos: 1, comments: 3 },
      { audience: 'industry-other', videos: 388, comments: 10500 },
    ]
    const { data } = composeBrief(input('leadership', out, POINTS, { audiences, giveaway: { posts: 1, comments: 149 } }))
    const shares = data.sections.find((s) => s.key === 'leadership.shares')!
    expect(shares.groups[0].items.map((i) => i.text)).toEqual(['3.3% of the market\'s comments and 4.7% of its videos, on videos about Rival.'])
    expect(shares.groups[0].lines).toEqual(['Acme\'s own posts drew 256 comments in September, 149 of them on one giveaway post.'])
    expect(JSON.stringify(shares)).not.toMatch(/largest|second|smaller share|larger share/)
  })

  it('no share of talk by brand where the product does not count the brands', () => {
    const audiences = [{ audience: 'client', videos: 19, comments: 150 }, { audience: 'competitor:Rival', videos: 42, comments: 650 }]
    const { data } = composeBrief(input('leadership', out, POINTS, { audiences, brandsCounted: { client: false, rivals: [] } }))
    expect(data.sections.find((s) => s.key === 'leadership.shares')).toBeUndefined()
  })
})

describe('the figures In short prints', () => {
  it('the market for every reader, then the reader\'s own: never a figure for an uncalibrated subject, never a share by brand', () => {
    const subjects = [{ id: 'S1', fact: fact({ subjectId: 's1', name: 'Cost & access', calibration: 'provisional', level: null, rank: 0 }) }]
    const base = { company: 'Össur', month: SEP, market: { videos: 430, comments: 11000 }, subjects, ownPosts: 19, playbook: null }
    expect(figuresFor({ ...base, role: 'sales' })).toEqual([{ value: '430', label: 'videos in your market in September, with 11,000 comments' }])
    expect(figuresFor({ ...base, role: 'marketing' })[1]).toEqual({ value: '19', label: 'posts Össur published in September' })
    expect(figuresFor({ ...base, role: 'leadership' })).toHaveLength(1)
  })
})

describe('the set', () => {
  const brief = (role: BriefRole, items: { text: string; videoIds: string[] }[], summary = ''): MonthlyBriefData => ({
    version: 1, kind: 'monthly_brief', role, title: role, company: 'Acme', month: SEP, heardMonths: [],
    inShort: { summary, figures: [], also: [] }, findings: [],
    sections: [{ key: role === 'sales' ? 'sales.rivals' : 'marketing.rivals', title: 'x', groups: [{ items: items.map((i) => ({ ...i, basedOn: [], videos: i.videoIds.length })) }] }],
    held: [], promptVersion: 'v', model: 'm', costUsd: 0,
  })

  it('a section item another brief already printed on the same videos is named in a line there', () => {
    const sales = brief('sales', [{ text: 'Rival is chosen for long trips. It has a warranty.', videoIds: ['a', 'b', 'c'] }])
    const marketing = brief('marketing', [{ text: 'Rival is chosen for long trips and its warranty. People like it.', videoIds: ['a', 'b', 'c', 'd'] }])
    const [, m] = namedAcross([sales, marketing], words())
    expect(m.sections[0].groups[0].items[0]).toMatchObject({ tag: 'Also in the Sales brief', text: 'Rival is chosen for long trips and its warranty.' })
  })

  it('In short keeps only what the brief printed, and a sentence naming a brand only what it printed about that brand', () => {
    const d = brief('sales', [{ text: 'Rival is chosen for long trips and its warranty.', videoIds: ['a', 'b', 'c'] }],
      'Rival is chosen for long trips. Acme stands out for recycled sails. Buyers love bright colours.')
    const out = summaryAgainstPrinted(d, words(), ['Acme', 'Rival'])
    expect(out.inShort.summary).toBe('Rival is chosen for long trips.')
    expect(out.held.map((h) => h.reason)).toEqual(['nothing printed about Acme says it', 'nothing the brief printed says it'])
  })

  it('In short does not summarise what another brief argues', () => {
    const d = brief('sales', [{ text: 'Rival is chosen for long trips and its warranty.', videoIds: ['a', 'b', 'c'] }, { text: 'Owners wash straps after rainy hikes.', videoIds: ['d', 'e', 'f'] }],
      'Rival is chosen for long trips. Owners clean straps after muddy hikes.')
    d.sections[0].groups[0].items.push({ text: 'Owners clean straps after muddy hikes.', tag: 'Argued in the Content brief', basedOn: [], videos: 3 })
    d.inShort.also = [{ headline: 'Owners clean straps after muddy hikes', brief: 'content' }]
    const out = summaryAgainstPrinted(d, words(), ['Acme', 'Rival'])
    expect(out.inShort.summary).toBe('Rival is chosen for long trips.')
    expect(out.held.map((h) => h.reason)).toEqual(['it says what another brief argues'])
  })

  it('finds two briefs resting on the same research, and says whether it is named in a line', () => {
    const { data: sales } = composeBrief(input('sales', salesOut(), POINTS))
    const marketing = { ...sales, role: 'marketing' as const, findings: [], sections: [{ key: 'marketing.believe' as const, title: 'x', groups: [{ items: [{ text: 'Same', basedOn: ['G2'] }] }] }] }
    expect(repeatsAcross([sales, marketing])).toEqual([{ a: 'sales sales.stops "The price"', b: 'marketing marketing.believe "Same"', overlap: 1, tagged: false }])
  })
})

describe('the reading copy', () => {
  it('prints the words, where and whose, and every number from code', () => {
    const c = input('sales', salesOut(), POINTS)
    const { data } = composeBrief(c)
    const md = briefMarkdown(data, (ref) => c.quotes.textOf(ref), null)
    expect(md).toContain('# Sales brief · Acme · September 2026')
    expect(md).toContain('- Leadership brief: Owners judge the brand by how it handles repairs')
    expect(md).toContain('_Heard in August and September, on 12 videos, others in your market._')
    expect(md).toMatch(/> "Buyers said buyers ask where to order/)
    expect(md).not.toMatch(/—/)
  })
})
