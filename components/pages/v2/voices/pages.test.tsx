import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { VOICES_ONE_MONTH } from '@/lib/pages/v2/voices'
import { BACK_TO_VOICES, BRAND_MISSING, CREATOR_REDDIT, GROUP_MISSING, GROUP_QUOTES_UNREAD, groupQuotesNone, VOICES_ONE_MONTH_SHORT, type BrandPage, type CreatorPage, type GroupPage, type LevelMissing } from '@/lib/pages/v2/voices-levels'
import { brandFixture, creatorFixture, groupFixture, groupThinFixture, SEP_CLOSED_MONTH, VOICES_LEVEL_FIXTURES } from '@/lib/pages/v2/voices-levels-fixture'
import { VoicesBrandPage, VoicesCreatorPage, VoicesGroupPage } from './pages'
import { BRAND_NUMBERS_NONE } from './brand-page'

// VOICES' LEVEL PAGES, AS THEY PRINT (17 Oct; the G3 boards): each from its
// fixture through the page's own builders, against the copy contract, the
// boards' order and words, ruling U6, decision 2 and the parity rule.

const group = (d: GroupPage | LevelMissing, switcherOpen = false) => <VoicesGroupPage data={d} switcherOpen={switcherOpen} />
const brand = (d: BrandPage | LevelMissing, switcherOpen = false) => <VoicesBrandPage data={d} switcherOpen={switcherOpen} />
const creator = (d: CreatorPage | LevelMissing) => <VoicesCreatorPage data={d} />
/** Heading levels in document order that drop more than one below the last
 *  (an h1 straight to an h3): none on any page. */
const headingSkips = (html: string): string[] => {
  const out: string[] = []
  let last = 0
  for (const m of html.matchAll(/<h([1-6])\b/g)) {
    const level = Number(m[1])
    if (last && level > last + 1) out.push(`h${last} to h${level}`)
    last = level
  }
  return out
}

const nodeOf = (key: keyof typeof VOICES_LEVEL_FIXTURES) => {
  const d = VOICES_LEVEL_FIXTURES[key]() as never
  return key.startsWith('group') ? group(d) : key.startsWith('brand') ? brand(d) : creator(d)
}

describe('every level page', () => {
  it('keeps the copy contract, prints no em or en dash and no quote outside a quote node', () => {
    for (const key of Object.keys(VOICES_LEVEL_FIXTURES) as (keyof typeof VOICES_LEVEL_FIXTURES)[]) {
      assertCopyContract(nodeOf(key))
      expect(renderText(nodeOf(key)), key).not.toMatch(/[—–]/)
    }
  })

  it('skips no heading level, a group with no one-liner and a brand with no finding included', () => {
    for (const key of Object.keys(VOICES_LEVEL_FIXTURES) as (keyof typeof VOICES_LEVEL_FIXTURES)[]) expect(headingSkips(render(nodeOf(key))), key).toEqual([])
    const noLiner = render(group({ ...groupFixture(), oneLiner: '' }))
    expect(noLiner).toContain('<h2 class="sr-only">Who they are</h2>')
    expect(headingSkips(noLiner)).toEqual([])
    const client = render(brand(brandFixture({ key: 'client' })))
    expect(client).toMatch(/data-brand-read="none"[^>]*><h2 /)
    expect(headingSkips(client)).toEqual([])
  })

  it('opens with the path and the title block: the crumb row, the h1, the level said under it and the figures row, the month switch with the week and over time not offered and its line; no tile and no label', () => {
    const g = render(group(groupFixture()))
    expect(g).toContain('data-level-bar="group"')
    // The audit design (7 Nov): no tile and no label over the h1.
    expect(g).toContain('data-level-block="audit"')
    expect(g).not.toContain('data-level-tile')
    expect(g.match(/<h1\b/g)).toHaveLength(1)
    expect(renderText(group(groupFixture()))).toMatch(/^Voices \/ Caregivers and family Voices Caregivers and family A group in your market This week/)
    expect(renderText(group(groupFixture()))).toContain(`Caregivers and family A group in your market This week`)
    expect(renderText(group(groupFixture()))).toContain(`${VOICES_ONE_MONTH} Month October so far Their videos 45 of the market’s 318 Described at The 11 Oct update Against September Not compared yet`)
    expect(g.match(/data-voices-one-month=""/g)).toHaveLength(1)
    // On a phone the row becomes the way back.
    expect(g).toMatch(/data-back-link=""[^>]*href="\/dashboard\/voices"/)
    expect(g.match(/aria-disabled="true"/g)).toHaveLength(2)
    expect(g).toContain(`title="${VOICES_ONE_MONTH}"`)
    expect(g).toContain('href="/dashboard/voices/groups/caregivers"')
    const b = render(brand(brandFixture()))
    expect(b).toContain('data-level-block="audit"')
    expect(b).not.toContain('data-level-tile')
    expect(b).toContain(`title="${VOICES_ONE_MONTH_SHORT}"`)
    expect(renderText(brand(brandFixture()))).toMatch(/^Voices \/ Ottobock Voices Ottobock A rival brand This week/)
    expect(renderText(brand(brandFixture({ key: 'client' })))).toMatch(/^Voices \/ Össur Voices Össur Your brand This week/)
    const c = render(creator(creatorFixture()))
    expect(c).toContain('data-level-block="audit"')
    expect(c).not.toContain('data-level-tile')
    expect(renderText(creator(creatorFixture()))).toMatch(/^Voices \/ @stepbystep\.amp Voices @stepbystep\.amp A creator on TikTok This week/)
    expect(renderText(creator(creatorFixture()))).toContain(`${VOICES_ONE_MONTH_SHORT} Month October so far Their videos 14 of the market’s 318 On TikTok 182K followers, as of their videos in October`)
  })

  it('an address naming nothing prints one calm line and the way back, never a 404', () => {
    for (const [node, line] of [[group({ kind: 'missing', level: 'group', line: GROUP_MISSING }), GROUP_MISSING], [brand({ kind: 'missing', level: 'brand', line: BRAND_MISSING }), BRAND_MISSING], [creator({ kind: 'missing', level: 'creator', line: CREATOR_REDDIT }), CREATOR_REDDIT]] as const) {
      const text = renderText(node)
      expect(text).toBe(`Voices ${line} ${BACK_TO_VOICES}`)
      expect(render(node)).toContain('href="/dashboard/voices"')
    }
  })

  it('its links into Market open This month for the month Voices reads', () => {
    expect(render(group(groupFixture()))).toContain('href="/dashboard/market/subjects/s-fit?period=month&amp;month=2026-10"')
    expect(render(creator(creatorFixture()))).toContain('href="/dashboard/market/conversations/reg-running?period=month&amp;month=2026-10"')
  })
})

describe('a group\'s page (G3-Voices-Group)', () => {
  const text = renderText(group(groupFixture()))
  const html = render(group(groupFixture()))

  it('in the board\'s order: who they are, the read card, what they talk about, every conversation, the numbers, their words, the Agent', () => {
    const at = (s: string) => text.indexOf(s)
    const order = ['Described at The 11 Oct update', 'Parents and partners asking', 'What they want', 'Who they say they are', 'What they talk about', 'All 6 conversations they’re in', 'The numbers', 'In their words', 'Ask what Caregivers and family say']
    for (let i = 1; i < order.length; i++) expect(at(order[i]), order[i]).toBeGreaterThan(at(order[i - 1]))
  })

  it('who they are: the one-liner leads, then three facts (decision 2: "Not compared yet" is the figures row\'s)', () => {
    expect(text).toContain('Parents and partners asking on someone’s behalf. The subject they talk about most 17 of their 45 are about Fit & comfort Conversations they’re in 6 conversations, listed below Why there is no September Each update describes the groups afresh.')
    expect(html).toContain('href="#talk"')
    expect(html).toContain('id="talk"')
    // The subject they talk about most opens its Market page.
    expect(html).toMatch(/are about <a [^>]*href="\/dashboard\/market\/subjects\/s-fit\?period=month&amp;month=2026-10"/)
    expect(text).not.toMatch(/%|no clear change|since September/)
  })

  it('three subject cards, each with the conversations inside it for them and its level on the market; the open one named once, the others also in their videos', () => {
    expect(html.match(/data-subject-card="ready"/g)).toHaveLength(3)
    expect(text).toContain('Fit & comfort 17 of their 45 videos Inside it, for them Growing out of a socket 12 Socket fit changing over time 5 108 videos in the market Open Fit & comfort in Market')
    expect(text).toContain(`${SUBJECT_NOT_MEASURED} Function & movement. It shows how many of their videos it holds once its check passes. Also in their videos Choosing the right device 4 , Look & style 1`)
    expect(html).not.toContain('→')
  })

  it('every conversation: its description, its subject, theirs of their videos, all its videos; a two-line list on a phone', () => {
    expect(text).toContain('Conversation Subject Their videos All videos in it, October so far Growing out of a socket A child’s socket stops fitting within months, and parents ask how often that is normal. Fit & comfort 12 19')
    expect(html.match(/data-phone-row=""/g)).toHaveLength(6)
    expect(text).toContain('Growing out of a socket 12 Fit & comfort, 19 in October so far')
    // A conversation no subject holds says so in its cell (the board's words).
    const g = groupFixture()
    const unplaced = { ...g, conversations: g.conversations.map((c, i) => (i === 0 ? { ...c, subject: null } : c)) }
    expect(renderText(group(unplaced))).toContain('is normal. Not assigned 12 19')
    // The footnote's second half only where the counts add up past their videos.
    expect(text).toContain('A video can sit in more than one conversation.')
  })

  it('the numbers: the brands (you first) and products in their videos, where they comment; three comments each labelled with its conversation', () => {
    // The section says the base once ("Their 45 videos"); the tiles print bare
    // counts with bars against their largest (decisions 2 and 5).
    expect(text).toContain('The numbers Their 45 videos, October so far Brands named in their videos Össur You 6 Ottobock 4 Fillauer 1 Each opens its page in Voices.')
    expect(text).toContain('Your products in their videos Iceross Comfort 2 Iceross Seal-In X 1 Couldn’t tell which product 7 Each opens in Your products.')
    expect(text).toContain('Where they comment Instagram 21 TikTok 16 YouTube 8')
    expect(text).toContain('In their words 3 of their comments in October so far, each from its conversation Growing out of a socket “My daughter outgrew her socket in four months. Is that normal?” Instagram, 4 Oct')
    expect(text).not.toMatch(/\d+ of 45\b/)
    expect(html.match(/data-quote-from=""/g)).toHaveLength(3)
  })

  // The thin board (G3-Voices-Group-Thin).
  it('the thin state keeps every frame: U6 said once in the strip, the cards by name with no figure, the read card\'s gaps in their places', () => {
    const t = renderText(group(groupThinFixture()))
    const h = render(group(groupThinFixture()))
    expect(t).toContain('The subject they talk about most Not measured yet. No subject has passed its check yet.')
    expect(t).not.toMatch(/of their 97 are about/)
    expect(h.match(/data-subject-card="provisional"/g)).toHaveLength(3)
    expect(t).toContain('Community & encouragement Not measured yet Inside it, for them Praise for resilience and courage 31 Its check is still open Open Community & encouragement in Market')
    expect(t).toContain('What tips them into acting Not described in the latest update.')
    expect(t).toContain('Who they say they are Nothing they said told us who they are.')
    // Every subject NAMED, never folded into a count (14 Oct: a tracked
    // subject is never hidden): the board's "all 6 of your subjects" left
    // Choosing the right device and Fit & comfort named nowhere on the page.
    expect(t).toContain(`${SUBJECT_NOT_MEASURED} Choosing the right device, Community & encouragement, Cost & access, Fit & comfort, Function & movement, Look & style. Each shows how many of their videos it holds once its check passes. Look & style holds one more of their conversations, in the list below`)
    expect(t).not.toMatch(/all \d+ of your subjects/)
    for (const s of groupThinFixture().notMeasured) expect(t, s.label).toContain(s.label)
    expect(t).toContain('Brands named in their videos Brands are not counted for this workspace yet. Össur You Ottobock')
    expect(t).toContain('Your products in their videos Your products are not read for this workspace yet.')
    expect(t).toContain('“Onde vocês conseguiram a prótese? Minha mãe precisa de uma.” Portuguese, machine translation Where did you get the prosthesis? My mother needs one.')
    expect(t).toContain('Caretaker A group in your market This week')
    expect(t).toContain('The last full month September Their videos 97 of the market’s 521')
    // Who they say they are, with nothing: its one line, no empty tracks
    // (decision 4).
    expect(h).not.toContain('data-empty-track')
  })

  // The parity rule: a card is never removed because its data is thin; the
  // thin board draws "In their words", so no comment to print is said inside it.
  it('"In their words" keeps its card with no comment to print, and says a failed read apart from none', () => {
    const none = groupFixture({ quotes: [] })
    const t = renderText(group(none))
    expect(t).toContain(`In their words ${groupQuotesNone('October so far', 45)}`)
    expect(t).toContain('can be quoted: a comment prints only where it reads clearly in the commenter’s own words.')
    expect(render(group(none))).toContain('data-quotes-gap="none"')
    const unread = groupFixture({ quotes: null })
    expect(unread).toMatchObject({ quotes: [], quotesUnread: true })
    expect(renderText(group(unread))).toContain(`In their words ${GROUP_QUOTES_UNREAD}`)
    expect(groupQuotesNone('September', 0)).toBe('None of their comments in September.')
    // The Agent still closes the page, after the card.
    expect(t.indexOf('In their words')).toBeLessThan(t.indexOf('Ask what Caregivers and family say'))
    assertCopyContract(group(none))
  })

  // A workspace that names no subject has none whose check could be open: the
  // section's note says none is tracked, never "No subject has passed its check".
  it('no subject tracked at all: the section says so, and claims no check', () => {
    const g = { ...groupFixture(), subjectsState: 'none' as const, cards: [], notMeasured: [], alsoIn: [], inNone: [], holdsMore: [], topSubject: null }
    const t = renderText(group(g))
    expect(t).toContain('What they talk about No subject is tracked yet. Every conversation they’re in opens in Market.')
    expect(t).not.toContain('passed its check')
    expect(render(group(g))).toContain('data-group-subjects-none=""')
  })

  it('a tracked subject is never hidden: the failed one\'s reason once on the page', () => {
    const h = render(group(groupFixture({ checks: 'tracked' })))
    expect(h.split(FAILED_EXPLAINED).length - 1).toBe(1)
    expect(renderText(group(groupFixture({ checks: 'tracked' })))).toContain('Fit & comfort holds two more of their conversations, in the list below')
  })

  it('the switcher drawn open: the month\'s groups, the page ticked', () => {
    const t = renderText(group(groupFixture(), true))
    expect(t).toContain('Groups in your market New amputees, first year Long-time users upgrading Active and athletic Caregivers and family Clinicians and prosthetists')
  })
})

describe('a brand\'s page (G3-Voices-Brand)', () => {
  const text = renderText(brand(brandFixture()))
  const html = render(brand(brandFixture()))

  it('in the board\'s order: the finding leads, how the talk differs, who talks about it, the numbers, under its own content, the Agent', () => {
    const at = (s: string) => text.indexOf(s)
    const order = ['Named at all 49 of 318 videos', 'Where its talk differs, from the 11 Oct update', 'How the talk differs', 'Who talks about Ottobock', 'The numbers', 'Under its own content', 'Said about Ottobock', 'Ask what your market says about Ottobock']
    for (let i = 1; i < order.length; i++) expect(at(order[i]), order[i]).toBeGreaterThan(at(order[i - 1]))
  })

  it('the figures row and the lead: named without being asked, named at all, the verdict with its change; the finding, praised and complained, one note', () => {
    expect(text).toContain('Month October so far Named without being asked 37 of 290 videos Named at all 49 of 318 videos Against last month No clear change , +2.4 pts')
    expect(text).toContain('Ottobock’s talk turns on getting a knee paid for Where its talk differs, from the 11 Oct update Named without being asked Counted in the 290 videos we did not find by searching for a brand Praised it 16 of the 49 videos naming it Complained about something 24 of the 49 videos naming it The 49 videos naming it are what every figure below is of, and its counts are October’s alone, not compared with September.')
    // Base `any` carries no verdict, and the page gives no reason for it.
    expect(text).not.toMatch(/too few to set against/)
    expect(html).toMatch(/data-copy="verdict" title="[^"]*"[^>]*>No clear change</)
    expect(html).toContain('data-copy="stored" data-slot="pass_c_finding"')
    // The finding's kind under its title, in sentence case.
    expect(text).toContain('Prosthetists in the comments mention it as what their clinic fits first How the talk differs')
  })

  // The month compared with is the month before the one read, whether or not
  // the brand had a reading then: Patagonia's page, with no September row,
  // once said "October's alone, not compared with October" (5 Nov).
  it('with no reading last month, every "compared with" names the month before, never the month read', () => {
    const t = renderText(brand({ ...brandFixture(), prevNamed: null }))
    expect(t).toContain('October’s alone, not compared with September')
    expect(t).not.toMatch(/compared with October|against October/)
  })

  // A level is a k of its own n: named at all is the row's `k_any` of its
  // `n` (never of another read's market count), and each cross's head names
  // the base its rows are of (the lens's), as the root's panel did.
  it('each figure is of its own base: named at all of the row\'s n, each cross of the lens\'s', () => {
    const b = brandFixture()
    const shifted = { ...b, month: { ...b.month, n: 321 }, kinds: b.kinds.map((k) => ({ ...k, n: 45 })), subjects: b.subjects.map((x) => ({ ...x, n: 45 })) }
    const t = renderText(brand(shifted))
    expect(t).toContain('Named at all 49 of 318 videos')
    expect(t).not.toMatch(/of 321/)
    expect(t).toContain('What people did in the comments, of its 45')
    expect(t).toContain('What its talk sits in, of its 45 Cost & access 26')
  })

  // A subject being re-described is named with the open ones, and why it
  // shows no figure is said once on the page (14 Oct), as on the root and a
  // group's page; the brand's page said it nowhere.
  it('a subject being re-described: named with the rest, and its reason once on the page', () => {
    const b = brandFixture()
    const failed = { ...b, notMeasured: [{ id: 's-function', label: 'Function & movement' }, { id: 's-fit', label: 'Fit & comfort', failed: true }] }
    const h = render(brand(failed))
    expect(renderText(brand(failed))).toContain('Not measured yet: Function & movement, Fit & comfort. Each opens in Market. Fit & comfort. Being re-described:')
    expect(h.split(FAILED_EXPLAINED).length - 1).toBe(1)
    expect(render(brand(b))).not.toContain(FAILED_EXPLAINED)
  })

  it('who talks about it: the groups with bars against the largest, the creators a table, each opening its page by its name (no chevron)', () => {
    expect(text).toContain('Who talks about Ottobock Its 49 videos, October so far. Each opens its page in Voices.')
    expect(text).toContain('The groups commenting on its videos A video can hold more than one group, so the counts overlap. Long-time users upgrading Know what they want; fighting to get it paid for. 21')
    expect(text).toContain('Creators it comes up with Accounts with 3 or more of your market’s videos this month whose videos name it. Creator Platform Audience Its videos The Amputee Diaries YouTube, 96K subscribers YouTube 96K subscribers 3')
    expect(html).toContain('href="/dashboard/voices/groups/long-time"')
    expect(html).toContain('href="/dashboard/voices/creators/youtube/The%20Amputee%20Diaries"')
    expect(html).not.toContain('data-row-chevron')
    expect(html).toContain('aria-label="21 of 49"')
  })

  it('the numbers: three months as a table, the kinds, the subjects with those not measured named, where it was named, where (the verdict in the figures row)', () => {
    expect(text).toContain('Named without being asked, month by month Month Named without being asked Share August 52 of 520 10% September 74 of 713 10% October so far 37 of 290 13%')
    expect(html).not.toContain('fill-comp')
    expect(text).toContain('What its talk sits in, of its 49 Cost & access 26 Choosing the right device 11 Fit & comfort 7 Look & style 2 Not measured yet: Function & movement. Each opens in Market.')
    expect(text).toContain('Where it was named, of its 49 In the comments 34 In the video: caption, speech or on screen 21 A video can name it in both.')
    expect(html.match(/data-brand-month="filling"/g)).toHaveLength(1)
  })

  it('under its own content (D4): its own heading and window chip, what is asked, what it says (stored, never a quote), three comments each from its conversation', () => {
    expect(html).toContain('<span data-window-chip="">14 Jul to 11 Oct, the ninety days to the month’s last update</span>')
    expect(text).toContain('Asked under its content Insurance refusals for powered knees 14 videos')
    expect(html).toContain('data-copy="stored" data-slot="pass_a_brand_claim"')
    expect(text).toContain('Said about Ottobock 3 comments, each from its conversation Insurance refusals for powered knees “Got the C-Leg approved after a year of fighting. Worth it, but the fight nearly broke me.” YouTube, 3 Oct')
  })

  it('the switcher drawn open (G3-Voices-Brand-Switcher): brands you track, you first, the unnamed below the hairline in words', () => {
    const t = renderText(brand(brandFixture(), true))
    expect(t).toContain('Brands you track Össur You Ottobock Fillauer Blatchford Proteor Not named this month')
    expect(render(brand(brandFixture(), true))).toContain('role="separator"')
  })

  it('your own brand: no finding to lead and no ninety days, said in one line', () => {
    const t = renderText(brand(brandFixture({ key: 'client' })))
    expect(t).toContain('Your brand This week')
    expect(t).toContain('Named without being asked 41 of 290 videos')
    expect(t).toContain('How the talk differs Findings compare a rival’s talk with the rest of the market, so your own brand has none.')
    // In the dashed box, as every other gap on the page (decision 4).
    expect(render(brand(brandFixture({ key: 'client' }))).match(/data-brand-read="none"[\s\S]*?data-empty-box=""[^>]*><div>Findings compare/)).not.toBeNull()
    expect(t).not.toContain('Under its own content')
    // How people treat it, not read: said once, not under both heads.
    expect(t.match(/Not read yet\./g)?.length).toBe(2)
    expect(t).toContain('How people treat it Not read yet.')
  })

  it('a brand not counted keeps every frame and says why once; its ninety days stand', () => {
    const t = renderText(brand(brandFixture({ counted: false })))
    // The why is said once, in the figures row.
    expect(t).toContain('Named without being asked Not counted yet Against last month No comparison yet')
    expect(t.split(/not counted yet/i).length - 1).toBe(1)
    expect(t).toContain('The groups commenting on its videos A video can hold more than one group, so the counts overlap. No group is listed for Ottobock this month.')
    expect(t).toContain('No creator is listed for Ottobock this month.')
    expect(t.split('No figure prints for Ottobock this month.').length - 1).toBe(1)
    // THE PARITY RULE, in the audit design's shape (decision 4; the review
    // of Phases 4 and 5): the numbers keep their section and one tile, its
    // parts named once in the dashed box; no empty table, no line said a
    // frame, no empty tracks, no bar.
    const h = render(brand(brandFixture({ counted: false })))
    expect(t).toContain(`The numbers ${BRAND_NUMBERS_NONE}`)
    expect(t).not.toContain('No figure prints here.')
    expect(h).not.toContain('data-brand-month')
    expect(h).not.toContain('data-empty-row')
    expect(h).not.toContain('data-empty-track')
    expect(h.match(/data-empty-box=""/g)?.length).toBeGreaterThanOrEqual(4)
    expect(h).toMatch(/data-numbers-gap="not_yet"[^>]*><div data-empty-box=""/)
    expect(t).toContain('Under its own content')
    expect(t).not.toMatch(/\d+ of 290/)
  })
})

// DECISION 3, "TWO CLOCKS": a level page reading September in October (the
// reading month stays the month just ended until the new one is half over)
// names September and never calls it "this month", in every frame the page
// writes itself: the empty groups and creators, the creators' head, the
// switcher's notes, a creator's empty "who comments".
// A brand no video names is counted (`none`), and a noisy name is never
// counted: neither may read "not counted yet" in the frames below the header.
describe('a brand no video names', () => {
  it('says why once in its header, and no frame calls it "not counted yet"', () => {
    const p = brandFixture({ key: 'proteor' })
    expect(p.state).toBe('none')
    const t = renderText(brand(p))
    expect(t).toContain('Named without being asked No video names it Against last month')
    expect(t).toContain('No group is listed for Proteor this month.')
    expect(t).toContain('No figure prints for Proteor this month.')
    expect(t).not.toMatch(/not counted|until it is counted/)
    assertCopyContract(brand(p))
  })
})

describe('a level page reading a closed month never calls it "this month"', () => {
  it('a brand\'s and a creator\'s own words name the month', () => {
    const b = { ...brandFixture({ month: SEP_CLOSED_MONTH }), groups: [], creators: [] }
    const bt = renderText(brand(b, true))
    expect(bt).toContain('None of the groups comments on its videos in September.')
    expect(bt).toContain('Creators it comes up with Accounts with 3 or more of your market’s videos in September whose videos name it. No creator with three or more videos in September made one that names it.')
    expect(bt).toContain('Proteor Not named in September')
    expect(bt).not.toMatch(/this month/i)
    const c = { ...creatorFixture({ month: SEP_CLOSED_MONTH }), groups: [] }
    const ct = renderText(creator(c))
    expect(ct).toContain('Who comments, of 14 No group comments on their videos in September.')
    expect(ct).toContain('of the 24 in it in September.')
    expect(ct).not.toMatch(/this month/i)
    expect(renderText(group(groupThinFixture()))).not.toMatch(/this month/i)
  })

  it('while the month is under way the boards\' "this month" stands', () => {
    const b = { ...brandFixture(), groups: [], creators: [] }
    expect(renderText(brand(b))).toContain('None of the groups comments on its videos this month.')
    expect(renderText(creator({ ...creatorFixture(), groups: [] }))).toContain('No group comments on their videos this month.')
  })
})

describe('a creator\'s page (G3-Voices-Creator)', () => {
  const text = renderText(creator(creatorFixture()))
  const html = render(creator(creatorFixture()))

  it('the lead: one line from figures, the brands named in their videos as a list of names; no hub card', () => {
    expect(text).toContain('Their biggest conversation is Running on a blade : 6 of their 14 videos, of the 24 in it this month. Brands named in their videos: Össur ( 4 ), Ottobock ( 1 )')
    expect(html).not.toContain('data-strip=""')
    expect(html).toContain('data-creator-lead=""')
    // The figures row's own hook, never `data-strip` (that guard above).
    expect(html).toContain('data-stat-strip=""')
    expect(html.match(/data-who-chip=/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('their videos, caption first: the day, the brand and the conversation, the link to watch it on its platform, comments counted of all on it, each comment naming its conversation', () => {
    expect(text).toContain('Their videos 14 videos in October so far, the most comments counted first First 5k on the Cheetah, and what nobody tells you about the socket Posted 8 Oct, Össur , in Running on a blade Watch the video on TikTok 22 comments counted, of 340 on the video “Mile 3 on the new foot and I forgot I was wearing it.”')
    expect(text).toContain('“How long before you could run without the socket rubbing?” 2 Oct, in Socket fit causes pain')
    expect(text).toContain('Spanish, machine translation Which foot do you run with in the mountains? I can’t find one that holds up.')
    expect(html.match(/data-video-card=""/g)).toHaveLength(5)
    // The caption heads its tile in at most the board's four lines (a real
    // YouTube description runs to 70), a long link breaking inside the card.
    expect(html.match(/<h3 data-video-caption="" class="[^"]*line-clamp-4[^"]*\[overflow-wrap:anywhere\]">/g)).toHaveLength(5)
    expect(text).toContain('Show 3 of 22 comments')
    expect(text).toContain('Show 9 more videos')
    expect(text).not.toMatch(/[→↗↓]/)
    expect(html).toMatch(/<a href="https:\/\/www\.tiktok\.com\/@stepbystep\.amp\/video\/1" target="_blank" rel="noopener noreferrer"/)
  })

  it('a video opened says what it does not print and closes; every video listed has no "Show more"', () => {
    const t = renderText(creator(creatorFixture({ video: 2 })))
    // The gate here asks no relevance to a claim, so the reason claims none
    // (Market's "and speaks to this" is its conversation page's own rule).
    expect(t).toContain('The other 9 are counted, not quoted: a comment prints only where it reads clearly in the commenter’s own words. Show fewer comments')
    expect(t).not.toContain('speaks to this')
    const all = renderText(creator(creatorFixture({ all: true })))
    expect(all).not.toContain('Show more videos')
    expect(render(creator(creatorFixture({ all: true }))).match(/data-video-card=""/g)).toHaveLength(14)
  })

  it('the facts beside their videos: their conversations a table, who comments and what people did with bars; then the other creators a table and the root\'s list (the platform is the figures row\'s)', () => {
    expect(text).toContain('The facts Conversations their videos are in, of 14 Conversation Theirs All in it Running on a blade 6 24')
    expect(text).not.toContain('The facts On TikTok')
    expect(text).toContain('Theirs, then all the videos in it. Each opens in Market. Who comments, of 14 Active and athletic 9')
    expect(text).toContain('What people did, of 14 Praised a device 11')
    expect(text).toContain('Other creators, October so far Creator Platform Videos The Amputee Diaries YouTube 9')
    expect(text).toContain('All 9 in Voices')
    expect(html).toContain('href="/dashboard/voices?creators=all#creators"')
    expect(html.match(/data-sibling=""/g)).toHaveLength(8)
    expect(html).toContain('aria-label="9 of 14"')
  })
})
