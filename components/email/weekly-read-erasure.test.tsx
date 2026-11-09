import { describe, expect, it } from 'vitest'

import { renderWeeklyReadEmail } from '@/lib/email/weekly-read'
import { isWeeklyReadData, type WeeklyReadSnapshotData } from '@/lib/reports/weekly-read-build'
import { ANALYSIS_PROSE_TABLES, scrubStoredProse } from '@/lib/retention/analysis-prose'
import { fakeDb } from '@/lib/test/fake-db'
import { markupText, render } from '@/lib/test/render'
import { ossurRead, ossurSnapshot, ossurSubjects } from '@/lib/test/weekly-read-v3-fixture'
import { WeeklyReadPage } from './weekly-read'

// An erasure scrubs a frozen weekly read (scripts/erase-commenter.ts, step 7f,
// `report_snapshots`), and the issue still renders: the email as sent, the
// share page, the viewer and the paper all re-render from the snapshot, so
// they print the marker where the words were and everything else as before.
// Synthetic words, none from production.

const ERASED = 'my socket rubs raw after an hour every single day'
const OTHER = 'my socket rubs a little after a long day'
const MARKER = '[removed at the commenter'
const APP = 'https://app.verbatimintel.com'

/** Össur's 18 Oct issue with the erased person's words in its prose: the week
 *  in one line (and so the subject line), an implication, a subject's
 *  headline; and another person's near words in a second implication. */
function carrying(): WeeklyReadSnapshotData {
  const read = ossurRead({
    headline: `People said “${ERASED}” and asked what to change`,
    implications: [
      { body: `The socket decides the leg. One wearer wrote “${ERASED}” and others agreed.`, basedOn: ['o1'] },
      { body: `Insurance sits inside the buying question. Another wrote “${OTHER}”.`, basedOn: ['o2'] },
    ],
  })
  const subjects = ossurSubjects().map((s, i) => (i === 0 ? { ...s, headline: `Wearers say ${ERASED}` } : s))
  return ossurSnapshot({ read, subjects })
}

const emailOf = (data: WeeklyReadSnapshotData) => renderWeeklyReadEmail({ data, appUrl: APP, shareUrl: `${APP}/r/tok`, attached: false, medical: false })
const pageOf = (data: WeeklyReadSnapshotData, print = false) => render(<WeeklyReadPage data={data} appUrl={APP} fill={!print} print={print} />)
/** Every key and type, the strings left out: the shape a renderer reads. */
const shapeOf = (v: unknown): unknown =>
  typeof v === 'string' ? 'S' : Array.isArray(v) ? v.map(shapeOf) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x)])) : v

async function scrubbed(snap: WeeklyReadSnapshotData): Promise<WeeklyReadSnapshotData> {
  const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'report_snapshots')!
  const tables = { report_snapshots: [{ id: 's1', client_id: 'c1', title: 'This week in your market', data: snap, workings: null }] }
  const n = await scrubStoredProse(fakeDb(tables).client as never, spec, ['c1'], [ERASED], { apply: true })
  expect(n.rows).toBe(1)
  return tables.report_snapshots[0].data
}

describe('a scrubbed weekly-read snapshot still renders, without the words', () => {
  it('before the scrub the issue prints the erased words: the gap', () => {
    const snap = carrying()
    expect(emailOf(snap).subject).toContain(ERASED)
    expect(markupText(emailOf(snap).html)).toContain(ERASED)
    expect(markupText(pageOf(snap))).toContain(ERASED)
  })

  it('after it, the email, the full read and the paper render, with the marker in the words\' place and the shape unchanged', async () => {
    const before = carrying()
    const after = await scrubbed(carrying())
    expect(isWeeklyReadData(after)).toBe(true)
    expect(after.version).toBe(before.version)
    expect(shapeOf(after)).toEqual(shapeOf(before))

    const email = emailOf(after)
    expect(email.subject).not.toContain(ERASED)
    expect(email.subject).toContain(MARKER)
    expect(markupText(email.html)).not.toContain(ERASED)
    expect(markupText(email.html)).toContain(MARKER)
    expect(email.text).not.toContain(ERASED)

    for (const html of [pageOf(after), pageOf(after, true)]) {
      const text = markupText(html)
      expect(text).not.toContain(ERASED)
      expect(text).toContain(MARKER)
      // Another person's near words are theirs, and stay.
      expect(text).toContain(OTHER)
    }
  })

  it('changes only the strings that carried the words', async () => {
    const before = carrying()
    const after = await scrubbed(carrying())
    const strings = (v: unknown, out: string[] = []): string[] => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
      else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
      return out
    }
    const was = strings(before)
    const now = strings(after)
    const changed = was.filter((s, i) => s !== now[i])
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.every((s) => s.includes(ERASED))).toBe(true)
  })
})
