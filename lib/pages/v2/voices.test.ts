import { describe, expect, it } from 'vitest'
import { SEALAND_CLIENT_ID, OSSUR_CLIENT_ID } from '../../config'
import { brandMonthPair, type BrandCrossRow, type BrandMonthVideos, type CreatorThemes } from '../../reading/cross'
import {
  buildBrandPanel, buildBrands, buildCreatorPanel, buildCreators, buildGroupPanel, buildGroups, clientNameCounts, clientNameCountsByCount,
  creatorVideoIds, crossKeys, findingsFor, firstSentence, groupRows, initialsOf, matchesBrand, noteOf, openOf, parseVoicesParams, personasOf,
  phrasesOf, PHRASE_MAX_WORDS, resolveCreator, themeVideoSets, topFinding, topVoicesOf, voicesHref, whoLabel, mergeWho, whoKey, WHO_FILLER_WORDS, WHO_SHOWN,
  BRANDS_NOT_COUNTED, BRANDS_NOT_READ, GROUPS_NOT_RUN, GROUPS_NONE, GROUPS_UNREAD, type FindingRow,
} from './voices'
import { ossurVoicesFixture, sealandVoicesFixture } from './voices-fixture'

const SEP = '2026-09-01'

describe('the address', () => {
  it('reads one value per key, and takes the old Conversation `?persona=` as a group', () => {
    expect(parseVoicesParams({ persona: ' athlete ', brand: ['Ottobock', 'x'], creator: '', month: '2026-08' })).toEqual({ group: 'athlete', brand: 'Ottobock', month: '2026-08' })
    expect(parseVoicesParams({ group: 'a', persona: 'b' }).group).toBe('a')
    expect(parseVoicesParams(null)).toEqual({})
  })

  it('opens one item at a time, keeps the month and the creators list, and anchors the panel', () => {
    const p = { month: '2026-08', creators: 'all', group: 'x', brand: 'y' }
    expect(voicesHref(p)).toBe('/dashboard/voices?month=2026-08&creators=all')
    expect(voicesHref(p, { kind: 'brand', key: 'The North Face' })).toBe('/dashboard/voices?month=2026-08&creators=all&brand=The+North+Face#brand-panel')
    expect(voicesHref({}, { kind: 'group', key: 'athlete' })).toBe('/dashboard/voices?group=athlete#group-panel')
    expect(voicesHref(p, null, { creators: null })).toBe('/dashboard/voices?month=2026-08')
  })
})

describe('small words', () => {
  it('takes a stored line\'s first sentence for a card', () => {
    expect(firstSentence('Know what is normal. Someone who has been there.')).toBe('Know what is normal.')
    expect(firstSentence('  no stop at all  ')).toBe('no stop at all')
    expect(firstSentence('')).toBe('')
  })

  it('draws two letters for an avatar', () => {
    expect(initialsOf('@stepbystep.amp')).toBe('SA')
    expect(initialsOf('r/onebag')).toBe('ON')
    expect(initialsOf('A L I S')).toBe('AL')
    expect(initialsOf('Shining Echoes')).toBe('SE')
  })

  it('reads a demographic slug as words', () => {
    expect(whoLabel('parent_of-child  amputee')).toBe('Parent of child amputee')
    expect(whoLabel('  ')).toBe('')
  })

  // Decision 8: near-repeats of one self-description are one row.
  describe('merging "Who they say they are"', () => {
    it('merges the wordings of one self-description, adds their counts, and keeps the commonest wording', () => {
      expect(mergeWho([
        { label: 'Amputee community', count: 24 }, { label: 'Amputee', count: 14 },
        { label: 'Amputee users', count: 14 }, { label: 'Amputee type', count: 9 },
      ])).toEqual([{ label: 'Amputee community', count: 61 }])
      expect(whoKey('Amputee community')).toBe('amputee')
      expect(whoKey('Amputee users')).toBe('amputee')
      expect(whoKey('Amputee type')).toBe('amputee')
      expect(whoKey('Recent amputees')).toBe('recent amputee')
      expect(whoKey('Families of amputees')).toBe('family of amputee')
    })

    it('never merges different people: caretaker and care worker, or a word order', () => {
      expect(mergeWho([{ label: 'Caretaker', count: 5 }, { label: 'Care worker', count: 4 }])).toEqual([
        { label: 'Caretaker', count: 5 }, { label: 'Care worker', count: 4 },
      ])
      expect(whoKey('Child amputee')).not.toBe(whoKey('Amputee child'))
      expect(whoKey('Bilateral amputee')).not.toBe(whoKey('Amputee'))
      expect(whoKey('Amputee interest')).not.toBe(whoKey('Amputee'))
      // A support group is not support, and news is not new (the fresh check).
      expect(whoKey('Support group')).not.toBe(whoKey('Support'))
      expect(whoKey('News')).not.toBe(whoKey('New'))
      expect(mergeWho([{ label: 'Support group', count: 4 }, { label: 'Support', count: 3 }, { label: 'News', count: 2 }, { label: 'New', count: 1 }])).toHaveLength(4)
      expect(WHO_FILLER_WORDS.has('group')).toBe(false)
      // Filler alone keeps its words: two different ones stay two.
      expect(mergeWho([{ label: 'Community', count: 3 }, { label: 'Users', count: 2 }])).toHaveLength(2)
      // Singular is simple, and the same on both sides of a comparison:
      // "-us", "-ss" and "-is" endings are left alone.
      expect(whoKey('Diabetes patients')).toBe(whoKey('Diabetes patient'))
      expect(whoKey('Bus users')).toBe('bus')
      expect(whoKey('Glass users')).toBe('glass')
    })

    it('orders most first, a tie in the order the rows came, and labels a tie with the first wording', () => {
      expect(mergeWho([{ label: 'B', count: 2 }, { label: 'A user', count: 2 }, { label: 'A', count: 2 }, { label: 'C', count: 5 }]))
        .toEqual([{ label: 'C', count: 5 }, { label: 'A user', count: 4 }, { label: 'B', count: 2 }])
    })

    it('reads Össur\'s caretakers (production, 13 Oct) as three distinct rows at the top', () => {
      const ossur = [
        ['Amputee community', 24], ['Amputee', 14], ['Amputee users', 14], ['Prosthetic users', 11], ['Amputee type', 9],
        ['Amputee audience', 8], ['Prosthetic user', 8], ['Bilateral amputee', 7], ['Above knee amputee', 6], ['Amputee interest', 6],
        ['Amputee identity', 5], ['Below knee amputee', 5], ['Child amputee', 5], ['Recent amputee', 2], ['Recent amputees', 2],
      ].map(([label, count]) => ({ label: label as string, count: count as number }))
      expect(mergeWho(ossur).slice(0, WHO_SHOWN)).toEqual([
        { label: 'Amputee community', count: 74 },
        { label: 'Prosthetic users', count: 19 },
        { label: 'Bilateral amputee', count: 7 },
      ])
      expect(mergeWho(ossur).find((w) => w.label.startsWith('Recent'))).toEqual({ label: 'Recent amputee', count: 4 })
      expect([...WHO_FILLER_WORDS]).toEqual(expect.arrayContaining(['community', 'user', 'type', 'people', 'person', 'folk']))
    })
  })

  it('keeps a phrase once, short, with its English where it has one', () => {
    const long = Array.from({ length: PHRASE_MAX_WORDS + 1 }, (_, i) => `w${i}`).join(' ')
    const out = phrasesOf(['is this normal?', 'Is this normal?', long, ' my  son’s leg ', 'biz varız'], (t) => (t === 'biz varız' ? 'we are here' : t === 'my son’s leg' ? 'my son’s leg' : null))
    expect(out).toEqual([
      { text: 'is this normal?', english: null },
      { text: 'my son’s leg', english: null },
      { text: 'biz varız', english: 'we are here' },
    ])
  })
})

describe('the groups (decision 2: this month\'s videos, no share, no change)', () => {
  const profile = {
    run_id: 'r1', run_date: '2026-09-27',
    personas: [
      { key: 'a', name: 'Alpha', oneLiner: 'One.', wants: 'Want one. Want two.', blockers: 'Stop one.', triggers: 't', howTheyTalk: [], who: [], insightIds: ['i1'], registryIds: ['t1', 7, 't2'], platformMix: { tiktok: 900 } },
      { key: 'b', name: 'Beta', oneLiner: '', wants: '', blockers: '', triggers: '', howTheyTalk: [], who: [], insightIds: [] },
      { name: '' },
    ],
  }
  const read = {
    videos: [{ key: 'a', name: 'Alpha', month: SEP, videoIds: ['v1', 'v2'], n: 2 }, { key: 'b', name: 'Beta', month: SEP, videoIds: ['v1', 'v2', 'v3'], n: 3 }],
    groups: [{ key: 'b', name: 'Beta', month: SEP, n: 3, subjects: [{ subjectId: 's1', label: 'Fit', k: 2, n: 3 }, { subjectId: 's2', label: 'Cost', k: 1, n: 3 }, { subjectId: 's3', label: 'Look', k: 1, n: 3 }, { subjectId: 's4', label: 'Price', k: 1, n: 3 }] }],
  }
  const platformOf = new Map([['v1', 'tiktok'], ['v2', 'youtube'], ['v3', 'tiktok']])

  it('keeps a persona\'s conversations and drops a row with no name', () => {
    const ps = personasOf(profile)
    expect(ps.map((p) => p.key)).toEqual(['a', 'b'])
    expect(ps[0].registryIds).toEqual(['t1', 't2'])
    expect(personasOf(null)).toEqual([])
  })

  it('says why no group shows, three ways apart', () => {
    expect(buildGroups({ profile: null, read: null, platformOf, params: {} })).toMatchObject({ state: 'not_run', empty: GROUPS_NOT_RUN })
    expect(buildGroups({ profile: { ...profile, personas: [] }, read: null, platformOf, params: {} })).toMatchObject({ state: 'no_personas', empty: GROUPS_NONE })
    expect(buildGroups({ profile, read: null, platformOf, params: {}, failed: true })).toMatchObject({ state: 'unread', empty: GROUPS_UNREAD })
  })

  it('counts each group\'s videos this month, most first, its platforms from those videos and never the stored mix', () => {
    const g = buildGroups({ profile, read, platformOf, params: { group: 'a' } })
    expect(g.cards.map((c) => [c.key, c.videos])).toEqual([['b', 3], ['a', 2]])
    const [beta, alpha] = g.cards
    expect(beta.subjects.map((s) => s.label)).toEqual(['Fit', 'Cost', 'Look'])
    expect(beta.platforms).toEqual([{ platform: 'tiktok', label: 'TikTok', k: 2 }, { platform: 'youtube', label: 'YouTube', k: 1 }])
    expect(alpha.platforms.reduce((s, p) => s + p.k, 0)).toBe(2)
    expect(alpha.wants).toBe('Want one.')
    expect(alpha.selected).toBe(true)
    expect(alpha.href).toBe('/dashboard/voices')
    expect(beta.href).toBe('/dashboard/voices?group=b#group-panel')
  })

  it('lays the cards out three to a row', () => {
    expect(groupRows([1, 2, 3, 4, 5])).toEqual([[1, 2, 3], [4, 5]])
  })

  it('opens a group: the conversations it is in, by its own videos in each', () => {
    const ps = personasOf(profile)
    const g = buildGroups({ profile, read, platformOf, params: { group: 'a' } })
    const sets = themeVideoSets([
      { themeId: 't1', audience: 'industry-other', videoIds: ['v1', 'v9'] },
      { themeId: 't1', audience: 'competitor:X', videoIds: ['v2'] },
      { themeId: 't2', audience: 'industry-other', videoIds: ['v9'] },
    ])
    const panel = buildGroupPanel({
      persona: ps[0], card: g.cards[1], index: 4, perRow: 3, n: 10, subjects: [], videoIds: ['v1', 'v2'],
      themeSets: sets, labels: new Map([['t1', 'Socket fit'], ['t2', 'Liners']]), quotes: [], params: {},
    })
    expect(panel.conversations).toEqual([{ registryId: 't1', label: 'Socket fit', k: 2, href: '/dashboard/market?conv=t1#conversation-panel' }])
    expect(panel.notchAt).toBeCloseTo(0.5)
    expect(panel.wants).toBe('Want one. Want two.')
    expect(panel.askHref).toContain('/dashboard/agent?ask=')
  })
})

describe('the brands', () => {
  const brands = [
    { brandKey: 'client', label: 'Sealand', countState: 'counted' as const },
    { brandKey: 'p', label: 'Patagonia', countState: 'counted' as const },
    { brandKey: 'f', label: 'Freitag', countState: 'noise' as const },
    { brandKey: 'o', label: 'Old School', countState: 'none' as const },
    { brandKey: 'r', label: 'Rareform', countState: 'counted' as const },
    { brandKey: 'n', label: 'Newcomer', countState: 'not_yet' as const },
  ]
  const row = (brand_key: string, month: string, k_any: number, k_organic: number, n = 940, n_organic = 743) => ({ month, audience: 'industry-other', brand_key, k_any, k_organic, n, n_organic })
  const rows = [
    row('client', SEP, 1, 1), row('p', SEP, 65, 13), row('f', SEP, 7, 2), row('o', SEP, 0, 0), row('r', SEP, 0, 0), row('n', SEP, 3, 1),
    row('p', '2026-08-01', 24, 4, 378, 250),
  ]
  const pairs = brandMonthPair({ month: SEP, brands, rows, audiences: ['industry-other'], pair: null })
  const sets: BrandMonthVideos[] = brands.map((b) => ({ ...b, month: SEP, any: b.brandKey === 'client' ? ['a8fdd6fe-e2d6-434c-a207-6f17eb3f9b26'] : [], organic: [], n: 940, nOrganic: 743 }))
  const kinds: BrandCrossRow[] = [{ brandKey: 'p', label: 'Patagonia', month: SEP, base: 'any', n: 65, cells: [{ id: 'praise', label: 'praise', k: 50, n: 65 }, { id: 'question', label: 'question', k: 45, n: 65 }, { id: 'misinformation', label: 'misinformation', k: 1, n: 65 }] }]
  const subjects: BrandCrossRow[] = [{ brandKey: 'p', label: 'Patagonia', month: SEP, base: 'any', n: 65, cells: [{ id: 's1', label: 'Durability', k: 19, n: 65 }] }]

  it('is not read for a tenant with no brand rules, and not counted where no month row exists (Össur today)', () => {
    expect(buildBrands({ clientId: OSSUR_CLIENT_ID, month: SEP, pairs: null, crosses: null, note: null, params: {} })).toMatchObject({ state: 'not_read', empty: BRANDS_NOT_READ })
    const none = brandMonthPair({ month: SEP, brands: brands.slice(0, 2), rows: [], audiences: ['industry-other'], pair: null })
    const b = buildBrands({ clientId: OSSUR_CLIENT_ID, month: SEP, pairs: none, crosses: null, note: { rival: 'Patagonia', title: 'A finding' }, params: { brand: 'patagonia' } })
    expect(b).toMatchObject({ state: 'not_counted', empty: BRANDS_NOT_COUNTED, rows: [] })
    expect(b.tracked).toEqual([
      { label: 'Sealand', href: '/dashboard/voices?brand=Sealand#brand-panel' },
      { label: 'Patagonia', href: '/dashboard/voices' },
    ])
    // Every tracked brand is still there to open, each saying it is not counted;
    // the latest update's finding is still the note, and its link opens.
    expect(b.all.map((r) => [r.label, r.state, r.stateWords])).toEqual([['Sealand', 'not_yet', 'not counted yet'], ['Patagonia', 'not_yet', 'not counted yet']])
    expect(b.note).toEqual({ rival: 'Patagonia', title: 'A finding', href: '/dashboard/voices?brand=Patagonia#brand-panel' })
  })

  it('counts unprompted on one base, you first, and the crosses over every video naming it', () => {
    const b = buildBrands({ clientId: SEALAND_CLIENT_ID, month: SEP, pairs, crosses: { videos: sets, kinds, subjects }, note: { rival: 'patagonia', title: 'Lasts for years' }, params: { brand: 'competitor:Patagonia' } })
    expect(b.state).toBe('ready')
    expect(b.rows.map((r) => [r.label, r.named?.k, r.named?.n])).toEqual([['Sealand', 1, 743], ['Patagonia', 13, 743]])
    const p = b.rows[1]
    expect(p.any).toEqual({ k: 65, n: 940 })
    expect(p.praised).toEqual({ k: 50, n: 65 })
    expect(p.complained).toEqual({ k: 0, n: 65 })
    expect(p.topSubject).toEqual({ id: 's1', label: 'Durability', k: 19, n: 65 })
    expect(p.verdict?.state).toBe('too_little_data')
    expect(p.prevNamed).toEqual({ k: 4, n: 250, month: '2026-08-01' })
    expect(p.selected).toBe(true)
    expect(b.notNamed.map((x) => x.label)).toEqual(['Old School', 'Rareform'])
    expect(b.notNamed[0].href).toBe('/dashboard/voices?brand=Old+School#brand-panel')
    expect(b.notCounted.map((x) => [x.label, x.words])).toEqual([['Freitag', 'mostly the German word for Friday · not counted'], ['Newcomer', 'not counted yet']])
    expect(b.all).toHaveLength(6)
    expect(b.note).toEqual({ rival: 'Patagonia', title: 'Lasts for years', href: '/dashboard/voices?brand=Patagonia#brand-panel' })
  })

  it('holds your own name to the hand reads: a match nobody read keeps the row uncounted', () => {
    const unread = sets.map((s) => (s.brandKey === 'client' ? { ...s, any: ['someone-else'] } : s))
    const b = buildBrands({ clientId: SEALAND_CLIENT_ID, month: SEP, pairs, crosses: { videos: unread, kinds, subjects }, note: null, params: {} })
    expect(b.rows.map((r) => r.label)).toEqual(['Patagonia'])
    expect(b.notCounted.map((r) => r.label)).toContain('Sealand')
    // NO SET READ IS NO MATCH READ: with no crosses and no judgement handed
    // in, your row fails closed (it used to pass on an empty set).
    const blind = buildBrands({ clientId: SEALAND_CLIENT_ID, month: SEP, pairs, crosses: null, note: null, params: {} })
    expect(blind.rows.map((r) => r.label)).toEqual(['Patagonia'])
    expect(blind.all.find((r) => r.you)?.state).toBe('not_yet')
    // The caller's judgement, where it has one, stands.
    expect(buildBrands({ clientId: SEALAND_CLIENT_ID, month: SEP, pairs, crosses: null, note: null, params: {}, clientCounts: true }).rows[0].label).toBe('Sealand')
    expect(clientNameCounts(SEALAND_CLIENT_ID, SEP, [])).toBe(true)
    expect(clientNameCounts(SEALAND_CLIENT_ID, '2026-10-01', ['x'])).toBe(false)
    // Össur's name is checked (T15) and no match of it outside its posts is read yet.
    expect(clientNameCounts(OSSUR_CLIENT_ID, SEP, ['x'])).toBe(false)
    expect(clientNameCountsByCount(SEALAND_CLIENT_ID, SEP, 1)).toBe(true)
    expect(clientNameCountsByCount(SEALAND_CLIENT_ID, SEP, 2)).toBe(false)
  })

  it('takes a brand by any name an old link carries', () => {
    const b = { brandKey: 'uuid-1', label: 'The North Face' }
    for (const w of ['the north face', 'uuid-1', 'competitor:The North Face', ' The North Face ']) expect(matchesBrand(b, w)).toBe(true)
    expect(matchesBrand(b, 'Patagonia')).toBe(false)
    expect(matchesBrand({ brandKey: 'client', label: 'Össur' }, 'you')).toBe(true)
    expect(matchesBrand(b, '')).toBe(false)
  })

  it('crosses only the brands whose month row may print', () => {
    expect(crossKeys(pairs)).toEqual(['client', 'p'])
    expect(crossKeys(brandMonthPair({ month: SEP, brands, rows: [], audiences: ['industry-other'], pair: null }))).toEqual([])
  })

  it('reads one rival\'s findings off the latest update, and no note under a month the reader chose', () => {
    const rows: FindingRow[] = [
      { id: '1', run_id: 'r', category: 'content_gap', competitor_name: 'Ottobock', title: ' Gap ', finding: 'Body', impact_level: 'high' },
      { id: '2', run_id: 'r', category: 'notable_account', competitor_name: 'Ottobock', title: 'Held', finding: null, impact_level: 'high' },
      { id: '3', run_id: 'r', category: 'content_gap', competitor_name: 'Other', title: 'Not this rival', finding: null, impact_level: 'low' },
    ]
    expect(findingsFor(rows, 'ottobock')).toEqual([{ id: '1', category: 'content_gap', title: 'Gap', body: 'Body' }])
    expect(noteOf('current_early', rows, ['Ottobock'])).toEqual({ rival: 'Ottobock', title: 'Gap' })
    expect(noteOf('explicit', rows, ['Ottobock'])).toBeNull()
  })

  it('takes Pass C\'s weightiest finding of a tracked brand as the note, the held kinds left out', () => {
    const rows = [
      { competitor_name: 'Ottobock', category: 'notable_account', title: 'An account', impact_level: 'high' },
      { competitor_name: 'Ottobock', category: 'content_gap', title: 'Medium one', impact_level: 'medium' },
      { competitor_name: 'Nobody', category: 'content_gap', title: 'Untracked', impact_level: 'high' },
      { competitor_name: 'Ottobock', category: 'topic_ownership', title: 'High one', impact_level: 'high' },
    ]
    expect(topFinding(rows, ['Ottobock'])).toEqual({ rival: 'Ottobock', title: 'High one' })
    expect(topFinding(rows, [])).toBeNull()
  })

  it('opens a brand: every kind but the flagged one, in the reader\'s words, and the pane\'s own parts', () => {
    const b = buildBrands({ clientId: SEALAND_CLIENT_ID, month: SEP, pairs, crosses: { videos: sets, kinds, subjects }, note: null, params: {} })
    const panel = buildBrandPanel({
      row: b.rows[1], kinds: kinds[0], subjects: subjects[0], noun: 'bags', window: { from: '2026-07-03', to: '2026-10-01' },
      asked: { themes: [{ registryId: 't9', label: 'Is it worth it', videos: 3 }] }, said: [],
      findings: [{ id: 'f1', category: 'engagement_benchmark', title: 'held', body: null }, { id: 'f2', category: 'content_gap', title: 'kept', body: 'b' }],
      params: {},
    })
    expect(panel.kinds.map((k) => k.label)).toEqual(['Praised a bag', 'Asked a question'])
    expect(panel.asked?.themes[0].href).toBe('/dashboard/market?conv=t9#conversation-panel')
    expect(panel.findings).toEqual([{ id: 'f2', kindWords: 'where the content differs', title: 'kept', body: 'b' }])
    expect(panel.closeHref).toBe('/dashboard/voices')
    expect(panel).toMatchObject({ stateWords: null, tooFew: false })
  })

  it('opens a brand the table does not print: its count half says why, its rival half stands', () => {
    const b = buildBrands({ clientId: SEALAND_CLIENT_ID, month: SEP, pairs, crosses: { videos: sets, kinds, subjects }, note: null, params: {} })
    const noise = buildBrandPanel({ row: b.all.find((r) => r.label === 'Freitag')!, kinds: undefined, subjects: undefined, noun: null, window: null, asked: null, said: [], findings: [{ id: 'f', category: 'content_gap', title: 't', body: null }], params: {} })
    expect(noise).toMatchObject({ state: 'noise', stateWords: 'mostly the German word for Friday · not counted', tooFew: false, kinds: [], named: null })
    expect(noise.findings).toHaveLength(1)
    const zero = buildBrandPanel({ row: b.all.find((r) => r.label === 'Rareform')!, kinds: undefined, subjects: undefined, noun: null, window: null, asked: null, said: [], findings: [], params: {} })
    expect(zero).toMatchObject({ state: 'counted', tooFew: true, named: { k: 0, n: 743 } })
  })
})

describe('the creators', () => {
  const read: CreatorThemes = {
    month: SEP, videos: 20, themeVideos: { t1: 8 },
    creators: [
      { key: 'reddit|r/onebag', account: 'r/onebag', platform: 'reddit', videos: 6, followers: null, themes: [{ themeId: 't0', k: 3, ofCreator: 6, ofTheme: 4 }, { themeId: 't1', k: 2, ofCreator: 6, ofTheme: 8 }] },
      { key: 'tiktok|kate', account: 'kate', platform: 'tiktok', videos: 4, followers: 88400, themes: [] },
      { key: 'youtube|kate', account: 'kate', platform: 'youtube', videos: 3, followers: 9000, themes: [] },
      { key: 'tiktok|once', account: 'once', platform: 'tiktok', videos: 2, followers: 10, themes: [] },
    ],
  }
  const market = [
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, platform: 'reddit', account: 'r/onebag' })),
    { id: 'g', platform: 'tiktok', account: 'kate' }, { id: 'h', platform: 'youtube', account: null },
  ]
  const brands = [{ label: 'Patagonia', you: false, any: new Set(['a', 'b']) }, { label: 'Sealand', you: true, any: new Set(['c']) }]

  it('lists the people and brands at the floor, never a Reddit community, with their conversation and the brand named most', () => {
    const c = buildCreators({ month: SEP, read, labels: new Map([['t1', 'Laundry']]), videoIds: creatorVideoIds(market), brands, params: { creator: 'tiktok|kate' } })
    expect(c.accounts).toBe(3)
    expect(c.atFloor).toBe(2)
    expect(c.communitiesLeftOut).toBe(true)
    expect(c.rows.map((r) => [r.key, r.param])).toEqual([['tiktok|kate', 'tiktok|kate'], ['youtube|kate', 'youtube|kate']])
    expect(c.rows[0]).toMatchObject({ top: null, brand: null, selected: true, followerWord: 'followers', followers: 88400 })
    expect(c.rows[1].followerWord).toBe('subscribers')
    expect(c.more).toBe(0)
    expect(c.toggleHref).toBe('/dashboard/voices?creators=all')
    expect(c.empty).toBeNull()
    const noReddit = buildCreators({ month: SEP, read: { ...read, creators: read.creators.slice(1) }, labels: new Map(), videoIds: new Map(), brands: [], params: {} })
    expect(noReddit.communitiesLeftOut).toBe(false)
  })

  it('names a creator\'s conversation where it has a label, and the brand named in most of its videos', () => {
    const tiktok = { ...read.creators[0], key: 'tiktok|onebag', account: 'onebag', platform: 'tiktok' }
    const vids = creatorVideoIds(market.map((m) => (m.account === 'r/onebag' ? { ...m, platform: 'tiktok', account: 'onebag' } : m)))
    const c = buildCreators({ month: SEP, read: { ...read, creators: [tiktok] }, labels: new Map([['t1', 'Laundry']]), videoIds: vids, brands, params: {} })
    expect(c.rows[0]).toMatchObject({ top: { registryId: 't1', label: 'Laundry', k: 2, ofTheme: 8 }, brand: { label: 'Patagonia', k: 2, you: false } })
  })

  it('says so when no account reaches the floor, and when the creators were not read', () => {
    const thin = buildCreators({ month: SEP, read: { ...read, creators: [read.creators[3]] }, labels: new Map(), videoIds: new Map(), brands: [], params: {} })
    expect(thin.empty).toBe('No account made 3 or more of the market’s videos in September.')
    expect(buildCreators({ month: SEP, read: null, labels: new Map(), videoIds: new Map(), brands: [], params: {} }).empty).toBe('Creators could not be read just now.')
  })

  it('finds a creator by its key or its name', () => {
    expect(resolveCreator(read.creators, 'kate')?.key).toBe('tiktok|kate')
    expect(resolveCreator(read.creators, 'youtube|kate')?.key).toBe('youtube|kate')
    expect(resolveCreator(read.creators, 'R/ONEBAG')?.key).toBe('reddit|r/onebag')
    expect(resolveCreator(read.creators, 'nobody')).toBeNull()
  })

  it('opens a creator: its conversations with labels, and every brand named in its videos', () => {
    const p = buildCreatorPanel({ creator: read.creators[0], n: 20, labels: new Map([['t0', 'Size'], ['t1', 'Laundry']]), videoIds: ['a', 'b', 'c'], brands, params: {} })
    expect(p.conversations.map((c) => [c.label, c.k, c.ofTheme])).toEqual([['Size', 3, 4], ['Laundry', 2, 8]])
    expect(p.brands).toEqual([{ label: 'Patagonia', k: 2, you: false }, { label: 'Sealand', k: 1, you: true }])
    expect(p.followers).toBeNull()
  })
})

describe('the page and the Dashboard tile', () => {
  it('opens one item, a group before a brand before a creator, and nothing it cannot find', () => {
    const d = sealandVoicesFixture()
    expect(openOf(d, { group: 'eco', brand: 'Patagonia' })).toEqual({ kind: 'group', key: 'eco' })
    expect(openOf(d, { group: 'gone', brand: 'patagonia' })?.kind).toBe('brand')
    expect(openOf(d, { creator: 'Pack Hacker' })).toEqual({ kind: 'creator', key: 'youtube|Pack Hacker' })
    expect(openOf(d, { brand: 'Nobody' })).toBeNull()
    // ANY tracked brand opens: one the table does not print (Freedom of Movement, named
    // in no video), and Össur's rival, counted or not.
    expect(openOf(d, { brand: 'Freedom of Movement' })).toEqual({ kind: 'brand', key: 'c-fom' })
    expect(openOf(ossurVoicesFixture(), { brand: 'competitor:Ottobock' })).toEqual({ kind: 'brand', key: '5ecfa431' })
    // A subreddit is no creator.
    expect(openOf(d, { creator: 'r/onebag' })).toBeNull()
  })

  it('tops the tile with the group of the most videos, and the two brands named most', () => {
    const d = sealandVoicesFixture()
    const top = topVoicesOf({ month: d.month, soFar: false, videos: d.videos, groups: d.groups, brands: d.brands })
    expect(top.group).toMatchObject({ key: 'one-bag', videos: 74, href: '/dashboard/voices?group=one-bag#group-panel' })
    expect(top.named.map((n) => [n.label, n.k, n.n])).toEqual([['Patagonia', 13, 743], ['The North Face', 10, 743]])
    expect(top.groups).toHaveLength(3)
    const o = ossurVoicesFixture()
    expect(topVoicesOf({ month: o.month, soFar: true, videos: o.videos, groups: o.groups, brands: o.brands })).toMatchObject({ monthWords: 'September so far', named: [] })
  })

  // Decision 3: the tile carries the label its loader read at its clock.
  it('carries the month\'s label to the tile, and none where the loader gave none', () => {
    const d = sealandVoicesFixture()
    expect(topVoicesOf({ month: d.month, soFar: false, monthLabel: 'the last full month', videos: d.videos, groups: d.groups, brands: d.brands }).monthLabel).toBe('the last full month')
    expect(topVoicesOf({ month: d.month, soFar: true, videos: d.videos, groups: d.groups, brands: d.brands }).monthLabel).toBeNull()
    // The page's data carries it from the fixture's day, 13 October.
    expect(d.monthLabel).toBe('the last full month')
  })
})
