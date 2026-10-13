import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { SUBJECTS_NOT_APPLIED } from '@/lib/subjects/moves'
import { SUBJECT_WRITE_REFUSED, SUBJECTS_HELD } from '@/lib/subjects/types'
import { yourSubjectsView, type YourSubjectsView } from '@/lib/settings/your-subjects'
import { fixtureSubjectId, subjectsFixtureRows } from './fixture'
import { YourSubjectsTab } from './index'

// Settings › Your subjects (T10c): the editor at its new address. What the tab
// PRINTS, for an owner and a member, with and without suggestions, at the
// ceiling, and where the subjects migration is not applied.

const view = (canEdit = true, rows = subjectsFixtureRows()): YourSubjectsView => yourSubjectsView(rows, canEdit)
const text = (v: YourSubjectsView | null) => renderText(<YourSubjectsTab view={v} />).replace(/\s+/g, ' ')

describe('the Your subjects tab', () => {
  it('keeps the copy contract in every state', () => {
    const followedOnly = subjectsFixtureRows().filter((r) => r.status === 'active')
    for (const v of [view(true), view(false), view(true, followedOnly), view(true, []), view(false, []), null]) {
      const markup = render(<YourSubjectsTab view={v} />)
      assertCopyContract(markup)
      expect(markup).not.toContain('—')
      expect(markup).not.toMatch(/border-l(-|\b)/)
    }
  })

  it('draws the editor for an owner: Add a subject, every row\'s menu, and Confirm on a suggestion', () => {
    const markup = render(<YourSubjectsTab view={view()} />)
    const t = text(view())
    const order = [
      'A subject is something your market talks about that you chose to follow.',
      'Subjects you follow', '6 subjects you follow, up to 10', 'Add a subject',
      'Subject What it covers', 'Durability Whether the bag lasts', 'Comfort How a bag carries',
      'Waiting for you', '2 suggestions. A suggestion is not counted until you confirm it.',
      'Community & purpose The people and the cause behind a brand. Suggested because you said this in your own posts. Confirm',
      'Travel size rules No description. Suggested because the category raised it in the videos we read. Confirm',
    ]
    const at = order.map((s) => t.indexOf(s))
    expect(at.filter((x) => x < 0), order.filter((_, i) => at[i] < 0).join(' | ')).toEqual([])
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // One "…" per subject, followed or waiting: Rename, Stop following (and Confirm).
    expect(markup.match(/aria-label="Rename or stop /g)).toHaveLength(8)
    expect(markup.match(/aria-label="Confirm /g)).toHaveLength(2)
    // A followed subject's name opens it on Market.
    expect(markup).toContain(`href="/dashboard/market?subject=${fixtureSubjectId(1)}"`)
  })

  it('draws no control for a member, and says who can change the set', () => {
    const t = text(view(false))
    for (const gone of ['Add a subject', 'Confirm', 'Rename']) expect(t, gone).not.toContain(gone)
    expect(render(<YourSubjectsTab view={view(false)} />)).not.toContain('Rename or stop')
    expect(t).toContain(SUBJECT_WRITE_REFUSED)
    expect(t).toContain('Durability')
  })

  // Decision 7 (13 Oct): Sealand's lock holds its subjects as it holds its
  // searches and its product list. The tab says so before anything is
  // submitted, and every control is drawn disabled.
  it('shows a locked tenant\'s owner the lock\'s line and every control disabled, before anything is submitted', () => {
    const v = yourSubjectsView(subjectsFixtureRows(), true, true)
    expect(v.locked).toBe(true)
    const markup = render(<YourSubjectsTab view={v} />)
    const t = text(v)
    expect(t).toContain(`A subject is something your market talks about that you chose to follow. ${SUBJECTS_HELD}`)
    expect(t).not.toContain('Renaming one starts a fresh subject')
    const buttons = markup.match(/<button[^>]*>/g) ?? []
    // Add a subject, eight row menus and two Confirms.
    expect(buttons.length).toBe(11)
    for (const b of buttons) expect(b, b).toContain('disabled=""')
    assertCopyContract(markup)
    expect(markup).not.toContain('—')
  })

  it('an unlocked owner, and the operator (never locked), get the controls as before', () => {
    const v = yourSubjectsView(subjectsFixtureRows(), true, false)
    expect(v.locked).toBe(false)
    const markup = render(<YourSubjectsTab view={v} />)
    expect(text(v)).not.toContain(SUBJECTS_HELD)
    expect((markup.match(/<button[^>]*>/g) ?? []).filter((b) => b.includes('disabled=""'))).toEqual([])
  })

  it('a member is never "locked": they read the lists and the role\'s sentence, not the lock\'s', () => {
    const v = yourSubjectsView(subjectsFixtureRows(), false, true)
    expect(v.locked).toBe(false)
    expect(text(v)).toContain(SUBJECT_WRITE_REFUSED)
    expect(text(v)).not.toContain(SUBJECTS_HELD)
  })

  it('the lock\'s line is calibrated copy: no em dash, no digit', () => {
    expect(SUBJECTS_HELD).not.toContain('—')
    expect(SUBJECTS_HELD).not.toMatch(/\d/)
  })

  it('stops offering a new subject at the ceiling', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...subjectsFixtureRows()[0], id: fixtureSubjectId(i + 1), name: `Subject ${i + 1}` }))
    expect(render(<YourSubjectsTab view={view(true, ten)} />)).toMatch(/<button[^>]*disabled=""[^>]*title="You follow 10 subjects\. Stop one before you add another\."/)
  })

  it('says so when nothing is followed, and draws no waiting card without a suggestion', () => {
    expect(text(view(true, []))).toContain('You follow no subject yet. Add one, or confirm a suggestion below.')
    expect(text(view(true, subjectsFixtureRows().filter((r) => r.status === 'active')))).not.toContain('Waiting for you')
  })

  it('says subjects are not switched on where the migration is not applied', () => {
    expect(text(null)).toBe(`Your subjects ${SUBJECTS_NOT_APPLIED}`)
  })

  it('is the route at /dashboard/settings/subjects, which no longer redirects', () => {
    const src = readFileSync(join(__dirname, '../../../../app/dashboard/settings/subjects/page.tsx'), 'utf8')
    expect(src).not.toContain('redirect(')
    expect(src).toContain('<SettingsFrame active="subjects"')
    expect(src).toContain('YourSubjectsTab')
    // The route asks the lock the way the actions do (decision 7).
    expect(src).toContain("assertTenantMay(session, clientId, 'tracking')")
  })
})
