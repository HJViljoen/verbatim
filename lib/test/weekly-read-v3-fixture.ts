import { MARKET_LONG_RUN_ANCHOR, marketMonthHref, marketSubjectHref } from '../nav'
import { weeklyReadSnapshotData, type WeeklyReadSnapshotData } from '../reports/weekly-read-build'
import type { WeeklyContentPart, WeeklyMonthClose, WeeklyMovesPart, WeeklyPages, WeeklyProductsPart, WeeklySubjectRead, WeeklyVoicesPart } from '../reports/weekly-read-v3'
import type { QuoteRef, WeekReadConversation, WeekReadDataV2 } from '../written/types'
import { sealandFlag, sealandUnusual } from './weekly-read-fixture'

// The weekly read, version 3, as the render tier sees it: the H7 boards'
// three issues. ÖSSUR (H7-Email-Weekly-Alt, 12 to 18 October): the week in
// one line, what it means and the six subject headlines and meanings are the
// real stored words of run 5af5ee13 (18 Oct); the post ideas, the products and
// the categories are the 17 Oct dumps; the story, its quotes, worth watching
// and the week's counts are the board's own invention, as the board says.
// SEALAND (H7-Email-Weekly-Sealand, 5 to 11 October): every word and number
// is the offline v4e read on run 78a6eb3c's inputs, as Market printed that
// week; no Your products (switched off) and no post idea (the stand-in
// question). THE MONTH-CLOSING ISSUE (H7-Email-Weekly-MonthEnd, 26 October to
// 1 November): October closed, a flag leads, a move compares.

const q = (ref: string, date: string, platform: string, text: string): QuoteRef & { text: string } =>
  ({ ref, text, date, platform, thread: `${platform}::x` }) as QuoteRef & { text: string }

const conv = (registryId: string, label: string, week: number, month: number, setApart = false): WeekReadConversation => ({ registryId, label, week, month, setApart })

export const OSSUR_WINDOW = { from: '2026-10-11T04:02:00.000Z', to: '2026-10-18T04:02:00.000Z' }

/** Össur's 18 Oct read (week_read_v4), quotes resolved for reading. */
export function ossurRead(over: Partial<WeekReadDataV2> = {}): WeekReadDataV2 {
  return {
    version: 2,
    window: OSSUR_WINDOW,
    month: '2026-10-01',
    headline: 'Interest in prosthetics turns quickly into practical tests of fit, function and where to get one.',
    story: [
      {
        body: 'The week’s talk treated a prosthetic leg as something to test before it is trusted. People asked why a socket that feels fine in the morning hurts by the evening, why a leg feels heavy after a day of wear, and what bruising or swelling around the residual limb says about the fit. Liner pads and socks came up as the everyday fixes, named by people who wear the leg all day.',
        basedOn: ['o1'],
        quote: q('e:11111111-1111-4111-8111-111111111111', '2026-10-14', 'tiktok', 'My socket is fine in the morning and by dinner I can’t stand it. Is that the liner or me?'),
      },
      {
        body: 'Once the fit was settled, people turned to getting one and keeping one. They asked what insurance covers for a knee or a foot, how long approval takes, and whether a replacement is covered when a part wears out. Where a device was praised, the next comment often asked where it was fitted and who paid for it.',
        basedOn: ['o2'],
        quote: q('e:22222222-2222-4222-8222-222222222222', '2026-10-15', 'instagram', 'Insurance approved the knee but not the second socket. Nobody tells you that part.'),
      },
      {
        body: 'For hands, the proof was in plain tasks. Viewers judged a bionic hand by whether it could hold a cup, carry a bag or support weight, and they watched the fingers before the arm. Encouragement ran through all of it: people cheered visible independence and answered each other with advice.',
        basedOn: ['o3'],
        quote: q('e:33333333-3333-4333-8333-333333333333', '2026-10-16', 'youtube', 'Watching her pick up a grape with it made me tear up. That is the whole point.'),
      },
    ],
    implications: [
      { body: 'The residual limb is where wearers place the risk of a prosthetic leg. Bruising, swelling and skin protection are part of what a wearer means by the socket.', basedOn: ['o1'] },
      { body: 'Insurance and replacement timing sit inside the buying question for knees, feet and full sets. A prosthesis is discussed as something people may need to replace, not only obtain.', basedOn: ['o2'] },
      { body: 'For upper limb devices, finger movement and grip strength are the named proof points. People judge the hand by tasks they can picture, including holding, supporting weight and eating.', basedOn: ['o3'] },
    ],
    newThisWeek: [],
    watch: [
      { body: 'Whether questions about socket comfort keep naming the residual limb, or start naming the liner and socks instead', basedOn: ['o1'] },
      { body: 'Whether people asking about insurance keep naming replacement and repair beside the first fitting', basedOn: ['o2'] },
    ],
    findings: [
      {
        headline: 'Fit is judged across a whole day of wear', saw: 'People describe the socket through the day.', means: 'The socket is judged by the evening, not the fitting.',
        basedOn: ['o1'], quote: null, videos: { week: 19, month: 54 }, subjectId: null, isNew: false, sure: 'reasonable',
        evidence: '[[f1_week]] videos this week · [[f1_month]] in October so far', context: '',
      },
    ],
    standing: [],
    market: { week: { videos: 146, comments: 4180 }, month: { videos: 434, comments: 11178 } },
    figures: {
      f1_week: { label: 'videos this week behind the first finding', value: '19', kind: 'count' },
      f1_month: { label: 'videos in October so far behind the first finding', value: '54', kind: 'count' },
    },
    held: [],
    conversations: [
      conv('o1', 'Praise for resilience and courage', 19, 54),
      conv('o2', 'How the prosthesis works', 14, 36),
      conv('o3', 'Insurance barriers and delays', 9, 14),
      conv('om', 'Clinics showing their own fittings', 30, 80, true),
    ],
    unusual: { outcome: 'nothing_unusual', flags: [], flaggedCount: 0 },
    model: 'gpt-5.4',
    promptVersion: 'week_read_v4',
    costUsd: 0.2,
    ...over,
  }
}

const OSSUR_SUBJECTS: [string, string, string, string][] = [
  ['s-cost', 'Cost & access', 'Insurance cover decides whether a socket or knee joint feels obtainable', 'For buyers, the socket, knee joint and hand are where access becomes concrete, because those parts are priced, approved, replaced and repaired one by one. Insurance cover and local repair shape whether a prosthesis feels obtainable. Microprocessor knees and bionic hands are named where funding and paperwork stop a purchase or replacement.'],
  ['s-func', 'Function & movement', 'Visible grip and finger control make advanced hands believable', 'People settle function through plain actions: grip strength, finger movement, a foot that allows walking and a knee joint that bends as expected. These checks decide whether an advanced device counts as useful in daily life and sport. Extra hand attachments are judged by the task they add.'],
  ['s-choose', 'Choosing the right device', 'A communicative prosthetist decides the device when differences stay unsettled', 'Choice rests on trust in the prosthetist and in the parts that make the limb feel secure. Vacuum and pin lock are asked about for security and comfort, while mechanical knees and hands are named when people want cost, usability and the risk of electronics shorting out settled. A foot shell for flip flops can stop the decision even when the foot itself is already chosen.'],
  ['s-look', 'Look & style', 'Sleeves and covers decide whether a prosthetic blends in or stands out', 'Personalisation is taken for granted here, but the finish still decides what the prosthetic says in public. Sleeves, covers, gloves and foot colours are the named parts, and buyers turn to them either for a skin match that blends in or a design that stands out. A cover is praised when it carries meaning and style without extra hassle.'],
  ['s-fit', 'Fit & comfort', 'The socket decides whether the whole leg can be worn', 'Buyers treat the socket as the part that decides whether the whole leg can be worn through the day. Questions about pain, heaviness, leg length and the knee type return to socket pressure, socks, suspension and liner contact with skin. Protective liner pads are the named comfort fix, praised for cushioning and less skin friction.'],
  ['s-comm', 'Community & encouragement', 'Visible independence earns the encouragement around a prosthetic leg', 'Here, a prosthetic leg is taken for granted. The response turns on visible independence in ordinary milestones, sport, humour and personal style, plus an amputee community that offers advice and belonging. Family backing is named in the same way.'],
]

/** Össur's six ready subjects' stored reads, in Market's order. */
export function ossurSubjects(month = '2026-10-01'): WeeklySubjectRead[] {
  return OSSUR_SUBJECTS.map(([id, name, headline, means]) => ({ id, name, status: 'ready', headline, means, line: null, href: marketSubjectHref(id, { period: 'month', month }) }))
}

export function ossurVoices(over: Partial<WeeklyVoicesPart> = {}): WeeklyVoicesPart {
  return {
    month: '2026-10-01', monthWords: 'October so far', monthLabel: null, videos: 434,
    group: { name: 'Caretaker', oneLiner: 'This person is supporting someone through limb loss or mobility change and is looking for ways to be useful without taking over the story.', videos: 47, href: '/dashboard/voices/groups/caretaker' },
    others: ['First-time buyer', 'Athlete', 'New amputee', 'Long-term user'],
    named: [],
    href: '/dashboard/voices',
    ...over,
  }
}

export function ossurProducts(over: Partial<WeeklyProductsPart> = {}): WeeklyProductsPart {
  const p = (id: string, name: string, category: string, group: string, videos: number, first = false) => ({ id, name, category, videos, first, href: `/dashboard/products/${group}/${id}` })
  return {
    month: '2026-10-01', monthWords: 'October so far', monthLabel: null, cameUp: 5, products: 65, videos: 72,
    top: [
      p('p-ds', 'Direct Socket', 'Sockets & Locks', 'g-sock', 4),
      p('p-lp', 'Pro-Flex LP Align', 'Feet', 'g-feet', 3, true),
      p('p-xc', 'Pro-Flex XC', 'Feet', 'g-feet', 1),
      p('p-te', 'Pro-Flex Terra', 'Feet', 'g-feet', 1),
      p('p-pk', 'Power Knee', 'Knees', 'g-knee', 1),
    ],
    categories: [
      { id: 'g-sock', name: 'Sockets & Locks', videos: 24, href: '/dashboard/products/g-sock' },
      { id: 'g-hand', name: 'Hands', videos: 23, href: '/dashboard/products/g-hand' },
      { id: 'g-feet', name: 'Feet', videos: 14, href: '/dashboard/products/g-feet' },
      { id: 'g-lin', name: 'Liners', videos: 12, href: '/dashboard/products/g-lin' },
      { id: 'g-brace', name: 'Bracing & Supports', videos: 11, href: '/dashboard/products/g-brace' },
      { id: 'g-knee', name: 'Knees', videos: 10, href: '/dashboard/products/g-knee' },
    ],
    href: '/dashboard/products',
    ...over,
  }
}

export function ossurContent(over: Partial<WeeklyContentPart> = {}): WeeklyContentPart {
  return {
    ideas: [
      { id: 'i1', title: 'Why can a prosthetic feel heavy or hard to wear all day?', href: '/dashboard/content/ideas/i1' },
      { id: 'i2', title: 'What happened that led to the amputation?', href: '/dashboard/content/ideas/i2' },
      { id: 'i3', title: 'Why did they do the surgery that way?', href: '/dashboard/content/ideas/i3' },
    ],
    read: '21 Sep to 18 Oct',
    medical: true,
    asked: null,
    replies: { href: '/dashboard/content/replies', days: '12 to 18 Oct' },
    href: '/dashboard/content',
    ...over,
  }
}

export function ossurMoves(over: Partial<WeeklyMovesPart> = {}): WeeklyMovesPart {
  const a = (lineage: string, title: string) => ({ title, untitled: false, href: `/dashboard/moves/advice/${lineage}`, figure: '1 update, first raised 12 Oct', since: '2026-10-12' })
  return {
    waiting: 4,
    advice: [
      a('l1', 'Create an Össur Access Navigator for new amputees and caregivers'),
      a('l2', 'Translate Össur engineering into everyday outcomes before Ottobock defines the category'),
      a('l3', 'Make daily wear issues such as socket pain, sweat and skin irritation a named part of the fitting story'),
      a('l4', 'Replace pure inspiration with guided realism in ambassador and rehab storytelling'),
    ],
    move: null,
    href: '/dashboard/moves',
    recordHref: '/dashboard/moves/record',
    ...over,
  }
}

export function ossurPages(over: Partial<WeeklyPages> = {}): WeeklyPages {
  return { voices: ossurVoices(), products: ossurProducts(), content: ossurContent(), moves: ossurMoves(), ...over }
}

/** Össur's 18 Oct issue, version 3, as the build freezes it. */
export function ossurSnapshot(a: { read?: WeekReadDataV2; subjects?: WeeklySubjectRead[]; pages?: WeeklyPages; monthClose?: WeeklyMonthClose | null } = {}): WeeklyReadSnapshotData {
  return weeklyReadSnapshotData({
    company: 'Össur', runId: '5af5ee13', read: a.read ?? ossurRead(), writtenAt: '2026-10-18T07:40:00.000Z',
    parts: { subjects: a.subjects ?? ossurSubjects(), pages: a.pages ?? ossurPages(), monthClose: a.monthClose ?? null },
  })
}

// ---- Sealand, 5 to 11 October (H7-Email-Weekly-Sealand) -------------------------------------

export const SEALAND_OCT_WINDOW = { from: '2026-10-04T04:02:00.000Z', to: '2026-10-11T04:02:00.000Z' }

export function sealandOctRead(over: Partial<WeekReadDataV2> = {}): WeekReadDataV2 {
  return {
    ...ossurRead(),
    window: SEALAND_OCT_WINDOW,
    headline: 'Travel backpack buyers judged bags by airline fit and by how the load feels on the body once packed.',
    story: [
      { body: 'Buyers measured a travel backpack against the airline’s rules before anything else. They asked whether it fits under a seat, whether it counts as a personal item and how it looks when full.', basedOn: ['b1'], quote: q('e:44444444-4444-4444-8444-444444444444', '2026-10-07', 'reddit', 'Does this actually fit the Ryanair sizer when it is packed?') },
      { body: 'Comfort came next. People wanted to know how the straps and hip belt carry a full load, and a worn view on a person counted for more than a product shot.', basedOn: ['b2'], quote: null },
    ],
    implications: [
      { body: 'For a travel backpack, the worn view is part of product research. Buyers look for the bag on a person before they look at the specification.', basedOn: ['b1'] },
      { body: 'Comfort is still hard to settle from a product page. The straps and hip belt are where buyers place the doubt.', basedOn: ['b2'] },
      { body: 'For limited bags, availability affects whether a ready buyer can act. A sold-out colour stops a decision that was already made.', basedOn: ['b3'] },
    ],
    watch: [{ body: 'Whether airline fit keeps leading the questions once the holiday season ends', basedOn: ['b1'] }],
    market: { week: { videos: 294, comments: 5590 }, month: { videos: 446, comments: 9281 } },
    conversations: [
      conv('b1', 'Price questions before buying', 9, 11),
      conv('b2', 'Will it fit airline rules', 7, 9),
      conv('b3', 'Praise for smart packing methods', 6, 8),
    ],
    promptVersion: 'week_read_v4',
    ...over,
  }
}

export function sealandSubjects(month = '2026-10-01'): WeeklySubjectRead[] {
  const ready = (id: string, name: string, headline: string): WeeklySubjectRead => ({ id, name, status: 'ready', headline, means: `${headline}.`, line: null, href: marketSubjectHref(id, { period: 'month', month }) })
  return [
    ready('sb-buy', 'Buying & delivery', 'Stock status decides if a chosen bag gets bought'),
    ready('sb-look', 'Looks & style', 'Colour and finish decide whether reused material looks desirable'),
    ready('sb-comf', 'Comfort', 'A full pack is judged at the straps and hip belt'),
    ready('sb-dur', 'Durability', 'Zips under compression make long life believable'),
    { id: 'sb-price', name: 'Price', status: 'thin', headline: null, means: null, line: 'In October so far, talk about Price sat in “Price questions before buying”.', href: marketSubjectHref('sb-price', { period: 'month', month }) },
  ]
}

export function sealandPages(over: Partial<WeeklyPages> = {}): WeeklyPages {
  return {
    voices: {
      month: '2026-10-01', monthWords: 'October so far', monthLabel: null, videos: 446,
      group: { name: 'Bag lover', oneLiner: 'Someone who keeps a shelf of bags and reads every review before the next one.', videos: 148, href: '/dashboard/voices/groups/bag-lover' },
      others: ['Commuter', 'Traveller'],
      named: [
        { label: 'The North Face', k: 4, n: 364, you: false, href: '/dashboard/voices/brands/The%20North%20Face' },
        { label: 'Cotopaxi', k: 3, n: 364, you: false, href: '/dashboard/voices/brands/Cotopaxi' },
      ],
      href: '/dashboard/voices',
    },
    products: null,
    content: {
      ideas: [], read: null, medical: false,
      asked: { label: 'Questions about product details', week: 6, month: 8, weekWords: 'this week', monthWords: 'in October so far', href: '/dashboard/content#idea-slot-1' },
      replies: { href: '/dashboard/content/replies', days: '5 to 11 Oct' },
      href: '/dashboard/content',
    },
    moves: {
      waiting: 4,
      advice: [{ title: 'Add a repair, refurbishment, and care program so sustainability continues after the sale', untitled: false, href: '/dashboard/moves/advice/sl1', figure: '1 update raised it', since: null }],
      move: null, href: '/dashboard/moves', recordHref: '/dashboard/moves/record',
    },
    ...over,
  }
}

export function sealandV3Snapshot(a: { read?: WeekReadDataV2; subjects?: WeeklySubjectRead[]; pages?: WeeklyPages } = {}): WeeklyReadSnapshotData {
  return weeklyReadSnapshotData({
    company: 'Sealand', runId: '78a6eb3c', read: a.read ?? sealandOctRead(), writtenAt: '2026-10-11T07:20:00.000Z',
    parts: { subjects: a.subjects ?? sealandSubjects(), pages: a.pages ?? sealandPages(), monthClose: null },
  })
}

// ---- The month-closing issue (H7-Email-Weekly-MonthEnd) ------------------------------------

export const MONTH_END_WINDOW = { from: '2026-10-25T04:02:00.000Z', to: '2026-11-01T04:02:00.000Z' }

export function monthEndClose(): WeeklyMonthClose {
  return { month: '2026-10-01', title: 'What holds across September and October', href: marketMonthHref('2026-10-01', MARKET_LONG_RUN_ANCHOR) }
}

/** A flag the check raised: insurance refusals for powered knees. */
export function knee() {
  return sealandFlag({ objectId: 'o9', label: 'Insurance refusals for powered knees', week: { k: 19, n: 241 }, baseline: { k: 38, n: 1089 } })
}

export function monthEndRead(over: Partial<WeekReadDataV2> = {}): WeekReadDataV2 {
  return ossurRead({
    window: MONTH_END_WINDOW,
    month: '2026-10-01',
    monthComplete: true,
    market: { week: { videos: 151, comments: 4390 }, month: { videos: 902, comments: 24612 } },
    unusual: sealandUnusual([knee()]),
    ...over,
  })
}

/** A move whose comparison prints: no clear change. */
export function movedMoves(): WeeklyMovesPart {
  return ossurMoves({
    move: {
      title: 'Price transparency page', day: '2026-09-02', label: 'Cost & access', kind: 'subject', href: '/dashboard/moves/m1',
      before: { k: 92, n: 612 }, after: { k: 134, n: 839 },
      months: { before: 'August, the month before', after: 'September, the month of the move' },
      verdict: {
        objectKind: 'subject', objectId: 's-cost', objectLabel: 'Cost & access', audience: 'market',
        window: { kind: 'month', from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
        value: { k: 134, n: 839 }, baseline: { k: 92, n: 612 }, changePts: 0.9, bandPts: 3.2, state: 'no_clear_change', flags: [],
      },
    },
  })
}

export function monthEndSnapshot(): WeeklyReadSnapshotData {
  return ossurSnapshot({ read: monthEndRead(), pages: ossurPages({ moves: movedMoves() }), monthClose: monthEndClose() })
}
