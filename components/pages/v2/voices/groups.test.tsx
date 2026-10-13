import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurVoicesFixture } from '@/lib/pages/v2/voices-fixture'
import { mergeWho, type GroupPanel } from '@/lib/pages/v2/voices'
import { GroupCard, GroupGrid, GroupPanelView, MixCard, WhoCard } from './groups'

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

describe('How the mix changed (the board\'s sixth card; decision 2)', () => {
  const d = ossurVoicesFixture()

  it('keeps its place: this month\'s column drawn, last month\'s axis empty, and one line saying why', () => {
    const node = <MixCard cards={d.groups.cards} n={d.videos} month={d.month} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('How the mix changed Each group’s videos of the market’s 487 , August against September')
    expect(text).toContain('Not compared yet: each update describes the groups afresh, so August has no reading of these groups.')
    const m = render(node)
    // Both columns are named; only September's carries points, and no line
    // joins the two (a line needs both ends).
    expect(m).toContain('>Aug</text>')
    expect(m).toContain('>Sep</text>')
    expect(m.match(/<circle /g)).toHaveLength(d.groups.cards.length)
    expect(m).not.toMatch(/<line [^>]*stroke-cat/)
    // Long names are shortened on the chart, whole on the cards.
    expect(m).toContain('New amputees…')
    expect(text).not.toMatch(/%|no clear change|moved/)
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

  it('leaves out what a group does not have', () => {
    const bare: GroupPanel = { ...panel, who: [], conversations: [], phrases: [], quotes: [], triggers: '' }
    const text = renderText(<GroupPanelView panel={bare} monthWords="September" />)
    expect(text).not.toMatch(/Who they say|conversations they|How they talk|In their words|tips them/)
    assertCopyContract(<GroupPanelView panel={bare} monthWords="September" />)
  })
})
