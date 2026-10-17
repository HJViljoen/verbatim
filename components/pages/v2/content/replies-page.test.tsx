import { describe, expect, it } from 'vitest'
import { render, renderText as rawText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { contentRepliesFixture } from '@/lib/pages/v2/content-levels-fixture'
import { ContentRepliesPage, repliesMeta } from './replies-page'

// THE COMMENTS WORTH A REPLY, THE EVIDENCE (G5-Content-Replies and
// -Replies-Phone): what it prints, in the board's order, in every state.

/** The page's words as read: a tag between a word and its comma is not a space. */
const renderText = (node: Parameters<typeof rawText>[0]): string => rawText(node).replace(/\s+([,.])/g, '$1')
const page = (o: Parameters<typeof contentRepliesFixture>[0] = {}) => <ContentRepliesPage data={contentRepliesFixture(o)} />

describe('the reply list\'s page', () => {
  it('opens flat: "Content / Worth a reply", a reply arrow on the neutral, "Comments", the days and the counts, the period switch', () => {
    const m = render(page())
    const text = renderText(page())
    expect(m).toMatch(/data-crumb-row=""[\s\S]*href="\/dashboard\/content"[^>]*>Content</)
    expect(m).not.toContain('data-crumb-chevron')
    expect(m).toMatch(/data-level-tile="replies" class="[^"]*bg-track/)
    expect(text).toContain('Comments Worth a reply Written 5 to 11 October · 12 comments · 6 under your posts, 3 under posts about you, 3 elsewhere')
    expect(m).toContain('href="/dashboard/content/replies?period=month"')
    expect(m).toMatch(/aria-current="page"[^>]*>This week</)
    // A cap, never a level: no "of N" and no month beside the count.
    expect(copyNodes(m.slice(0, m.indexOf('data-replies-lead'))).filter((n) => n.kind === 'level')).toEqual([])
    expect(repliesMeta(contentRepliesFixture()).flat().join(' ')).not.toMatch(/ of |so far/)
    // No card or figures up top: the lead is the page's own words.
    expect(text).toContain('Comments from these seven days that ask you something, push back, or say they want to buy, each under the video it was written on.')
  })

  it('carries the chips by kind, each to its section', () => {
    const m = render(page())
    expect(renderText(page())).toContain('Ready to buy 5 Questions 3 Objections 3 Wrong information 1 Ready to buy')
    for (const a of ['buy', 'questions', 'objections', 'wrong']) {
      expect(m).toContain(`href="#${a}"`)
      expect(m).toContain(`id="${a}"`)
    }
  })

  it('lists each kind\'s comments under the video they were written on: its poster, day, whose post, caption, the comments, the reply link', () => {
    const text = renderText(page())
    expect(text).toContain('Ready to buy 5 comments on 4 videos They say they want one, ask where to try it, or ask what it would cost them.')
    expect(text).toContain('@ossur Instagram · posted 7 Oct Your post Rheo Knee. Designed around you. “Where can I try the Navii in Cape Town? My clinic only has older knees.” 9 Oct · 12 likes · about looking for a fitting “How do I get a quote for the Rheo through my prosthetist?” 7 Oct · 3 likes · about asking how to buy Open the post on Instagram ↗')
    expect(text).toContain('The Amputee Diaries YouTube · posted 4 Oct Össur Trying the Pro-Flex foot for a month')
    expect(text).toContain('Reply on YouTube ↗')
    const m = render(page())
    expect(m).toMatch(/data-who-chip="you"[^>]*>Össur</)
    expect(m).toMatch(/href="https:\/\/example\.com\/m\/1\?lc=native5" target="_blank" rel="noopener noreferrer"/)
  })

  it('gives wrong information no reply link, for awareness', () => {
    const text = renderText(page())
    expect(text).toContain('Wrong information, for awareness 1 comment on 1 video')
    expect(text).toContain('Beach day, leg off or leg on? “You can’t swim with any prosthetic leg, the water ruins them all.” 6 Oct · about water and prostheses For awareness only, no reply link')
    const m = render(page())
    const wrong = m.slice(m.indexOf('id="wrong"'))
    expect(wrong.slice(0, wrong.indexOf('</section>'))).not.toMatch(/Reply on|Open the post on/)
  })

  it('sets the facts beside it: what they are, whose post, where, and how the list is picked (today\'s limits)', () => {
    const text = renderText(page())
    expect(text).toContain('The facts What they are Ready to buy 5 Questions 3 Objections 3 Wrong information 1 Whose post they sit under Your posts 6 Posts about you 3 Elsewhere in your market 3 Where Instagram 4 TikTok 4 YouTube 4')
    expect(text).toContain('Picked from the comments written between 5 and 11 Oct: at most three of a kind, twelve in all and two from one video. We cannot see whether you have replied, so a comment stays on the list.')
    const facts = renderText(page()).slice(renderText(page()).indexOf('The facts'))
    expect(facts.slice(0, facts.indexOf('Elsewhere on Content'))).not.toMatch(/waiting|oldest/i)
  })

  it('on a phone, lists two videos a kind, then "Show all … in {kind}" by its address; a kind asked for in full', () => {
    const m = render(page())
    expect(m).toContain('href="/dashboard/content/replies?kind=buy#buy"')
    expect(renderText(page())).toContain('Show all 5 in Ready to buy')
    const buy = m.slice(m.indexOf('id="buy"'), m.indexOf('id="questions"'))
    expect(buy.match(/data-reply-video="" class="[^"]*max-sm:hidden/g)).toHaveLength(2)
    const full = render(page({ kind: 'buy' }))
    const fullBuy = full.slice(full.indexOf('id="buy"'), full.indexOf('id="questions"'))
    expect(fullBuy).not.toMatch(/max-sm:hidden/)
    expect(fullBuy).not.toContain('Show all 5 in Ready to buy')
  })

  it('reads the month by the switch, the dates and the line saying so', () => {
    const text = renderText(page({ period: 'month' }))
    expect(text).toContain('Written October so far')
    expect(text).toContain('Comments from October so far that ask you something')
    expect(render(page({ period: 'month' }))).toMatch(/aria-current="page"[^>]*>This month</)
  })

  it('ends with elsewhere on Content and the Agent', () => {
    const text = renderText(page())
    expect(text.indexOf('Elsewhere on Content')).toBeGreaterThan(text.indexOf('How the list is picked'))
    expect(text).toContain('How long does a liner last, and how do you know it is time to replace it? Post idea 1 · 48 of 640 videos, 14 Sep to 11 Oct · 31 in October so far')
    expect(text).toContain('Your posts 9 posts in October so far')
    expect(text).toContain('Ask about these comments and what people want from you, in your own words.')
    const m = render(page())
    expect(m).toContain('href="/dashboard/content/ideas/i0000001-0000-4000-8000-000000000000"')
    expect(m).toContain('href="/dashboard/content/posts"')
  })

  it('keeps its frame where the list is empty, could not be read, or no update has covered a week', () => {
    const empty = renderText(page({ state: 'empty', noIdeas: true }))
    expect(empty).toContain('Ready to buy They say they want one')
    expect(empty).toContain('None this week.')
    expect(empty).toContain('What to post next Post ideas are not switched on for this workspace.')
    expect(renderText(page({ state: 'unread' }))).toContain('The comments worth a reply could not be read just now.')
    const noWeek = renderText(page({ state: 'no_week' }))
    expect(noWeek).toContain('No update has covered a week yet, so there is no reply list.')
    expect(noWeek).not.toContain('Written')
  })

  it('keeps the copy contract in every state', () => {
    for (const o of [{}, { period: 'month' as const }, { kind: 'buy' as const }, { state: 'empty' as const, noIdeas: true }, { state: 'unread' as const }, { state: 'no_week' as const }]) assertCopyContract(page(o))
  })

  it('breaks its meta into its phone lines', () => {
    const lines = repliesMeta(contentRepliesFixture())
    expect(lines[0]).toEqual(['Written 5 to 11 October'])
    expect(lines[1]).toHaveLength(2)
  })
})
