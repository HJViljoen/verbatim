import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { AskButton, Followers, LevelText, MiniRow, Phrase, PlatformStrip, QuoteCard } from './parts'

describe('the Voices parts', () => {
  it('a mini row prints its count as a figure and draws its bar against the head\'s n', () => {
    const node = <MiniRow label="Fit & comfort" k={46} of={96} />
    expect(renderText(node)).toBe('Fit & comfort 46')
    expect(render(node)).toContain('aria-label="46 of 96"')
    assertCopyContract(node)
  })

  it('a level carries its denominator', () => {
    const node = <LevelText k={97} n={521} unit="videos" />
    expect(renderText(node)).toBe('97 of 521 videos')
    expect(render(node)).toContain('data-copy="level"')
    assertCopyContract(node)
  })

  it('a platform strip adds up, and draws nothing for no video', () => {
    const node = <PlatformStrip label="Where" platforms={[{ platform: 'tiktok', label: 'TikTok', k: 50 }, { platform: 'reddit', label: 'Reddit', k: 11 }]} />
    expect(renderText(node)).toBe('TikTok 50 · Reddit 11')
    expect(render(node)).toMatch(/width:81\.9\d*%/)
    assertCopyContract(node)
    expect(render(<PlatformStrip label="x" platforms={[]} />)).toBe('')
  })

  it('followers are compact, and Reddit\'s are never printed', () => {
    expect(renderText(<Followers n={186221} word="followers" />)).toBe('186K followers')
    expect(render(<Followers n={null} word="followers" />)).toBe('')
  })

  it('a phrase and a quote are the commenter\'s own words: quote nodes, English first, no emoji', () => {
    const phrase = <Phrase text="biz varız" english="we are here" />
    expect(renderText(phrase)).toBe('“we are here”')
    expect(render(phrase)).toContain('data-copy="quote"')
    const quote = <QuoteCard quote={{ ref: 'e:1', text: 'Mine grew 😝 again', english: null, lang: null, platform: 'tiktok', cite: 'TikTok · 1 Sep' }} />
    expect(renderText(quote)).toBe('“Mine grew again” TikTok · 1 Sep')
    assertCopyContract(phrase)
    assertCopyContract(quote)
  })

  it('Ask is a link to the Agent', () => {
    expect(render(<AskButton href="/dashboard/agent?ask=x">Ask the Agent about this group</AskButton>)).toContain('href="/dashboard/agent?ask=x"')
  })
})
