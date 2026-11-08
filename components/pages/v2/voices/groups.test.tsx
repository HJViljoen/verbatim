import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { ossurVoicesFixture, VOICES_FIXTURES } from '@/lib/pages/v2/voices-fixture'
import { FAILED_EXPLAINED } from '@/lib/subjects/calibration-state'
import { FAILED_EXPLAINED_EACH } from '@/components/v2'
import { GroupCard, GroupGrid, MixCard, WhoCard } from './groups'
import { VoicesPage } from './index'

describe('Who is in your market and the group cards (decision 2)', () => {
  const d = ossurVoicesFixture()

  it('draws each group\'s videos this month as its own bar, never a share and never an "Other"', () => {
    const node = <WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} />
    const text = renderText(node)
    // The audit design (7 Nov): a bare count, its base the figures row's
    // (decision 2), and the bars against the largest (decision 5).
    expect(text).toContain('New amputees, first year 96 videos')
    expect(text).not.toMatch(/of 487/)
    const m = render(node)
    expect(m).toContain('style="width:100%"')
    expect(m).toContain('aria-label="New amputees, first year: 96 videos"')
    expect(text).toContain('the counts overlap')
    expect(text).not.toMatch(/%|Other/)
    assertCopyContract(node)
  })

  it('is the target an old Conversation link\'s #cast lands on', () => {
    expect(render(<WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} />)).toMatch(/<section id="cast" /)
  })

  // G3-Voices (17 Oct): each row opens the group's own page. The audit
  // design (7 Nov): the name is the row's link, with no chevron.
  it('each row opens the group\'s page by its name, with no chevron', () => {
    const m = render(<WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} />)
    expect(m).toContain('href="/dashboard/voices/groups/caregivers"')
    expect(m.match(/href="\/dashboard\/voices\/groups\//g)).toHaveLength(d.groups.cards.length)
    expect(m).not.toContain('data-row-chevron')
    expect(m).not.toContain('scroll=')
  })

  it('says why no group shows', () => {
    const node = <WhoCard groups={{ state: 'not_run', profileDate: null, cards: [], empty: 'Reading who is talking is not switched on for this workspace yet.' }} videos={487} monthWords="September" />
    expect(renderText(node)).toContain('not switched on')
    assertCopyContract(node)
  })

  it('a card: the count of the market, what they talk about, wants and stops, where; no change and no quote', () => {
    const node = <GroupCard card={d.groups.cards[3]} n={d.videos} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('Caregivers and family')
    expect(text).toContain('45 videos in September')
    expect(text).toContain('What they talk about, of their 45 videos Fit & comfort 17 Cost & access 14')
    expect(text).toContain('Wants Clear answers they can act on for someone else: what to buy, what’s covered, what recovery looks like.')
    expect(text).toContain('Open Caregivers and family')
    expect(render(node)).toContain('href="/dashboard/voices/groups/caregivers"')
    // Wants and stops are a list of two, printed whole, as the board draws
    // them (the audit design, 7 Nov).
    expect(render(node)).toMatch(/<dl [^>]*><div><dt [^>]*>Wants<\/dt><dd /)
    expect(render(node)).not.toContain('line-clamp')
    // Where they comment: a figure a platform.
    expect(text).toMatch(/Where they comment( [A-Za-z]+ \d+)+ Open Caregivers/)
    expect(text).not.toMatch(/%|no clear change|since September/)
    expect(render(node)).not.toContain('data-copy="quote"')
    assertCopyContract(node)
  })

  // The parity pass (13 Oct): a thin card keeps the board's card. Its level
  // row, its "What they talk about" box and its "Where" strip stay, each
  // carrying the gap in its own frame.
  it('a card with no video this month keeps the board\'s card: the level at 0, the box and the strip', () => {
    const node = <GroupCard card={{ ...d.groups.cards[0], videos: 0, subjects: [], platforms: [] }} n={487} monthWords="September" />
    const text = renderText(node)
    expect(text).toContain('0 videos in September')
    expect(text).toContain('What they talk about None of their comments in September.')
    expect(text).toContain('Where they comment None in September.')
    expect(text).not.toContain('of their 0')
    assertCopyContract(node)
  })

  it('a card whose videos carry no subject keeps its box and says so in it', () => {
    const node = <GroupCard card={{ ...d.groups.cards[0], subjects: [], subjectsNone: [] }} n={487} monthWords="September" />
    expect(renderText(node)).toContain('What they talk about, of their 96 videos No subject read in their videos yet.')
    assertCopyContract(node)
  })

  // Ruling U6 (13 Oct): Össur's six subjects are all provisional, and one of
  // them measured 9% precision, so a count on any of them is wrong, not just
  // unlabelled. The box keeps its frame and its height and says so once.
  it('U6, all provisional: the box keeps its frame, names every subject not measured yet in one line and prints no subject count', () => {
    const p = ossurVoicesFixture({}, 'provisional')
    const node = <GroupCard card={p.groups.cards.find((c) => c.key === 'caregivers')!} n={p.videos} monthWords={p.monthWords} />
    const text = renderText(node)
    // 14 Oct: a tracked subject is named, never folded into a count.
    expect(text).toContain('What they talk about Not measured yet: Choosing the right device, Community & encouragement, Cost & access, Fit & comfort, Function & movement, Look & style')
    expect(text).not.toContain('of their 45')
    expect(render(node)).not.toMatch(/<span data-copy="figure"[^>]*>\d+<\/span> more/)
    // The line is said in the dashed box, with no empty tracks (decision 4).
    expect(render(node).match(/data-empty-box=""/g)).toHaveLength(1)
    expect(render(node)).not.toContain('data-empty-track')
    assertCopyContract(node)
  })

  it('U6, mixed: the ready rows with their counts first, then the subjects not measured yet, named', () => {
    const p = ossurVoicesFixture({}, 'mixed')
    const node = <GroupCard card={p.groups.cards.find((c) => c.key === 'caregivers')!} n={p.videos} monthWords={p.monthWords} />
    const text = renderText(node)
    // A ready subject on none of their videos is named, never a row at 0
    // among what they talk about (5 Nov; never hidden, 14 Oct).
    expect(text).toContain('What they talk about, of their 45 videos Cost & access 14 In none of their videos: Function & movement Not measured yet: Choosing the right device, Community & encouragement, Fit & comfort, Look & style')
    // Named, never counted: Fit & comfort (17 of their videos) prints no figure.
    expect(text).not.toMatch(/Fit & comfort \d/)
    assertCopyContract(node)
  })

  it('the section head says once that no group is compared (decision 2), never a direction, and no card says it again', () => {
    expect(renderText(<GroupCard card={d.groups.cards[0]} n={d.videos} monthWords={d.monthWords} />)).not.toMatch(/compared/i)
    const text = renderText(<GroupGrid data={d} />)
    expect(text).toMatch(/^Each group in September Not compared with August yet /)
    expect(text.match(/compared/gi)).toHaveLength(1)
  })

  it('the grid: every card, then the mix card; nothing opens in place (17 Oct)', () => {
    const m = render(<GroupGrid data={d} />)
    expect(m.match(/aria-label="The groups"/g)).toHaveLength(1)
    expect(m).not.toContain('id="group-panel"')
    expect(m).not.toContain('Close ↑')
    expect(m).not.toContain('--panel-o-')
    expect(m.match(/data-group="/g)).toHaveLength(d.groups.cards.length)
    assertCopyContract(<GroupGrid data={d} />)
  })
})

describe('the mix card (the board\'s sixth; decision 2)', () => {
  const d = ossurVoicesFixture()

  it('keeps its place, named for what it shows: the dashed box in its chart\'s place says why (decision 4)', () => {
    const node = <MixCard cards={d.groups.cards} n={d.videos} month={d.month} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('The mix in September August isn’t read for these groups')
    expect(text).toContain('Each update describes the groups afresh, so these groups have no earlier month to set this one beside.')
    // No word that claims a comparison (the fresh check, 13 Oct).
    expect(text).not.toMatch(/How the mix changed|against|changed|%|no clear change|moved/)
    const m = render(node)
    // No ghost chart: the board's dashed box, its title and its sentence.
    expect(m.match(/data-empty-box=""/g)).toHaveLength(1)
    expect(m).not.toContain('<svg')
    expect(m).not.toContain('<circle')
    assertCopyContract(node)
  })

  it('sits in the grid after the group cards', () => {
    const m = render(<GroupGrid data={d} />)
    expect(m.indexOf('data-mix=""')).toBeGreaterThan(m.lastIndexOf('data-group='))
    expect(m.match(/data-mix=""/g)).toHaveLength(1)
  })
})

// EVERY READY SUBJECT AT 0 IS STILL A READING (5 Nov review): the box names
// them as on none of their videos, never "No subject read in their videos
// yet", and, with a subject not measured too, names both, never the
// not-measured box alone.
describe('a group whose every ready subject is on none of their videos', () => {
  const p = ossurVoicesFixture()
  const c = p.groups.cards.find((x) => x.videos > 0)!
  const allZero = { ...c, subjects: [], subjectsNone: ['Comfort', 'Price'], subjectsPending: 0, subjectsNotMeasured: [] }

  it('names them on none of their videos, under the box\'s base', () => {
    const text = renderText(<GroupCard card={allZero} n={p.videos} monthWords={p.monthWords} />)
    expect(text).toContain(`What they talk about, of their ${c.videos} videos In none of their videos: Comfort, Price`)
    expect(text).not.toContain('No subject read in their videos yet')
    assertCopyContract(<GroupCard card={allZero} n={p.videos} monthWords={p.monthWords} />)
  })

  it('with a subject not measured too: both named, the ready ones first', () => {
    const withPending = { ...allZero, subjectsPending: 1, subjectsNotMeasured: [{ id: 's-x', label: 'Fit' }] }
    const node = <GroupCard card={withPending} n={p.videos} monthWords={p.monthWords} />
    const text = renderText(node)
    expect(text).toContain(`What they talk about, of their ${c.videos} videos In none of their videos: Comfort, Price Not measured yet: Fit`)
    expect(render(node)).not.toMatch(/border-dashed/)
    assertCopyContract(node)
  })
})

// A TRACKED SUBJECT IS NEVER HIDDEN (Heinrich, 14 Oct): Function & movement
// ready, Look & style ready and thin, Cost & access's check open, Fit &
// comfort being re-described.
describe('a tracked subject is never hidden (14 Oct)', () => {
  const d = VOICES_FIXTURES['ossur-tracked']()
  const card = (key: string) => d.groups.cards.find((c) => c.key === key)!

  it('a group\'s box: the ready rows, a thin one\'s small count, the one on none of their videos named, then ONE short line naming the open and the failed subject (the lead\'s ruling, 14 Oct)', () => {
    const node = <GroupCard card={card('caregivers')} n={d.videos} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('What they talk about, of their 45 videos Look & style 2 In none of their videos: Function & movement Not measured yet: Cost & access, Fit & comfort Wants ')
    // The reason is said once on the page, never on a card.
    expect(text).not.toContain(FAILED_EXPLAINED)
    const html = render(node)
    const line = html.slice(html.indexOf('data-subjects-not-measured'), html.indexOf('</p>', html.indexOf('data-subjects-not-measured')))
    expect(line).not.toMatch(/data-copy=/)
    assertCopyContract(node)
  })

  it('a box with no ready subject names those not measured yet, the failed one among them, where "Not measured yet" stood alone', () => {
    const only = { ...card('caregivers'), subjects: [], subjectsNone: [], subjectsPending: 1, subjectsNotMeasured: [{ id: 's-fit', label: 'Fit & comfort' }] }
    const node = <GroupCard card={only} n={d.videos} monthWords={d.monthWords} />
    const text = renderText(node)
    expect(text).toContain('What they talk about Not measured yet: Fit & comfort')
    expect(text).not.toContain(FAILED_EXPLAINED)
    assertCopyContract(node)
  })

  it('the page says why a failed subject shows no figure ONCE, in the foot of "Who\'s in your market", one line a subject', () => {
    const node = <WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} failed={d.subjectsFailed} />
    const text = renderText(node)
    expect(text.endsWith(`Clinicians and prosthetists 29 videos Fit & comfort. ${FAILED_EXPLAINED}`)).toBe(true)
    // One colon, the sentence's own: never "Fit & comfort: Being re-described:".
    expect(text).not.toContain('Fit & comfort: Being')
    expect(render(node).match(/data-subject-failed/g)).toHaveLength(1)
    assertCopyContract(node)
    // None where no subject failed.
    expect(render(<WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} />)).not.toContain('data-subjects-failed')
  })

  it('two or more being re-described: named together, and why said once for all of them (the real-data pass, 8 Nov)', () => {
    const two = [{ id: 's-fit', label: 'Fit & comfort' }, { id: 's-cost', label: 'Cost & access' }, { id: 's-look', label: 'Look & style' }]
    const node = <WhoCard groups={d.groups} videos={d.videos} monthWords={d.monthWords} failed={two} />
    const text = renderText(node)
    expect(text.endsWith(`Clinicians and prosthetists 29 videos Fit & comfort, Cost & access and Look & style. ${FAILED_EXPLAINED_EACH}`)).toBe(true)
    expect(text).not.toContain(FAILED_EXPLAINED)
    expect(text.split('Being re-described').length - 1).toBe(1)
    expect(render(node).match(/data-subject-failed/g)).toHaveLength(1)
    assertCopyContract(node)
  })

  it('the whole page prints FAILED_EXPLAINED once, however many cards name the subject', () => {
    const html = render(<VoicesPage data={d} />)
    expect(html.split(FAILED_EXPLAINED).length - 1).toBe(1)
    const counts = d.groups.cards.map((c) => c.subjectsNotMeasured?.length ?? 0)
    expect(counts.every((n) => n === 2)).toBe(true)
  })
})
