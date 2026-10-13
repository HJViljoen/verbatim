import { describe, expect, it } from 'vitest'
import { MessageSquareText, TrendingUp } from 'lucide-react'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { CARD, CardHead } from './card-head'
import { FlagChip } from './flag-chip'
import { WEEK_FLAG } from './fixture'

describe('CardHead and CARD', () => {
  it('opens on the colour roles\' icon tile, then the 17px title and its muted line', () => {
    const m = render(<CardHead icon={MessageSquareText} title="What the market is talking about" sub="Your six subjects, October so far" />)
    expect(m).toContain('data-icon-tile="soft"')
    expect(m).toContain('bg-accent text-orange-text')
    expect(m).toMatch(/<h2 class="[^"]*text-\[17px\][^"]*">What the market is talking about<\/h2>/)
    expect(m).toMatch(/<p class="[^"]*text-\[13px\][^"]*text-muted-foreground">Your six subjects, October so far<\/p>/)
  })

  it('carries a hero\'s eyebrow and flag over a 21px title', () => {
    const node = <CardHead icon={TrendingUp} size="lg" eyebrow="Unusual this week" flag={<FlagChip verdict={WEEK_FLAG} />} title="Insurance refusals for powered knees" />
    const m = render(node)
    expect(m).toContain('text-orange-text')
    expect(m).toContain('text-[21px]')
    expect(m).toContain('data-copy="verdict"')
    assertCopyContract(node)
    expect(renderText(node)).toBe('Unusual this week Unusual this week Insurance refusals for powered knees')
  })

  it('puts an action at the right-hand end and centres the head', () => {
    const m = render(<CardHead icon={TrendingUp} title="Your catalogue" action={<a href="#">Edit</a>} />)
    expect(m).toMatch(/^<div class="flex gap-3 items-center">/)
    expect(m).toContain('<div class="ml-auto shrink-0"><a href="#">Edit</a></div>')
  })

  it('is a white card on the one card shadow, radius 16', () => {
    for (const c of ['rounded-[16px]', 'bg-card', 'shadow-card']) expect(CARD).toContain(c)
    expect(CARD).not.toContain('bg-accent')
  })
})
