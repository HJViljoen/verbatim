import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { marketConversationFixture, marketSubjectFixture, marketWeekFixture, fixtureId, fixtureSubjectId } from '@/lib/pages/v2/market-fixture'
import { conversationCrumbs, marketParams, subjectCrumbs, subjectMenu, subjectNavOf, weekCrumbs, LITTLE_TALK, type SubjectNavItem } from '@/lib/pages/v2/market'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import type { Crumb } from '@/lib/pages/crumbs'
import { ANCESTOR_MAX, BackLink, CrumbRow, Switcher } from './crumbs'
import { ConversationLabel, LevelBar } from './level-bar'

// THE PATH AND ITS SWITCHERS, THEN THE TITLE BLOCK (F3-Market-Nav, 17 Oct):
// what each level page's crumb row and title block print, and what a
// switcher lists, from the page fixtures and the loader's own builders.

describe('the crumb row', () => {
  const subject = marketSubjectFixture('fit')
  const conv = marketConversationFixture(1)
  const week = marketWeekFixture()

  it('a subject: "Market / {subject}" at 14px, Market a muted link at 500, the slash light, the subject ink at 600 with its 22px chevron', () => {
    const html = render(<CrumbRow crumbs={subject.crumbs!} />)
    expect(html).toMatch(/<div data-crumb-row="" class="border-b border-border pt-3 pb-\[11px\] max-sm:hidden sm:-mx-4 sm:-mt-\[18px\] sm:px-4 md:-mx-10 md:-mt-7 md:px-10">/)
    expect(html).toMatch(/<nav aria-label="Breadcrumb"><ol class="[^"]*text-\[14px\][^"]*">/)
    expect(html).toMatch(/<a title="Market" class="[^"]*font-medium text-muted-foreground[^"]*" href="\/dashboard\/market">Market<\/a>/)
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*text-\[17px\][^"]*font-light text-muted-foreground\/45">\/<\/span>/)
    expect(html).toMatch(/<span aria-current="page" class="[^"]*font-semibold text-foreground">Fit &amp; comfort<\/span>/)
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-label="Switch to another subject"[^>]*class="[^"]*size-\[22px\]/)
    // The page's h1 is the title block's, never the row's.
    expect(html).not.toContain('<h1')
    assertCopyContract(<CrumbRow crumbs={subject.crumbs!} />)
  })

  it('never ends a line on a slash: each slash rides at the head of the crumb after it, in one item (17 Oct)', () => {
    const html = render(<CrumbRow crumbs={conv.crumbs!} />)
    const items = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g)!
    expect(items).toHaveLength(3)
    expect(items[0]).not.toContain('>/<')
    for (const item of items.slice(1)) expect(item).toMatch(/^<li[^>]*><span aria-hidden="true"[^>]*>\/<\/span>/)
  })

  it('an ancestor stops at its max width in an ellipsis, its whole name its text and its title; the page\'s segment is never cut', () => {
    const long: Crumb[] = [
      { label: 'Market', href: '/dashboard/market' },
      { label: 'Community & encouragement', href: '/dashboard/market/subjects/s' },
      { label: 'Praise for resilience and courage', href: null, slot: 'pass_b_theme' },
    ]
    const html = render(<CrumbRow crumbs={long} />)
    expect(html).toMatch(new RegExp(`title="Community &amp; encouragement" class="min-w-0 truncate [^"]*${ANCESTOR_MAX.replace(/[[\]]/g, '\\$&')}" href="/dashboard/market/subjects/s">Community &amp; encouragement</a>`))
    expect(html).toMatch(/<span aria-current="page" class="(?![^"]*truncate)[^"]*"><span data-copy="subject" data-slot="pass_b_theme">Praise for resilience and courage<\/span><\/span>/)
    expect(renderText(<CrumbRow crumbs={long} />)).toBe('Market / Community & encouragement / Praise for resilience and courage')
  })

  it('a conversation under a ready subject: "Market / {subject} ⌃⌄ / {conversation} ⌃⌄", the subject a link with its own chevron', () => {
    const html = render(<CrumbRow crumbs={conv.crumbs!} />)
    expect(renderText(<CrumbRow crumbs={conv.crumbs!} />)).toBe('Market / Fit & comfort / How long a liner lasts')
    expect(html).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('fit')}"`)
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Switch to another subject"')
    expect(html).toContain('aria-label="Switch to another conversation in Fit &amp; comfort"')
    // A conversation's label is Pass B's: a subject node with its slot.
    expect(html).toMatch(/aria-current="page"[^>]*><span data-copy="subject" data-slot="pass_b_theme">How long a liner lasts<\/span>/)
    assertCopyContract(<CrumbRow crumbs={conv.crumbs!} />)
  })

  it('the week\'s page: "Market / This week\'s read", no chevron, never a disabled one', () => {
    const html = render(<CrumbRow crumbs={week.crumbs!} />)
    expect(renderText(<CrumbRow crumbs={week.crumbs!} />)).toBe('Market / This week’s read')
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toContain('disabled')
  })

  it('keeps the period in every segment\'s address', () => {
    const month = marketConversationFixture(1, { period: 'month' })
    const html = render(<CrumbRow crumbs={month.crumbs!} />)
    expect(html).toContain('href="/dashboard/market?period=month"')
    expect(html).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('fit')}?period=month"`)
  })

  it('on a phone the row becomes the way back: "‹ {parent}" at 14px/600', () => {
    const html = render(<BackLink crumbs={conv.crumbs!} />)
    expect(html).toMatch(/<a data-back-link="" class="[^"]*text-\[14px\] font-semibold text-muted-foreground[^"]*sm:hidden" href="\/dashboard\/market\/subjects\/subj-fit"><svg[^>]*><path d="m15 18-6-6 6-6"><\/path><\/svg>Fit &amp; comfort<\/a>/)
    expect(renderText(<BackLink crumbs={subject.crumbs!} />)).toBe('Market')
  })
})

describe('the title block', () => {
  const subject = marketSubjectFixture('fit')
  const conv = marketConversationFixture(1)

  it('names the level: the tile, the small label, the 28px title as the page\'s one h1, the mono meta, the control at the right', () => {
    const node = <LevelBar crumbs={subject.crumbs!} level="subject" label="Subject" meta={[['5 to 11 October', '82 of 241 videos this week'], ['108 of 318 in October so far']]} controls={<span>switch</span>} />
    const html = render(node)
    expect(html).toMatch(/<span aria-hidden="true" data-level-tile="subject" class="[^"]*size-\[46px\][^"]*bg-accent text-orange-text">/)
    expect(html).toMatch(/<p data-level-label="" class="m-0 text-\[13px\] leading-\[18px\] font-semibold text-muted-foreground">Subject<\/p>/)
    expect(html).toMatch(/<h1 class="[^"]*text-\[28px\][^"]*font-bold[^"]*max-sm:text-\[24px\][^"]*">Fit &amp; comfort<\/h1>/)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(renderText(node)).toBe('Market / Fit & comfort Market Subject Fit & comfort 5 to 11 October · 82 of 241 videos this week · 108 of 318 in October so far switch')
    // On a phone the meta breaks into its lines, and the separator between
    // them goes.
    expect(html).toMatch(/<span class="max-sm:block"><span class="max-sm:hidden"> · <\/span>108 of 318/)
    // The page's own chevron rides after the title on a phone only.
    expect(html).toMatch(/<\/h1><span class="relative shrink-0 sm:hidden"><button[^>]*aria-label="Switch to another subject"/)
  })

  it('a conversation: the speech bubble on the neutral, "Conversation in {subject}" with the subject a link up', () => {
    const parent = conv.crumbs![1]
    const node = <LevelBar crumbs={conv.crumbs!} level="conversation" label={<ConversationLabel parent={parent} />} />
    const html = render(node)
    expect(html).toMatch(/data-level-tile="conversation" class="[^"]*bg-track text-secondary-foreground"/)
    expect(html).toMatch(/Conversation in <a class="[^"]*underline[^"]*" href="\/dashboard\/market\/subjects\/subj-fit">Fit &amp; comfort<\/a><\/p>/)
    expect(html).toMatch(/<h1[^>]*><span data-copy="subject" data-slot="pass_b_theme">How long a liner lasts<\/span><\/h1>/)
    expect(renderText(<ConversationLabel parent={null} />)).toBe('Conversation')
    assertCopyContract(node)
  })

  it('takes a closed set of levels: Market\'s draw their own tile, another page\'s must bring one (checked by tsc)', () => {
    const crumbs = conv.crumbs!
    const tile = <span data-level-tile="idea" />
    // @ts-expect-error a level no page names is a compile error
    void (<LevelBar crumbs={crumbs} level="subjct" label="Subject" />)
    // @ts-expect-error another page's level brings its own tile
    void (<LevelBar crumbs={crumbs} level="idea" label="Post idea 1" />)
    // @ts-expect-error Market's levels draw LevelTile and take no tile
    void (<LevelBar crumbs={crumbs} level="subject" tile={tile} label="Subject" />)
    expect(render(<LevelBar crumbs={crumbs} level="idea" tile={tile} label="Post idea 1" />)).toContain('data-level-bar="idea"')
  })
})

describe('the switcher', () => {
  const nav = marketSubjectFixture('fit', { subjects: 'states' }).subjectNav!

  it('lists the subjects in the top page\'s order, ticks the current one, says states in words and no figure; the unready below a hairline', () => {
    const menu = subjectMenu(nav, fixtureSubjectId('fit'))!
    const html = render(<Switcher menu={menu} defaultOpen />)
    const text = renderText(<Switcher menu={menu} defaultOpen />)
    expect(text).toBe(`Your subjects Fit & comfort Cost & access Choosing the right device ${LITTLE_TALK} Look & style Community & encouragement ${SUBJECT_NOT_MEASURED} Function & movement ${SUBJECT_NOT_MEASURED}`)
    expect(html).toMatch(/role="menu" aria-label="Your subjects"/)
    expect(html.match(/role="menuitemradio" aria-checked="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:<svg[^>]*>.*?<\/svg>)<span class="min-w-0">Fit &amp; comfort<\/span>/)
    // The hairline, then the unready, dimmed and unranked (U6).
    expect(html.indexOf('role="separator"')).toBeGreaterThan(html.indexOf('Look &amp; style'))
    expect(html.indexOf('role="separator"')).toBeLessThan(html.indexOf('Community &amp; encouragement'))
    expect(html).toMatch(/<span class="min-w-0 text-muted-foreground">Community &amp; encouragement<\/span>/)
    expect(text).not.toMatch(/\d/)
    assertCopyContract(<Switcher menu={menu} defaultOpen />)
  })

  it('owns only its items and its hairline: the small-caps label is for the eye (the fresh check, 17 Oct)', () => {
    const html = render(<Switcher menu={subjectMenu(nav, fixtureSubjectId('fit'))!} defaultOpen />)
    const inside = html.slice(html.indexOf('role="menu"'))
    expect(inside).toMatch(/^role="menu" aria-label="Your subjects"[^>]*><p aria-hidden="true"[^>]*>Your subjects<\/p>/)
    // Every other child is an entry or the separator.
    const children = inside.replace(/^[^>]*>/, '').replace(/<p aria-hidden="true"[^>]*>[^<]*<\/p>/, '').match(/<(a|div) [^>]*>/g) ?? []
    expect(children.length).toBeGreaterThan(0)
    for (const c of children) expect(c).toMatch(/role="(menuitemradio|separator)"/)
  })

  it('opens from a 22px button, and is closed until asked', () => {
    const menu = subjectMenu(nav, fixtureSubjectId('fit'))!
    const closed = render(<Switcher menu={menu} />)
    expect(closed).toMatch(/<button type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Switch to another subject"[^>]*class="[^"]*size-\[22px\]/)
    expect(closed).not.toContain('role="menu"')
    expect(render(<Switcher menu={menu} defaultOpen />)).toContain('aria-expanded="true"')
  })

  it('carries the period on every entry', () => {
    const month = marketSubjectFixture('fit', { period: 'month' }).subjectNav!
    for (const s of month) expect(s.href).toBe(`/dashboard/market/subjects/${s.id}?period=month`)
  })
})

describe('the builders', () => {
  const p = marketParams({})
  const nav: SubjectNavItem[] = [
    { id: 'a', name: 'Alpha', href: '/a', ready: true, note: null },
    { id: 'b', name: 'Beta', href: '/b', ready: true, note: LITTLE_TALK },
    { id: 'c', name: 'Gamma', href: '/c', ready: false, note: SUBJECT_NOT_MEASURED },
  ]

  it('a subject alone has no switcher (no other page to go to)', () => {
    expect(subjectMenu([nav[0]], 'a')).toBeNull()
    expect(subjectMenu(nav, 'c')).toMatchObject({ items: [{ key: 'a', current: false }, { key: 'b', current: false }], below: [{ key: 'c', current: true }] })
  })

  it('a subject\'s page names it under Market', () => {
    const c: Crumb[] = subjectCrumbs(p, nav, { id: 'b', name: 'Beta' })
    expect(c.map((x) => [x.label, x.href, x.menu ? 'menu' : null])).toEqual([['Market', '/dashboard/market', null], ['Beta', null, 'menu']])
  })

  it('a conversation with no ready subject: "Market / {conversation}", its siblings the period\'s conversations', () => {
    const c = conversationCrumbs({ p, nav, conv: { id: 'x', label: 'X' }, parent: null, siblings: [{ id: 'x', label: 'X', href: '/x' }, { id: 'y', label: 'Y', href: '/y' }] })
    expect(c.map((x) => x.label)).toEqual(['Market', 'X'])
    expect(c[1].menu).toMatchObject({ label: 'Conversations this week', switchLabel: 'Switch to another conversation this week', items: [{ key: 'x', current: true, slot: 'pass_b_theme' }, { key: 'y', current: false }] })
    // Alone in its set: no chevron.
    expect(conversationCrumbs({ p, nav, conv: { id: 'x', label: 'X' }, parent: null, siblings: [{ id: 'x', label: 'X', href: '/x' }] })[1].menu).toBeNull()
  })

  it('places a conversation under its READY subject only (placeSubject), and Market alone otherwise', () => {
    // Fit & comfort is ready: How long a liner lasts sits under it.
    expect(marketConversationFixture(1).crumbs!.map((c) => c.label)).toEqual(['Market', 'Fit & comfort', 'How long a liner lasts'])
    // Every check open: the conversation stands under Market alone.
    const open = marketConversationFixture(1, { subjects: 'provisional' })
    expect(open.crumbs!.map((c) => c.label)).toEqual(['Market', 'How long a liner lasts'])
    expect(open.crumbs![1].menu?.items.map((i) => i.key)).toContain(fixtureId(3))
  })

  it('the week\'s page has no switcher', () => {
    expect(weekCrumbs(p)).toEqual([{ label: 'Market', href: '/dashboard/market' }, { label: 'This week’s read', href: null }])
  })

  it('the switcher\'s order and words come off the board\'s rows', () => {
    const d = marketSubjectFixture('fit', { subjects: 'states' })
    expect(subjectNavOf({ rows: d.subjects!.rows, read: null, month: '2026-10-01', readsOn: true, href: (id) => id }).map((s) => [s.name, s.ready, s.note])).toEqual([
      ['Fit & comfort', true, null], ['Cost & access', true, null], ['Choosing the right device', true, null], ['Look & style', true, null],
      ['Community & encouragement', false, SUBJECT_NOT_MEASURED], ['Function & movement', false, SUBJECT_NOT_MEASURED],
    ])
  })
})
