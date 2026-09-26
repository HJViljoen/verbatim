import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { AppealControl } from '@/app/dashboard/settings/record/appeal-control'
import { APPEAL_FILED } from '@/app/dashboard/settings/record/appeal-copy'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import type { ClientChange } from '@/lib/settings/change-log'

import { ChangeLogBlock } from './change-log'
import { changeLogFixture, gateSummaryFixture, rejectRowsFixture } from './fixture'
import { RejectLogBlock } from './rejects'
import { LOG_LINES_SHOWN, ShowAll } from './show-all'

// The long logs show their latest five, then "Show all N" (Heinrich's default,
// 26 Sep, R-b): a native disclosure (no client script, keyboard reachable),
// opened on paper by app/globals.css so every row prints.

/** The markup inside the disclosure, and before it. */
function split(markup: string): { before: string; inside: string } {
  const at = markup.indexOf('<details')
  if (at < 0) return { before: markup, inside: '' }
  return { before: markup.slice(0, at), inside: markup.slice(at) }
}

describe('ShowAll', () => {
  const items = Array.from({ length: 8 }, (_, i) => `line ${String.fromCharCode(97 + i)}`)
  const node = <ShowAll items={items} count={8} render={(s) => <p key={s}>{s}</p>} />

  it('draws the latest five, then the rest behind a native disclosure', () => {
    expect(LOG_LINES_SHOWN).toBe(5)
    const markup = render(node)
    const { before, inside } = split(markup)
    for (const s of items.slice(0, 5)) expect(before).toContain(s)
    for (const s of items.slice(5)) {
      expect(before).not.toContain(s)
      expect(inside).toContain(s)
    }
    // A summary, so the control is focusable and toggles on Enter or Space
    // with no script; marked for print.
    expect(inside).toMatch(/^<details data-print-all=""/)
    expect(inside).toContain('<summary')
    expect(renderText(node)).toContain('Show all 8')
    expect(markup).not.toContain('onClick')
  })

  it('draws no control where the log fits', () => {
    const markup = render(<ShowAll items={items.slice(0, 5)} count={5} render={(s) => <p key={s}>{s}</p>} />)
    expect(markup).not.toContain('<details')
    expect(markup).not.toContain('Show all')
  })

  it('is opened for print, every row with it (app/globals.css)', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
    const print = css.match(/@media print \{[^{}]*details\[data-print-all\][\s\S]*?\n\}/)?.[0] ?? ''
    expect(print).toContain('details[data-print-all]::details-content { content-visibility: visible; display: block; }')
    expect(print).toContain('details[data-print-all] > summary { display: none; }')
  })
})

describe('the reject log, the latest five', () => {
  // Twenty set-aside posts, the page's REJECT_ROWS: the fixture's three
  // cycled with their own ids (labelled stand-ins for a real sample).
  const rows = Array.from({ length: 20 }, (_, i) => ({ ...rejectRowsFixture()[i % 3], videoId: `v-${i + 1}`, captionExcerpt: `Set-aside post ${i + 1}` }))
  const node = (
    <RejectLogBlock
      rows={rows} summary={gateSummaryFixture()} unjudged={null} byTerm={[]} byPlatform={[]}
      control={(r) => <AppealControl filed={r.appealed ? APPEAL_FILED : null} />}
    />
  )

  it('shows the latest five and offers all twenty', () => {
    const { before, inside } = split(render(node))
    for (let i = 1; i <= 5; i++) expect(before).toContain(`Set-aside post ${i}”`)
    for (let i = 6; i <= 20; i++) expect(inside).toContain(`Set-aside post ${i}”`)
    expect(renderText(node)).toContain('Show all 20')
    assertCopyContract(node)
  })
})

describe('the change logs, the latest five lines', () => {
  const base = changeLogFixture()
  const one = base.recorded[0]
  const recorded: ClientChange[] = Array.from({ length: 9 }, (_, i) => ({ ...one, id: `r-${i}`, said: `Recorded change ${i + 1}` }))
  const prehistory: ClientChange[] = Array.from({ length: 7 }, (_, i) => ({ ...base.prehistory[0], id: `p-${i}`, said: `Worked out afterwards ${i + 1}` }))

  it('puts the recorded rows and the reconstructed rows each behind their own "Show all N"', () => {
    const node = <ChangeLogBlock log={{ ...base, recorded, prehistory }} now="2026-09-28T09:00:00.000Z" />
    const text = renderText(node)
    expect(text).toContain('Show all 9')
    expect(text).toContain('Show all 7')
    // Every row is in the markup: nothing is capped away.
    for (let i = 1; i <= 9; i++) expect(text).toContain(`Recorded change ${i}`)
    for (let i = 1; i <= 7; i++) expect(text).toContain(`Worked out afterwards ${i}`)
    // The cap's sentence went with the cap.
    expect(text).not.toContain('most recent of')
    const markup = render(node)
    expect(markup.match(/<details data-print-all=""/g)).toHaveLength(2)
    expect(split(markup).before).not.toContain('Recorded change 6')
    assertCopyContract(node)
  })

  it('counts entries, not lines, where repeated entries share a line', () => {
    // Six identical entries print as one line "×6" (sameRows), so the five
    // lines above the control hold ten entries; "all" is all fifteen.
    const twins: ClientChange[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ ...one, id: `t-${i}`, said: 'Precision measured by hand' })),
      ...Array.from({ length: 9 }, (_, i) => ({ ...one, id: `u-${i}`, said: `Recorded change ${i + 1}` })),
    ]
    const text = renderText(<ChangeLogBlock log={{ ...base, recorded: twins, prehistory: [] }} now="2026-09-28T09:00:00.000Z" />)
    expect(text).toContain('×6')
    expect(text).toContain('Show all 15')
  })
})
