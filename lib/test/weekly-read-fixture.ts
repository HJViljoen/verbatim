import type { WeekReadDataV1, WeekReadDataV2, WeekReadFlag, WeekReadUnusual, QuoteRef } from '../written/types'
import { WEEKLY_READ_REPORT_VERSION, weeklyReadSnapshotData, type WeeklyReadSnapshotData } from '../reports/weekly-read-build'
import type { WeeklyReadLine } from '../reports/weekly-read-lines'

// The weekly read as the render tier sees it, built from Sealand's 27 Sep dry
// read (v3b, `week_read_v3`, reads/2026-09-27-dry-v3b.json in the plan),
// trimmed to what the report prints: the report sections, the three findings,
// the market's four numbers and the figures the evidence lines name. The
// quotes are the real comments the dry read resolved for reading; `frozen`
// empties them, as a stored row holds them.

const q = (ref: string, date: string, platform: string, thread: string, text = ''): QuoteRef & { text: string } =>
  ({ ref, text, date, platform, thread }) as QuoteRef & { text: string }

export const SEALAND_READ_WINDOW = { from: '2026-09-20T04:02:57.874+00:00', to: '2026-09-27T04:03:42.768+00:00' }

/** Sealand's 27 Sep read, its quotes' words resolved. */
export function sealandRead(over: Partial<WeekReadDataV2> = {}): WeekReadDataV2 {
  return {
    version: 2,
    window: SEALAND_READ_WINDOW,
    month: '2026-09-01',
    headline: 'Buyers treated bag choice as a practical match, comparing named models by trip fit, proof of quality and the colour they wanted.',
    story: [
      {
        body: 'The week was about active bag shopping. The bag had to match a specific trip and a specific way of carrying it.',
        basedOn: ['t1', 't2'],
        quote: q('e:bd2a2f71-2240-4365-9c44-01d685e970b1', '2026-09-26', 'reddit', 'reddit::1wqnkk2', 'I recommend looking at Columbia tiger brook series.'),
      },
      {
        body: 'The same practical test carried into price. A pricier bag was treated as worth it when materials, durability and comfort suggested years of use, but people pushed back when a bag felt above budget or when the build, weight, space planning or water protection did not seem to match the ask. Cotopaxi was one place where that argument was spelled out.',
        basedOn: ['t2', 't4'],
        quote: null,
      },
      {
        body: 'Colour sat inside that same purchase decision. People said the backpack caught their attention because of the colour, asked for red and purple, and said limited options stopped them from buying. For these buyers, the exact shade is part of choosing the bag.',
        basedOn: ['t3'],
        quote: q('e:e2e1146c-be79-452f-b943-2f3381a662f9', '2026-09-24', 'youtube', 'youtube::vxQjndDyq6w', 'Thanks for calling them out on the Empire, we need MORE COLORS!!!'),
      },
    ],
    implications: [
      { body: 'Sealand sells travel gear into a market that asks for exact bag jobs, carry on size, expandability, commute use and walking comfort. Its outdoor and urban claim meets buyers who sort bags by those details.', basedOn: ['t1'] },
      { body: 'Sealand says great design and responsible production can coexist. This week price was judged through material quality, durability and comfort over years of use, so the good business story sits beside a bag quality test.', basedOn: ['t2'] },
      { body: "Sealand's upcycled and dead stock collections carry a story of transformation. Buyers this week also treated the exact colour as a purchase reason, so the shade is part of what the product is.", basedOn: ['t3'] },
    ],
    newThisWeek: [],
    watch: [{ body: 'Whether colour requests keep naming exact shades when people say they want the bag', basedOn: ['t3'] }],
    findings: [
      {
        headline: 'Buyers ask for named alternatives that match exact bag needs',
        saw: 'People ask for specific backpack brands and models, from Alpaka and Bellroy to Osprey, Patagonia and GoRuck.',
        means: 'Choice is made inside a comparison set. A bag enters the market beside named rivals and is judged by how exactly it suits a trip, a body and a routine.',
        basedOn: ['t1'],
        quote: q('e:e2aa9829-a7ec-4947-ac47-387a9a14133c', '2026-09-21', 'reddit', 'reddit::1wly4t2', 'If you think you’ll be doing a lot of walking with the backpack, I’d recommend the Osprey Farpoint.'),
        videos: { week: 7, month: 16 },
        subjectId: null, isNew: false, sure: 'reasonable',
        evidence: '[[f1_week]] videos this week · [[f1_month]] in September so far',
        context: '',
      },
      {
        headline: 'Colour choice can decide whether buyers want the bag',
        saw: 'People say they want the backpack because of how it looks, especially the colour.',
        means: 'Colour is part of purchase fit. Buyers treat the exact shade as a reason to buy or not buy the bag.',
        basedOn: ['t3'],
        quote: null,
        videos: { week: 6, month: 22 },
        subjectId: 's1', isNew: false, sure: 'reasonable',
        evidence: '[[f2_week]] videos this week · [[f2_month]] in September so far',
        context: 'Part of Buying & delivery: [[subj_bd_level]] of [[subj_bd_n]] videos in your market in September, the biggest subject.',
      },
      {
        headline: 'A high price is accepted when quality looks built to last',
        saw: 'People question resale claims and push back on bags that sit above budget or feel overpriced.',
        means: 'Price is translated into years of use, materials and daily carry. Buyers dispute the cost when those proofs are missing.',
        basedOn: ['t2', 't4'],
        quote: null,
        videos: { week: 5, month: 9 },
        subjectId: 's2', isNew: false, sure: 'reasonable',
        evidence: '[[f3_week]] videos this week · [[f3_month]] in September so far',
        context: '',
      },
    ],
    standing: [],
    market: { week: { videos: 274, comments: 4777 }, month: { videos: 852, comments: 21468 } },
    figures: {
      f1_week: { label: 'videos this week behind the first finding', value: '7', kind: 'count' },
      f1_month: { label: 'videos in September so far behind the first finding', value: '16', kind: 'count' },
      f2_week: { label: 'videos this week behind the second finding', value: '6', kind: 'count' },
      f2_month: { label: 'videos in September so far behind the second finding', value: '22', kind: 'count' },
      f3_week: { label: 'videos this week behind the third finding', value: '5', kind: 'count' },
      f3_month: { label: 'videos in September so far behind the third finding', value: '9', kind: 'count' },
      subj_bd_level: { label: 'Buying & delivery', value: '23%', kind: 'pct' },
      subj_bd_n: { label: 'videos in your market in September', value: '852', kind: 'count' },
    },
    held: [],
    model: 'gpt-5.4',
    promptVersion: 'week_read_v3',
    costUsd: 0.1921,
    ...over,
  }
}

/** An older read (week_read_v1/v2): In short, then findings with team lines. */
export function olderRead(): WeekReadDataV1 {
  const v2 = sealandRead()
  return {
    version: 1,
    window: v2.window,
    month: v2.month,
    inShort: 'Buyers compared named bags by the trip they had in mind. Colour and proof of quality decided the rest.',
    findings: v2.findings.map((f) => ({ ...f, for: { sales: 'Buyers name rivals before they buy.' } })),
    standing: [],
    figures: v2.figures,
    held: [],
    model: 'gpt-5.4',
    promptVersion: 'week_read_v2',
    costUsd: 0.099,
  }
}

/** The same read with every quote's words emptied, as `week_reads` stores it. */
export function frozen<T>(read: T): T {
  return JSON.parse(JSON.stringify(read), (k, v) => (k === 'text' && typeof v === 'string' ? '' : v)) as T
}

/** The snapshot's data for a read, as the send path builds it (level 1,
 *  version 2, with the page lines given). */
export function sealandSnapshot(read: WeekReadDataV2 | WeekReadDataV1 = sealandRead(), lines: WeeklyReadLine[] = []): WeeklyReadSnapshotData {
  return weeklyReadSnapshotData({ company: 'Sealand', runId: 'run-27', read, writtenAt: '2026-09-27T07:20:00.000Z', lines })
}

/** A snapshot as every one stored before level 1 holds it (version 1, the
 *  report): the same fields, no `lines`. */
export function storedReportSnapshot(read: WeekReadDataV2 | WeekReadDataV1 = sealandRead()): WeeklyReadSnapshotData {
  const { lines: _lines, ...rest } = sealandSnapshot(read)
  return { ...rest, version: WEEKLY_READ_REPORT_VERSION }
}

/** One frozen flag, as `write-week-read` keeps it (lib/written/unusual.ts):
 *  the colour conversation, 19 of 241 videos this week against 38 of 1,089
 *  over June to August. */
export function sealandFlag(over: Partial<WeekReadFlag> = {}): WeekReadFlag {
  const week = over.week ?? { k: 19, n: 241 }
  const baseline = over.baseline ?? { k: 38, n: 1089 }
  return {
    objectKind: 'theme',
    objectId: 't3',
    label: 'Asking for the bag in more colours',
    denominator: 'every audience together',
    week,
    baseline,
    baselineMonths: ['2026-06-01', '2026-07-01', '2026-08-01'],
    changePts: 4.4,
    bandPts: 2.1,
    rank: 1,
    verdict: {
      objectKind: over.objectKind ?? 'theme',
      objectId: over.objectId ?? 't3',
      objectLabel: over.label ?? 'Asking for the bag in more colours',
      audience: 'every audience together',
      window: { kind: 'week', from: SEALAND_READ_WINDOW.from, to: SEALAND_READ_WINDOW.to },
      basis: { from: '2026-06-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
      value: week,
      baseline,
      changePts: 4.4,
      bandPts: 2.1,
      state: 'moved',
      flags: [],
    },
    ...over,
  }
}

/** The update's check as the read keeps it: flagged, the given flags. */
export function sealandUnusual(flags: WeekReadFlag[] = [sealandFlag()]): WeekReadUnusual {
  return { outcome: flags.length > 0 ? 'flagged' : 'nothing_unusual', flags, flaggedCount: flags.length }
}

/** The four page lines, as the build freezes them. */
export function sealandLines(): WeeklyReadLine[] {
  return [
    { page: 'voices', label: 'Voices', href: '/dashboard/voices?group=commuters', lead: 'In the most videos in September:', name: 'Daily commuters', copy: { kind: 'subject', slot: 'pass_e_persona' }, figure: '41 videos' },
    { page: 'products', label: 'Your products', href: '/dashboard/products?product=p1', lead: 'Named most in September:', name: 'Kirby backpack', copy: { kind: 'plain' }, figure: '9 videos' },
    { page: 'content', label: 'Content', href: '/dashboard/content?idea=1', lead: 'Post next:', name: 'Which bag fits a carry-on rule, and how to check', copy: { kind: 'prose' }, figure: '7 videos this week · 16 in September so far' },
    { page: 'moves', label: 'Your moves', href: '/dashboard/moves?advice=lin-1', lead: 'Advice waiting:', name: 'Publish a colour roadmap for the core bags', copy: { kind: 'stored', slot: 'pass_d_b_recommendation' }, figure: 'raised in 4 updates' },
  ]
}

/** The level-1 read: the report's read, its check flagged, two conversations
 *  also heard this week. */
export function levelOneRead(over: Partial<WeekReadDataV2> = {}): WeekReadDataV2 {
  return sealandRead({
    unusual: sealandUnusual(),
    alsoHeard: [
      { themeId: 't7', label: 'Laptop sleeves that fit a 16-inch machine', videos: 9, videoIds: [], monthVideos: 21 },
      { themeId: 't8', label: 'Straps that dig in on a long walk', videos: 6, videoIds: [], monthVideos: 11 },
    ],
    ...over,
  })
}
