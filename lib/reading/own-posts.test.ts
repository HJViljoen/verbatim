import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CENSUS_EMPTY,
  ECHO_NOT_COUNTED,
  ECHO_SILENT,
  OWN_CLAIMS_UNREADABLE,
  OWN_POSTS_NO_ACCOUNTS,
  OWN_POSTS_UNREADABLE,
  OWN_POSTS_UNREADABLE_OUTSIDE,
  OWN_POST_COMMENT_FLOOR,
  RIVAL_CLAIMS_WITHHELD,
  SAID_ABOUT_EMPTY,
  SUBJECTS_MATCHED_NONE,
  SUBJECTS_MATCHED_UNCHECKED,
  SUBJECTS_NONE_NAMED,
  SUBJECTS_NOT_ANALYSED,
  ECHO_MARKET_UNREAD,
  MARKET_ECHO_AUDIENCE,
  TOUCH_MIN_WORDS,
  claimEcho,
  isMissingOwnPostSubjects,
  marketClaimEcho,
  followersCount,
  followersLine,
  followersOnly,
  marketEchoReading,
  ownCensusWithClaims,
  ownPostFilings,
  postsTouching,
  touchWords,
  ownPostBasis,
  ownPostCensus,
  rivalOwnClaims,
  saidAbout,
  type OwnPostInput,
} from './own-posts'
import {
  OWN_POSTS_UNREADABLE as OVERVIEW_UNREADABLE,
  OWN_POSTS_UNREADABLE_OUTSIDE as OVERVIEW_UNREADABLE_OUTSIDE,
} from '../pages/overview'

const MONTH = '2026-09-01'

const video = (over: Partial<OwnPostInput['videos'][number]> = {}) => ({
  id: 'v1',
  upload_date: '2026-09-04',
  comments_count: 40,
  hook_style: 'demonstration' as string | null,
  classified_type: 'review' as string | null,
  ...over,
})

const input = (over: Partial<OwnPostInput> = {}): OwnPostInput => ({
  month: MONTH,
  audience: 'client',
  audienceLabel: 'You',
  videos: [
    video({ id: 'v1' }),
    video({ id: 'v2', hook_style: 'bold-claim', classified_type: 'promotional' }),
    // Below the floor, and carrying nothing the classifier named.
    video({ id: 'v3', comments_count: 1, hook_style: null, classified_type: null }),
    // Last month: outside the census entirely.
    video({ id: 'v4', upload_date: '2026-08-28' }),
    // Undated: cannot be dated by the post, so it is not counted.
    video({ id: 'v5', upload_date: null }),
  ],
  claims: [],
  membership: [],
  echoes: [],
  ...over,
})

describe('ownPostBasis', () => {
  it('names the month the posts were published in', () => {
    expect(ownPostBasis(MONTH)).toBe('posts published in September')
  })
})

describe('ownPostCensus', () => {
  it('counts posts by their own upload date and carries the basis', () => {
    const c = ownPostCensus(input())
    expect(c.month).toBe(MONTH)
    expect(c.basis).toBe('posts published in September')
    expect(c.published).toEqual({ k: 3, n: 3 })
    expect(c.unread).toBeNull()
  })

  it('states the comment floor beside the count that used it', () => {
    const c = ownPostCensus(input())
    expect(c.commentFloor).toBe(OWN_POST_COMMENT_FLOOR)
    expect(c.overFloor).toEqual({ k: 2, n: 3 })
  })

  it('takes a caller’s floor when it is given one', () => {
    expect(ownPostCensus(input({ commentFloor: 0 })).overFloor).toEqual({ k: 3, n: 3 })
  })

  it('gives every hook and format row its own "of N", and they do not sum to the census', () => {
    const c = ownPostCensus(input())
    expect(c.hooks.map((h) => [h.label, h.value.k, h.value.n])).toEqual([
      ['Bold claim', 1, 3],
      ['Demonstration', 1, 3],
    ])
    // THE POINT OF THE ROW SHAPE: two of three posts carry a hook, so the rows
    // sum to less than the census — and a post carrying two would make them sum
    // to more. Either way a reader may not add them.
    const summed = c.hooks.reduce((n, h) => n + h.value.k, 0)
    expect(summed).toBeLessThan(c.published.k)
    expect(c.formats.map((f) => f.label)).toEqual(['Promotional', 'Review'])
    for (const row of [...c.hooks, ...c.formats]) expect(row.value.n).toBe(c.published.k)
  })

  it('counts a subject only over the posts in this month', () => {
    const c = ownPostCensus(
      input({
        membership: [
          { subjectId: 's1', label: 'Durability', videoIds: ['v1', 'v2', 'v4'] },
          { subjectId: 's2', label: 'Recycled materials', videoIds: ['v4'] },
        ],
      }),
    )
    // v4 is last month's post: Durability keeps two, and a subject whose only
    // post is outside the month is not a row of nothing.
    expect(c.subjects).toEqual([{ subjectId: 's1', label: 'Durability', value: { k: 2, n: 3 } }])
  })

  it('prints a match on your own posts only for a READY subject (decision C, WP1.1)', () => {
    // Production, 25 Sep: Community & purpose (0.60 on 25 labels) failed its
    // check, and it is your followers' one subject. Its match on your own posts
    // is your side of it, which a failed or provisional subject does not show.
    const c = ownPostCensus(
      input({
        membership: [
          { subjectId: 's1', label: 'Durability', videoIds: ['v1', 'v2'], calibration: 'ready' },
          { subjectId: 's2', label: 'Community & purpose', videoIds: ['v1', 'v2', 'v3'], calibration: 'failed' },
          { subjectId: 's3', label: 'Travel fit', videoIds: ['v3'], calibration: 'provisional' },
        ],
        subjectScope: { named: 3, analysedPosts: 3 },
      }),
    )
    expect(c.subjects).toEqual([{ subjectId: 's1', label: 'Durability', value: { k: 2, n: 3 } }])
    expect(c.subjectsNote).toBeNull()
  })

  it('never says no post was about a subject when the only matches are held back', () => {
    const c = ownPostCensus(
      input({
        membership: [{ subjectId: 's2', label: 'Community & purpose', videoIds: ['v1'], calibration: 'failed' }],
        subjectScope: { named: 3, analysedPosts: 3 },
      }),
    )
    expect(c.subjects).toEqual([])
    expect(c.subjectsNote).toBe(SUBJECTS_MATCHED_UNCHECKED)
    expect(SUBJECTS_MATCHED_UNCHECKED).not.toMatch(/[0-9—]/)
  })

  it('says WHY the subject half is empty, which is the half that is empty today', () => {
    const named = (over: Partial<OwnPostInput>) => ownPostCensus(input(over)).subjectsNote
    // Nothing named: the posts were matched against nothing.
    expect(named({ subjectScope: { named: 0, analysedPosts: 0 } })).toBe(SUBJECTS_NONE_NAMED)
    // Named, and nothing on the posts has been read — the production shape:
    // Sealand has no insight on any of its seventeen September posts.
    expect(named({ subjectScope: { named: 3, analysedPosts: 0 } })).toBe(SUBJECTS_NOT_ANALYSED)
    // Read, matched, and none of them was about a named subject. A reading.
    expect(named({ subjectScope: { named: 3, analysedPosts: 3 } })).toBe(SUBJECTS_MATCHED_NONE)
    // A match needs no note, and neither does a caller who said nothing.
    expect(
      named({
        subjectScope: { named: 3, analysedPosts: 3 },
        membership: [{ subjectId: 's1', label: 'Durability', videoIds: ['v1'] }],
      }),
    ).toBeNull()
    expect(named({})).toBeNull()
  })

  it('leaves the subject half unqualified when the whole census is unread', () => {
    // `unread` already says no post was published; a second sentence about the
    // subjects of posts that do not exist is noise, not honesty.
    expect(ownPostCensus(input({ videos: [], subjectScope: { named: 3, analysedPosts: 0 } })).subjectsNote).toBeNull()
  })

  it('says the census is empty rather than printing three zeroes', () => {
    const c = ownPostCensus(input({ videos: [] }))
    expect(c.published).toEqual({ k: 0, n: 0 })
    expect(c.unread).toBe(CENSUS_EMPTY('posts published in September'))
  })

  it('groups claims by what a reader reads as one claim, with the posts carrying it', () => {
    const c = ownPostCensus(
      input({
        claims: [
          { id: 'c1', source_video_id: 'v1', entity: 'client', claim: 'Built to last a decade', quote: 'These last a decade.' },
          { id: 'c2', source_video_id: 'v2', entity: 'client', claim: 'built  to last a DECADE', quote: 'Ten years easily.' },
          { id: 'c3', source_video_id: 'v4', entity: 'client', claim: 'Made from recycled sails', quote: 'Every one is a sail.' },
        ],
        echoes: [],
      }),
    )
    // Two rows would be wrong (one claim, two posts) and so would one post
    // (the claim is on both). The August post's claim is not in this month.
    expect(c.claims).toHaveLength(1)
    expect(c.claims[0].claim).toBe('Built to last a decade')
    expect(c.claims[0].posts).toEqual({ k: 2, n: 3 })
    expect(c.claims[0].postedOn).toBe('2026-09-04')
    // The claim's OWN ref. A `v:<videos.id>` ref resolves through
    // insight_evidence to a commenter's excerpt on that video, so a snapshot
    // frozen under one would print a stranger's comment as the brand's claim.
    expect(c.claims[0].quote?.ref).toBe('k:c1')
  })

  it('counts a claim by the post it sits on, never by the entity a run froze on it', () => {
    // `video_claims.entity` froze `videos.is_client` at the run that wrote the
    // row; a re-tag since rewrites the video and never the claim. The census's
    // membership test is the POST, so a stale row on one of this month's own
    // posts is counted, and a row on a post outside the census is not.
    const c = ownPostCensus(
      input({
        claims: [
          { id: 'c1', source_video_id: 'v1', entity: 'competitor:Freitag', claim: 'Built to last a decade', quote: '' },
          { id: 'c2', source_video_id: 'v4', entity: 'client', claim: 'Made from recycled sails', quote: '' },
        ],
        echoes: [],
      }),
    )
    expect(c.claims.map((r) => r.claim)).toEqual(['Built to last a decade'])
    expect(c.claims[0].posts).toEqual({ k: 1, n: 3 })
  })

  it('leaves a claim nobody counted as an absence, never as silence', () => {
    const c = ownPostCensus(
      input({
        claims: [{ id: 'c1', source_video_id: 'v1', entity: 'client', claim: 'Waterproof', quote: 'It is waterproof.' }],
        echoes: [],
      }),
    )
    expect(c.claims[0].echo.state).toBe('not_tracked')
    expect(c.claims[0].echo.why).toBe(ECHO_NOT_COUNTED)
  })
})

describe('claimEcho', () => {
  const at = { audience: 'client', audienceLabel: 'You' }

  it('reads a counted claim as echoed', () => {
    const e = claimEcho({ ...at, reading: { k: 22, n: 84 }, stance: 'echoes' })
    expect(e.state).toBe('echoed')
    expect(e.label).toBe('Echoed')
    expect(e.value).toEqual({ k: 22, n: 84 })
    expect(e.why).toBeNull()
  })

  it('reads a counted claim the audience argued with as pushed back', () => {
    const e = claimEcho({ ...at, reading: { k: 9, n: 84 }, stance: 'contradicts' })
    expect(e.state).toBe('pushed_back')
    expect(e.label).toBe('Pushed back')
    expect(e.value).toEqual({ k: 9, n: 84 })
  })

  it('reads a counted zero as silence, and says so', () => {
    const e = claimEcho({ ...at, reading: { k: 0, n: 84 }, stance: 'echoes' })
    // THE COUNT OVERRULES THE STANCE. Pass D-a said "echoes"; nothing carried
    // it, and a model's adjective may not survive its own denominator.
    expect(e.state).toBe('silent')
    expect(e.label).toBe('Not talked about')
    expect(e.why).toBe(ECHO_SILENT)
  })

  it('refuses to count in an audience nobody read', () => {
    const e = claimEcho({ ...at, reading: null, stance: 'echoes' })
    expect(e.state).toBe('not_tracked')
    expect(e.why).toBe(ECHO_NOT_COUNTED)
    const noDenominator = claimEcho({ ...at, reading: { k: 0, n: 0 }, stance: 'silent' })
    expect(noDenominator.state).toBe('not_tracked')
  })

  it('names a rival with no account as not tracked, in the product’s own sentence', () => {
    const e = claimEcho({ audience: 'competitor:Patagonia', audienceLabel: 'Patagonia', reading: null, tracked: false })
    expect(e.state).toBe('not_tracked')
    expect(e.label).toBe('not tracked')
    expect(e.why).toBe(OWN_POSTS_UNREADABLE)
  })
})

describe('rivalOwnClaims', () => {
  const rival = (over: Partial<OwnPostInput>): OwnPostInput =>
    input({ audience: 'competitor:Freitag', audienceLabel: 'Freitag', ...over })

  it('tells "no account configured" from "read them and found nothing"', () => {
    const [none, empty] = rivalOwnClaims([
      rival({ audienceLabel: 'Patagonia', audience: 'competitor:Patagonia', videos: [], handles: {} }),
      rival({ videos: [], handles: { tiktok: '@freitag' } }),
    ])
    expect(none.unread).toBe(OWN_POSTS_NO_ACCOUNTS)
    expect(empty.unread).toBe(CENSUS_EMPTY('posts published in September'))
  })

  it('counts a tracked rival’s posts and withholds their claims', () => {
    const [r] = rivalOwnClaims([rival({ handles: { tiktok: '@freitag' } })])
    expect(r.published).toEqual({ k: 3, n: 3 })
    expect(r.basis).toBe('posts published in September')
    expect(r.claims).toEqual([])
    // A tenant session may never read a rival's claims (M8's policy is
    // `entity = 'client'`), so an empty list has to say which emptiness it is.
    expect(r.claimsNote).toBe(RIVAL_CLAIMS_WITHHELD)
  })

  it('does not put a claims note on a rival that has no census at all', () => {
    const [r] = rivalOwnClaims([rival({ videos: [], handles: { tiktok: '' } })])
    expect(r.claimsNote).toBeNull()
  })

  it('treats an unstated handle map as "the caller did not say", not as "none"', () => {
    const [r] = rivalOwnClaims([rival({ videos: [] })])
    expect(r.unread).not.toBe(OWN_POSTS_NO_ACCOUNTS)
  })
})

describe('ownCensusWithClaims', () => {
  it('names the half it could not read, and keeps the half it did', () => {
    const c = ownCensusWithClaims(input(), false)
    expect(c.published).toEqual({ k: 3, n: 3 })
    expect(c.claims).toEqual([])
    expect(c.claimsNote).toBe(OWN_CLAIMS_UNREADABLE)
  })

  it('says nothing about the claims half once it has been read', () => {
    expect(ownCensusWithClaims(input(), true).claimsNote).toBeNull()
  })
})

describe('saidAbout', () => {
  it('counts distinct videos over the audience’s own denominator', () => {
    const s = saidAbout({
      audience: 'competitor:Patagonia',
      label: 'Patagonia',
      of: 376,
      claims: [
        { id: 'k1', claim: 'They repair for free', quote: 'Fixed my 8 year old pack for free.', videoId: 'a' },
        { id: 'k2', claim: 'they  REPAIR for free', quote: 'Sent it back and they fixed it.', videoId: 'b' },
        { id: 'k3', claim: 'they repair for free', quote: 'Same story here.', videoId: 'b' },
        { id: 'k4', claim: 'Expensive', quote: 'Costs a fortune.', videoId: 'c' },
      ],
    })
    expect(s.rows).toHaveLength(2)
    expect(s.rows[0]).toMatchObject({ claim: 'They repair for free', value: { k: 2, n: 376 } })
    // The CLAIM's ref, not the video's: `v:` resolves to a commenter's excerpt.
    expect(s.rows[0].quote?.ref).toBe('k:k1')
    expect(s.rows[1].value).toEqual({ k: 1, n: 376 })
    expect(s.empty).toBeNull()
  })

  it('carries no quote for a row whose claim row it cannot key', () => {
    const s = saidAbout({
      audience: 'competitor:Patagonia',
      label: 'Patagonia',
      of: 376,
      claims: [{ claim: 'They repair for free', quote: 'Fixed my pack for free.', videoId: 'a' }],
    })
    expect(s.rows[0].value).toEqual({ k: 1, n: 376 })
    expect(s.rows[0].quote).toBeNull()
  })

  it('has its own words for nothing said', () => {
    const s = saidAbout({ audience: 'competitor:Poler', label: 'Poler', of: 214, claims: [] })
    expect(s.rows).toEqual([])
    expect(s.empty).toBe(SAID_ABOUT_EMPTY('Poler'))
  })
})

describe('the absence sentences', () => {
  // THE TEST THAT USED TO STAND HERE COMPARED A VALUE WITH ITSELF (code review
  // m15). `lib/pages/overview.ts` re-EXPORTS these two constants now — the
  // duplicated copy was merged into this leaf in Block D wave 2 — so
  // `OWN_POSTS_UNREADABLE === OVERVIEW_UNREADABLE` is `x === x` and passes
  // whatever either of them says. A tautology that reads like a pin is worse
  // than a deleted test, so this asserts the two things that are actually true
  // and could actually break: the leaf is the one definition, and the two
  // sentences differ in exactly one way.
  it('are the one definition — Overview re-exports this file’s constants, and does not copy them', () => {
    // A copy would satisfy `toBe` on a string too, so the real pin is that the
    // module object identity holds and the file declares them once.
    expect(OWN_POSTS_UNREADABLE).toBe(OVERVIEW_UNREADABLE)
    expect(OWN_POSTS_UNREADABLE_OUTSIDE).toBe(OVERVIEW_UNREADABLE_OUTSIDE)
    const src = readFileSync(new URL('./own-posts.ts', import.meta.url), 'utf8')
    expect(src.match(/export const OWN_POSTS_UNREADABLE =/g)).toHaveLength(1)
    const overview = readFileSync(new URL('../pages/overview.ts', import.meta.url), 'utf8')
    expect(overview).not.toMatch(/const OWN_POSTS_UNREADABLE\s*=/)
    expect(overview).toContain("export { OWN_POSTS_UNREADABLE, OWN_POSTS_UNREADABLE_OUTSIDE } from '../reading/own-posts'")
  })

  it('differ only by the internal owner, and the tenant’s form says where to look', () => {
    // Nit 25: "· Verbatim engineering" was a dangling internal label in the
    // middle of a client's rivals table with nothing saying where a reader
    // could go and see it. The owner is named on the Readiness page; the cell
    // names the page.
    expect(OWN_POSTS_UNREADABLE.startsWith(OWN_POSTS_UNREADABLE_OUTSIDE)).toBe(true)
    expect(OWN_POSTS_UNREADABLE).toContain('Settings \u203a Readiness')
    expect(OWN_POSTS_UNREADABLE_OUTSIDE).not.toContain('Settings')
    expect(OWN_POSTS_UNREADABLE_OUTSIDE).not.toContain('Verbatim')
  })
})

// ---- WP3.6: touched by your posts, the judge's filing, the market echo ------

// Sealand's own posts on staging, September (topics as stored).
const SEP_POSTS = [
  { id: '747f0d6a', topics: ['Heritage Day', 'community event', 'environmental activism', 'yoga', 'coastal clean-up', 'sustainability', 'people and planet'] },
  { id: '76a8af8e', topics: ['giveaway', 'event', 'crossbody bags', 'trail running', 'collaboration', 'sustainable gear'] },
  { id: 'df0a32f5', topics: ['event', 'yoga', 'coastal clean-up', 'community', 'sustainability', 'South Africa', 'Heritage Day', 'Sealand gear'] },
  { id: 'no-topics', topics: null },
]

describe('postsTouching (WP3.6 Y1, WP2.5 rule)', () => {
  it('needs two non-generic words from one post, and prints what it checked', () => {
    const airline = postsTouching('Confusion over airline bag sizes', SEP_POSTS)
    expect(airline.checked).toEqual(['airline', 'sizes'])
    expect(airline.matched).toEqual([])
  })

  it('never calls a one-word label touched', () => {
    const shipping = postsTouching('Questions about buying and shipping', SEP_POSTS)
    expect(shipping.checked).toEqual(['shipping'])
    expect(shipping.checked.length).toBeLessThan(TOUCH_MIN_WORDS)
    expect(shipping.matched).toEqual([])
  })

  it('lists each post that shares two or more words, with the words', () => {
    const r = postsTouching('Questions about coastal clean-up events', SEP_POSTS)
    expect(r.matched.map((m) => m.id)).toEqual(['747f0d6a', 'df0a32f5'])
    expect(r.matched[1].words).toEqual(['coastal', 'clean', 'events'])
  })

  it('drops the generic words and folds a plural', () => {
    expect(touchWords('Love for handmade bags')).toEqual([])
    expect(touchWords('Zippers in rain')).toEqual(['zipper', 'rain'])
  })
})

describe('ownPostFilings (MF3 own_post_subjects)', () => {
  const row = (over: Partial<Parameters<typeof ownPostFilings>[0][number]>) => ({
    video_id: 'p1', claim_id: null, subject_id: 's-water', touches: false, matched_words: [], method: 'judge', judge_version: 'v1', decided_at: '2026-11-22T10:00:00Z', ...over,
  })

  it('reads the newest row per pair, and an override wins a tie', () => {
    const f = ownPostFilings([
      row({ touches: true, matched_words: ['rain'], decided_at: '2026-11-22T10:00:00Z' }),
      row({ touches: false, decided_at: '2026-11-23T10:00:00Z' }),
      row({ video_id: 'p2', touches: false }),
      row({ video_id: 'p2', touches: true, matched_words: ['waterproof'], method: 'override' }),
    ])
    expect(f.postFiled.has('p1|s-water')).toBe(true)
    expect(f.touching.get('s-water')?.has('p1')).toBe(false)
    expect(f.touching.get('s-water')?.get('p2')).toEqual(['waterproof'])
  })

  it('files a claim apart from its post, and a touching claim touches its post', () => {
    const f = ownPostFilings([row({ claim_id: 'c1', touches: true, matched_words: ['recycled', 'sailcloth'] })])
    expect(f.postFiled.size).toBe(0)
    expect(f.claimFiled.has('c1|s-water')).toBe(true)
    expect(f.claimTouches.get('c1')).toEqual(new Set(['s-water']))
    expect(f.touching.get('s-water')?.get('p1')).toEqual(['recycled', 'sailcloth'])
  })

  it('knows the missing table by name only', () => {
    expect(isMissingOwnPostSubjects({ code: 'PGRST205', message: 'Could not find the table public.own_post_subjects in the schema cache' })).toBe(true)
    expect(isMissingOwnPostSubjects({ code: '42P01', message: 'relation "own_post_subjects" does not exist' })).toBe(true)
    expect(isMissingOwnPostSubjects({ code: '42501', message: 'permission denied for table own_post_subjects' })).toBe(false)
    expect(isMissingOwnPostSubjects({ code: 'PGRST205', message: 'Could not find the table public.moves' })).toBe(false)
  })
})

describe('the market echo (WP3.6 Y3: market counts, not the client audience)', () => {
  // Staging, September: 654 market videos; the echoed claim's cited evidence
  // sits on 152 videos, 89 of them in the month; the pushed-back claim's on
  // 35, 25 of them in the month.
  const month = new Set(Array.from({ length: 654 }, (_, i) => `v${i}`))
  const cited = (inMonth: number, outside: number) => [
    ...Array.from({ length: inMonth }, (_, i) => `v${i}`),
    ...Array.from({ length: outside }, (_, i) => `old${i}`),
  ]

  it('counts the cited videos inside the month, of the month', () => {
    expect(marketEchoReading(cited(89, 63), month)).toEqual({ k: 89, n: 654 })
    const echo = marketClaimEcho({ stance: 'echoes', reading: marketEchoReading(cited(89, 63), month) })
    expect(echo.audience).toBe(MARKET_ECHO_AUDIENCE)
    expect(echo.state).toBe('echoed')
    expect(echo.value).toEqual({ k: 89, n: 654 })
    expect(marketClaimEcho({ stance: 'contradicts', reading: marketEchoReading(cited(25, 10), month) }).state).toBe('pushed_back')
  })

  it('reads a claim nothing carried as silent, and an unread month as no reading', () => {
    expect(marketClaimEcho({ stance: 'silent', reading: marketEchoReading([], month) }).state).toBe('silent')
    const unread = marketClaimEcho({ stance: 'echoes', reading: marketEchoReading(cited(89, 0), null) })
    expect(unread.state).toBe('not_tracked')
    expect(unread.why).toBe(ECHO_MARKET_UNREAD)
  })
})

// Walkthrough item 8. "Protect Our Paths": Echoed on Subjects, "Not talked
// about · 0 of 852" on Your moves — the evidence was Sealand's own followers.
describe('a claim your followers took up and your market did not', () => {
  const theySay = 'People respond to Sealand as a community-rooted label, praising the cleanup work and expressing interest in showing up for events.'
  const echo = marketClaimEcho({ stance: 'echoes', reading: { k: 0, n: 852 }, theySay, followers: 3 })
  it('reads as not talked about in the market, and says whose reading it is', () => {
    expect(echo.state).toBe('silent')
    expect(echo.label).toBe('Not talked about')
    expect(followersOnly(echo)).toBe(true)
    expect(followersLine(echo, 'echoes', theySay)).toBe('Your own followers echoed it, under 3 of your posts; your market did not take it up this month.')
    expect(followersCount(echo)).toBe('raised under 3 of your own posts')
  })
  it('says nothing about followers where the market carried it, or nobody did', () => {
    const market = marketClaimEcho({ stance: 'echoes', reading: { k: 40, n: 852 }, theySay, followers: 3 })
    expect(followersOnly(market)).toBe(false)
    expect(followersLine(market, 'echoes', theySay)).toBeNull()
    expect(followersCount(market)).toBe('raised under 3 of your own posts')
    const nobody = marketClaimEcho({ stance: 'echoes', reading: { k: 0, n: 852 }, theySay, followers: 0 })
    expect(followersLine(nobody, 'echoes', theySay)).toBeNull()
    expect(followersCount(nobody)).toBeNull()
  })
  it('calls a contradiction made of questions "Questioned"', () => {
    const asked = 'People love upcycling ideas, but they also ask what materials are used and whether an upcycling claim is genuine.'
    const q = marketClaimEcho({ stance: 'contradicts', reading: { k: 125, n: 852 }, theySay: asked })
    expect(q.state).toBe('pushed_back')
    expect(q.label).toBe('Questioned')
    expect(q.questioned).toBe(true)
    expect(followersLine(marketClaimEcho({ stance: 'contradicts', reading: { k: 0, n: 852 }, theySay: asked, followers: 2 }), 'contradicts', asked))
      .toContain('Your own followers questioned it')
  })
})
