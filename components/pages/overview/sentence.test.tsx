import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewSentence } from './sentence'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV1 · in one sentence', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewSentence.render(data, mode, ctx)))
      }
    }
  })

  it('writes the figures into the sentence and marks them as code’s', () => {
    const node = overviewSentence.render(overviewFixture(), 'app', ctx)
    const markup = render(node)
    const text = renderText(node)
    expect(text).toContain('Will it survive a wet commute came up in 9.4%')
    expect(text).toContain('130 of 1,388 videos')
    expect(markup).not.toContain('[[t1_share]]')
    const figures = copyNodes(markup).filter((n) => n.kind === 'figure')
    expect(figures.map((f) => f.text)).toContain('9.4%')
  })

  it('marks the model’s read as prose, and code’s sentence as neither', () => {
    const nodes = copyNodes(render(overviewSentence.render(overviewFixture(), 'app', ctx)))
    const prose = nodes.filter((n) => n.kind === 'prose')
    expect(prose).toHaveLength(1)
    expect(prose[0].text).toContain('Durability has become the question of the season')
    // The one place the model may argue carries its label and says who wrote it.
    const text = renderText(render(overviewSentence.render(overviewFixture(), 'app', ctx)))
    expect(text).toContain('Interpretation')
    expect(text).toContain('We wrote this read ourselves this month.')
  })

  it('prints the unusual line with its band, its n and one quote', () => {
    const text = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Unusual this week:')
    expect(text).toContain('21 of 310 videos')
    expect(text).toContain('band ±2.1 points')
  })

  it('drops the unusual line entirely when nothing fired — never a reassurance', () => {
    const text = renderText(overviewSentence.render(refusedFixture(), 'app', ctx))
    expect(text).not.toContain('Unusual this week')
    expect(text).not.toContain('Nothing unusual')
  })

  it('prints the top recommendation with its age and your decision', () => {
    const text = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Lead with repairability')
    expect(text).toContain('first raised 3 months ago')
    expect(text).toContain('you marked it Working on it on 2 Sep')
  })

  it('shows the original and the English under it, never instead of it', () => {
    const text = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Dit het twee winters gehou.')
    expect(text).toContain('It held through two winters.')
  })

  it('hands back its quotes as refs and its verdict', () => {
    const { quotes, verdicts } = blockAnswers(overviewSentence, overviewFixture())
    expect(quotes).toEqual(['e:1', 'e:2', 'c:1'])
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0].bandPts).toBe(1.8)
  })

  it('is email-safe', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('links onward to Market, absolutely', () => {
    const markup = render(overviewSentence.render(overviewFixture(), 'email', ctx))
    expect(markup).toContain('https://app.verbatimintel.com/dashboard/market')
  })
})
