import { describe, expect, it } from 'vitest'
import { selectClaims, ownVoice, competitorVoice, claimEntity, shapeBrandVoice, mentionsBrand, MAX_ABOUT_CLAIMS, ABOUT_YOU_MAX } from './claims'

const TRACKED = ['Cotopaxi', 'Topo Designs']

const row = (over: Partial<Parameters<typeof selectClaims>[0][number]> = {}) => ({
  run_id: 'run-new',
  source_video_id: 'v1',
  entity: 'competitor',
  competitor_name: 'Cotopaxi',
  claim: 'Lifetime warranty on bags',
  quote: 'They have a lifetime warranty on their bags',
  ...over,
})

describe('selectClaims', () => {
  it('splits client and named-competitor claims', () => {
    const r = selectClaims([
      row({ entity: 'client', competitor_name: null, source_video_id: 'c1', claim: 'Upcycled materials' }),
      row(),
    ], TRACKED)
    expect(r.client).toEqual([{ competitor: null, claim: 'Upcycled materials', quote: row().quote }])
    expect(r.competitorsOwn).toEqual([{ competitor: 'Cotopaxi', claim: 'Lifetime warranty on bags', quote: row().quote }])
  })

  it('newest-run-wins per video: older runs\' paraphrase variants vanish entirely', () => {
    const r = selectClaims([
      row({ run_id: 'run-new', claim: 'Democratises shipping rates for all merchants' }),
      row({ run_id: 'run-old', claim: 'Democratises shipping rates so merchants get the same price' }),
      row({ run_id: 'run-old', claim: 'A completely different old claim' }),
    ], TRACKED)
    expect(r.competitorsOwn).toHaveLength(1)
    expect(r.competitorsOwn[0].claim).toBe('Democratises shipping rates for all merchants')
  })

  it('newest-run-wins is per video — other videos keep their own newest run', () => {
    const r = selectClaims([
      row({ source_video_id: 'v1', run_id: 'run-new' }),
      row({ source_video_id: 'v2', run_id: 'run-old', claim: 'Free People collab collection' }),
    ], TRACKED)
    expect(r.competitorsOwn).toHaveLength(2)
  })

  it('drops claims from competitors no longer tracked (fold-compared)', () => {
    const r = selectClaims([
      row({ competitor_name: 'cotopaxi' }),
      row({ competitor_name: 'Patagonia', source_video_id: 'v2' }),
    ], TRACKED)
    expect(r.competitorsOwn).toHaveLength(1)
    expect(r.competitorsOwn[0].competitor).toBe('cotopaxi')
  })

  it('excludes unnamed competitor claims; client claims unaffected by tracking', () => {
    const r = selectClaims([
      row({ competitor_name: null }),
      row({ competitor_name: 'unknown', source_video_id: 'v2' }),
      row({ entity: 'client', competitor_name: null, source_video_id: 'c1', claim: 'Handmade' }),
    ], [])
    expect(r.competitorsOwn).toHaveLength(0)
    expect(r.client).toHaveLength(1)
  })

  it('dedupes same video+normalized claim and caps per entity', () => {
    const dup = selectClaims([row({ quote: 'newest quote' }), row({ claim: ' lifetime   WARRANTY on bags ' })], TRACKED)
    expect(dup.competitorsOwn).toHaveLength(1)
    expect(dup.competitorsOwn[0].quote).toBe('newest quote')

    const rows = [
      ...Array.from({ length: 4 }, (_, i) => row({ source_video_id: `a${i}`, claim: `claim ${i}` })),
      ...Array.from({ length: 4 }, (_, i) => row({ source_video_id: `b${i}`, claim: `claim ${i}`, competitor_name: 'Topo Designs' })),
      ...Array.from({ length: 4 }, (_, i) => row({ source_video_id: `c${i}`, claim: `claim ${i}`, entity: 'client', competitor_name: null })),
    ]
    const capped = selectClaims(rows, TRACKED, 3)
    expect(capped.competitorsOwn.filter((c) => c.competitor === 'Cotopaxi')).toHaveLength(3)
    expect(capped.competitorsOwn.filter((c) => c.competitor === 'Topo Designs')).toHaveLength(3)
    expect(capped.client).toHaveLength(3)
  })
})

describe('ownVoice — is this client-bucket video the client speaking?', () => {
  const OSSUR = ['Össur', 'ossur']
  it('an owned post is own voice regardless of account name', () => {
    expect(ownVoice({ source: 'owned', account_name: 'whatever' }, OSSUR)).toBe(true)
  })
  it("a COMPETITOR's own post is never the client's voice", () => {
    // competitor_owned rows arrived 2026-09-09; the check is on 'owned'
    // exactly, and a competitor's handle folds to none of the brand keywords.
    expect(ownVoice({ source: 'competitor_owned', account_name: 'ottobock' }, OSSUR)).toBe(false)
  })
  it("a discovered video from one of the client's own accounts is own voice (name folds to a brand keyword)", () => {
    expect(ownVoice({ source: 'discovered', account_name: 'ÖSSUR' }, OSSUR)).toBe(true)
    expect(ownVoice({ source: 'discovered', account_name: 'Össur Academy' }, OSSUR)).toBe(true)
    expect(ownVoice({ source: 'discovered', account_name: 'Össur DE' }, OSSUR)).toBe(true)
  })
  it('a third party talking about the client is NOT own voice — the 2026-08-16 misattribution', () => {
    expect(ownVoice({ source: 'discovered', account_name: 'McMorris Prosthetic Services' }, OSSUR)).toBe(false)
    expect(ownVoice({ source: 'discovered', account_name: 'The Sport Verdict' }, OSSUR)).toBe(false)
    expect(ownVoice({ source: 'discovered', account_name: 'tunl.to' }, ['Sealand', 'Sealand Gear'])).toBe(false)
  })
  it("a third-party account that carries the brand's name is still NOT own voice — review/fan/vs channels", () => {
    expect(ownVoice({ source: 'discovered', account_name: 'Össur Review' }, OSSUR)).toBe(false)
    expect(ownVoice({ source: 'discovered', account_name: 'WHOOP Fans' }, ['whoop'])).toBe(false)
    expect(ownVoice({ source: 'discovered', account_name: 'Ossur vs Ottobock' }, OSSUR)).toBe(false)
    expect(ownVoice({ source: 'discovered', account_name: 'Össur Academy' }, OSSUR)).toBe(true) // still fine
  })

  it('null account, empty keywords, or a too-short keyword never match', () => {
    expect(ownVoice({ source: 'discovered', account_name: null }, OSSUR)).toBe(false)
    expect(ownVoice({ source: 'discovered', account_name: 'ÖSSUR' }, [])).toBe(false)
    expect(ownVoice({ source: 'discovered', account_name: 'ÖSSUR' }, null)).toBe(false)
    expect(ownVoice({ source: 'discovered', account_name: 'Sport Verdict' }, ['or'])).toBe(false)
  })
})

describe('selectClaims — voice split', () => {
  it('routes client claims by voice: own → client, about → about; competitors untouched', () => {
    const r = selectClaims([
      row({ entity: 'client', competitor_name: null, source_video_id: 'own1', claim: 'Proprio Foot adapts to terrain', voice: 'own', account: 'ÖSSUR', platform: 'youtube', url: 'https://youtu.be/x' }),
      row({ entity: 'client', competitor_name: null, source_video_id: 'rev1', claim: 'ProFlex is the model they base all their feet on', voice: 'about', account: 'McMorris Prosthetic Services', platform: 'youtube', url: 'https://youtu.be/y' }),
      row(),
    ], TRACKED)
    expect(r.client.map((c) => c.claim)).toEqual(['Proprio Foot adapts to terrain'])
    expect(r.about).toEqual([{ competitor: null, claim: 'ProFlex is the model they base all their feet on', quote: row().quote, voice: 'about', account: 'McMorris Prosthetic Services', platform: 'youtube', url: 'https://youtu.be/y' }])
    expect(r.competitorsOwn).toHaveLength(1)
  })

  it('a client row without a voice is treated as own voice (pre-voice callers)', () => {
    const r = selectClaims([row({ entity: 'client', competitor_name: null, source_video_id: 'c1' })], TRACKED)
    expect(r.client).toHaveLength(1)
    expect(r.about).toHaveLength(0)
  })

  it('caps own and about separately — a busy reviewer cannot crowd out the client\'s own words', () => {
    const rows = [
      ...Array.from({ length: MAX_ABOUT_CLAIMS + 3 }, (_, i) => row({ entity: 'client', competitor_name: null, source_video_id: `rev${i}`, claim: `review claim ${i}`, voice: 'about' as const })),
      row({ entity: 'client', competitor_name: null, source_video_id: 'own1', claim: 'own claim', voice: 'own' as const }),
    ]
    const r = selectClaims(rows, TRACKED)
    expect(r.about).toHaveLength(MAX_ABOUT_CLAIMS)
    expect(r.client.map((c) => c.claim)).toEqual(['own claim'])
  })
})

describe('selectClaims counts + shapeBrandVoice', () => {
  const BRAND = ['Sealand']
  const about = (i: number, url = `https://youtu.be/v${i}`, claim = `Sealand about claim ${i}`) =>
    row({ entity: 'client', competitor_name: null, source_video_id: `rev${i}`, claim, voice: 'about' as const, account: `Reviewer ${i}`, platform: 'youtube', url })

  it('counts are post-hygiene but PRE-cap, so the roll-up stays honest past the cap; about holds up to MAX_ABOUT_CLAIMS', () => {
    const rows = [
      ...Array.from({ length: MAX_ABOUT_CLAIMS + 5 }, (_, i) => about(i)),
      row({ entity: 'client', competitor_name: null, source_video_id: 'own1', claim: 'own', voice: 'own' as const }),
      row(),
    ]
    const r = selectClaims(rows, TRACKED)
    expect(r.counts).toEqual({ own: 1, about: MAX_ABOUT_CLAIMS + 5, competitors: 1, competitors_own: 1, competitors_about: 0 })
    expect(r.about).toHaveLength(MAX_ABOUT_CLAIMS)
  })

  it('shapes the About-you block: ≤2 per video, claim-text dedupe, capped, speaker + platform + url carried', () => {
    const rows = [
      about(1, 'https://youtu.be/A', 'Sealand A first'), about(2, 'https://youtu.be/A', 'Sealand A second'), about(3, 'https://youtu.be/A', 'Sealand A third'),
      about(4, 'https://youtu.be/B', 'Sealand same words'), about(5, 'https://youtu.be/C', 'Sealand same  words'),
      ...Array.from({ length: 10 }, (_, i) => about(10 + i, `https://youtu.be/D${i}`, `Sealand unique ${i}`)),
    ]
    const snap = shapeBrandVoice(selectClaims(rows, TRACKED, 100), BRAND)
    expect(snap.about.filter((e) => e.url === 'https://youtu.be/A')).toHaveLength(2)
    expect(snap.about.filter((e) => e.claim.toLowerCase().replace(/\s+/g, ' ') === 'sealand same words')).toHaveLength(1)
    expect(snap.about).toHaveLength(ABOUT_YOU_MAX)
    expect(snap.about[0]).toEqual({ claim: 'Sealand A first', quote: row().quote, account: 'Reviewer 1', platform: 'youtube', url: 'https://youtu.be/A' })
    expect(snap.counts.about).toBe(15)
  })

  it('an empty about side yields an empty block but keeps the counts', () => {
    const snap = shapeBrandVoice(selectClaims([row()], TRACKED), BRAND)
    expect(snap).toEqual({ counts: { own: 0, about: 0, competitors: 1, competitors_own: 1, competitors_about: 0 }, about: [] })
  })

  it("drops About-you claims that never name the brand — a shipping company's copy is not 'about you' (review 2026-08-16)", () => {
    const rows = [
      about(1, 'https://i/1', 'Tunl is an international shipping company based in Cape Town'),
      about(2, 'https://i/2', 'Sealand Gear bags come with a lifetime warranty'),
    ]
    const snap = shapeBrandVoice(selectClaims(rows, TRACKED), ['sealandgear', 'sealand gear'])
    expect(snap.about.map((e) => e.claim)).toEqual(['Sealand Gear bags come with a lifetime warranty'])
    expect(snap.counts.about).toBe(2) // the roll-up still counts what Pass A stored
  })
})

describe('mentionsBrand', () => {
  it('matches in the claim OR the quote, fold-insensitive; short keywords never match', () => {
    expect(mentionsBrand({ claim: 'ProFlex has a sandal toe', quote: 'Össur builds it' }, ['ossur'])).toBe(true)
    expect(mentionsBrand({ claim: 'ProFlex has a sandal toe', quote: 'the foot is light' }, ['ossur'])).toBe(false)
    expect(mentionsBrand({ claim: 'anything', quote: 'x' }, ['or'])).toBe(false)
    expect(mentionsBrand({ claim: 'anything', quote: 'x' }, null)).toBe(false)
  })
})

describe('competitorVoice — is this the rival speaking, or somebody about them?', () => {
  // The account shapes are production's, 2026-09-14: Össur's Ottobock claims
  // come off `ottobock`, `ottobock professionals` and `ottobock deutschland`;
  // Sealand's Cotopaxi claims come off creators like `berryd treasure`.
  it("a post read off the rival's own profile is their voice, whatever the account is called", () => {
    expect(competitorVoice({ source: 'competitor_owned', account_name: 'cotopaxiofficial' }, 'Cotopaxi')).toBe('own')
    expect(competitorVoice({ source: 'competitor_owned', account_name: null }, 'Cotopaxi')).toBe('own')
  })

  it('a discovered video from an account carrying the rival\'s name is their voice — the sub-brand and regional channels one handle cannot reach', () => {
    expect(competitorVoice({ source: 'discovered', account_name: 'ottobock' }, 'Ottobock')).toBe('own')
    expect(competitorVoice({ source: 'discovered', account_name: 'ottobock professionals' }, 'Ottobock')).toBe('own')
    expect(competitorVoice({ source: 'discovered', account_name: 'Ottobock Deutschland' }, 'Ottobock')).toBe('own')
  })

  it('a creator, a clinic or a deal account is NOT the rival — the 206-of-208 Cotopaxi misattribution', () => {
    expect(competitorVoice({ source: 'discovered', account_name: 'berryd treasure' }, 'Cotopaxi')).toBe('about')
    expect(competitorVoice({ source: 'discovered', account_name: 'mcmorris prosthetic services' }, 'Ottobock')).toBe('about')
    expect(competitorVoice({ source: 'discovered', account_name: null }, 'Ottobock')).toBe('about')
  })

  it("a third-party account carrying the rival's name is still not the rival — review / fan / vs channels", () => {
    expect(competitorVoice({ source: 'discovered', account_name: 'ottobock fan page' }, 'Ottobock')).toBe('about')
    expect(competitorVoice({ source: 'discovered', account_name: 'Ossur vs Ottobock' }, 'Ottobock')).toBe('about')
    expect(competitorVoice({ source: 'discovered', account_name: 'Cotopaxi Unboxing' }, 'Cotopaxi')).toBe('about')
  })

  it('the census account names answer first, so an account naming nobody still reads as theirs', () => {
    const names = new Map([['tiktok', new Set(['cotopaxiofficial', 'nelson'])]])
    expect(competitorVoice({ source: 'discovered', account_name: 'Nelson', platform: 'tiktok' }, 'Cotopaxi', names)).toBe('own')
    // Same account name, a platform the handle set does not cover.
    expect(competitorVoice({ source: 'discovered', account_name: 'Nelson', platform: 'youtube' }, 'Cotopaxi', names)).toBe('about')
  })

  it('an unnamed or too-short rival never matches by name alone', () => {
    expect(competitorVoice({ source: 'discovered', account_name: 'ottobock' }, null)).toBe('about')
    expect(competitorVoice({ source: 'discovered', account_name: 'someones bio' }, 'io')).toBe('about')
  })

  it("the client's own post is never a rival's voice", () => {
    expect(competitorVoice({ source: 'owned', account_name: 'sealandgear' }, 'Cotopaxi')).toBe('about')
  })
})

describe('claimEntity — who the claim belongs to, read from the video as it stands now', () => {
  it('authorship first: an owned post is the client\'s even when a caption-only re-tag cleared is_client', () => {
    // Sealand production, 2026-09-14: two `sealandgear` TikToks carry 18 claims
    // between them and `is_client = false` since the 9 Sep re-tag.
    expect(claimEntity({ source: 'owned', is_client: false, is_competitor: false, competitor_name: null }))
      .toEqual({ entity: 'client', competitor: null })
    expect(claimEntity({ source: 'competitor_owned', is_client: false, is_competitor: true, competitor_name: 'Cotopaxi' }))
      .toEqual({ entity: 'competitor', competitor: 'Cotopaxi' })
  })

  it('then the subject tags, which is what a keyword-discovered video has', () => {
    expect(claimEntity({ source: 'discovered', is_client: true, is_competitor: false, competitor_name: null }))
      .toEqual({ entity: 'client', competitor: null })
    expect(claimEntity({ source: 'discovered', is_client: false, is_competitor: true, competitor_name: 'Ottobock' }))
      .toEqual({ entity: 'competitor', competitor: 'Ottobock' })
  })

  it('a video that is nobody\'s now belongs to nobody — the 54 Patagonia rows whose tag was cleared', () => {
    expect(claimEntity({ source: 'discovered', is_client: false, is_competitor: false, competitor_name: null })).toBeNull()
    expect(claimEntity({ source: 'discovered', is_client: false, is_competitor: true, competitor_name: '  ' })).toBeNull()
    expect(claimEntity({ source: 'competitor_owned', is_client: false, is_competitor: true, competitor_name: null })).toBeNull()
  })

  it('the client wins over a competitor tag, the way every other bucketing does', () => {
    expect(claimEntity({ source: 'discovered', is_client: true, is_competitor: true, competitor_name: 'Ottobock' }))
      .toEqual({ entity: 'client', competitor: null })
  })
})

describe('selectClaims — the competitor voice split', () => {
  const rival = (over: Parameters<typeof row>[0] = {}) => row({ competitor_name: 'Cotopaxi', ...over })

  it("routes a rival's claims by voice, and a rival's about side never reaches the own side", () => {
    const r = selectClaims([
      rival({ source_video_id: 'own1', claim: 'Every bag funds a grant', voice: 'own', account: 'cotopaxiofficial' }),
      rival({ source_video_id: 'rev1', claim: 'This bag is cheaper at the outlet', voice: 'about', account: 'berryd treasure' }),
    ], TRACKED)
    expect(r.competitorsOwn.map((c) => c.claim)).toEqual(['Every bag funds a grant'])
    expect(r.competitorsAbout.map((c) => c.claim)).toEqual(['This bag is cheaper at the outlet'])
    expect(r.counts).toMatchObject({ competitors: 2, competitors_own: 1, competitors_about: 1 })
  })

  it('a competitor row without a voice is read as the rival speaking (callers that do not compute it)', () => {
    const r = selectClaims([rival()], TRACKED)
    expect(r.competitorsOwn).toHaveLength(1)
    expect(r.competitorsAbout).toHaveLength(0)
  })

  it('caps each rival per side: a busy creator cannot crowd out that rival\'s own words', () => {
    const rows = [
      ...Array.from({ length: MAX_ABOUT_CLAIMS + 4 }, (_, i) => rival({ source_video_id: `rev${i}`, claim: `creator claim ${i}`, voice: 'about' as const })),
      ...Array.from({ length: 5 }, (_, i) => rival({ source_video_id: `own${i}`, claim: `brand claim ${i}`, voice: 'own' as const })),
      ...Array.from({ length: 5 }, (_, i) => rival({ competitor_name: 'Topo Designs', source_video_id: `t${i}`, claim: `topo claim ${i}`, voice: 'own' as const })),
    ]
    const r = selectClaims(rows, TRACKED, 3)
    expect(r.competitorsAbout).toHaveLength(MAX_ABOUT_CLAIMS)
    expect(r.competitorsOwn.filter((c) => c.competitor === 'Cotopaxi')).toHaveLength(3)
    expect(r.competitorsOwn.filter((c) => c.competitor === 'Topo Designs')).toHaveLength(3)
    // Pre-cap counts stay honest on both sides.
    expect(r.counts).toMatchObject({ competitors_own: 10, competitors_about: MAX_ABOUT_CLAIMS + 4 })
  })

  it('an untracked rival is dropped from BOTH sides, not just the one that feeds a prompt', () => {
    const r = selectClaims([
      rival({ competitor_name: 'Patagonia', source_video_id: 'p1', voice: 'own' as const }),
      rival({ competitor_name: 'Patagonia', source_video_id: 'p2', voice: 'about' as const }),
    ], TRACKED)
    expect(r.competitorsOwn).toHaveLength(0)
    expect(r.competitorsAbout).toHaveLength(0)
    expect(r.counts.competitors).toBe(0)
  })
})
