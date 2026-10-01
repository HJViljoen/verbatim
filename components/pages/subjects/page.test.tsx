import { describe, expect, it } from 'vitest'
import { SEALAND_CLIENT_ID } from '@/lib/config'
import type { SubjectsData } from '@/lib/pages/subjects'
import { subjectsView, type SubjectReadLine } from '@/lib/pages/subjects-view'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { marketSubjectsFixture, waterproofingFixture } from './fixture'
import { SUBJECTS_FIRST_RUN, SubjectsPage } from './page'

// The Subjects page, built to Page-Subjects.dc.html (pages rebuild, 1 Oct):
// the list with its editor, the open subject (standing, the read's sentence,
// the conversations inside it, one quote), what people say about it and the
// questions asked on it. Render tier: what it PRINTS.

const READ: SubjectReadLine = {
  month: '2026-09-01',
  sentence: 'Buyers ask for specific bags and replacements, naming size, colour, condition and office use before they buy.',
  contents: ['Searching for a specific bag', 'Looking for a better replacement bag'],
  quote: { ref: 'e:1', text: 'I think it’s time to buy the bluey purple smaller backpack! Great color and easier for me to fly with.', date: '2026-09-21', platform: 'youtube', thread: null },
}

const full = (): SubjectsData => {
  const data = marketSubjectsFixture()
  return { ...data, selected: { ...data.selected!, unanswered: waterproofingFixture().selected!.unanswered } }
}
const owner = (data: SubjectsData): SubjectsData => ({ ...data, list: { ...data.list, canEdit: true } })
const member = (data: SubjectsData): SubjectsData => ({ ...data, list: { ...data.list, canEdit: false } })
const page = (data: SubjectsData, read: SubjectReadLine | null = READ) =>
  <SubjectsPage view={subjectsView(data, read, SEALAND_CLIENT_ID)} />
const text = (data: SubjectsData, read: SubjectReadLine | null = READ) => renderText(page(data, read)).replace(/\s+/g, ' ')

describe('the Subjects page', () => {
  it('keeps the copy contract, with and without the week read, for an owner and a member', () => {
    for (const data of [owner(full()), member(full()), owner(marketSubjectsFixture())]) {
      for (const read of [READ, null]) assertCopyContract(render(page(data, read)))
    }
  })

  it('prints the design\'s blocks in its order', () => {
    const t = text(owner(full()))
    const order = [
      'Your subjects', 'Looks & style', 'Add a subject', 'Edit', '16%',
      'of the 654 videos in your market in September, the biggest subject',
      'Buyers ask for specific bags', 'Conversations inside it', 'Searching for a specific bag',
      '“I think it’s time to buy the bluey purple', 'YouTube · 21 Sep',
      'What people say about it', 'Share of its 103 videos in September', 'Praised a bag', '90%',
      'Questions people ask on it', '16 of its videos carry a question. Asked most:', 'Demand for real waterproofing 3 videos',
    ]
    const at = order.map((s) => t.indexOf(s))
    expect(at.filter((x) => x < 0), order.filter((_, i) => at[i] < 0).join(' | ')).toEqual([])
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('prints no voices, no export, no context line and nothing about how it is made', () => {
    const t = text(owner(full()))
    for (const gone of ['Voices', 'Export', 'How to read', 'as at', 'update', 'Month by month', 'Your own posts', 'Say vs hear', 'Where we found them', 'provisional', 're-described']) {
      expect(t, gone).not.toContain(gone)
    }
  })

  it('draws no left stripe, no em dash and no highlight', () => {
    const html = render(page(owner(full())))
    expect(html).not.toMatch(/border-l(?:-|\b)|border-left/)
    expect(renderText(page(owner(full())))).not.toContain('—')
    expect(html).not.toMatch(/<mark\b/)
    expect(html).not.toMatch(/gradient/)
  })

  it('offers the editor to an owner or admin, and draws no control a member may not use', () => {
    const o = render(page(owner(full())))
    expect(o).toContain('aria-label="Rename or stop Looks &amp; style"')
    expect(o).toContain('Add a subject')
    expect(o).toContain('>Edit<')
    const m = render(page(member(full())))
    expect(m).not.toContain('Rename or stop')
    expect(m).not.toContain('Add a subject')
    expect(m).not.toContain('>Edit<')
  })

  it('links every subject with a pane, and marks the open one', () => {
    const html = render(page(owner(full())))
    expect(html).toContain('href="/dashboard/subjects?item=s-looks"')
    expect(html).toContain('aria-current="true"')
  })

  it('leaves the read\'s blocks out where there is no read for the month (rule 2)', () => {
    const t = text(owner(full()), null)
    expect(t).toContain('16%')
    for (const gone of ['Conversations inside it', 'Buyers ask', 'YouTube · 21 Sep']) expect(t).not.toContain(gone)
  })

  it('a subject that is not ready keeps its name and what the read says, and prints no figure (T0a, U6)', () => {
    for (const calibration of ['provisional', 'failed'] as const) {
      const data = owner(full())
      const t = text({ ...data, selected: { ...data.selected!, calibration } })
      expect(t).toContain('Looks & style')
      expect(t).toContain('Buyers ask for specific bags')
      for (const gone of ['16%', '654', 'What people say about it', 'Questions people ask on it', 'Praised a bag']) expect(t, `${calibration} ${gone}`).not.toContain(gone)
    }
  })

  it('a workspace with nothing read yet gets one neutral line (U2)', () => {
    const t = renderText(<SubjectsPage view={null} />)
    expect(t).toContain(SUBJECTS_FIRST_RUN)
  })
})
