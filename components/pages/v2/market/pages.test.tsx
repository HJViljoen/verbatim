import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { marketConversationFixture, marketSubjectFixture } from '@/lib/pages/v2/market-fixture'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import type { MarketData } from '@/lib/pages/v2/market'
import { ConversationPanel, SubjectPanelView, SUBJECT_NONE_THIS_WEEK } from './panel'

// MARKET'S LEVEL PAGES' BODIES (17 Oct): a conversation and a tracked
// subject, each its own page, from the page fixtures, against the copy
// contract and the rules the 14 Oct panels set (U6: no block rests on a
// membership that has not passed its check).

const SUBJECT = marketSubjectFixture('cost', { detail: null, subjectReads: 'none' })

describe('ConversationPanel (a conversation\'s page body)', () => {
  const OPEN = marketConversationFixture(3)
  const panel = OPEN.convPage!.panel
  it('the conversation in full: its tags, its stats with their n, our read, its months, who, what, where', () => {
    const text = renderText(<ConversationPanel panel={panel} data={OPEN} />)
    expect(text).toMatch(/^Cost & access Unusual this week Insurance refusals for powered knees 19 of 226 category videos this week 31 of 300 category videos in October so far 19 of 780 category videos in September 39 of 1,906 videos in July to September, every audience together, your own posts included Our read People describe appeals/)
    expect(text).toContain('Month by month · share of the category’s videos')
    expect(text).toContain('October so far · 31 of 300')
    expect(text).toContain('What people did · of 31 in October so far Complained about something 14')
    expect(text).toContain('Who’s saying it Long-time users upgrading Caregivers and family Each opens in Voices')
    expect(text).toContain('Where TikTok 12')
    expect(text).toContain('Ask the Agent about this')
    assertCopyContract(<ConversationPanel panel={panel} data={OPEN} />)
  })

  it('three quotes at level 2, as quote nodes, with who the video is filed under', () => {
    const html = render(<ConversationPanel panel={panel} data={OPEN} />)
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(renderText(<ConversationPanel panel={panel} data={OPEN} />)).toContain('YouTube · 3 Oct Ottobock')
  })

  it('our read is stored prose with its slot', () => {
    expect(render(<ConversationPanel panel={panel} data={OPEN} />)).toContain('data-copy="stored" data-slot="week_read"')
    const desc = { ...panel, ourRead: { slot: 'pass_b_theme' as const, lines: [{ body: 'A 16-inch liner.', figures: {} }] } }
    expect(copyViolations(<ConversationPanel panel={desc} data={OPEN} />)).toEqual([])
  })

})

describe('SubjectPanelView', () => {
  it('a subject being re-described says why and lists the conversations inside it, as an open one does (14 Oct)', () => {
    const data = marketSubjectFixture('community', { subjects: 'tracked', detail: null, subjectReads: 'none' })
    const text = renderText(<SubjectPanelView panel={data.subjectPage!.panel} data={data} />)
    // Its reason is said once a page: on its own page, here (17 Oct).
    expect(text).toContain(`Community & encouragement ${FAILED_EXPLAINED}`)
    expect(text.split(FAILED_EXPLAINED).length - 1).toBe(1)
    expect(text).toContain('Conversations inside it · this week, and October so far Running-blade stories 17 26')
    expect(text).not.toMatch(/\d+ of \d+ videos in your market/)
    assertCopyContract(<SubjectPanelView panel={data.subjectPage!.panel} data={data} />)
  })

  it('a subject whose check is open says why and lists the conversations inside it', () => {
    const data = marketSubjectFixture('cost', { flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true, detail: null, subjectReads: 'none' })
    const text = renderText(<SubjectPanelView panel={data.subjectPage!.panel} data={data} />)
    expect(text).toContain(`Cost & access ${SUBJECT_NOT_MEASURED}.`)
    expect(text).toContain('Conversations inside it · this week, and October so far Insurance refusals for powered knees 19 31 Paying out of pocket 15 22 Medical aid and liners 9 12')
    assertCopyContract(<SubjectPanelView panel={data.subjectPage!.panel} data={data} />)
  })

  it('the subject in full: its level, against last month, our read, its months and every conversation inside it', () => {
    const p = SUBJECT.subjectPage!.panel
    const text = renderText(<SubjectPanelView panel={p} data={SUBJECT} />)
    expect(text).toMatch(/^Subject Cost & access 70 of 318 videos in your market, October so far 22% of the market’s videos ▲ 7 pts Our read People ask how to get a knee paid for/)
    expect(text).toContain('Conversations inside it · this week, and October so far Insurance refusals for powered knees Unusual this week 19 31')
    assertCopyContract(<SubjectPanelView panel={p} data={SUBJECT} />)
  })
})

// A TRACKED SUBJECT'S PANEL SAYS SOMETHING (Heinrich, 14 Oct: "What's the
// point of tracking a subject if we just have nothing there"). A READY
// subject's panel has the conversation panel's anatomy over its own videos:
// our read (its own written read), month by month, who it is about, what
// people did, who is saying it, where, three quotes, Ask the Agent and the
// conversations inside it. A subject whose check is open or failed keeps the
// panel it had: no block rests on its membership (ruling U6).
describe('SubjectPanelView: a ready subject in full (14 Oct)', () => {
  const RICH = marketSubjectFixture('cost', { detail: 'rich', subjectReads: 'v2' })
  const RICH_MONTH = marketSubjectFixture('cost', { detail: 'rich', period: 'month', subjectReads: 'v2' })
  const THIN = marketSubjectFixture('look', { subjects: 'tracked', detail: 'thin', subjectReads: 'v2' })
  const panelOf = (d: MarketData) => <SubjectPanelView panel={d.subjectPage!.panel} data={d} />

  it('this week: the week beside the month, its own read, the four blocks, three quotes, then the conversations inside it', () => {
    const text = renderText(panelOf(RICH))
    // The week's videos stand beside the month's level (decision 1).
    expect(text).toMatch(/^Subject Cost & access 40 of 241 videos in your market this week 70 of 318 videos in your market, October so far 22% of the market’s videos ▲ 7 pts The parts below read the videos where a comment was about it: 40 this week, and 64 of these 70 in October so far\. Our read People describe insurance refusals/)
    // Our read: what people said, then what it means for the company.
    expect(text).toContain('Paying out of pocket runs through all of it.')
    expect(text).toContain('fundraisers when the funding does not come. What it means for Össur The refusals people describe are for powered knees, the kind of knee Össur sells.')
    expect(text).toContain('Who it’s about · this week Össur 6 · Ottobock 3 · others 31 October so far Össur 7 · Ottobock 6 · others 51')
    expect(text).toContain('What people did · of 64 in October so far Complained about something 44 Asked a question 20')
    expect(text).toContain('Who’s saying it Long-time users upgrading Caregivers and family Each opens in Voices')
    expect(text).toContain('Where This week October so far TikTok 20 32 of 64 Instagram 10 16 of 64 YouTube 10 16 of 64')
    expect(text).toMatch(/In their words · 3 of the comments “The cost of a running blade/)
    expect(text).toMatch(/Conversations inside it · this week, and October so far Insurance refusals for powered knees Unusual this week 19 31 .*Ask the Agent about this/)
    const html = render(panelOf(RICH))
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(html).toContain('href="/dashboard/voices?group=long-time-users#group-panel"')
    // The quotes and the blocks come before the conversations inside it.
    expect(html.indexOf('In their words')).toBeLessThan(html.indexOf('Conversations inside it'))
    assertCopyContract(panelOf(RICH))
  })

  it('this month: the month alone, its one base named under the stats, where by platform as bars', () => {
    const text = renderText(panelOf(RICH_MONTH))
    expect(text).toMatch(/^Subject Cost & access 70 of 318 videos in your market, October so far 22% of the market’s videos ▲ 7 pts The parts below read the 64 of these 70 videos where a comment was about it\. Our read/)
    // Every block reads that one base: none of them counts over the level's 70.
    expect(text).toContain('What people did · of 64 in October so far')
    expect(text).not.toContain('this week')
    expect(text).toContain('Who it’s about Össur 7 · Ottobock 6 · others 51 What people did · of 64 in October so far')
    expect(text).toContain('Where TikTok 32 Instagram 16 YouTube 16')
    assertCopyContract(panelOf(RICH_MONTH))
  })

  it('ready and thin (one video): a small count as a small count, and code\'s one line as its read', () => {
    const text = renderText(panelOf(THIN))
    expect(text).toMatch(/^Subject Look & style 1 of 241 videos in your market this week 4 of 318 videos in your market, October so far 1% of the market’s videos too few to compare The parts below read the videos where a comment was about it: 1 this week, and 1 of these 4 in October so far\. Our read In October so far, talk about Look & style sat in “Covers and finishes” and “Showing it or hiding it”\./)
    expect(text).toContain('What people did · of 1 in October so far Praised it 1')
    expect(text).toContain('Where This week October so far Instagram 1 1 of 1')
    expect(text).toContain('In their words · 1 of the comments')
    // No group's talk is in it: the block is left out, as the conversation panel's is.
    expect(text).not.toContain('Who’s saying it')
    assertCopyContract(panelOf(THIN))
  })


  it('a tenant whose subject reads are switched off: the week read\'s sentence alone under Our read, the blocks as they are', () => {
    const d = marketSubjectFixture('cost', { detail: 'rich', subjectReadsOff: true })
    const text = renderText(panelOf(d))
    expect(text).toContain('Our read People ask how to get a knee paid for, and what to do when a claim is refused. Month by month')
    expect(text).not.toMatch(/People describe insurance refusals|What it means for/)
    expect(text).toContain('What people did · of 64 in October so far')
    assertCopyContract(panelOf(d))
  })

  it('no base line where the blocks read every video the level counts', () => {
    const d = marketSubjectFixture('cost', { detail: 'rich', period: 'month', subjectReads: 'v2' })
    const panel = { ...d.subjectPage!.panel, level: { ...d.subjectPage!.panel.level!, k: 64 } }
    expect(render(<SubjectPanelView panel={panel} data={d} />)).not.toContain('data-subject-base')
  })

  it('this week with none of its videos: who it is about and where keep their frame, say so in one line, and give the month', () => {
    const d = marketSubjectFixture('cost', { detail: 'rich', subjectReads: 'v2' })
    const detail = d.subjectPage!.panel.detail!
    const quiet = {
      ...d.subjectPage!.panel,
      detail: { ...detail, week: { k: 0, n: 241 }, cited: { month: 64, week: 0 }, who: { parts: [], n: 0, month: detail.who!.month }, platforms: { rows: [], n: 0, month: detail.platforms!.month } },
    }
    const text = renderText(<SubjectPanelView panel={quiet} data={d} />)
    expect(text).toContain(`Who it’s about · this week ${SUBJECT_NONE_THIS_WEEK} October so far Össur 7 · Ottobock 6 · others 51`)
    expect(text).toContain(`Where This week October so far TikTok 0 32 of 64 Instagram 0 16 of 64 YouTube 0 16 of 64 ${SUBJECT_NONE_THIS_WEEK}`)
    assertCopyContract(<SubjectPanelView panel={quiet} data={d} />)
  })

  it('brands not counted yet: who it is about says so, and nothing else changes', () => {
    const d = marketSubjectFixture('cost', { detail: 'rich', period: 'month', subjectReads: 'v2' })
    const panel = { ...d.subjectPage!.panel, detail: { ...d.subjectPage!.panel.detail!, brands: 'not_counted' as const } }
    const text = renderText(<SubjectPanelView panel={panel} data={d} />)
    expect(text).toContain('Who it’s about Brands are not counted for this workspace yet.')
    expect(text).not.toContain('Össur 7')
    assertCopyContract(<SubjectPanelView panel={panel} data={d} />)
  })

  it('a subject whose check is open keeps its panel: no read of its own, no block, no quote (U6)', () => {
    const d = marketSubjectFixture('cost', { flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true, detail: 'rich', subjectReads: 'v2' })
    expect(d.subjectPage?.panel).toMatchObject({ state: 'provisional', detail: null, read: null })
    const text = renderText(panelOf(d))
    expect(text).toContain(`Cost & access ${SUBJECT_NOT_MEASURED}.`)
    expect(text).not.toMatch(/Who it’s about|What people did|Who’s saying it|Where|In their words|People describe insurance refusals|videos in your market/)
    expect(text).toContain('Conversations inside it · this week, and October so far Insurance refusals for powered knees 19 31')
    expect(render(panelOf(d))).not.toContain('data-copy="quote"')
    assertCopyContract(panelOf(d))
  })

  it('a subject being re-described keeps its panel: no read of its own, no block, no quote (U6)', () => {
    const d = marketSubjectFixture('community', { subjects: 'tracked', detail: 'rich', subjectReads: 'v2' })
    expect(d.subjectPage?.panel).toMatchObject({ state: 'failed', detail: null, read: null })
    const text = renderText(panelOf(d))
    expect(text).toContain(`Community & encouragement ${FAILED_EXPLAINED} Conversations inside it`)
    expect(text).not.toMatch(/Who it’s about|What people did|Who’s saying it|In their words|Our read|videos in your market/)
    assertCopyContract(panelOf(d))
  })

})
