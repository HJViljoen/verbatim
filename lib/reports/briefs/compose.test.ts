import { describe, expect, it } from 'vitest'

import type { WhoVideo } from '../../brands/attribution'
import { fact } from '../../written/test-fixtures'
import { allocateIdeas } from './allocate'
import { composeBrief, figuresFor, footnotesOnlyPrinted, namedAcross, pointToSalesGroups, repeatsAcross, summaryAgainstPrinted, type AudienceRow, type ComposeInput } from './compose'
import type { BriefAppInputs } from './app'
import { OSSUR_MOVES, OSSUR_PEOPLE } from './app-fixture'
import { SALES_GROUPS_LINE } from './app-words'
import { canvasOf } from './canvas'
import { briefMarkdown } from './markdown'
import { Meaning } from './meaning'
import { QuotePool } from './quotes'
import { briefFixture, octoberFixture } from '../../../components/briefs/fixture'
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
    cite({ insight: p.insightIds[0], video: `qa${i}`, audience: about[p.id], text: `Buyers said ${p.text.toLowerCase()} and that it decided the purchase for them.`, description: p.text }),
    cite({ insight: p.insightIds[0], video: `qb${i}`, audience: about[p.id], text: `Another buyer wrote that ${p.text.toLowerCase()} in their own words here.`, description: p.text }),
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

  it('where the company stands against its rivals: each brand a share of the month\'s comments and videos, its own posts included, the bars, the table and the notes, a giveaway said', () => {
    const audiences: AudienceRow[] = [
      { audience: 'client', videos: 10, comments: 256, platforms: { instagram: 10 } },
      { audience: 'competitor:Rival', videos: 42, comments: 650, platforms: { reddit: 30, youtube: 12 } },
      { audience: 'competitor:Tiny', videos: 1, comments: 3, platforms: { tiktok: 1 } },
      { audience: 'industry-other', videos: 388, comments: 10500, platforms: { tiktok: 200 } },
    ]
    const { data } = composeBrief(input('leadership', out, POINTS, { audiences, rivals: ['Rival', 'Tiny'], giveaway: { posts: 1, comments: 149 } }))
    const shares = data.sections.find((s) => s.key === 'leadership.shares')!
    expect(shares.title).toBe('Where Acme stands against its rivals')
    expect(shares.sub).toBe("Share of September's conversation: 11,409 comments and 441 videos, Acme's own posts included.")
    expect(shares.groups[0].items.map((i) => [i.title, i.measure?.comments, i.measure?.videos, i.detail])).toEqual([
      ['Rival', 5.7, 9.5, 'Reddit, YouTube'],
      ['Acme (you)', 2.2, 2.3, 'Its own Instagram posts'],
      ['Tiny', 0, 0.2, 'TikTok'],
    ])
    expect(shares.shares?.comments.line).toBe('Acme 2.2% · its two rivals 5.7% · the rest of the category 92.1%')
    expect(shares.lines).toEqual([
      "Acme holds 2.2% of the month's comments, second of these three brands, behind Rival's 5.7%. 149 of Acme's comments were on one giveaway post.",
      "Acme and its two rivals together hold 7.9% of the month's comments. The rest of the category holds 92.1%.",
      "Acme's comments sit under its own Instagram posts. Its rivals are talked about on Reddit, YouTube and TikTok.",
    ])
    expect(data.inShort.figures[1]).toEqual({ value: '2.2%', label: "of September's comments were under Acme's posts; Rival held 5.7%" })
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
    expect(figuresFor({ ...base, role: 'sales' })).toEqual([{ value: '430', label: 'videos in your market in September' }])
    expect(figuresFor({ ...base, role: 'marketing' })[1]).toEqual({ value: '19', label: 'posts Össur published in September' })
    expect(figuresFor({ ...base, role: 'leadership' })).toEqual([{ value: '430', label: 'videos and 11,000 comments in your market in September' }])
    // The Sales figure: the biggest ready subject.
    const ready = [{ id: 'S1', fact: fact({ subjectId: 's1', name: 'Buying & delivery', calibration: 'ready', level: { k: 99, n: 430 }, rank: 1 }) }]
    expect(figuresFor({ ...base, subjects: ready, role: 'sales' })[1]).toEqual({ value: '23%', label: 'of them about Buying & delivery, the biggest subject' })
  })
})

describe('the set', () => {
  // A page of rows that prints: its items and a second line beside them (a
  // page needs two), on videos of its own.
  const FILLER = { text: 'Owners oil zips every spring.', videoIds: ['x', 'y', 'z'] }
  const brief = (role: BriefRole, items: { text: string; videoIds: string[] }[], summary = '', filler = true): MonthlyBriefData => ({
    version: 1, kind: 'monthly_brief', role, title: role, company: 'Acme', month: SEP, heardMonths: [],
    inShort: { summary, figures: [], also: [] }, findings: [],
    sections: [{ key: role === 'sales' ? 'sales.care' : 'marketing.say_hear', title: 'x', groups: [{ items: [...items, ...(filler ? [FILLER] : [])].map((i) => ({ ...i, basedOn: [], videos: i.videoIds.length })) }] }],
    held: [], promptVersion: 'v', model: 'm', costUsd: 0,
  })

  it('a section item another brief already printed on the same videos is named in a line there', () => {
    const sales = brief('sales', [{ text: 'Rival is chosen for long trips. It has a warranty.', videoIds: ['a', 'b', 'c'] }])
    const marketing = brief('marketing', [{ text: 'Rival is chosen for long trips and its warranty. People like it.', videoIds: ['a', 'b', 'c', 'd'] }])
    const [, m] = namedAcross([sales, marketing], words())
    expect(m.sections[0].groups[0].items[0]).toMatchObject({ tag: 'Also in the Sales brief', text: 'Rival is chosen for long trips and its warranty.' })
  })

  it('names only an item the earlier brief prints: never one on a page left out as thin', () => {
    const marketing = () => brief('marketing', [{ text: 'Rival is chosen for long trips and its warranty. People like it.', videoIds: ['a', 'b', 'c', 'd'] }])
    // The Sales page holds one line: a page needs two, so it does not print.
    const thin = brief('sales', [{ text: 'Rival is chosen for long trips. It has a warranty.', videoIds: ['a', 'b', 'c'] }], '', false)
    const [, m] = namedAcross([thin, marketing()], words())
    expect(m.sections[0].groups[0].items[0].tag).toBeUndefined()
    expect(m.sections[0].groups[0].items[0].text).toBe('Rival is chosen for long trips and its warranty. People like it.')
    const [, named] = namedAcross([brief('sales', [{ text: 'Rival is chosen for long trips. It has a warranty.', videoIds: ['a', 'b', 'c'] }]), marketing()], words())
    expect(named.sections[0].groups[0].items[0].named).toEqual({ brief: 'sales', item: 'sales|sales.care||Rival is chosen for long trips. It has a warranty.' })
  })

  it('a footnote never points at what did not print: an idea with no finding, or an item on a page left out', () => {
    const argued = (idea: string) => ({ title: 'Wear doubts', text: 'Shoppers doubt the straps hold.', tag: 'Argued in the Content brief', named: { brief: 'content' as const, idea }, basedOn: [], videos: 3, videoIds: ['p', 'q', 'r'] })
    const sales = brief('sales', [{ text: 'Rival is chosen for long trips and its warranty.', videoIds: ['a', 'b', 'c'] }, { text: 'Owners wash straps after rainy hikes.', videoIds: ['d', 'e', 'f'] }])
    sales.sections[0].groups[0].items.push(argued('I3'), argued('I4'))
    const content = { ...brief('content', []), sections: [], findings: [{ ...briefFixture('content').findings[0], ideaId: 'I3' }] }
    const [s] = footnotesOnlyPrinted([sales, content])
    expect(s.sections[0].groups[0].items.map((i) => (i.named && 'idea' in i.named ? i.named.idea : i.text))).toEqual(['Rival is chosen for long trips and its warranty.', 'Owners wash straps after rainy hikes.', 'Owners oil zips every spring.', 'I3'])
    expect(s.held).toEqual([{ what: 'sales.care: Wear doubts', reason: 'it names the Content brief, which does not print what it names' }])

    // An item naming a line on a page the earlier brief leaves out is held;
    // the same line on a page that prints keeps it.
    const thin = brief('sales', [{ text: 'Rival is chosen for long trips.', videoIds: ['a', 'b', 'c'] }], '', false)
    const also = (key: string) => brief('marketing', [{ text: 'Owners clean straps.', videoIds: ['d', 'e', 'f'] }, { text: 'Rival is chosen for long trips.', videoIds: ['a', 'b'] }].map((i, k) => (k === 1 ? { ...i, tag: 'Also in the Sales brief', named: { brief: 'sales' as const, item: key } } : i)))
    const key = 'sales|sales.care||Rival is chosen for long trips.'
    const [, gone] = footnotesOnlyPrinted([thin, also(key)])
    expect(gone.sections[0].groups[0].items.map((i) => i.text)).toEqual(['Owners clean straps.', 'Owners oil zips every spring.'])
    const printing = brief('sales', [{ text: 'Rival is chosen for long trips.', videoIds: ['a', 'b', 'c'] }])
    const [, kept] = footnotesOnlyPrinted([printing, also(key)])
    expect(kept.sections[0].groups[0].items.map((i) => i.text)).toEqual(['Owners clean straps.', 'Rival is chosen for long trips.', 'Owners oil zips every spring.'])
    // A brief outside the set is not judged.
    expect(footnotesOnlyPrinted([also(key)])[0].sections[0].groups[0].items).toHaveLength(3)
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

describe('the canvas\'s components, each from material that stands', () => {
  const SALES = [
    point('G1', 'sales', 12, { questionId: 'sales.settle', text: 'Buyers ask where to order and who ships the pack to them.' }),
    point('G21', 'sales', 6, { questionId: 'sales.who', text: 'Commuters carry a laptop pack every day and want room, padded straps and a laptop sleeve that keeps its shape.' }),
    point('G22', 'sales', 5, { questionId: 'sales.who', text: 'Makers watch pack videos to sew their own pack from old jeans and rarely buy one.' }),
    point('G23', 'sales', 6, { questionId: 'sales.trigger', text: 'Owners replace a pack when the straps tear or the zip breaks.' }),
    point('G24', 'sales', 5, { questionId: 'sales.trigger', text: 'Students buy a new pack before the school term starts.' }),
    point('G25', 'sales', 5, { questionId: 'sales.rivals', text: 'Rival is chosen for long trips and its warranty.' }),
    point('G26', 'sales', 4, { questionId: 'sales.rivals', text: 'Buyers compare Rival with Trailmark and Pakt on weight and locking zips.' }),
  ]
  const ABOUT = { G25: 'competitor:Rival', G26: 'competitor:Rival' }
  const out = (o: Partial<BriefOutput>): BriefOutput => salesOut({ stops: part([]), rivals: part([]), ...o })
  const buyer = (o: Record<string, unknown>) => ({ title: 'Commuter', text: 'Commuters carry a laptop pack every day.', detail: '', based_on: ['G21'], want: 'Room, padded straps and a laptop sleeve that keeps its shape.', stops: 'Rain that soaks the bag.', moves: 'A sleeve that keeps the laptop shape.', for_sale: 'Room and straps decide it.', buys: true, status: '', ...o })

  it('a buyer card carries its columns where the points carry them, and a person who mostly does not buy is drawn quieter with their status', () => {
    const o = out({ buyers: { lead: '', items: [buyer({}), buyer({ title: 'Maker', text: 'Makers watch pack videos to sew their own pack.', based_on: ['G22'], want: 'To sew their own pack from old jeans.', stops: '', moves: '', buys: false, status: 'Mostly makes, rarely buys' })] } as never })
    const { data, scrubbed } = composeBrief(input('sales', o, SALES, {}, ABOUT))
    const [commuter, maker] = data.sections.find((s) => s.key === 'sales.buyers')!.groups[0].items
    expect(commuter.persona).toEqual({ want: 'Room, padded straps and a laptop sleeve that keeps its shape.', moves: 'A sleeve that keeps the laptop shape.', forSale: 'Room and straps decide it.' })
    // "Rain that soaks the bag." is not what the commuter's point says.
    expect(scrubbed).toContainEqual({ field: 'buyers0.stops', sentence: 'Rain that soaks the bag.', rule: 'not carried by the points kept' })
    expect(commuter.muted).toBeUndefined()
    expect(maker).toMatchObject({ title: 'Maker', muted: true, pill: 'Mostly makes, rarely buys' })
  })

  it('a voice for each of the first trigger moments, from its own points', () => {
    const o = out({ triggers: part([
      { title: 'The old pack gives out', text: 'Owners replace a pack when the straps tear or the zip breaks.', based_on: ['G23'] },
      { title: 'Back to school', text: 'Students buy a new pack before the school term starts.', based_on: ['G24'] },
    ]) })
    const items = composeBrief(input('sales', o, SALES, {}, ABOUT)).data.sections.find((s) => s.key === 'sales.triggers')!.groups[0].items
    expect(items.map((i) => !!i.quote)).toEqual([true, true])
    expect(items[0].quote?.text).toBe('')
  })

  it('a rival card says what it is bought for, its voice is talk about it, and the set\'s other brands are one line', () => {
    const o = out({
      rivals: { lead: '', items: [{ title: 'Rival', text: 'Rival is chosen for long trips and its warranty.', detail: '', based_on: ['G25'], job: 'Long trips' }] } as never,
      also_set: { text: 'Buyers compare Rival with Trailmark and Pakt on weight and locking zips.', based_on: ['G26'] },
    })
    const s = composeBrief(input('sales', o, SALES, {}, ABOUT)).data.sections.find((x) => x.key === 'sales.rivals')!
    expect(s.title).toBe('Who buyers compare you with')
    expect(s.groups[0].items[0]).toMatchObject({ title: 'Rival', pill: 'Bought for long trips' })
    expect(s.groups[0].items[0].quote?.about).toBe('rival:Rival')
    expect(s.also).toBe('Buyers compare Rival with Trailmark and Pakt on weight and locking zips.')
  })

  const MKT = [
    point('G31', 'marketing', 8, { questionId: 'marketing.notice', text: 'People call it a backpack, a rucksack or a daypack, and praise it as practical and sturdy.' }),
    point('G32', 'marketing', 6, { questionId: 'marketing.notice', text: 'People complain the pack rips, smells after rain and soaks through.' }),
    point('G33', 'marketing', 5, { questionId: 'marketing.notice', text: 'People argue over whether a handmade pack is worth the price.' }),
    point('G34', 'marketing', 6, { questionId: 'marketing.claims', text: 'People under Acme posts praise the beach clean-up days and the team.' }),
    point('G35', 'marketing', 5, { questionId: 'marketing.recall', text: 'People remember Acme for its clean-up days and its team.' }),
  ]
  const MABOUT = { G34: 'client', G35: 'client' }
  const mout = (o: Partial<BriefOutput>): BriefOutput => ({ findings: [], in_short: '', believe: part([]), doubt: part([]), recall: part([]), rivals: part([]), ...o })

  it('in its own words: the market\'s words as chips, only words a point uses, and what makes them stop and argue', () => {
    const o = mout({ own_words: {
      call_it: { words: ['backpack', 'daypack', 'rucksack', 'tote'], based_on: ['G31'] },
      praise: { words: ['practical', 'sturdy'], based_on: ['G31'] },
      problem: { words: ['rips', 'soaks through'], based_on: ['G32'] },
      lead: 'People describe the problem as packs that rip, smell and soak through.',
      stop_on: { text: 'A practical, sturdy daypack.', based_on: ['G31'] },
      share: { text: '', based_on: [] },
      argue: { text: 'Whether a handmade pack is worth the price.', based_on: ['G33'] },
    } })
    const { data } = composeBrief(input('marketing', o, MKT, {}, MABOUT))
    const s = data.sections.find((x) => x.key === 'marketing.words')!
    expect(s.chips).toEqual([
      { label: 'What they call it', words: ['backpack', 'daypack', 'rucksack'] },
      { label: 'How they praise it', words: ['practical', 'sturdy'] },
      { label: 'The problem, in their words', words: ['rips', 'soaks through'] },
    ])
    expect(data.held).toContainEqual({ what: 'own_words.call_it: tote', reason: 'no point it cites uses the words' })
    expect(s.panel?.title).toBe('What makes them stop and argue')
    expect(s.panel?.rows.map((r) => r.title)).toEqual(['They stop on', 'They argue over'])
    expect(s.lead).toBe('People describe the problem as packs that rip, smell and soak through.')
  })

  it('says and hears carries each claim\'s status, and how rivals are heard carries the company\'s own card and each brand\'s own posts', () => {
    const o = mout({
      say_hear: [{ claim: 'A1', status: 'heard_back', heard: 'People praise the beach clean-up days and the team.', based_on: ['G34'] }],
      you: { idea: 'Values', text: 'People remember Acme for its clean-up days and its team.', based_on: ['G35'] },
    })
    const posts = [
      { name: 'Acme', you: true, posts: 25, five: 11 },
      { name: 'Rival', you: false, posts: 20, five: 15 },
      { name: 'Quiet', you: false, posts: 0, five: 0 },
    ]
    const { data } = composeBrief(input('marketing', o, MKT, { claims: [{ id: 'A1', claim: 'We run beach clean-up days.' }], posts }, MABOUT))
    expect(data.sections.find((x) => x.key === 'marketing.say_hear')!.groups[0].items[0]).toMatchObject({ title: 'We run beach clean-up days.', status: 'heard_back' })
    const rivals = data.sections.find((x) => x.key === 'marketing.rivals')!
    expect(rivals.groups[0].items[0]).toMatchObject({ title: 'Acme', pill: 'Values', you: true })
    expect(rivals.posts).toEqual({ title: 'Own posts published in September', rows: [
      { name: 'Acme', you: true, posts: 25, five: 11, pct: 44 },
      { name: 'Rival', you: false, posts: 20, five: 15, pct: 75 },
    ] })
  })

  it('a status the writer did not choose from the five prints no pill', () => {
    const o = mout({ say_hear: [{ claim: 'A1', status: 'loved', heard: 'People praise the beach clean-up days and the team.', based_on: ['G34'] }] })
    const { data } = composeBrief(input('marketing', o, MKT, { claims: [{ id: 'A1', claim: 'We run beach clean-up days.' }] }, MABOUT))
    expect(data.sections.find((x) => x.key === 'marketing.say_hear')!.groups[0].items[0].status).toBeUndefined()
  })

  const LEAD = [
    ...POINTS,
    point('G41', 'leadership', 6, { questionId: 'leadership.stand', text: 'Rival is heard for travel packs that last on long trips.' }),
    point('G42', 'leadership', 5, { questionId: 'leadership.stand', text: 'Acme is heard for its clean-up days and its team values.' }),
  ]
  const LABOUT = { G41: 'competitor:Rival', G42: 'client' }
  const lout = (o: Partial<BriefOutput>): BriefOutput => ({
    findings: [{ idea: 'I2', saw: 'Owners describe the repair service in detail.', means: 'Repairs carry the brand\'s name with owners.', practice: [] }],
    weigh: part([]), stay: part([]), move: part([]), risks: part([]), decisions: part([]), in_short: '', ...o,
  })

  it('what each brand is heard for prints on the finding, each brand from talk about it, the company last', () => {
    const o = lout({ heard_for: [
      { brand: 'Acme', phrase: 'Clean-up days and team values', based_on: ['G42'] },
      { brand: 'Rival', phrase: 'Travel packs that last', based_on: ['G41'] },
      { brand: 'Osprey', phrase: 'Hip belts', based_on: ['G41'] },
    ] })
    const { data } = composeBrief(input('leadership', o, LEAD, {}, LABOUT))
    expect(data.findings[0].heardFor).toEqual([
      { name: 'Rival', you: false, phrase: 'Travel packs that last' },
      { name: 'Acme', you: true, phrase: 'Clean-up days and team values' },
    ])
    expect(data.held).toContainEqual({ what: 'heard_for: Osprey', reason: 'not the company or a tracked rival a cited point names' })
  })

  it('what holds so far prints the month\'s long-run patterns and the company\'s position in one line', () => {
    const o = lout({ position: { text: 'Acme is heard for its clean-up days and its team values.', based_on: ['G42'] } })
    const longRun = { months: ['2026-08-01', SEP], ideas: [
      { headline: 'Buyers judge a pack by how it carries a full load', videos: 30, months: [{ month: '2026-08-01', videos: 12 }, { month: SEP, videos: 20 }] },
      { headline: 'Thin pattern', videos: 2, months: [{ month: SEP, videos: 2 }] },
    ] }
    const s = composeBrief(input('leadership', o, LEAD, { longRun }, LABOUT)).data.sections.find((x) => x.key === 'leadership.holds')!
    expect(s.groups[0].items.map((i) => i.text)).toEqual(['Buyers judge a pack by how it carries a full load'])
    expect(s.sub).toBe('Patterns here describe August and September. Each was heard in both months.')
    expect(s.position?.text).toBe('Acme is heard for its clean-up days and its team values.')
    // No long-run read: no page.
    expect(composeBrief(input('leadership', o, LEAD, {}, LABOUT)).data.sections.some((x) => x.key === 'leadership.holds')).toBe(false)
  })

  it('what people did in the comments and the mood print as shares only over enough videos', () => {
    const subjects = [{ id: 'S1', fact: fact({ subjectId: 's1', name: 'Function', calibration: 'ready', level: { k: 90, n: 400 }, rank: 1 }) }]
    const o = lout({ subjects: [{ subject: 'S1', sentence: 'People compare running packs.' }] })
    const kinds = { n: 400, judged: 380, kinds: [{ kind: 'praise', k: 290 }, { kind: 'question', k: 200 }, { kind: 'pain_point', k: 150 }, { kind: 'objection', k: 8 }], mood: [{ mood: 'positive', k: 290 }, { mood: 'mixed', k: 50 }, { mood: 'neutral', k: 30 }, { mood: 'negative', k: 10 }] }
    const m = composeBrief(input('leadership', o, LEAD, { subjects, kinds }, LABOUT)).data.sections.find((x) => x.key === 'leadership.market')!
    expect(m.kinds).toEqual({ base: 'Share of the 400 videos in your market in September', rows: [{ label: 'Saying it worked', pct: 72.5 }, { label: 'Asking how it works', pct: 50 }, { label: 'Hitting a problem', pct: 37.5 }] })
    expect(m.mood?.base).toBe('380 of the same 400 videos')
    expect(m.mood?.rows.map((r) => r.pct)).toEqual([76.3, 13.2, 7.9, 2.6])
    const thin = composeBrief(input('leadership', o, LEAD, { subjects, kinds: { ...kinds, n: 80 } }, LABOUT)).data.sections.find((x) => x.key === 'leadership.market')!
    expect(thin.kinds).toBeUndefined()
  })

  it('a finding is part of the ready subject half its insights are members of, and says so with the level', () => {
    const subjects = [{ id: 'S1', fact: fact({ subjectId: 's1', name: 'Buying & delivery', calibration: 'ready', level: { k: 99, n: 430 }, rank: 1 }) }]
    const insightSubjects = new Map([['i-G1', ['s1']]])
    const { data } = composeBrief(input('sales', salesOut(), POINTS, { subjects, insightSubjects }))
    expect(data.findings[0].subjectLine).toBe('Part of Buying & delivery, the biggest subject in your market: 23% of September\'s videos.')
    expect(composeBrief(input('sales', salesOut(), POINTS, { subjects })).data.findings[0].subjectLine).toBeUndefined()
  })
})

describe('the October canvas: the pages read from the app (`fromApp`)', () => {
  const leadOut: BriefOutput = {
    findings: [{ idea: 'I2', saw: 'Owners describe the repair service in detail.', means: 'Repairs carry the brand\'s name with owners.', practice: [] }],
    stand: part([]), weigh: part([]), stay: part([]), move: part([]),
    decisions: part([]), risks: part([]),
    subjects: [{ subject: 'S1', sentence: 'People talk about the fit of the socket through a long day.' }, { subject: 'S2', sentence: 'People compare running blades.' }],
    in_short: 'Repairs matter.',
  }
  const subjects = [
    { id: 'S1', fact: fact({ subjectId: 's1', name: 'Fit & comfort', calibration: 'ready', level: { k: 120, n: 400 }, rank: 1 }) },
    { id: 'S2', fact: fact({ subjectId: 's2', name: 'Function', calibration: 'ready', level: { k: 90, n: 400 }, rank: 2 }) },
    { id: 'S3', fact: fact({ subjectId: 's3', name: 'Cost & access', calibration: 'provisional', level: null, rank: 0 }) },
  ]
  const app = (over: Partial<BriefAppInputs> = {}): BriefAppInputs => ({ month: SEP, subjectReads: null, people: null, named: null, products: null, ideas: null, hooks: null, moves: null, ...over })

  it('given what the app read, the brief carries fromApp (the October canvas); without it, none (the 12 Oct canvas)', () => {
    const v2 = composeBrief(input('sales', salesOut(), POINTS, { app: app({ people: OSSUR_PEOPLE }) })).data
    expect(v2.fromApp?.map((s) => s.key)).toEqual(['sales.groups'])
    expect(canvasOf(v2)).toBe('v2')
    // The writer's buyer types are still written and stored.
    expect(v2.sections.some((s) => s.key === 'sales.stops')).toBe(true)
    const empty = composeBrief(input('sales', salesOut(), POINTS, { app: null })).data
    expect(empty.fromApp).toEqual([])
    expect(canvasOf(empty)).toBe('v2')
    const v1 = composeBrief(input('sales', salesOut(), POINTS)).data
    expect('fromApp' in v1).toBe(false)
    expect(canvasOf(v1)).toBe('v1')
  })

  it('Where the market stands: each READY subject in its own read on Market, the writer\'s sentence where the month holds none, an unready one never (U6)', () => {
    const reads = [{ id: 's1', status: 'ready' as const, headline: 'The socket decides whether the leg is worn', means: 'Pain returns to the socket. More follows.', line: null }]
    const { data } = composeBrief(input('leadership', leadOut, POINTS, { subjects, app: app({ subjectReads: reads }) }))
    const page = data.fromApp!.find((s) => s.key === 'leadership.subjects')!
    expect(page.groups[0].items).toEqual([
      { title: 'Fit & comfort', text: 'The socket decides whether the leg is worn', detail: 'Pain returns to the socket.', slot: 'week_read', measure: { pct: 30 }, href: '/dashboard/market/subjects/s1?period=month&month=2026-09' },
      { title: 'Function', text: 'People compare running blades.', measure: { pct: 23 }, href: '/dashboard/market/subjects/s2?period=month&month=2026-09' },
    ])
    expect(page.base).toBe('Share of the 400 videos in your market in September · each subject in Market’s own words')
    expect(page.link).toEqual({ href: '/dashboard/market?period=month&month=2026-09', text: 'Open September on Market →' })
    // The writer's market page is still built and stored.
    expect(data.sections.some((s) => s.key === 'leadership.market')).toBe(true)
  })

  it('Your moves\' advice folds by the step\'s own vectors, and with none is drawn unmerged', () => {
    const vectors = new Map<string, number[]>()
    const same = [1, 0, 0]
    OSSUR_MOVES.pool.forEach((r, k) => vectors.set(`${r.title}. ${r.why ?? ''}`.trim(), k < 2 ? same : [0, k === 2 ? 1 : 0, k === 3 ? 1 : 0]))
    const folded = composeBrief(input('leadership', leadOut, POINTS, { subjects, meaning: new Meaning(vectors, 'vectors'), app: app({ moves: OSSUR_MOVES }) })).data
    expect(folded.fromApp!.find((s) => s.key === 'leadership.moves')!.moves!.waiting).toHaveLength(3)
    const collect = new Meaning(new Map(), 'collect')
    const flat = composeBrief(input('leadership', leadOut, POINTS, { subjects, meaning: collect, app: app({ moves: OSSUR_MOVES }) })).data
    expect(flat.fromApp!.find((s) => s.key === 'leadership.moves')!.moves!.waiting).toHaveLength(4)
    // The first pass asks for every advice text, so the one embedding batch
    // carries them: no call of its own.
    expect(collect.wanted()).toContain('Create an Össur Access Navigator for new amputees and caregivers. Build one route through cover, providers and fitting.')
  })

  it('the Leadership groups\' foot points at the Sales brief only where the Sales brief prints its groups', () => {
    const lead = octoberFixture('leadership')
    const sales = octoberFixture('sales')
    const [, pointed] = pointToSalesGroups([sales, lead])
    expect(pointed.fromApp!.find((s) => s.key === 'leadership.groups')!.foot).toBe(`Each update describes the groups afresh, so no count is set against September. ${SALES_GROUPS_LINE}`)
    const noGroups = { ...sales, fromApp: [] }
    const [, alone] = pointToSalesGroups([noGroups, pointed])
    expect(alone.fromApp!.find((s) => s.key === 'leadership.groups')!.foot).toBe('Each update describes the groups afresh, so no count is set against September.')
    // Idempotent, and a set with no Sales brief is not judged.
    expect(pointToSalesGroups([sales, pointed])[1]).toBe(pointed)
    expect(pointToSalesGroups([lead])[0]).toBe(lead)
  })
})
