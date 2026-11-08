import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { marketConversationFixture, marketSubjectFixture, marketWeekFixture, fixtureId, fixtureSubjectId } from '@/lib/pages/v2/market-fixture'
import { conversationCrumbs, marketParams, subjectCrumbs, subjectMenu, subjectNavOf, weekCrumbs, LITTLE_TALK, type SubjectNavItem } from '@/lib/pages/v2/market'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import type { Crumb } from '@/lib/pages/crumbs'
import { ANCESTOR_MAX, BackLink, CrumbRow, Switcher } from './crumbs'
import { LevelBar } from './level-bar'
import { GoLink } from '@/components/v2/ui'

// THE PATH AND ITS SWITCHERS, THEN THE TITLE BLOCK (F3-Market-Nav, 17 Oct):
// what each level page's crumb row and title block print, and what a
// switcher lists, from the page fixtures and the loader's own builders.

describe('the crumb row', () => {
  const subject = marketSubjectFixture('fit')
  const conv = marketConversationFixture(1)
  const week = marketWeekFixture()

  it('a subject: "Market / {subject}" at 14px, Market an underlined link, the slash light, the subject ink at 500 with its 22px chevron, 44px to tap on a phone', () => {
    const html = render(<CrumbRow crumbs={subject.crumbs!} />)
    // The boards' crumbs: above the title, no rule under them (the audit
    // design, 7 Nov).
    expect(html).toMatch(/<div data-crumb-row="" class="pb-2 max-sm:hidden">/)
    expect(html).not.toMatch(/data-crumb-row="" class="[^"]*border-b/)
    expect(html).toMatch(/<nav aria-label="Breadcrumb"><ol class="[^"]*text-\[14px\][^"]*">/)
    expect(html).toMatch(/<a title="Market" class="[^"]*text-secondary-foreground underline decoration-control underline-offset-4[^"]*" href="\/dashboard\/market">Market<\/a>/)
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*text-\[17px\][^"]*font-light text-muted-foreground\/45">\/<\/span>/)
    expect(html).toMatch(/<span aria-current="page" class="[^"]*font-medium text-foreground">Fit &amp; comfort<\/span>/)
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-label="Switch to another subject"[^>]*class="[^"]*size-\[22px\][^"]*max-sm:before:-inset-\[12px\]/)
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

  it('on a phone the row becomes the way back: "{parent}", an underlined link with no chevron, 44px to tap', () => {
    const html = render(<BackLink crumbs={conv.crumbs!} />)
    expect(html).toMatch(/<a data-back-link="" class="[^"]*min-h-11[^"]*text-\[14px\] font-medium text-secondary-foreground underline[^"]*sm:hidden" href="\/dashboard\/market\/subjects\/subj-fit">Fit &amp; comfort<\/a>/)
    expect(html).not.toContain('<svg')
    expect(renderText(<BackLink crumbs={subject.crumbs!} />)).toBe('Market')
  })
})

describe('the title block', () => {
  const subject = marketSubjectFixture('fit')
  const conv = marketConversationFixture(1)

  it('the audit design\'s block: the h1, then the line under it, its tags and the figures row; no tile and no label', () => {
    const node = (
      <LevelBar
        crumbs={subject.crumbs!}
        level="subject"
        sub={<>A subject in <GoLink href="/dashboard/market">your market</GoLink></>}
        tags={<span data-tag="tint">Unusual this week</span>}
        stats={[{ term: 'Week', value: '5 to 11 October' }, { term: 'This week', value: <span data-copy="figure">32 videos</span> }]}
        controls={<span>switch</span>}
      />
    )
    const html = render(node)
    expect(html).toMatch(/^<header data-level-bar="subject" data-level-block="audit"/)
    expect(html).not.toContain('data-level-tile')
    expect(html).not.toContain('data-level-label')
    expect(html).not.toContain('data-bar-meta')
    expect(html).toMatch(/<h1 class="[^"]*text-\[28px\][^"]*font-bold[^"]*">Fit &amp; comfort<\/h1>/)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    const at = (s: string) => html.indexOf(s)
    expect(at('<h1')).toBeLessThan(at('data-level-sub'))
    expect(at('data-level-sub')).toBeLessThan(at('data-level-tags'))
    expect(at('data-level-tags')).toBeLessThan(at('data-stat-strip'))
    expect(html).toMatch(/<p data-level-sub="" class="[^"]*text-\[14\.5px\][^"]*text-secondary-foreground">A subject in <a class="[^"]*decoration-control[^"]*" href="\/dashboard\/market">your market<\/a><\/p>/)
    // The control at the right of the h1 and the line under it (the Voices
    // boards: the switch with its line stands beside both). The page's own
    // switcher rides after the h1 on a phone, always where it has siblings
    // (decision 15 keeps the menus): a menu button, never an arrow glued to
    // a link. The way back's chevron is gone (the review of Phases 4 and 5).
    expect(html).toMatch(/<\/h1><span class="relative shrink-0 sm:hidden"><button type="button" aria-haspopup="menu"[^>]*aria-label="Switch to another subject"[\s\S]*?<\/span><\/div><p data-level-sub=""[\s\S]*?<\/p><\/div><div data-level-controls="" class="shrink-0"><span>switch<\/span><\/div>/)
    expect(html).not.toContain('m15 18-6-6 6-6')
    expect(renderText(node)).toBe('Market / Fit & comfort Market Fit & comfort A subject in your market switch Unusual this week Week 5 to 11 October This week 32 videos')
    assertCopyContract(node)
    // Another page's level needs no tile in the audit block.
    expect(render(<LevelBar crumbs={subject.crumbs!} level="idea" sub="Post idea 1" />)).toContain('data-level-bar="idea"')
    // A conversation's title is the model's label, replayed from its slot.
    expect(render(<LevelBar crumbs={conv.crumbs!} level="conversation" />)).toMatch(/<h1[^>]*><span data-copy="subject" data-slot="pass_b_theme">How long a liner lasts<\/span><\/h1>/)
  })

  it('takes a closed set of levels (checked by tsc)', () => {
    const crumbs = conv.crumbs!
    // @ts-expect-error a level no page names is a compile error
    void (<LevelBar crumbs={crumbs} level="subjct" />)
    expect(render(<LevelBar crumbs={crumbs} level="idea" />)).toContain('data-level-bar="idea"')
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
    // Its label is the kit's sentence-case LBL, never caps; the menu is radius 8
    // on a 1px hairline (the audit design).
    expect(inside).toMatch(/<p aria-hidden="true" class="m-0 mx-2\.5 mb-1\.5 mt-2 text-\[13px\] font-semibold leading-\[1\.3\] text-secondary-foreground">Your subjects<\/p>/)
    expect(inside).not.toContain('uppercase')
    expect(html).toMatch(/role="menu" aria-label="Your subjects" class="[^"]*rounded-\[8px\] border border-border bg-card/)
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
