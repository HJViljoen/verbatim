import type { BriefAppInputs, BriefMovesIn, BriefSubjectRead } from './app'
import type { BriefHooks, BriefIdeas, BriefNamed, BriefPeople, BriefProducts } from './types'

// The October canvas's parts for the deck's tests, its renders and the
// boards' comparison (briefs-2026-10): Össur-shaped and Sealand-shaped, at the
// boards' own lengths, and a worst case at the longest each field runs. The
// words are the boards' (a group's description, a subject's read, an advice
// title, a post idea: the stored words the app prints); every count is made
// up. Nothing here is a reading.

const OCT = '2026-10-01'
const SUB = (id: string) => `/dashboard/market/subjects/${id}?period=month&month=2026-10`

export const OSSUR_SUBJECT_IDS = {
  community: 'da5bd724-d336-4756-8d1a-0ad648766b2e',
  function: '0e352d0a-0299-4a69-8735-5a75b9396766',
  cost: '648497c8-5461-4b8d-a059-540fef04bd81',
  fit: 'd5d4f76b-fb20-46b7-beb7-25a77e69ed03',
  look: '288995fd-71cc-4623-9b3f-652edc43f005',
  choosing: '266dff35-446c-4d7a-a969-dfd7f26f6e59',
} as const

/** Market's subject reads (the boards' six, October so far). */
export const OSSUR_SUBJECT_READS: BriefSubjectRead[] = [
  { id: OSSUR_SUBJECT_IDS.community, status: 'ready', headline: 'Visible independence earns the encouragement around a prosthetic leg', means: 'Here, a prosthetic leg is taken for granted. The response turns on visible independence in ordinary milestones, sport, humour and personal style, plus an amputee community that offers advice and belonging.', line: null },
  { id: OSSUR_SUBJECT_IDS.function, status: 'ready', headline: 'Visible grip and finger control make advanced hands believable', means: 'People settle function through plain actions: grip strength, finger movement, a foot that allows walking and a knee joint that bends as expected. The rest follows.', line: null },
  { id: OSSUR_SUBJECT_IDS.cost, status: 'ready', headline: 'Insurance cover decides whether a socket or knee joint feels obtainable', means: 'For buyers, the socket, knee joint and hand are where access becomes concrete, because those parts are priced, approved, replaced and repaired one by one.', line: null },
  { id: OSSUR_SUBJECT_IDS.fit, status: 'ready', headline: 'The socket decides whether the whole leg can be worn', means: 'Questions about pain, heaviness, leg length and the knee type return to socket pressure, socks, suspension and liner contact with skin.', line: null },
  { id: OSSUR_SUBJECT_IDS.look, status: 'ready', headline: 'Sleeves and covers decide whether a prosthetic blends in or stands out', means: 'Personalisation is taken for granted here, but the finish still decides what the prosthetic says in public.', line: null },
  { id: OSSUR_SUBJECT_IDS.choosing, status: 'ready', headline: 'A communicative prosthetist decides the device when differences stay unsettled', means: 'Choice rests on trust in the prosthetist and in the parts that make the limb feel secure.', line: null },
]

/** The six subjects as the standing facts hold them (ready, ranked, with
 *  their levels in October of 902). */
export const OSSUR_SUBJECT_FACTS = ([
  ['community', 'Community & encouragement', 216],
  ['function', 'Function & movement', 117],
  ['cost', 'Cost & access', 108],
  ['fit', 'Fit & comfort', 90],
  ['look', 'Look & style', 72],
  ['choosing', 'Choosing the right device', 36],
] as const).map(([key, name, k], n) => ({ id: `S${n + 1}`, subjectId: OSSUR_SUBJECT_IDS[key], name, k, rank: n + 1 }))

const group = (key: string, name: string, videos: number, oneLiner: string, wants: string, stops: string, tips: string, top: { id: string; label: string; k: number } | null, products: { name: string; k: number }[] | null) => ({
  key, name, videos, oneLiner, wants, stops, tips,
  top: top ? { ...top, href: SUB(top.id) } : null,
  products: products ? products.map((p) => ({ ...p, href: `/dashboard/products/feet/${p.name.toLowerCase().replace(/\W+/g, '-')}?month=2026-10` })) : null,
  href: `/dashboard/voices/groups/${key}?month=2026-10`,
})

export const OSSUR_PEOPLE: BriefPeople = {
  month: OCT,
  market: 902,
  groups: [
    group('caretaker', 'Caretaker', 100, 'This person is supporting someone through limb loss or mobility change and is looking for ways to be useful without taking over the story.',
      'They want their person to feel safe, capable, and seen, because recovery at home depends on patience, morale, and steady support as much as clinical care.',
      'They feel torn between hope and helplessness, especially when emotions run high or access is hard to secure, and that makes every choice feel heavier than it looks.',
      'They respond to examples of calm encouragement, patient coaching, and communities that show support can protect dignity rather than smother it.',
      { id: OSSUR_SUBJECT_IDS.community, label: 'Community & encouragement', k: 22 }, []),
    group('first-time-buyer', 'First-time buyer', 88, 'This person is at the edge of action, trying to turn interest in a prosthesis into a first real decision about how to regain everyday independence.',
      'They want enough clarity to move forward without feeling naive, because this decision stands for getting back to ordinary life with less dependence on other people.',
      'They get stuck when the route into care feels opaque and costly, because the chance of making a wrong decision with daily consequences is hard to absorb.',
      'They move when someone makes the journey feel legible and achievable through plain language, honest lived experience, and a believable picture of life after the decision.',
      { id: OSSUR_SUBJECT_IDS.cost, label: 'Cost & access', k: 31 }, [{ name: 'Pro-Flex Terra', k: 3 }, { name: 'Direct Socket', k: 2 }]),
    group('athlete', 'Athlete', 69, 'This person relates to prosthetics through movement, sport, or ambitious activity and sees mobility as part of identity, not just recovery.',
      'They want to prove to themselves that ability still has room to expand, because performance offers a way back to confidence, joy, and public self-definition.',
      'They resist anything that frames them as fragile or finished, and they hesitate when they suspect their equipment or the world around them will limit what they can attempt.',
      'They are moved by visible mastery, competitive effort, and examples that treat adapted movement as skill, because aspiration lands when it is shown rather than explained.',
      { id: OSSUR_SUBJECT_IDS.function, label: 'Function & movement', k: 24 }, [{ name: 'Pro-Flex XC', k: 2 }]),
    group('new-amputee', 'New amputee', 56, 'This person is early in adaptation, trying to understand what life feels like after limb loss while the physical and emotional shock is still close.',
      'They want a believable path back to self-trust, because recovery is not only about movement but about feeling that life still belongs to them.',
      'Grief, pain, shame, and uncertainty about how adaptation unfolds can make progress feel hard to grasp, leaving them caught between needing hope and not wanting false reassurance.',
      'They respond to candid voices who admit the hard parts while normalizing slow adaptation, because honest reassurance feels safer than polished inspiration.',
      { id: OSSUR_SUBJECT_IDS.fit, label: 'Fit & comfort', k: 15 }, []),
    group('long-term-user', 'Long-term user', 50, 'This person already lives with a prosthesis and judges the category by whether it holds up in the grind of ordinary life.',
      'They want equipment that keeps up with a full day without fuss, because reliability is what lets them stop thinking about the leg.',
      'They lose patience with parts that wear, rub or need repair, and with advice that treats them as new to it.',
      'They listen to peers who have worn the same parts for years and say plainly what lasted.',
      { id: OSSUR_SUBJECT_IDS.fit, label: 'Fit & comfort', k: 21 }, null),
  ],
}

export const SEALAND_PEOPLE: BriefPeople = {
  month: OCT,
  market: 941,
  groups: [
    group('daily-commuter', 'Daily commuter', 120, 'This person carries a bag every working day and judges it by how it handles a laptop, a lunch and the weather on the way in.',
      'They want one bag that does the whole day, because swapping bags is the friction they are trying to remove.',
      'They hesitate when a bag looks good but gives no straight answer on laptop size, water resistance or how it wears on the shoulder.',
      'They buy when someone shows the bag packed for a real day, and when a friend vouches for it.',
      { id: 'b1', label: 'Buying & delivery', k: 30 }, null),
    group('traveller', 'Traveller', 74, 'This person is planning a trip and wants a bag that passes carry-on rules and survives being thrown about.',
      'They want certainty about size and weight before they buy.', 'They stop on vague measurements.', 'They move on packing videos that show the bag full.',
      { id: 'b2', label: 'Comfort', k: 18 }, null),
  ],
}

export const OSSUR_MOVES: BriefMovesIn = {
  month: OCT,
  pool: [
    { lineageId: '534ac3b8-9f33-4356-8475-8809798bf307', title: 'Create an Össur Access Navigator for new amputees and caregivers', why: 'Build one route through cover, providers and fitting.', status: 'new', inLatest: true, firstMade: '2026-10-12', aim: { label: 'Where can I get one', k: 41, n: 902, href: null }, href: '/dashboard/moves/advice/534ac3b8-9f33-4356-8475-8809798bf307' },
    { lineageId: '80be6307-341a-40c0-b865-371fb9caf330', title: 'Translate Össur engineering into everyday outcomes before Ottobock defines the category', why: 'Say what the parts do in a day.', status: 'new', inLatest: true, firstMade: '2026-10-12', aim: { label: 'How the prosthesis works', k: 61, n: 902, href: null }, href: '/dashboard/moves/advice/80be6307-341a-40c0-b865-371fb9caf330' },
    { lineageId: 'a35873b0-c41b-46fe-8715-3ab9083a72fa', title: 'Daily wear issues such as socket pain, sweat, skin irritation, and…', why: 'Answer the daily wear questions.', status: 'new', inLatest: true, firstMade: '2026-10-12', aim: { label: 'Sweat, heat and skin irritation', k: 19, n: 902, href: null }, href: '/dashboard/moves/advice/a35873b0-c41b-46fe-8715-3ab9083a72fa' },
    { lineageId: 'd34c0873-5d8e-4183-bd48-a4074ff2d3cc', title: 'Replace pure inspiration with guided realism in ambassador and rehab storytelling', why: 'Show the hard parts.', status: 'new', inLatest: true, firstMade: '2026-10-12', aim: { label: 'Praise for resilience and courage', k: 54, n: 902, href: null }, href: '/dashboard/moves/advice/d34c0873-5d8e-4183-bd48-a4074ff2d3cc' },
    { lineageId: 'done-1', title: 'Create a guided access path, not a standalone price answer', why: 'Done.', status: 'done', inLatest: true, firstMade: '2026-09-20', aim: null, href: '/dashboard/moves/advice/done-1' },
  ],
  moves: [{
    id: '01a4c724-2b4a-416b-b905-86ad4383a90a',
    title: 'Create a guided access path, not a standalone price answer',
    kind: 'advice', status: 'Done', day: '2026-10-05', label: 'Cost and affordability frustration', labelHref: '/dashboard/market/conversations/r-cost?period=month&month=2026-10',
    slots: [
      { month: '2026-08-01', k: null, n: null, soFar: false, why: 'cut' },
      { month: '2026-09-01', k: null, n: null, soFar: false, why: 'cut' },
      { month: '2026-10-01', k: 31, n: 902, soFar: false, why: null },
    ],
    sentence: 'Share of market videos: 3% (31 of 902) in October, the last full month.',
    verdict: null,
    axis: 'August and September are left off the line: the newer month is not over, or has not been read to its end.',
    href: '/dashboard/moves/01a4c724-2b4a-416b-b905-86ad4383a90a',
  }],
  record: { total: 65, decided: 1, since: '2026-06-13', href: '/dashboard/moves/advice?all=1' },
}

const PRODUCT = (cat: string, name: string) => `/dashboard/products/${cat}/${name.toLowerCase().replace(/\W+/g, '-')}?month=2026-10`

export const OSSUR_PRODUCTS: BriefProducts = {
  month: OCT,
  cameUp: 5,
  products: 65,
  videos: 151,
  market: 902,
  categories: [
    { id: 'sockets', name: 'Sockets & Locks', videos: 51, named: 4, products: [{ name: 'Direct Socket', videos: 4, first: false, href: PRODUCT('sockets', 'Direct Socket') }], href: '/dashboard/products/sockets?month=2026-10' },
    { id: 'hands', name: 'Hands', videos: 48, named: 0, products: [], href: '/dashboard/products/hands?month=2026-10' },
    { id: 'feet', name: 'Feet', videos: 30, named: 6, products: [
      { name: 'Pro-Flex Terra', videos: 3, first: false, href: PRODUCT('feet', 'Pro-Flex Terra') },
      { name: 'Pro-Flex XC', videos: 2, first: false, href: PRODUCT('feet', 'Pro-Flex XC') },
      { name: 'Pro-Flex LP Align', videos: 1, first: true, href: PRODUCT('feet', 'Pro-Flex LP Align') },
    ], href: '/dashboard/products/feet?month=2026-10' },
    { id: 'liners', name: 'Liners', videos: 26, named: 0, products: [], href: '/dashboard/products/liners?month=2026-10' },
    { id: 'bracing', name: 'Bracing & Supports', videos: 23, named: 0, products: [], href: '/dashboard/products/bracing?month=2026-10' },
    { id: 'knees', name: 'Knees', videos: 21, named: 2, products: [{ name: 'Power Knee', videos: 2, first: false, href: PRODUCT('knees', 'Power Knee') }], href: '/dashboard/products/knees?month=2026-10' },
  ],
  standouts: [
    { kind: 'general', label: 'Talked about, none of yours named', name: 'Hands', text: '48 videos about hands in October. None named one of Össur’s.', href: '/dashboard/products/hands?month=2026-10' },
    { kind: 'praised', label: 'Praise in the comments', name: 'Liners', text: '13 of the 26 videos about liners have praise in their comments.', href: '/dashboard/products/liners?month=2026-10' },
    { kind: 'first', label: 'Came up for the first time', name: 'Pro-Flex LP Align', text: 'Named in one video in October, its first since June.', href: PRODUCT('feet', 'Pro-Flex LP Align') },
    { kind: 'focus', label: 'Where it sits', name: 'Liners in Fit & comfort', text: '11 of the 26 videos about liners are in Fit & comfort.', href: '/dashboard/products/liners?month=2026-10' },
  ],
  href: '/dashboard/products?month=2026-10',
}

const BRAND = (id: string) => `/dashboard/voices/brands/${id}?month=2026-10`

export const SEALAND_NAMED: BriefNamed = {
  month: OCT,
  base: 941,
  rows: [
    { label: 'The North Face', you: false, named: { k: 11, n: 941 }, verdict: { state: 'too_little_data', change: null, band: null }, praised: { k: 15, n: 31 }, complained: { k: 9, n: 31 }, top: { label: 'Comfort', k: 9, n: 31 }, href: BRAND('tnf') },
    { label: 'Cotopaxi', you: false, named: { k: 8, n: 941 }, verdict: null, praised: { k: 27, n: 52 }, complained: { k: 32, n: 52 }, top: { label: 'Comfort', k: 14, n: 52 }, href: BRAND('cotopaxi') },
    { label: 'Patagonia', you: false, named: { k: 4, n: 941 }, verdict: null, praised: { k: 10, n: 18 }, complained: { k: 4, n: 18 }, top: { label: 'Durability', k: 6, n: 18 }, href: BRAND('patagonia') },
    { label: 'Rareform', you: false, named: { k: 3, n: 941 }, verdict: null, praised: { k: 2, n: 5 }, complained: { k: 1, n: 5 }, top: { label: 'Looks & style', k: 2, n: 5 }, href: BRAND('rareform') },
    { label: 'Sealand', you: true, named: { k: 2, n: 941 }, verdict: null, praised: { k: 9, n: 14 }, complained: { k: 2, n: 14 }, top: { label: 'Buying & delivery', k: 5, n: 14 }, href: BRAND('client') },
    { label: 'Freitag', you: false, named: { k: 1, n: 941 }, verdict: null, praised: { k: 3, n: 4 }, complained: { k: 0, n: 4 }, top: { label: 'Looks & style', k: 2, n: 4 }, href: BRAND('freitag') },
  ],
  notNamed: ['Freedom of Movement'],
  href: '/dashboard/voices?month=2026-10',
}

const IDEA = (n: number) => `/dashboard/content/ideas/b${n}`
const own = { state: 'none' as const, touched: 0, posts: 15, since: '2026-08-01' }

export const OSSUR_IDEAS: BriefIdeas = {
  month: OCT,
  read: { from: '2026-10-04T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z', label: '4 to 31 Oct' },
  since: '2026-08-01',
  medical: true,
  ideas: [
    { id: 'b1', rank: 1, title: 'Why can a prosthetic feel heavy or hard to wear all day?', read: { k: 23, n: 841 }, month: { k: 26, n: 902 }, groups: ['Long-term user', 'New amputee'], own,
      asks: [{ label: 'Why it feels heavier by the evening', videos: 6 }, { label: 'What the socket and liner change', videos: 4 }, { label: 'How long until it feels normal', videos: 3 }], asksOf: 14,
      format: { label: 'Story', multiple: 1.3 }, opening: { label: 'Open with a personal story', multiple: 1.4 }, href: IDEA(1) },
    { id: 'b2', rank: 2, title: 'What happened that led to the amputation?', read: { k: 19, n: 841 }, month: { k: 22, n: 902 }, groups: ['Caretaker', 'Athlete'], own,
      asks: [{ label: 'What caused it', videos: 7 }, { label: 'How old they were', videos: 4 }, { label: 'How they found out', videos: 3 }], asksOf: 12,
      format: { label: 'Testimonial', multiple: 1.2 }, opening: { label: 'Open with a question', multiple: 1.3 }, href: IDEA(2) },
    { id: 'b3', rank: 3, title: 'Why did they do the surgery that way?', read: { k: 12, n: 841 }, month: { k: 14, n: 902 }, groups: ['New amputee'], own,
      asks: [{ label: 'Why above or below the knee', videos: 5 }, { label: 'Why the limb was not kept', videos: 3 }], asksOf: 8,
      format: null, opening: null, href: IDEA(3) },
  ],
  asked: [
    { label: 'How the prosthesis works', videos: 61, href: '/dashboard/market/conversations/3c28b5fe?period=month&month=2026-10' },
    { label: 'Where can I get one', videos: 41, href: '/dashboard/market/conversations/86349219?period=month&month=2026-10' },
    { label: 'Questions about price and availability', videos: 29, href: '/dashboard/market/conversations/007ad294?period=month&month=2026-10' },
  ],
  replies: '/dashboard/content/replies?period=month',
  href: '/dashboard/content',
}

export const OSSUR_HOOKS: BriefHooks = {
  month: OCT,
  rival: 'Ottobock',
  formats: {
    of: 1024, ownOf: 15, rivalOf: 182,
    rows: [
      { label: 'Story', share: 40.1, own: 1, rival: 41, multiple: 1.3 },
      { label: 'Educational', share: 15.2, own: 0, rival: 26, multiple: 1.0 },
      { label: 'Promotional', share: 14.6, own: 7, rival: 40, multiple: 0.6 },
      { label: 'Testimonial', share: 12.8, own: 4, rival: 31, multiple: 0.9 },
      { label: 'Entertainment', share: 6.4, own: 2, rival: 5, multiple: 1.5 },
    ],
  },
  openings: {
    of: 998, ownOf: 13, rivalOf: 165,
    rows: [
      { label: 'A personal story', share: 45.3, own: 7, rival: 80, multiple: 1.3 },
      { label: 'A bold claim', share: 26.9, own: 2, rival: 55, multiple: 0.7 },
      { label: 'A question', share: 9.8, own: 0, rival: 18, multiple: 1.3 },
      { label: 'Showing it', share: 8.7, own: 4, rival: 12, multiple: 1.0 },
    ],
  },
  posts: {
    total: 15,
    byPlatform: [{ platform: 'instagram', posts: 7 }, { platform: 'tiktok', posts: 4 }, { platform: 'youtube', posts: 4 }],
    response: { multiple: 0.9, rated: 12 },
    sentence: '7 of your 15 posts in October were promotional videos, which draw 0.6× a typical video. Entertainment videos draw 1.5×, and you made 2.',
    best: { platform: 'tiktok', date: '2026-10-05', format: 'Testimonial', multiple: 2.3, href: '/dashboard/content/posts?post=p1#post-p1' },
    href: '/dashboard/content/posts?all=1',
  },
  basis: 'Response is each kind’s median against the market’s median video; Reddit is left out of response.',
  href: '/dashboard/content#what-works',
}

/** Every part, Össur-shaped (products on, brands not counted). */
export const OSSUR_APP: BriefAppInputs = {
  month: OCT, subjectReads: OSSUR_SUBJECT_READS, people: OSSUR_PEOPLE, named: null, products: OSSUR_PRODUCTS, ideas: OSSUR_IDEAS, hooks: OSSUR_HOOKS, moves: OSSUR_MOVES,
}

/** Sealand-shaped: no products (no catalogue), its brands counted, no
 *  medical line. */
export const SEALAND_APP: BriefAppInputs = {
  month: OCT, subjectReads: null, people: SEALAND_PEOPLE, named: SEALAND_NAMED, products: null,
  ideas: { ...OSSUR_IDEAS, medical: false }, hooks: { ...OSSUR_HOOKS, rival: 'Cotopaxi' }, moves: null,
}

// ---- The worst case: every field at the longest it runs --------------------------------------

const LONG = (s: string, n: number) => (s.repeat(Math.ceil(n / s.length))).slice(0, n).replace(/\s+\S*$/, '.')

export const WORST_PEOPLE: BriefPeople = {
  ...OSSUR_PEOPLE,
  groups: OSSUR_PEOPLE.groups.map((g) => ({
    ...g,
    name: `${g.name} and the people around them`,
    oneLiner: LONG(`${g.oneLiner} `, 260),
    wants: LONG(`${g.wants} `, 330),
    stops: LONG(`${g.stops} `, 330),
    tips: LONG(`${g.tips} `, 330),
    top: g.top ? { ...g.top, label: 'Choosing the right device and the prosthetist' } : null,
    products: [{ name: 'Pro-Flex LP Align', k: 4, href: '/x' }, { name: 'Direct Socket', k: 3, href: '/x' }, { name: 'Power Knee', k: 2, href: '/x' }],
  })),
}

export const WORST_SUBJECT_READS: BriefSubjectRead[] = OSSUR_SUBJECT_READS.map((r) => ({
  ...r,
  headline: LONG(`${r.headline} and what it means for every buyer `, 130),
  means: LONG(`${r.means} `, 400),
}))

export const WORST_MOVES: BriefMovesIn = {
  ...OSSUR_MOVES,
  pool: [...OSSUR_MOVES.pool.slice(0, 4).map((p) => ({ ...p, title: LONG(`${p.title} across every channel `, 150), aim: p.aim ? { ...p.aim, label: 'Questions about price, cover and where to get one' } : null })),
    ...OSSUR_MOVES.pool.slice(0, 3).map((p, n) => ({ ...p, lineageId: `${p.lineageId}-${n}`, title: `${p.title} (again)` }))],
  moves: OSSUR_MOVES.moves.map((m) => ({ ...m, title: LONG(`${m.title} for every new patient `, 120), axis: LONG(`${m.axis} `, 220) })),
}

export const WORST_PRODUCTS: BriefProducts = {
  ...OSSUR_PRODUCTS,
  categories: [...OSSUR_PRODUCTS.categories, ...OSSUR_PRODUCTS.categories].map((c, n) => ({
    ...c, id: `${c.id}-${n}`, name: n % 2 ? `${c.name} and Accessories` : c.name,
    products: [...c.products, { name: 'Unity Vacuum Suspension', videos: 2, first: true, href: '/x' }, { name: 'Iceross Seal-In X5', videos: 1, first: false, href: '/x' }],
  })),
  standouts: OSSUR_PRODUCTS.standouts.map((s) => ({ ...s, text: LONG(`${s.text} `, 150) })),
}

export const WORST_NAMED: BriefNamed = {
  ...SEALAND_NAMED,
  rows: [...SEALAND_NAMED.rows, { ...SEALAND_NAMED.rows[0], label: 'Fjällräven Kånken', href: BRAND('f') }, { ...SEALAND_NAMED.rows[1], label: 'Peak Design', href: BRAND('p') }]
    .map((r) => ({ ...r, verdict: { state: 'moved' as const, change: -12.4, band: 3.1 }, top: r.top ? { ...r.top, label: 'Buying & delivery questions' } : null })),
  notNamed: ['Freedom of Movement', 'Topo Designs', 'Osprey'],
}

export const WORST_IDEAS: BriefIdeas = {
  ...OSSUR_IDEAS,
  read: { from: '2026-09-28T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z', label: '28 Sep to 31 Oct' },
  ideas: OSSUR_IDEAS.ideas.map((i) => ({
    ...i,
    title: LONG(`${i.title.replace(/\?$/, '')} and what should be done about it `, 95).replace(/\.$/, '?'),
    groups: ['Long-term user', 'First-time buyer'],
    asks: [...i.asks, { label: 'What a prosthetist checks at the second fitting', videos: 2 }].map((a) => ({ ...a, label: LONG(`${a.label} and after `, 60) })),
    format: { label: 'Behind the scenes', multiple: 1.4 }, opening: { label: 'Open with a personal story', multiple: 1.6 },
  })),
  asked: OSSUR_IDEAS.asked.map((a) => ({ ...a, label: `${a.label} and the questions around it` })),
}

export const WORST_APP: BriefAppInputs = {
  month: OCT, subjectReads: WORST_SUBJECT_READS, people: WORST_PEOPLE, named: WORST_NAMED, products: WORST_PRODUCTS, ideas: WORST_IDEAS, hooks: OSSUR_HOOKS, moves: WORST_MOVES,
}
