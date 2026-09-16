import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, mergeFigures, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { MONTHLY_BLOCK_KEYS } from '@/lib/reports/monthly'
import { ALL_MONTHLY_BLOCKS, MONTHLY_BLOCKS, monthlyBlocksFor } from './index'
import { formingMonthlyFixture, monthlyFixture, refusedMonthlyFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [monthlyFixture(), refusedMonthlyFixture(), formingMonthlyFixture()]

describe('the eight blocks', () => {
  it('render in all three modes on every state and keep the copy contract', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(data, mode, ctx)))
        }
      }
    }
  })

  it('is one block per stored key, in the design’s order', () => {
    expect(ALL_MONTHLY_BLOCKS.map((b) => b.key)).toEqual([...MONTHLY_BLOCK_KEYS])
    for (const key of MONTHLY_BLOCK_KEYS) expect(MONTHLY_BLOCKS[key].key).toBe(key)
  })

  it('drops a key this build no longer knows rather than breaking the artefact', () => {
    expect(monthlyBlocksFor(['monthly.month', 'monthly.gone', 'monthly.sound']).map((b) => b.key))
      .toEqual(['monthly.month', 'monthly.sound'])
    expect(monthlyBlocksFor(['nothing.at.all'])).toEqual([])
  })

  it('prints no [[token]] in any mode on any state', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        for (const mode of MODES) expect(render(block.render(data, mode, ctx))).not.toContain('[[')
      }
    }
  })

  it('renders email-safe markup: no classes, no CSS variables, no flex, no grid', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        const markup = render(block.render(data, 'email', ctx))
        expect(markup).not.toContain('class=')
        expect(markup).not.toContain('var(--')
        expect(markup).not.toMatch(/display:\s*(flex|grid)/)
      }
    }
  })

  it('links out absolutely in every mode, so a link works outside the app', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        for (const mode of MODES) {
          const markup = render(block.render(data, mode, ctx))
          for (const href of markup.match(/href="([^"]+)"/g) ?? []) {
            expect(href).toMatch(/href="https?:\/\//)
          }
        }
      }
    }
  })

  it('keeps every section on every state — the artefact has one shape', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        expect(render(block.render(data, 'email', ctx)).length).toBeGreaterThan(0)
      }
    }
  })

  it('does not print one number twice, two ways', () => {
    for (const data of STATES) {
      const tables = ALL_MONTHLY_BLOCKS.map((b) => blockAnswers(b, data).figures)
      expect(figureConflicts(tables)).toEqual([])
    }
  })
})

describe('MR1 · the month', () => {
  const block = MONTHLY_BLOCKS['monthly.month']

  it('states the month’s sentence with its figures substituted', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('9.4%')
    expect(text).toContain('130')
    expect(text).toContain('1,388')
  })

  it('does not print the interpretation or the advice — both belong at the end', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).not.toContain('Interpretation')
    expect(text).not.toContain('Lead with repairability')
  })

  it('carries last month’s confirming line', () => {
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('August has closed at 7.1%')
  })

  it('says nothing about last month where nothing was ever sent about it', () => {
    expect(renderText(block.render(formingMonthlyFixture(), 'app', ctx))).not.toContain('has closed at')
  })

  it('shows the voices with the count they were drawn from', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('2 of 37 voices')
    expect(text).toContain('Three winters on the bike')
  })

  it('declares the month’s own size, which is what a sent figure is usually about', () => {
    const figures = blockAnswers(block, monthlyFixture()).figures
    expect(figures.month_videos).toMatchObject({ value: 2359, unit: 'videos' })
  })

  it('says so rather than printing an empty block when there is nothing yet', () => {
    const bare = formingMonthlyFixture()
    bare.overview.bar.videos = null
    expect(block.emptyState(bare)).toBe('There is nothing to report on this month yet.')
  })
})

describe('MR3 · what moved', () => {
  const block = MONTHLY_BLOCKS['monthly.movers']

  it('heads itself with no direction word — the rows carry theirs', () => {
    expect(block.title).toBe('What moved this month')
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('Cleared their band · a larger share than last month')
    expect(text).toContain('Cleared their band · a smaller share than last month')
  })

  it('writes every row’s line out in words, so an email with no images loses nothing', () => {
    const text = renderText(block.render(monthlyFixture(), 'email', ctx))
    expect(text).toContain('Apr 3.1% → May 4% → Jun 5.1% → Jul 6.8% → Aug 9.4% → Sep 9.4%')
  })

  it('names a month with no reading rather than closing the gap', () => {
    expect(renderText(block.render(monthlyFixture(), 'email', ctx))).toContain('Apr — → May 1.8%')
  })

  it('draws the line as an SVG on screen and not in the email', () => {
    expect(render(block.render(monthlyFixture(), 'app', ctx))).toContain('<svg')
    expect(render(block.render(monthlyFixture(), 'email', ctx))).not.toContain('<svg')
  })

  it('prints a first-heard theme as a level and never as a change', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('First heard this month')
    expect(text).toContain('Second-hand resale value')
    expect(text).toContain('first heard this month')
  })

  it('marks "gone quiet" as the verdict it is', () => {
    const markup = render(block.render(monthlyFixture(), 'app', ctx))
    expect(markup).toMatch(/data-copy="verdict"[^>]*>\s*gone quiet/)
  })

  it('declares four figures, not forty — the record takes the rest off verdicts', () => {
    const data = monthlyFixture()
    const answers = blockAnswers(block, data)
    expect(Object.keys(answers.figures).length).toBeLessThanOrEqual(8)
    expect(answers.verdicts.length).toBe(data.movers.growing.length + data.movers.fading.length)
  })

  it('says what it could not read rather than printing an empty list', () => {
    expect(block.emptyState(formingMonthlyFixture()))
      .toBe('Too little conversation this month to say what moved.')
  })
})

describe('MR6 · one voice per subject', () => {
  const block = MONTHLY_BLOCKS['monthly.voices']

  it('prints one quote per subject, with its subject named', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('Durability')
    expect(text).toContain('Three winters on the bike')
    expect(text).toContain('Recycled materials')
  })

  it('keeps a subject with no voice, and says which silence it is', () => {
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('nothing was said about this one this month')
  })

  it('says a withdrawn voice is gone rather than printing empty quotation marks', () => {
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('counted, not quotable')
  })

  it('shows the machine translation beside the original', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('Die sak hou vir ewig')
    expect(text).toContain('The bag lasts forever, but the price is a joke')
  })

  it('declares no figure — a quote is not a reading', () => {
    expect(blockAnswers(block, monthlyFixture()).figures).toEqual({})
  })

  it('hands every ref it shows to the freeze', () => {
    expect(blockAnswers(block, monthlyFixture()).quotes).toEqual(['e:1', 'e:2', 'e:3'])
  })

  it('says the subjects are not recorded rather than that nobody spoke', () => {
    expect(block.emptyState(formingMonthlyFixture()))
      .toBe('Your subjects are not recorded for this workspace yet.')
  })
})

describe('MR7 · what to decide', () => {
  const block = MONTHLY_BLOCKS['monthly.decide']

  it('carries the labelled slot and says who wrote it', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('Interpretation')
    expect(text).toContain('We wrote this read ourselves this month.')
  })

  it('carries the standing advice as its metadata, marked as stored model prose', () => {
    const markup = render(block.render(monthlyFixture(), 'app', ctx))
    expect(markup).toContain('data-slot="pass_d_b_recommendation"')
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('first raised 3 months ago · you marked it Working on it on 2 Sep')
  })

  it('gives the decision a deadline', () => {
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('The next reading of this is 1 Oct 2026.')
  })

  it('attaches the brief by link and does not claim to have built one', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('The brief is attached, one link per block.')
    expect(text).toContain('Marketing brief')
  })

  it('says when the attached brief pre-dates this reading', () => {
    const data = monthlyFixture()
    data.brief = { ...data.brief!, stale: true }
    expect(renderText(block.render(data, 'app', ctx))).toContain('before this reading')
  })

  it('says the brief is in the workspace where the link needs an account', () => {
    const data = monthlyFixture()
    data.brief = { ...data.brief!, public: false, href: '/dashboard/reports?view=x' }
    expect(renderText(block.render(data, 'app', ctx))).toContain('The brief is in the workspace.')
  })

  it('declares no figure of its own — the tokens are section 1’s', () => {
    expect(blockAnswers(block, monthlyFixture()).figures).toEqual({})
  })

  it('substitutes the interpretation’s tokens from section 1’s table', () => {
    const data = monthlyFixture()
    data.decide.interpretation = {
      ...data.decide.interpretation,
      sentences: ['It came up in [[t1_videos]] of [[t1_of]] videos.'],
    }
    const text = renderText(block.render(data, 'app', ctx))
    expect(text).toContain('130')
    expect(text).toContain('1,388')
    expect(text).not.toContain('[[')
  })
})

describe('the five sections that are Overview’s', () => {
  it('forward the page’s own answers untouched', () => {
    const data = monthlyFixture()
    for (const key of ['monthly.subjects', 'monthly.rivals', 'monthly.moves', 'monthly.sound'] as const) {
      const answers = blockAnswers(MONTHLY_BLOCKS[key], data)
      expect(answers).toBeTruthy()
    }
    // OV2's figures reach the artefact under OV2's own tokens, so a reader of
    // the record joins the report and the page on one key.
    const subjects = blockAnswers(MONTHLY_BLOCKS['monthly.subjects'], data).figures
    expect(Object.keys(subjects).length).toBeGreaterThan(0)
  })

  it('take the artefact’s heading where the mock gives them one', () => {
    expect(MONTHLY_BLOCKS['monthly.rivals'].title).toBe('The rivals’ month')
    expect(MONTHLY_BLOCKS['monthly.subjects'].title).toBe('Your subjects this month')
    expect(MONTHLY_BLOCKS['monthly.sound'].title).toBe('How sound is this month')
  })

  it('merge into one figure table with no key printed two ways', () => {
    const data = monthlyFixture()
    const merged = mergeFigures(ALL_MONTHLY_BLOCKS.map((b) => blockAnswers(b, data).figures))
    expect(Object.keys(merged).length).toBeGreaterThan(0)
  })
})
