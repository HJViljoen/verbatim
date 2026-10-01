import { describe, expect, it } from 'vitest'

import { HOME_DATA } from '@/lib/pages/home-fixture'
import type { HomeData } from '@/lib/pages/home'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { HomePage } from '.'
import { HomeSkeleton } from './skeleton'

// The Dashboard's render tier: what the page PRINTS, against the approved
// artboard (`Page-Dashboard.dc.html`), the copy contract and the design bans.

/** A left-stripe accent: a thick or coloured left border or bar, or a marker
 *  highlight (Heinrich's two bans, 30 Sep). A 1px hairline gridline is not one. */
const STRIPE = /border-l-(?:[2-9]|\[)|border-left:\s*[2-9]|<mark\b|\bw-\[3px\]/

describe('the Dashboard', () => {
  const markup = render(<HomePage data={HOME_DATA} />)
  const text = renderText(<HomePage data={HOME_DATA} />)

  it('keeps the copy contract', () => {
    assertCopyContract(<HomePage data={HOME_DATA} />)
  })

  it('prints the artboard’s blocks, in its order, in its words', () => {
    const order = [
      'Dashboard',
      'Your market in numbers', 'This week, 21 to 27 September', '262', 'videos', '4,528', 'comments', 'September so far', '852', '21,468',
      'Week by week', 'Videos', 'Comments', '28 Sep', '16 Nov',
      'Agent', 'Ask what your market thinks about anything: a product, a price, a claim, a competitor.', 'Your question', 'Ask',
      'Your market', 'Open →', 'videos in September', 'Buying & delivery', '23%',
      'This week', 'findings, 21 to 27 September', 'Buyers compare bags by exact travel and carry needs',
      'Conversation', 'conversations this week', 'Ready to buy the bag', '11%',
      'Competitive', 'brands you track',
      'Subjects', 'subjects you follow', 'Biggest this month', 'Buying & delivery, 23%', 'Added most recently', 'Buying & delivery, 24 Sep',
      'Your moves', 'posts published in September', 'Moves worth considering', 'Moves you dated', 'none yet',
    ]
    let at = -1
    for (const words of order) {
      const i = text.indexOf(words, at + 1)
      expect(i, `"${words}" after position ${at}`).toBeGreaterThan(at)
      at = i
    }
    expect(markup).toContain('placeholder="What does my market say about…"')
  })

  it('sends a question to the Agent with it in the box', () => {
    expect(markup).toMatch(/<form[^>]*action="\/dashboard\/agent"[^>]*method="get"/)
    expect(markup).toContain('name="ask"')
    expect(markup).toContain('type="submit"')
  })

  it('links every tile to its page', () => {
    for (const t of HOME_DATA.tiles) expect(markup).toContain(`href="${t.href}"`)
    expect(markup.match(/Open →/g)).toHaveLength(HOME_DATA.tiles.length)
  })

  it('draws every share bar against 100%', () => {
    expect(markup).toContain('width:23%')
    expect(markup).toContain('width:11%')
  })

  it('marks the model’s words: theme labels and the read’s headlines', () => {
    expect(markup).toContain('<span data-copy="subject" data-slot="pass_b_theme">Ready to buy the bag</span>')
    expect(markup).toContain('<span data-copy="stored" data-slot="week_read">Comfort is judged with weight in the bag</span>')
  })

  it('prints no quote, no em dash, no left stripe and no highlight', () => {
    expect(markup).not.toContain('data-copy="quote"')
    expect(text).not.toMatch(/[“”]/)
    expect(text).not.toContain('\u2014')
    expect(markup).not.toMatch(STRIPE)
  })

  it('prints nothing about how it is made', () => {
    expect(text).not.toMatch(/\b(update|updates|search|searches|gathered|coverage|readiness|placeholder|as at|so far this update)\b/i)
  })
})

describe('the Dashboard with nothing to show yet', () => {
  const empty: HomeData = { numbers: null, weeks: null, tiles: [] }

  it('omits the blocks and tiles that have nothing, and keeps the Agent', () => {
    const text = renderText(<HomePage data={empty} />)
    expect(text).not.toContain('Your market in numbers')
    expect(text).not.toContain('Week by week')
    expect(text).not.toContain('Open →')
    expect(text).toContain('Agent')
    assertCopyContract(<HomePage data={empty} />)
  })

  it('omits Week by week alone until two weeks have settled', () => {
    const text = renderText(<HomePage data={{ ...HOME_DATA, weeks: null }} />)
    expect(text).toContain('Your market in numbers')
    expect(text).not.toContain('Week by week')
    expect(text).not.toContain('28 Sep')
  })

  it('prints one half of the numbers when only one was read', () => {
    const text = renderText(<HomePage data={{ ...HOME_DATA, numbers: { week: null, month: HOME_DATA.numbers!.month } }} />)
    expect(text).toContain('September so far')
    expect(text).not.toContain('This week, 21 to 27 September')
  })
})

describe('the Dashboard skeleton', () => {
  it('names the page and prints no words the page might not', () => {
    const text = renderText(<HomeSkeleton />)
    expect(text).toContain('Dashboard')
    expect(text).not.toContain('\u2014')
    expect(render(<HomeSkeleton />)).not.toMatch(STRIPE)
  })
})
