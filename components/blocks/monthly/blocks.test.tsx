import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { MONTHLY_BLOCK_KEYS } from '@/lib/reports/monthly'
import { changeLead, measuredSearchSentence } from '@/lib/pages/overview-market'
import { coverPlainText } from '@/lib/reports/cover'
import { proseFigures } from '@/lib/prose/figures'
import { overviewThemes } from '@/components/pages/overview/themes'
import { ALL_MONTHLY_BLOCKS, MONTHLY_BLOCKS, monthlyBlocksFor, monthlySections } from './index'
import { splitClause } from './month'
import { filledSlotsFixture, monthlyFixture, ossurMonthlyFixture, unmeasuredMonthlyFixture } from './fixture'
import { noneFoundBrandsRead, shippedBrandsRead } from '@/lib/test/brands-fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const NAMED_STATES = [
  ['Sealand, the skeleton', monthlyFixture()],
  ['Sealand before MF1, unmeasured', unmeasuredMonthlyFixture()],
  ['Össur, paused', ossurMonthlyFixture()],
  ['Sealand, every slot filled', filledSlotsFixture()],
] as const
const STATES = NAMED_STATES.map(([, data]) => data)
/** The classes the email's one media query reads, and nothing else. */
const EMAIL_CLASSES = new Set(['vb-m-bar', 'vb-m-col'])

const text = (key: keyof typeof MONTHLY_BLOCKS, data = monthlyFixture(), mode: RenderMode = 'email') =>
  renderText(MONTHLY_BLOCKS[key].render(data, mode, ctx))

describe('the ten sections', () => {
  it('are one block per stored key, in the front page’s order', () => {
    expect(ALL_MONTHLY_BLOCKS.map((b) => b.key)).toEqual([...MONTHLY_BLOCK_KEYS])
    for (const key of MONTHLY_BLOCK_KEYS) expect(MONTHLY_BLOCKS[key].key).toBe(key)
  })

  // One test a section a state, so a failure names both.
  describe.each(NAMED_STATES)('on %s', (_name, data) => {
    it.each(ALL_MONTHLY_BLOCKS.map((b) => [b.key, b] as const))('%s keeps the copy contract in all three modes', (_key, block) => {
      for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
    })

    it.each(ALL_MONTHLY_BLOCKS.map((b) => [b.key, b] as const))('%s is drawn in a BlockFrame, its title alone, no footer note (25 Sep rulings)', (_key, block) => {
      for (const mode of MODES) {
        const el = block.render(data, mode, ctx)
        expect(isValidElement(el) && el.type === BlockFrame, mode).toBe(true)
        const props = (el as { props: { meta?: unknown; footerNote?: unknown; title?: unknown } }).props
        expect(props.meta, `${mode} meta`).toBeUndefined()
        expect(props.footerNote, `${mode} footer note`).toBeUndefined()
        expect(props.title).toBe(block.title)
      }
    })

    it.each(ALL_MONTHLY_BLOCKS.map((b) => [b.key, b] as const))('%s draws its email in the section card, with no class the stylesheet does not read', (_key, block) => {
      const el = block.render(data, 'email', ctx) as { props: { card?: boolean } }
      expect(el.props.card).toBe(true)
      const markup = render(el as never)
      const classes = [...markup.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/))
      expect(classes.filter((c) => !EMAIL_CLASSES.has(c))).toEqual([])
      expect(markup).not.toContain('var(--')
      expect(markup).not.toMatch(/display:\s*(flex|grid)/)
    })
  })

  it('print no [[token]] and no "how sound" in any mode on any state', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        for (const mode of MODES) {
          const markup = render(block.render(data, mode, ctx))
          expect(markup).not.toContain('[[')
          expect(markup.toLowerCase()).not.toContain('how sound')
        }
      }
    }
  })

  it('link out absolutely in every mode, so a link works outside the app', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        for (const mode of MODES) {
          for (const href of render(block.render(data, mode, ctx)).match(/href="([^"]+)"/g) ?? []) {
            expect(href).toMatch(/href="https?:\/\//)
          }
        }
      }
    }
  })

  it('do not print one number twice, two ways', () => {
    for (const data of STATES) {
      expect(figureConflicts(ALL_MONTHLY_BLOCKS.map((b) => blockAnswers(b, data).figures))).toEqual([])
    }
  })

  it('carry no verdict: nothing is compared before December (decision D)', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) expect(blockAnswers(block, data).verdicts, block.key).toEqual([])
    }
  })

  it('drop a key this build does not know, a version 1 key included', () => {
    expect(monthlyBlocksFor(['monthly.month', 'monthly.gone', 'monthly.movers', 'monthly.sound']).map((b) => b.key)).toEqual(['monthly.month'])
    expect(monthlyBlocksFor(['nothing.at.all'])).toEqual([])
  })
})

describe('the four slots (WP2.3, WP2.5, WP2.6, WP2.7)', () => {
  it('are absent from the artefact while a stub fills them', () => {
    const keys = monthlySections(MONTHLY_BLOCK_KEYS, monthlyFixture()).map((b) => b.key)
    expect(keys).toEqual(['monthly.month', 'monthly.themes', 'monthly.kinds', 'monthly.asks', 'monthly.subjects', 'monthly.change', 'monthly.decide'])
  })

  it('are present, in the front page’s order, once their packages fill them', () => {
    expect(monthlySections(MONTHLY_BLOCK_KEYS, filledSlotsFixture()).map((b) => b.key)).toEqual([...MONTHLY_BLOCK_KEYS])
  })

  it('a stored reading with no slots at all reads every slot as a stub', () => {
    const { slots: _slots, ...rest } = monthlyFixture()
    const bare = rest as unknown as ReturnType<typeof monthlyFixture>
    expect(monthlySections(MONTHLY_BLOCK_KEYS, bare).map((b) => b.key)).not.toContain('monthly.brands')
    for (const key of ['monthly.arrivals', 'monthly.you', 'monthly.brands'] as const) {
      for (const mode of MODES) expect(() => render(MONTHLY_BLOCKS[key].render(bare, mode, ctx))).not.toThrow()
    }
  })

  it('brands print the name line and each brand, without any video our rival searches found (one base) and in all (staging’s brands_v1 plan)', () => {
    for (const mode of MODES) {
      const t = text('monthly.brands', filledSlotsFixture(), mode)
      expect(t, mode).toContain('In September your name came up in none of your market’s 654 videos.')
      expect(t, mode).toContain('The 8 videos that name you are your own posts.')
      expect(t, mode).toMatch(/Without any video our rival searches found\s*(·\s*)?of 516/)
      expect(t, mode).toMatch(/In all\s*(·\s*)?of 654/)
      expect(t, mode).toMatch(/Patagonia\s*13\s*45/)
      expect(t, mode).toMatch(/The North Face\s*6\s*36/)
      expect(t, mode).toMatch(/Cotopaxi\s*3\s*28/)
      // No measured precision: "not counted yet", never 0 and never a count.
      for (const brand of ['Freitag', 'Rareform', 'Freedom of Movement', 'Old School']) {
        expect(t, mode).toMatch(new RegExp(`${brand}\\s*not counted yet`))
      }
      expect(t, mode).not.toMatch(/Freitag\s*1\b|Freitag\s*6\b|Rareform\s*0/)
    }
  })

  // Deploy 3 ships every brand "not counted yet" (the 27 Sep ruling): the
  // heads are empty then, and the design review found their bar, 144px and
  // 64px widths still set, so "Freedom of Movement" wrapped at 640 beside an
  // empty area. The widths are the figures' only, where a brand is counted.
  it('brands set the figure columns’ widths only where a brand is counted', () => {
    const shipped = { ...filledSlotsFixture(), slots: { ...filledSlotsFixture().slots, brands: { state: 'filled' as const, value: shippedBrandsRead() } } }
    const head = (data: ReturnType<typeof filledSlotsFixture>) => {
      const html = render(MONTHLY_BLOCKS['monthly.brands'].render(data, 'email', ctx))
      return html.slice(html.indexOf('<thead'), html.indexOf('</thead>'))
    }
    expect(head(shipped)).not.toMatch(/width:\s*\d/)
    expect(text('monthly.brands', shipped)).toMatch(/Freedom of Movement\s*not counted yet/)
    expect(head(filledSlotsFixture())).toMatch(/width:\s*160px/)
    expect(head(filledSlotsFixture())).toMatch(/width:\s*144px/)
  })

  // The lead's ruling of 27 Sep (fast track): a brand production's list held
  // no match of prints "none found" in the monthly as on the page.
  it('brands print "none found" for a brand production’s list held no match of, in every mode', () => {
    const data = { ...filledSlotsFixture(), slots: { ...filledSlotsFixture().slots, brands: { state: 'filled' as const, value: noneFoundBrandsRead() } } }
    for (const mode of MODES) {
      const t = text('monthly.brands', data, mode)
      for (const brand of ['Rareform', 'Freedom of Movement', 'Old School']) expect(t, mode).toMatch(new RegExp(`${brand}\\s*none found`))
      for (const brand of ['Cotopaxi', 'Patagonia', 'The North Face', 'Freitag']) expect(t, mode).toMatch(new RegExp(`${brand}\\s*not counted yet`))
      expect(t, mode).not.toMatch(/\b0\b|of 516/)
      assertCopyContract(render(MONTHLY_BLOCKS['monthly.brands'].render(data, mode, ctx)))
    }
    // No figure is declared for a brand none found: it prints a word.
    expect(Object.keys(MONTHLY_BLOCKS['monthly.brands'].figures?.(data) ?? {}).filter((k) => k.startsWith('brand_'))).toEqual([])
  })

  it('you prints the for-you line and what you published', () => {
    const t = text('monthly.you', filledSlotsFixture())
    expect(t).toContain('Waterproofing')
    expect(t).toMatch(/Your market asked about it on\s*16\s*videos over the last 3 months\. None of your\s*56\s*posts in that time shared two or more of its words\./)
    expect(t).toContain('What you published')
    expect(t).toMatch(/20\s*posts/)
    expect(t).toContain('30 in August')
    expect(t).toContain('234 comments')
    expect(t).toContain('Respect for Sealand’s mission')
    expect(t).toContain('Moves: none dated yet')
    expect(t).toContain('Open Your moves')
  })

  it('arrivals print the came-in counts, adding to months, and no weekly bars', () => {
    const t = text('monthly.arrivals', filledSlotsFixture())
    // Staging's 20 Sep update (update_arrivals, 26 Sep): the front page's words.
    expect(t).toContain('With the 20 Sep update: 395 videos read in your market for the first time, and 11,999 more September comments came in.')
    expect(t).toContain('With 10+ videos in September:')
    expect(t).toMatch(/Laundry planning for travel\s*”: 8 of its 10 videos came from searches we added in September/)
    expect(t).toMatch(/Preference for secondhand fashion\s*”: 8 of its 10 videos/)
    // Minted by the 20 Sep update but held by August: not heard for the first time.
    expect(t).not.toContain('Interest in shipping and locations')
    expect(t).not.toMatch(/week by week/i)
    expect(t).toContain('Open This week')
  })

  it('the change section adds WP2.3’s check line once its slot is filled', () => {
    const filled = text('monthly.change', filledSlotsFixture())
    expect(filled).toContain('Re-checked')
    expect(filled).toContain('Too few videos on the searches both months ran to check.')
    expect(text('monthly.change', filledSlotsFixture(), 'app')).toContain('Too few videos on the searches both months ran to check.')
    expect(text('monthly.change')).not.toContain('Re-checked')
  })
})

describe('9 · what changed, and what is ours', () => {
  it('prints the front page’s measured sentence, through the front page’s function', () => {
    const data = monthlyFixture()
    const block = data.overview.change!
    const measured = measuredSearchSentence(block)
    expect(measured).not.toBeNull()
    const lead = changeLead(block)!
    expect(lead.body).toBe(measured!.body)
    const words = coverPlainText(lead.body, proseFigures(lead.figures))
    // `renderText` spaces every node apart, so the figures' spans are closed
    // back up against their parenthesis and comma (as the front page's test reads).
    const read = (t: string) => t.replace(/\s+([,.)”’:])/g, '$1').replace(/([“(])\s+/g, '$1')
    for (const mode of MODES) expect(read(text('monthly.change', data, mode))).toContain(words)
    // Staging's measured row: WP1.8's one figure, 356 of September's 654
    // market videos (the 26 Sep ruling), read with the 20 Sep update; never
    // the strict 376 of 625, which decides the refusal only.
    expect(words).toContain('about half of September came from searches we added in September')
    expect(words).toContain('356 of 654')
    expect(words).toContain('read with the 20 Sep update')
    expect(words).not.toContain('376')
    for (const mode of MODES) expect(text('monthly.change', data, mode)).not.toMatch(/\b376\b|\b625\b/)
  })

  it('prints the pair’s own words where no row measured it', () => {
    const data = unmeasuredMonthlyFixture()
    const lead = changeLead(data.overview.change!)!
    expect(measuredSearchSentence(data.overview.change!)).toBeNull()
    expect(text('monthly.change', data)).toContain(coverPlainText(lead.body, proseFigures(lead.figures)))
  })

  it('draws the pair not read as a change and the first pair read the same way', () => {
    const t = text('monthly.change')
    expect(t).toContain('Not read as a change')
    expect(t).toMatch(/Aug\s*Sep/)
    expect(t).toContain('The first comparison read the same way')
    expect(t).toMatch(/Oct\s*Nov/)
    expect(t).toContain('From the 6 Dec update, if nothing we search changes')
    expect(t).toContain('Our search changes, 9, 13 and 17 Sep')
    expect(t).toContain('What we changed, and when')
  })

  it('promises no next pair to a paused tenant, and keys its own search changes', () => {
    const t = text('monthly.change', ossurMonthlyFixture())
    expect(t).not.toContain('The first comparison read the same way')
    expect(t).toContain('Our search changes, 23 Aug and 13 Sep')
  })
})

describe('1 · the month', () => {
  it('opens on the market’s size, then the three biggest conversations as a table', () => {
    const t = text('monthly.month')
    expect(t).toContain('Your market in September: 655 videos and 16,233 comments.')
    expect(t).not.toContain('so far')
    expect(t).toContain('655')
    expect(t).toContain('16,233')
    expect(t).toContain('Its three biggest conversations not led by makers, of the 626 category videos:')
    expect(t).toMatch(/Ready to buy handmade bags\s*69\s*7%/)
    expect(t).toMatch(/Confusion over airline bag sizes\s*21\s*3%/)
    expect(t).toContain('About a third of each of the first two sits under makers’ own posts.')
    expect(t).toContain('Aug of 351')
  })

  it('prints the lead theme’s voices from its own comments, and links to Your market', () => {
    const t = text('monthly.month')
    expect(t).toMatch(/One voice on “\s*Confusion over airline bag sizes\s*”/)
    expect(t).toContain('About time they do something')
    expect(t).toContain('Open Your market')
  })

  it('keeps the page’s words in the app and on paper, under the section’s link', () => {
    const app = text('monthly.month', monthlyFixture(), 'app')
    expect(app).toContain('Your market in September')
    expect(app).toContain('Open Your market')
    expect(text('monthly.month', monthlyFixture(), 'print')).not.toContain('Open Your market')
  })

  it('cuts the page’s clause where the table goes, never rewording it', () => {
    const cut = splitClause([
      { t: 'text', s: 'Its three biggest conversations, of the ' },
      { t: 'figure', key: 'n' },
      { t: 'text', s: ' category videos: ' },
      { t: 'label', s: 'A' }, { t: 'text', s: ' ' }, { t: 'figure', key: 'a' },
      { t: 'text', s: '.' },
      { t: 'text', s: ' About a third of each sits under makers’ own posts.' },
    ])!
    expect(cut.intro.map((p) => (p.t === 'figure' ? `[${p.key}]` : p.s)).join('')).toBe('Its three biggest conversations, of the [n] category videos:')
    expect(cut.after.map((p) => (p.t === 'figure' ? p.key : p.s)).join('')).toBe('About a third of each sits under makers’ own posts.')
    expect(splitClause([{ t: 'text', s: 'The subject we read most.' }])).toBeNull()
  })
})

describe('2 · 4 · 5 · 6 · the front page’s other blocks', () => {
  it('the themes print the board with both months’ bases, the makers line and the chip', () => {
    const t = text('monthly.themes')
    expect(t).toContain('Sep of 626')
    expect(t).toContain('Aug of 351')
    expect(t).toMatch(/Ready to buy handmade bags\s*about a third makers\s*69\s*11%\s*7%/)
    expect(t).toContain('Makers and DIY, grouped:')
    expect(t).toContain('Not read as a change: we changed our searches in September.')
    // The page's current sidebar label (plan §4.0): Conversation from WP2.4.
    expect(t).toContain('Open Conversation')
    expect(t).not.toContain('Voice')
    expect(MONTHLY_BLOCKS['monthly.themes'].title).toBe(overviewThemes.title)
  })

  it('the kinds print every kind and the moods on the market’s base, with no footer link', () => {
    const t = text('monthly.kinds')
    expect(t).toMatch(/Praising it\s*450\s*72%/)
    expect(t).toContain('under 10, a count only')
    expect(t).toContain('Mood of 626')
    expect(t).toMatch(/Positive\s*484\s*77%/)
    expect(t).not.toContain('Open ')
  })

  it('the asks print three lists, each with a quote from its own themes', () => {
    const t = text('monthly.asks')
    expect(t).toContain('Asked')
    expect(t).toContain('Complained')
    expect(t).toContain('Wished for')
    expect(t).toContain('If you made it in pink and a bigger size I would buy it immediately')
    expect(t).toContain('a comment · September')
  })

  it('the subjects print the market’s rows, ranked, with their calibration words', () => {
    const t = text('monthly.subjects')
    expect(t).toMatch(/Looks & style\s*provisional\s*104\s*17%/)
    expect(t).toContain('no reading yet')
    expect(t).toContain('Open Subjects')
    expect(text('monthly.subjects', ossurMonthlyFixture())).toContain('No subjects named yet')
  })

  it('a subject a fifth or more makers carries the front page\'s maker tag (the MonthlyReport artboard: "provisional · over a third makers")', () => {
    // Staging at the 11 Oct clock: Looks & style 35 of 103 market videos makers'.
    const base = monthlyFixture()
    const rows = base.overview.subjects.rows.map((r) => (r.id === 's-looks' ? { ...r, makerShare: 35 / 103 } : r))
    const data = { ...base, overview: { ...base.overview, subjects: { ...base.overview.subjects, rows } } }
    expect(text('monthly.subjects', data)).toMatch(/Looks & style\s*provisional · about a third makers\s*104/)
    expect(text('monthly.subjects')).not.toContain('makers')
  })
})

describe('10 · what to decide', () => {
  it('prints the current recommendation and the next monthly, on plan §3.7’s dates', () => {
    const t = text('monthly.decide')
    expect(t).toContain('The current recommendation')
    expect(t).toContain('Add a "fit and facts" layer to every Sealand bag page and shopping touchpoint')
    expect(t).toContain('Repeated across 3 updates · 253 videos behind it')
    expect(t).toContain('You marked it Working on it on 15 Sep')
    expect(t).toMatch(/Next: “October in your market”\s*, read to the 1 Nov update, on Tue 3 Nov\./)
    expect(t).not.toContain('Interpretation')
  })

  it('names no next monthly for a paused tenant, and says so where nothing stands', () => {
    const ossur = ossurMonthlyFixture()
    const t = text('monthly.decide', ossur)
    expect(t).not.toContain('Next:')
    expect(t).toContain('Launch an access navigator')
    expect(t).toContain('No decision recorded; it stands at New')
    const none = text('monthly.decide', ossurMonthlyFixture({ decide: { ...ossur.decide, ledger: null } }))
    expect(none).toContain('No recommendation stands for September.')
  })
})

describe('a quote withdrawn after the build', () => {
  it('leaves the month and the asks standing, quoting nobody', () => {
    const data = monthlyFixture()
    const erased = {
      ...data,
      overview: {
        ...data.overview,
        heroVoices: data.overview.heroVoices?.map((v) => ({ ...v, quote: null as never })),
        asks: data.overview.asks && { ...data.overview.asks, lists: data.overview.asks.lists.map((l) => ({ ...l, rows: l.rows.map((r) => ({ ...r, quote: null })) })) },
      },
    }
    for (const mode of MODES) {
      expect(() => render(MONTHLY_BLOCKS['monthly.month'].render(erased, mode, ctx))).not.toThrow()
      expect(() => render(MONTHLY_BLOCKS['monthly.asks'].render(erased, mode, ctx))).not.toThrow()
    }
    expect(MONTHLY_BLOCKS['monthly.month'].quotes?.(erased)).toEqual([])
    expect(markupText(render(MONTHLY_BLOCKS['monthly.month'].render(erased, 'email', ctx)))).not.toContain('About time')
  })
})
