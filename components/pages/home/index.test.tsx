import { describe, expect, it } from 'vitest'

import { HOME_DATA, HOME_EMPTY, HOME_NO_WEEKS } from '@/lib/pages/home-fixture'
import { competitiveTile, homeTiles, INSUFFICIENT, type HomeData } from '@/lib/pages/home'
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

describe('the Competitive tile names the brands named most (the backfill, 1 Oct)', () => {
  it('prints the row off Competitive\'s own brand list, with no "Insufficient data"', () => {
    const tile = competitiveTile(9, { month: '2026-09-01', rows: [{ label: 'Cotopaxi', k: 21, you: false }, { label: 'Patagonia', k: 12, you: false }] })
    const data: HomeData = { ...HOME_DATA, tiles: HOME_DATA.tiles.map((t) => (t.key === 'competitive' ? tile! : t)) }
    const text = renderText(<HomePage data={data} />)
    expect(text).toMatch(/Competitive Open → 9 brands you track Named most in September Cotopaxi, Patagonia/)
    expect(text).not.toMatch(/brands you track Insufficient data/)
    assertCopyContract(<HomePage data={data} />)
  })
})

describe('a tile without enough data (Heinrich, 1 Oct)', () => {
  it('stays, with "Insufficient data" where its rows would be: Competitive keeps its number', () => {
    const text = renderText(<HomePage data={HOME_DATA} />)
    expect(text).toMatch(/Competitive Open → 9 brands you track Insufficient data/)
  })

  it('a tile not read is its title and its link, with no number', () => {
    const data: HomeData = { ...HOME_DATA, tiles: homeTiles([null]) }
    const markup = render(<HomePage data={data} />)
    expect(markup.match(/Open →/g)).toHaveLength(6)
    expect(markup.match(/Insufficient data/g)).toHaveLength(6)
    expect(markup).not.toContain('data-copy="figure" class="font-mono text-[30px]')
    assertCopyContract(<HomePage data={data} />)
  })
})

/** The top as the artboard draws it: two columns, the numbers and then Week
 *  by week on the left (two of three), the Agent alone on the right, spanning
 *  both rows. */
const TOP = /<div class="grid grid-cols-1 gap-5 xl:grid-cols-3"><div class="flex min-w-0 flex-col gap-5 xl:col-span-2"><section[^>]*aria-labelledby="home-numbers">[\s\S]*?<\/section><section[^>]*aria-labelledby="home-weeks">[\s\S]*?<\/section><\/div><div class="min-w-0"><form[^>]*aria-labelledby="home-agent"/

/** The words between a block's title and the next block's. */
const between = (text: string, from: string, to: string): string => text.slice(text.indexOf(from), text.indexOf(to))

const AXIS = ['28 Sep', '5 Oct', '12 Oct', '19 Oct', '26 Oct', '2 Nov', '9 Nov', '16 Nov']

describe('the top keeps its two columns, the Agent on the right, whatever the data (Heinrich, 1 Oct)', () => {
  it('the full state: both blocks drawn as today, with no "Insufficient data" in either', () => {
    const markup = render(<HomePage data={HOME_DATA} />)
    const text = renderText(<HomePage data={HOME_DATA} />)
    expect(markup).toMatch(TOP)
    expect(markup).not.toContain('xl:col-span-3')
    expect(between(text, 'Your market in numbers', 'Agent')).not.toContain(INSUFFICIENT)
    expect(markup).toContain('role="img" aria-label="Videos and comments in your market, week by week. 28 Sep: 281 videos, 4,902 comments; 5 Oct: 254 videos, 4,210 comments."')
    expect(markup.match(/data-week-state=/g)).toHaveLength(2)
  })

  it('no read: both blocks drawn, each with "Insufficient data", and the Agent in the right column', () => {
    const markup = render(<HomePage data={HOME_EMPTY} />)
    const text = renderText(<HomePage data={HOME_EMPTY} />)
    expect(markup).toMatch(TOP)
    expect(markup).not.toContain('xl:col-span-3')
    // The numbers: the title and the tiles' empty line, no figure.
    expect(between(text, 'Your market in numbers', 'Week by week')).toBe(`Your market in numbers ${INSUFFICIENT} `)
    expect(markup).not.toContain('font-mono text-[34px]')
    // Week by week: the title, the legend, the empty frame's eight weeks as
    // drawn, then the line where the artboard prints its note.
    expect(between(text, 'Week by week', 'Agent')).toBe(`Week by week Videos Comments ${AXIS.join(' ')} ${INSUFFICIENT} `)
    expect(markup).not.toContain('data-week-state=')
    expect(markup).not.toContain('<polyline')
    expect(markup).not.toContain('role="img"')
    // Two blocks and six tiles, each saying so once.
    expect(markup.match(/Insufficient data/g)).toHaveLength(8)
    expect(text).toContain('Ask what your market thinks about anything')
    assertCopyContract(<HomePage data={HOME_EMPTY} />)
  })

  it('the numbers but no week to draw: the numbers as today, Week by week the empty frame', () => {
    const markup = render(<HomePage data={HOME_NO_WEEKS} />)
    const text = renderText(<HomePage data={HOME_NO_WEEKS} />)
    expect(markup).toMatch(TOP)
    expect(between(text, 'Your market in numbers', 'Week by week')).toBe('Your market in numbers This week, 21 to 27 September 262 videos 4,528 comments September so far 852 videos 21,468 comments ')
    expect(between(text, 'Week by week', 'Agent')).toBe(`Week by week Videos Comments ${AXIS.join(' ')} ${INSUFFICIENT} `)
    expect(markup).not.toContain('data-week-state=')
    assertCopyContract(<HomePage data={HOME_NO_WEEKS} />)
  })

  it('no tiles at all still keeps the two columns', () => {
    const markup = render(<HomePage data={{ ...HOME_EMPTY, tiles: [] }} />)
    expect(markup).toMatch(TOP)
    expect(markup).not.toContain('Open →')
  })

  it('prints one half of the numbers when only one was read', () => {
    const text = renderText(<HomePage data={{ ...HOME_DATA, numbers: { week: null, month: HOME_DATA.numbers!.month } }} />)
    expect(text).toContain('September so far')
    expect(text).not.toContain('This week, 21 to 27 September')
    expect(between(text, 'Your market in numbers', 'Agent')).not.toContain(INSUFFICIENT)
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
