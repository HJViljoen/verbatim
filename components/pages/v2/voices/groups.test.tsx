import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurVoicesFixture } from '@/lib/pages/v2/voices-fixture'
import type { GroupPanel } from '@/lib/pages/v2/voices'
import { GroupCard, GroupGrid, GroupPanelView, WhoCard } from './groups'

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
    const node = <WhoCard groups={{ state: 'not_run', profileDate: null, cards: [], empty: 'Reading who is talking is not switched on for this workspace.' }} videos={487} monthWords="September" />
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

  it('a card with no video this month says so and prints no level', () => {
    const node = <GroupCard card={{ ...d.groups.cards[0], videos: 0, subjects: [], platforms: [] }} n={487} monthWords="September" />
    expect(renderText(node)).toContain('No video of the market’s in September carries their comments.')
    assertCopyContract(node)
  })

  it('the grid opens a group\'s panel in place, under the row its card is in', () => {
    const open = ossurVoicesFixture({ group: 'caregivers' })
    const m = render(<GroupGrid data={open} />)
    const card = m.indexOf('data-group="caregivers"')
    const panel = m.indexOf('id="group-panel"')
    const nextRowCard = m.indexOf('data-group="clinicians"')
    expect(card).toBeGreaterThan(0)
    expect(panel).toBeGreaterThan(card)
    expect(nextRowCard).toBeGreaterThan(card)
    expect(panel).toBeGreaterThan(nextRowCard)
    expect(m).toContain('ring-2 ring-foreground')
    expect(m).toContain('Close ↑')
    assertCopyContract(<GroupGrid data={open} />)
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

  it('leaves out what a group does not have', () => {
    const bare: GroupPanel = { ...panel, who: [], conversations: [], phrases: [], quotes: [], triggers: '' }
    const text = renderText(<GroupPanelView panel={bare} monthWords="September" />)
    expect(text).not.toMatch(/Who they say|conversations they|How they talk|In their words|tips them/)
    assertCopyContract(<GroupPanelView panel={bare} monthWords="September" />)
  })
})
