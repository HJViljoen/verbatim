import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurVoicesFixture, VOICES_FIXTURES } from '@/lib/pages/v2/voices-fixture'
import { mergeWho, type GroupPanel } from '@/lib/pages/v2/voices'
import { FAILED_EXPLAINED } from '@/lib/subjects/calibration-state'
import { GroupCard, GroupGrid, GroupPanelView, MixCard, WhoCard } from './groups'
import { VoicesPage } from './index'

describe('Who is in your market and the group cards (decision 2)', () => {
  const d = ossurVoicesFixture()

  it('draws each group\'s videos this month as its own bar, never a share and never an "Other"', () => {
    const node = <WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('New amputees, first year 96 of 487 videos')
    expect(text).toContain('the counts overlap')
    expect(text).not.toMatch(/%|Other/)
    assertCopyContract(node)
  })

  it('is the target an old Conversation link\'s #cast lands on', () => {
    expect(render(<WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} />)).toMatch(/<section id="cast" /)
  })

  it('says why no group shows', () => {
    const node = <WhoCard groups={{ state: 'not_run', profileDate: null, cards: [], empty: 'Reading who is talking is not switched on for this workspace yet.' }} videos={487} monthWords="September" />
    expect(renderText(node)).toContain('not switched on')
    assertCopyContract(node)
  })

  it('a card: the count of the market, what they talk about, wants and stops, where; no change and no quote', () => {
    const node = <GroupCard card={d.groups.cards[3]} n={d.videos} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Caregivers and family')
    expect(text).toContain('45 of 487 videos')
    expect(text).toContain('What they talk about · of their 45 Fit & comfort 17 Cost & access 14')
    expect(text).toContain('Wants: Clear answers they can act on for someone else: what to buy, what’s covered, what recovery looks like.')
    expect(text).toContain('Open →')
    // Wants and stops hold three lines each on the card; the panel has them whole.
    expect(render(node).match(/class="line-clamp-3"/g)).toHaveLength(2)
    expect(text).not.toMatch(/%|no clear change|since September/)
    expect(render(node)).not.toContain('data-copy="quote"')
    assertCopyContract(node)
  })

  // The parity pass (13 Oct): a thin card keeps the board's card. Its level
  // row, its "What they talk about" box and its "Where" strip stay, each
  // carrying the gap in its own frame.
  it('a card with no video this month keeps the board\'s card: the level at 0, the box and the strip', () => {
    const node = <GroupCard card={{ ...d.groups.cards[0], videos: 0, subjects: [], platforms: [] }} n={487} monthWords="September" />
    const text = renderText(node)
    expect(text).toContain('0 of 487 videos not compared yet')
    expect(text).toContain('What they talk about None of their comments in September.')
    expect(text).toContain('Where')
    expect(text).not.toContain('of their 0')
    assertCopyContract(node)
  })

  it('a card whose videos carry no subject keeps its box and says so in it', () => {
    const node = <GroupCard card={{ ...d.groups.cards[0], subjects: [] }} n={487} monthWords="September" />
    expect(renderText(node)).toContain('What they talk about · of their 96 No subject read in their videos yet.')
    assertCopyContract(node)
  })

  // Ruling U6 (13 Oct): Össur's six subjects are all provisional, and one of
  // them measured 9% precision, so a count on any of them is wrong, not just
  // unlabelled. The box keeps its frame and its height and says so once.
  it('U6, all provisional: the box keeps its frame, names every subject not measured yet in one line and prints no subject count', () => {
    const p = ossurVoicesFixture({}, 'provisional')
    const node = <GroupCard card={p.groups.cards.find((c) => c.key === 'caregivers')!} n={p.videos} monthWords={p.monthWords} />
    const text = renderText(node)
    // 14 Oct: a tracked subject is named, never folded into a count.
    expect(text).toContain('What they talk about Not measured yet: Choosing the right device, Community & encouragement, Cost & access, Fit & comfort, Function & movement, Look & style')
    expect(text).not.toContain('of their 45')
    expect(render(node)).not.toMatch(/<span data-copy="figure"[^>]*>\d+<\/span> more/)
    // Its rows' empty tracks hold the box's height.
    expect(render(node).match(/border-dashed/g)?.length).toBeGreaterThanOrEqual(4)
    assertCopyContract(node)
  })

  it('U6, mixed: the ready rows with their counts first, then the subjects not measured yet, named', () => {
    const p = ossurVoicesFixture({}, 'mixed')
    const node = <GroupCard card={p.groups.cards.find((c) => c.key === 'caregivers')!} n={p.videos} monthWords={p.monthWords} />
    const text = renderText(node)
    // A ready subject on none of their videos keeps its row at 0 (14 Oct).
    expect(text).toContain('What they talk about · of their 45 Cost & access 14 Function & movement 0 Not measured yet: Choosing the right device, Community & encouragement, Fit & comfort, Look & style')
    // Named, never counted: Fit & comfort (17 of their videos) prints no figure.
    expect(text).not.toMatch(/Fit & comfort \d/)
    assertCopyContract(node)
  })

  it('U6, the group panel: no "are about" figure for an open subject; the place says so', () => {
    const open = VOICES_FIXTURES['ossur-provisional-group']()
    const panel = open.panel as GroupPanel
    const node = <GroupPanelView panel={panel} monthWords={open.monthWords} />
    const text = renderText(node)
    expect(text).not.toMatch(/of 45 are about/)
    expect(text).toContain('Not measured yet what their videos are about')
    assertCopyContract(node)
    const mixed = VOICES_FIXTURES['ossur-mixed-group']()
    const t2 = renderText(<GroupPanelView panel={mixed.panel as GroupPanel} monthWords={mixed.monthWords} />)
    expect(t2).toContain('14 of 45 are about Cost & access')
    expect(t2).not.toMatch(/are about Fit|are about Community|Not measured yet/)
  })

  it('a card\'s verdict slot says the change is not compared (decision 2), never a direction', () => {
    const text = renderText(<GroupCard card={d.groups.cards[0]} n={d.videos} monthWords={d.monthWords} />)
    expect(text).toContain('96 of 487 videos not compared yet')
  })

  it('the grid opens a group\'s panel in place, under its card at every width (T9)', () => {
    const open = ossurVoicesFixture({ group: 'caregivers' })
    const m = render(<GroupGrid data={open} />)
    const card = m.indexOf('data-group="caregivers"')
    const panel = m.indexOf('id="group-panel"')
    const nextCard = m.indexOf('data-group="clinicians"')
    // In the markup right after its card; one grid, one panel.
    expect(card).toBeGreaterThan(0)
    expect(panel).toBeGreaterThan(card)
    expect(nextCard).toBeGreaterThan(panel)
    expect(m.match(/aria-label="The groups"/g)).toHaveLength(1)
    expect(m).not.toContain('The groups, continued')
    expect(m.match(/id="group-panel"/g)).toHaveLength(1)
    // The fourth of five, the mix card the grid's sixth: after itself on a
    // phone (order 7), after the second row of two from 768 (cards 3 and 4:
    // order 7), after the second row of three from 1280 (cards 4 and 5 and
    // the mix card: order 11); its notch at its column: the middle, the right
    // of two, the left of three.
    expect(m).toContain('--panel-o-base:7;--panel-o-sm:7;--panel-o-md:7;--panel-o-lg:7;--panel-o-w1180:7;--panel-o-xl:11')
    // The panel lands before the mix card on a phone and after its row from 1280.
    expect(m.indexOf('data-mix=""')).toBeGreaterThan(panel)
    expect(m).toContain('data-mix="" aria-labelledby="voices-mix" style="order:10"')
    expect(m).toContain('--notch-base:50%;--notch-sm:50%;--notch-md:75%;--notch-lg:75%;--notch-w1180:75%;--notch-xl:16.67%')
    expect(m).toContain('ring-2 ring-foreground')
    expect(m).toContain('Close ↑')
    assertCopyContract(<GroupGrid data={open} />)
  })
})

describe('the mix card (the board\'s sixth; decision 2)', () => {
  const d = ossurVoicesFixture()

  it('keeps its place, named for what it shows: this month\'s column drawn, last month\'s axis empty and dashed', () => {
    const node = <MixCard cards={d.groups.cards} n={d.videos} month={d.month} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('The mix in September August isn’t read for these groups')
    expect(text).toContain('Each update describes the groups afresh, so these groups have no earlier month to set this one beside.')
    // No word that claims a comparison (the fresh check, 13 Oct).
    expect(text).not.toMatch(/How the mix changed|against|changed|%|no clear change|moved/)
    const m = render(node)
    // Both columns are named; only September's carries points, and no line
    // joins the two (a line needs both ends). Last month's axis is dashed.
    expect(m).toContain('>Aug</text>')
    expect(m).toContain('>Sep</text>')
    expect(m.match(/<circle /g)).toHaveLength(d.groups.cards.length)
    expect(m).not.toMatch(/<line [^>]*stroke-cat/)
    expect(m).toContain('[&amp;&gt;line:first-of-type]:[stroke-dasharray:3_4]')
    // Long names are shortened on the chart, whole for a screen reader.
    expect(m).toContain('New amputees…')
    expect(m).toMatch(/aria-label="[^"]*New amputees, first year none to 96/)
    assertCopyContract(node)
  })

  it('sits in the grid after the group cards', () => {
    const m = render(<GroupGrid data={d} />)
    expect(m.indexOf('data-mix=""')).toBeGreaterThan(m.lastIndexOf('data-group='))
    expect(m.match(/data-mix=""/g)).toHaveLength(1)
  })
})

describe('a group\'s panel (E3-Voices-Open)', () => {
  const d = ossurVoicesFixture({ group: 'caregivers' })
  const panel = d.panel as GroupPanel

  it('prints its stats as levels, its triggers, who they say they are, its conversations and three comments', () => {
    const node = <GroupPanelView panel={panel} monthWords="September" />
    const text = renderText(node)
    expect(text).toContain('45 of 487 videos they comment on')
    expect(text).toContain('17 of 45 are about Fit & comfort')
    expect(text).toContain('What tips them into acting A clinician or another parent saying it worked for them.')
    expect(text).toContain('Who they say they are Parent of child amputee 12')
    expect(text).toContain('The conversations they’re in Growing out of a socket 12 of 45')
    expect(text).toContain('How they talk “my son’s leg”')
    expect(text).toContain('In their words · 3 of their comments in September')
    expect(text).not.toContain('this month')
    expect(text).toContain('Ask the Agent about this group')
    expect(text).not.toMatch(/since September|%/)
    const m = render(node)
    expect(m.match(/data-copy="quote"/g)?.length).toBe(5 + 3)
    expect(m).toContain('href="/dashboard/market?conv=reg-growing#conversation-panel"')
    expect(m).toContain('href="/dashboard/voices"')
    assertCopyContract(node)
  })

  // Decision 8: the panel lists three distinct self-descriptions, the
  // near-repeats merged under their commonest wording.
  it('lists the top three self-descriptions, near-repeats merged', () => {
    const who = mergeWho([
      { label: 'Amputee community', count: 24 }, { label: 'Amputee', count: 14 }, { label: 'Amputee users', count: 14 },
      { label: 'Prosthetic users', count: 11 }, { label: 'Amputee type', count: 9 }, { label: 'Prosthetic user', count: 8 },
      { label: 'Bilateral amputee', count: 7 }, { label: 'Caretaker', count: 6 }, { label: 'Care worker', count: 5 },
    ])
    const node = <GroupPanelView panel={{ ...panel, who }} monthWords="September" />
    const text = renderText(node)
    expect(text).toContain('Who they say they are Amputee community 61 Prosthetic users 19 Bilateral amputee 7 How often each came up in what they said')
    for (const gone of ['Amputee users', 'Amputee type', 'Prosthetic user ', 'Caretaker', 'Care worker']) expect(text, gone).not.toContain(gone)
    assertCopyContract(node)
  })

  // The parity pass (13 Oct): the board's third column, "Products they
  // mention", is drawn as what the count is: your products named in the
  // group's videos, each opening in Your products.
  it('lists your products in their videos, and the talk about one of yours it could not place', () => {
    const node = <GroupPanelView panel={panel} monthWords="September" />
    const text = renderText(node)
    expect(text).toContain('Products in their videos · of their 45 Iceross Comfort 2 of 45 Iceross Seal-In 1 of 45 Couldn’t tell which product 7 of 45 Each opens in Your products')
    expect(text).not.toContain('Rheo Knee')
    expect(text).not.toContain('Where they comment')
    expect(render(node)).toContain('href="/dashboard/products?product=p-comfort#product-panel"')
    assertCopyContract(node)
  })

  it('keeps the products column where none is read, saying so in one line', () => {
    const off = { ...panel, products: { state: 'off' as const, rows: [], unclear: 0, line: 'Your products are not read for this workspace yet.' } }
    const text = renderText(<GroupPanelView panel={off} monthWords="September" />)
    expect(text).toContain('Products in their videos Your products are not read for this workspace yet.')
    assertCopyContract(<GroupPanelView panel={off} monthWords="September" />)
    // A panel stored before the column (a dump) draws where they comment.
    const { products: _drop, ...old } = panel
    void _drop
    expect(renderText(<GroupPanelView panel={old} monthWords="September" />)).toContain('Where they comment · of 45')
  })

  // The fresh check (13 Oct): a column with nothing to list keeps its place
  // and says so, so the panel's grids never reflow; the full-width rows (how
  // they talk, their words) are left out.
  it('keeps every column where a group has nothing to list, and leaves out the full-width rows', () => {
    const bare: GroupPanel = { ...panel, who: [], conversations: [], phrases: [], quotes: [], triggers: '' }
    const node = <GroupPanelView panel={bare} monthWords="September" />
    const text = renderText(node)
    expect(text).toContain('What tips them into acting Not described in the latest update.')
    expect(text).toContain('Who they say they are Nothing they said told us who they are.')
    expect(text).toContain('The conversations they’re in None of their videos in September is in a named conversation.')
    expect(text).toContain('Products in their videos')
    expect(text).not.toMatch(/How they talk|In their words/)
    // Six column heads in the two grids, as with everything filled.
    const heads = (m: string) => m.match(/<p class="m-0 text-\[11\.5px\] font-semibold uppercase/g)?.length ?? 0
    expect(heads(render(node))).toBe(heads(render(<GroupPanelView panel={panel} monthWords="September" />)) - 2)
    assertCopyContract(node)
  })
})

// A TRACKED SUBJECT IS NEVER HIDDEN (Heinrich, 14 Oct): Function & movement
// ready, Look & style ready and thin, Cost & access's check open, Fit &
// comfort being re-described.
describe('a tracked subject is never hidden (14 Oct)', () => {
  const d = VOICES_FIXTURES['ossur-tracked']()
  const card = (key: string) => d.groups.cards.find((c) => c.key === key)!

  it('a group\'s box: the ready rows, a thin one\'s small count and a 0, then ONE short line naming the open and the failed subject (the lead\'s ruling, 14 Oct)', () => {
    const node = <GroupCard card={card('caregivers')} n={d.videos} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('What they talk about · of their 45 Look & style 2 Function & movement 0 Not measured yet: Cost & access, Fit & comfort Wants:')
    // The reason is said once on the page, never on a card.
    expect(text).not.toContain(FAILED_EXPLAINED)
    const html = render(node)
    const line = html.slice(html.indexOf('data-subjects-not-measured'), html.indexOf('</p>', html.indexOf('data-subjects-not-measured')))
    expect(line).not.toMatch(/data-copy=/)
    assertCopyContract(node)
  })

  it('a box with no ready subject names those not measured yet, the failed one among them, where "Not measured yet" stood alone', () => {
    const only = { ...card('caregivers'), subjects: [], subjectsPending: 1, subjectsNotMeasured: [{ id: 's-fit', label: 'Fit & comfort' }] }
    const node = <GroupCard card={only} n={d.videos} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('What they talk about Not measured yet: Fit & comfort')
    expect(text).not.toContain(FAILED_EXPLAINED)
    assertCopyContract(node)
  })

  it('the page says why a failed subject shows no figure ONCE, in the foot of "Who\'s in your market", one line a subject', () => {
    const node = <WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} failed={d.subjectsFailed} />
    const text = renderText(node)
    expect(text).toMatch(new RegExp(`Clinicians and prosthetists 29 of 487 videos Fit & comfort: ${FAILED_EXPLAINED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    expect(render(node).match(/data-subject-failed/g)).toHaveLength(1)
    assertCopyContract(node)
    // None where no subject failed.
    expect(render(<WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} />)).not.toContain('data-subjects-failed')
  })

  it('the whole page prints FAILED_EXPLAINED once, however many cards name the subject', () => {
    const html = render(<VoicesPage data={d} />)
    expect(html.split(FAILED_EXPLAINED).length - 1).toBe(1)
    const counts = d.groups.cards.map((c) => c.subjectsNotMeasured?.length ?? 0)
    expect(counts.every((n) => n === 2)).toBe(true)
  })

  it('the group\'s panel counts the ready subjects alone, the thin one included', () => {
    const open = VOICES_FIXTURES['ossur-tracked-group']()
    const node = <GroupPanelView panel={open.panel as GroupPanel} monthWords={open.monthWords} />
    const text = renderText(node)
    expect(text).toContain('2 of 45 are about Look & style')
    expect(text).not.toMatch(/are about Fit & comfort|are about Cost & access/)
    assertCopyContract(node)
  })
})
