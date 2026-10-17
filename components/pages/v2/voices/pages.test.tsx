import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { VOICES_ONE_MONTH } from '@/lib/pages/v2/voices'
import { BACK_TO_VOICES, BRAND_MISSING, CREATOR_REDDIT, GROUP_MISSING, GROUP_QUOTES_UNREAD, groupQuotesNone, VOICES_ONE_MONTH_SHORT, type BrandPage, type CreatorPage, type GroupPage, type LevelMissing } from '@/lib/pages/v2/voices-levels'
import { brandFixture, creatorFixture, groupFixture, groupThinFixture, VOICES_LEVEL_FIXTURES } from '@/lib/pages/v2/voices-levels-fixture'
import { VoicesBrandPage, VoicesCreatorPage, VoicesGroupPage } from './pages'

// VOICES' LEVEL PAGES, AS THEY PRINT (17 Oct; the G3 boards): each from its
// fixture through the page's own builders, against the copy contract, the
// boards' order and words, ruling U6, decision 2 and the parity rule.

const group = (d: GroupPage | LevelMissing, switcherOpen = false) => <VoicesGroupPage data={d} switcherOpen={switcherOpen} />
const brand = (d: BrandPage | LevelMissing, switcherOpen = false) => <VoicesBrandPage data={d} switcherOpen={switcherOpen} />
const creator = (d: CreatorPage | LevelMissing) => <VoicesCreatorPage data={d} />
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

  it('opens with the path and the title block: the crumb row, the level\'s tile and label, the h1, the meta line, the month switch with the week and over time not offered', () => {
    const g = render(group(groupFixture()))
    expect(g).toContain('data-level-bar="group"')
    expect(g).toContain('data-level-tile="group"')
    expect(g.match(/<h1\b/g)).toHaveLength(1)
    expect(renderText(group(groupFixture()))).toMatch(/^Voices \/ Caregivers and family Voices Group Caregivers and family October so far · 45 of 318 videos · described at the 11 Oct update This week/)
    // On a phone the row becomes the way back.
    expect(g).toMatch(/data-back-link=""[^>]*href="\/dashboard\/voices"/)
    expect(g.match(/aria-disabled="true"/g)).toHaveLength(2)
    expect(g).toContain(`title="${VOICES_ONE_MONTH}"`)
    expect(g).toContain('href="/dashboard/voices/groups/caregivers"')
    const b = render(brand(brandFixture()))
    expect(b).toContain('data-level-tile="brand"')
    expect(b).toMatch(/data-level-tile="brand" class="[^"]*bg-comp/)
    expect(b).toContain(`title="${VOICES_ONE_MONTH_SHORT}"`)
    expect(render(brand(brandFixture({ key: 'client' })))).toMatch(/data-level-tile="brand" class="[^"]*bg-you/)
    expect(renderText(brand(brandFixture({ key: 'client' })))).toContain('Your brand Össur')
    expect(renderText(creator(creatorFixture()))).toMatch(/^Voices \/ @stepbystep\.amp Voices Creator on TikTok @stepbystep\.amp October so far · 14 of 318 videos · 182K followers/)
  })

  it('an address naming nothing prints one calm line and the way back, never a 404', () => {
    for (const [node, line] of [[group({ kind: 'missing', level: 'group', line: GROUP_MISSING }), GROUP_MISSING], [brand({ kind: 'missing', level: 'brand', line: BRAND_MISSING }), BRAND_MISSING], [creator({ kind: 'missing', level: 'creator', line: CREATOR_REDDIT }), CREATOR_REDDIT]] as const) {
      const text = renderText(node)
      expect(text).toBe(`Voices ${line} ${BACK_TO_VOICES} →`)
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
    const order = ['Who they are · described at the 11 Oct update', 'What they want', 'Who they say they are', 'What they talk about', 'All 6 conversations they’re in', 'The numbers', 'In their words', 'Ask what Caregivers and family say']
    for (let i = 1; i < order.length; i++) expect(at(order[i]), order[i]).toBeGreaterThan(at(order[i - 1]))
  })

  it('the header card: the one-liner leads, then the four figures (decision 2: "Not compared yet")', () => {
    expect(text).toContain('Parents and partners asking on someone’s behalf. 45 of your market’s 318 videos carry their comments October so far Not compared yet against September Each update describes the groups afresh 17 of their 45 are about Fit & comfort the subject they talk about most 6 conversations they’re in See them below ↓')
    expect(html).toContain('href="#talk"')
    expect(text).not.toMatch(/%|no clear change|since September/)
  })

  it('three subject cards, each with the conversations inside it for them and its level on the market; the open one named once, the others also in their videos', () => {
    expect(html.match(/data-subject-card="ready"/g)).toHaveLength(3)
    expect(text).toContain('Subject Fit & comfort 17 of their 45 videos Inside it, for them Growing out of a socket 12 Socket fit changing over time 5 108 of 318 in the market Open in Market →')
    expect(text).toContain(`${SUBJECT_NOT_MEASURED}: Function & movement. It shows how many of their videos it holds once its check passes. Also in their videos: Choosing the right device 4 · Look & style 1`)
  })

  it('every conversation: its description, its subject, theirs of their videos, all its videos; a two-line list on a phone', () => {
    expect(text).toContain('Growing out of a socket A child’s socket stops fitting within months, and parents ask how often that is normal. Fit & comfort 12 of 45 19')
    expect(html.match(/data-phone-row=""/g)).toHaveLength(6)
    // The footnote's second half only where the counts add up past their videos.
    expect(text).toContain('A video can sit in more than one conversation.')
  })

  it('the numbers: the brands (you first) and products in their videos, where they comment; three comments each labelled with its conversation', () => {
    expect(text).toContain('Brands named in their videos · of their 45 Össur You 6 of 45 Ottobock 4 of 45 Fillauer 1 of 45 Each opens its page in Voices')
    expect(text).toContain('Products in their videos · of their 45 Iceross Comfort 2 of 45 Iceross Seal-In X 1 of 45 Couldn’t tell which product 7 of 45 Each opens in Your products')
    expect(text).toContain('Where they comment · of their 45 Instagram 21 TikTok 16 YouTube 8')
    expect(text).toContain('In their words · 3 of their comments in October so far, each from its conversation Growing out of a socket “My daughter outgrew her socket in four months. Is that normal?” Instagram · 4 Oct')
    expect(html.match(/data-quote-from=""/g)).toHaveLength(3)
  })

  // The thin board (G3-Voices-Group-Thin).
  it('the thin state keeps every frame: U6 said once in the strip, the cards by name with no figure, the read card\'s gaps in their places', () => {
    const t = renderText(group(groupThinFixture()))
    const h = render(group(groupThinFixture()))
    expect(t).toContain('Not measured yet what their videos are about No subject has passed its check yet')
    expect(t).not.toMatch(/of their 97 are about/)
    expect(h.match(/data-subject-card="provisional"/g)).toHaveLength(3)
    expect(t).toContain('Subject Community & encouragement Not measured yet Inside it, for them Praise for resilience and courage 31 Its check is still open Open in Market →')
    expect(t).toContain('What tips them into acting Not described in the latest update.')
    expect(t).toContain('Who they say they are Nothing they said told us who they are.')
    // Every subject NAMED, never folded into a count (14 Oct: a tracked
    // subject is never hidden): the board's "all 6 of your subjects" left
    // Choosing the right device and Fit & comfort named nowhere on the page.
    expect(t).toContain(`${SUBJECT_NOT_MEASURED}: Choosing the right device, Community & encouragement, Cost & access, Fit & comfort, Function & movement, Look & style. Each shows how many of their videos it holds once its check passes. Look & style holds one more of their conversations, in the list below`)
    expect(t).not.toMatch(/all \d+ of your subjects/)
    for (const s of groupThinFixture().notMeasured) expect(t, s.label).toContain(s.label)
    expect(t).toContain('Brands named in their videos Brands are not counted for this workspace yet. Össur You Ottobock')
    expect(t).toContain('Products in their videos Your products are not read for this workspace yet.')
    expect(t).toContain('“Onde vocês conseguiram a prótese? Minha mãe precisa de uma.” Portuguese · machine translation Where did you get the prosthesis? My mother needs one.')
    expect(t).toMatch(/^Voices \/ Caretaker Voices Group Caretaker September · the last full month · 97 of 521 videos/)
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
    const order = ['Where its talk differs · the 11 Oct update', 'How the talk differs', 'Who talks about Ottobock', 'The numbers', 'Under its own content', 'Ask what your market says about Ottobock']
    for (let i = 1; i < order.length; i++) expect(at(order[i]), order[i]).toBeGreaterThan(at(order[i - 1]))
  })

  it('the header: named without being asked in the rival grey, the verdict with its change, named at all, praised and complained', () => {
    expect(text).toContain('Ottobock’s talk turns on getting a knee paid for 37 of 290 videos named it without being asked the videos we did not find by searching for a brand No clear change +2.4 pts against September 74 of 713 in September 49 of 318 videos named it at all what the figures below are of 16 · 24 of its 49 : praised · complained October’s alone, too few to set against September')
    expect(html).toMatch(/<div class="absolute inset-y-0 left-0 rounded-\[5px\] bg-comp"/)
    expect(html).toMatch(/data-copy="verdict" title="[^"]*"[^>]*>No clear change</)
    expect(html).toContain('data-copy="stored" data-slot="pass_c_finding"')
  })

  it('who talks about it: the groups and the creators, each row opening its page and ending in the chevron', () => {
    expect(text).toContain('The groups commenting on its videos A video can hold more than one group, so the counts overlap Long-time users upgrading Know what they want; fighting to get it paid for. 21 of 49')
    expect(text).toContain('Creators it comes up with Accounts with 3 or more of your market’s videos this month whose videos name it TA The Amputee Diaries YouTube · 96K subscribers 3 of its 49')
    expect(html).toContain('href="/dashboard/voices/groups/long-time"')
    expect(html).toContain('href="/dashboard/voices/creators/youtube/The%20Amputee%20Diaries"')
    expect(html.match(/data-row-chevron=""/g)).toHaveLength(9)
  })

  it('the numbers: three months in the rival grey with the verdict line, the kinds, the subjects with those not measured named, where it was named, where', () => {
    expect(html).toContain('class="fill-comp"')
    expect(text).toContain('No clear change against September: October so far is inside September’s normal swing.')
    expect(text).toContain('What its talk sits in · of its 49 Cost & access 26 of 49 Choosing the right device 11 of 49 Fit & comfort 7 of 49 Look & style 2 of 49 Not measured yet: Function & movement · each opens in Market')
    expect(text).toContain('Where it was named · of its 49 In the comments 34 In the video: caption, speech or on screen 21 A video can name it in both')
  })

  it('under its own content (D4): its own heading and window chip, what is asked, what it says (stored, never a quote), three comments each from its conversation', () => {
    expect(html).toMatch(/data-window-chip=""[^>]*>14 Jul to 11 Oct · <span class="max-sm:hidden">the ninety days to the month’s last update<\/span><span class="sm:hidden">ninety days<\/span>/)
    expect(text).toContain('Asked under its content Insurance refusals for powered knees 14 videos')
    expect(html).toContain('data-copy="stored" data-slot="pass_a_brand_claim"')
    expect(text).toContain('Said about Ottobock · 3 comments, each from its conversation Insurance refusals for powered knees “Got the C-Leg approved after a year of fighting. Worth it, but the fight nearly broke me.” YouTube · 3 Oct')
  })

  it('the switcher drawn open (G3-Voices-Brand-Switcher): brands you track, you first, the unnamed below the hairline in words', () => {
    const t = renderText(brand(brandFixture(), true))
    expect(t).toContain('Brands you track Össur You Ottobock Fillauer Blatchford Proteor Not named this month')
    expect(render(brand(brandFixture(), true))).toContain('role="separator"')
  })

  it('your own brand: no finding to lead and no ninety days, said in one line', () => {
    const t = renderText(brand(brandFixture({ key: 'client' })))
    expect(t).toContain('Your brand · October so far 41 of 290 videos named it without being asked')
    expect(t).toContain('How the talk differs Findings compare a rival’s talk with the rest of the market, so your own brand has none.')
    expect(t).not.toContain('Under its own content')
    expect(render(brand(brandFixture({ key: 'client' })))).toMatch(/class="absolute inset-y-0 left-0 rounded-\[5px\] bg-you"/)
  })

  it('a brand not counted keeps every frame and says why once; its ninety days stand', () => {
    const t = renderText(brand(brandFixture({ counted: false })))
    expect(t).toContain('Ottobock in October so far: not counted yet.')
    expect(t).toContain('The groups commenting on its videos A video can hold more than one group, so the counts overlap Ottobock is not counted yet.')
    expect(t).toContain('No figure prints for Ottobock until it is counted.')
    expect(t).toContain('Under its own content')
    expect(t).not.toMatch(/\d+ of 290/)
  })
})

describe('a creator\'s page (G3-Voices-Creator)', () => {
  const text = renderText(creator(creatorFixture()))
  const html = render(creator(creatorFixture()))

  it('the flat header: one line from figures, the brands named in their videos; no hub card', () => {
    expect(text).toContain('Their biggest conversation is Running on a blade : 6 of their 14 videos, of the 24 in it this month. Össur 4 Ottobock 1 brands named in their videos')
    expect(html).not.toContain('data-strip=""')
    expect(html).toContain('data-creator-lead=""')
  })

  it('their videos, caption first: the day and the conversation, the brand, comments counted of all on it, each comment naming its conversation', () => {
    // From 640 the brand's chip sits at the card's right; on a phone it rides
    // after the day and the conversation takes its own line.
    expect(text).toContain('Their videos 14 videos in October so far, the most comments counted first First 5k on the Cheetah, and what nobody tells you about the socket Posted 8 Oct · Össur · in Running on a blade Össur 22 comments counted, of 340 on the video Watch the video ↗ “Mile 3 on the new foot and I forgot I was wearing it.”')
    expect(text).toContain('“How long before you could run without the socket rubbing?” 2 Oct · in Socket fit causes pain')
    expect(text).toContain('Spanish · machine translation Which foot do you run with in the mountains? I can’t find one that holds up.')
    expect(html.match(/data-video-card=""/g)).toHaveLength(5)
    expect(text).toContain('Show 3 of 22 comments')
    expect(text).toContain('Show more videos · 9 more')
    expect(html).toMatch(/<a href="https:\/\/www\.tiktok\.com\/@stepbystep\.amp\/video\/1" target="_blank" rel="noopener noreferrer"/)
  })

  it('a video opened says what it does not print and closes; every video listed has no "Show more"', () => {
    const t = renderText(creator(creatorFixture({ video: 2 })))
    expect(t).toContain('The other 9 are counted, not quoted: a comment prints only where it reads clearly and speaks to this. Show fewer comments')
    const all = renderText(creator(creatorFixture({ all: true })))
    expect(all).not.toContain('Show more videos')
    expect(render(creator(creatorFixture({ all: true }))).match(/data-video-card=""/g)).toHaveLength(14)
  })

  it('the facts, small: on its platform, their conversations, who comments, what people did; then the other creators and the root\'s list', () => {
    expect(text).toContain('The facts On TikTok 182K followers, as of their videos in October 14 of your market’s 318 videos, October so far Conversations their videos are in · of 14 Running on a blade 6 · of 24')
    expect(text).toContain('Who comments · of 14 Active and athletic 9 of 14')
    expect(text).toContain('What people did · of 14 Praised a device 11')
    expect(text).toContain('Other creators, October so far All 9 in Voices →')
    expect(html).toContain('href="/dashboard/voices?creators=all#creators"')
    expect(html.match(/data-sibling=""/g)).toHaveLength(8)
  })
})
