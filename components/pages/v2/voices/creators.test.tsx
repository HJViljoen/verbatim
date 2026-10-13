import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurVoicesFixture, sealandVoicesFixture } from '@/lib/pages/v2/voices-fixture'
import type { CreatorPanel } from '@/lib/pages/v2/voices'
import { CreatorPanelView, CreatorsCard } from './creators'

describe('Creators who drive the talk', () => {
  it('the accounts at the floor: platform, followers (never Reddit\'s), the conversation they made most of, their videos', () => {
    const d = ossurVoicesFixture()
    const node = <CreatorsCard creators={d.creators} monthWords={d.monthWords} />
    const text = renderText(node)
    // A subreddit is a community, not a creator: left out, and said once.
    expect(text).not.toContain('r/amputee')
    expect(text).toContain('Reddit is left out: there a post’s account is the community it was posted in, not who made it.')
    expect(text).toContain('A L I S TikTok · 186K followers · made 8 of the 24 videos in Running on a blade 8 videos')
    expect(text).toContain('The Amputee Diaries YouTube · 96K subscribers')
    expect(text).toContain('All 6 accounts with 3 or more videos →')
    expect(render(node)).not.toContain('data-copy="quote"')
    assertCopyContract(node)
  })

  it('Sealand: the brand named in most of a creator\'s videos, as its chip', () => {
    const d = sealandVoicesFixture()
    const m = render(<CreatorsCard creators={d.creators} monthWords={d.monthWords} />)
    expect(m).toMatch(/data-who-chip="(rival|you)"/)
    assertCopyContract(<CreatorsCard creators={d.creators} monthWords={d.monthWords} />)
  })

  it('every account at the floor, and back', () => {
    const d = ossurVoicesFixture({ creators: 'all' })
    const text = renderText(<CreatorsCard creators={d.creators} monthWords={d.monthWords} />)
    expect(text).toContain('Stepping Forward')
    expect(text).toContain('Show the first five →')
  })

  it('says so when no account reaches the floor', () => {
    const d = ossurVoicesFixture()
    const node = <CreatorsCard creators={{ ...d.creators, rows: [], atFloor: 0, empty: 'No account made 3 or more of the market’s videos in September.' }} monthWords={d.monthWords} />
    expect(renderText(node)).toContain('No account made 3 or more')
    assertCopyContract(node)
  })
})

describe('a creator\'s panel', () => {
  it('its videos of the market, the conversations they are in, the brands they name', () => {
    const d = sealandVoicesFixture({ creator: 'Pack Hacker' })
    const panel = d.panel as CreatorPanel
    const node = <CreatorPanelView panel={panel} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Creator Pack Hacker YouTube · 512K subscribers as of their videos in September')
    expect(text).toContain('12 of 940 market videos in September')
    expect(text).toContain('Brands named in their videos')
    expect(text).toContain('Ask the Agent about this creator')
    expect(text).not.toContain('this month')
    assertCopyContract(node)
  })
})
