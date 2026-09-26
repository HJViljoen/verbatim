import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { appBaseUrl } from '@/lib/site'
import type { MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { monthlySections } from '@/components/blocks/monthly'
import { staleMonthlySnapshot } from '@/lib/reports/monthly-build'
import { Slide } from './slide'
import { STALE_ARTEFACT_LINE } from '@/lib/reports/stale'
import { withCurrentWords } from '@/lib/reports/legacy-words'

// "September in your market" on paper (market-first WP2.1).
//
// ONE SECTION PER SLIDE, the way every other deck in this codebase paginates
// (`report-deck.tsx`, `document-deck.tsx`, `weekly-deck.tsx`). A slide is a
// fixed 297 × 167 mm box with `overflow: hidden` over a fixed-height body; the
// weekly deck's first cut put all six sections on one of them and lost four in
// silence while the footer still read "1 / 1".
//
// The blocks render in `'print'` mode, the same bodies of code the email and
// the app call, so the PDF a send attaches and the email it is attached to
// cannot say different things; a section the email leaves out (an absent
// slot) has no sheet either. The chrome carries the masthead's one line
// ("September 2026 · read to the 11 Oct update") and the date; no rule or
// caveat footnote (25 Sep rulings).
//
// NOT toLocaleDateString: lib/format.ts's own header forbids it, because Intl
// draws on ICU data that differs between the Node server and the browser.
const fmtDate = (d: Date) => fullDate(d.toISOString())

export function MonthlyDeck({ data, date = fmtDate(new Date()) }: { data: MonthlySnapshotData; date?: string }) {
  // A snapshot built before the em-dash sweep re-renders in the current words.
  data = withCurrentWords(data)
  const ctx = blockContext(appBaseUrl(), EMAIL)
  const stale = staleMonthlySnapshot(data)
  const blocks = stale ? [] : monthlySections(data.keys, data.reading)
  const chrome = {
    context: `${data.company} · ${data.period}`,
    footer: <p className="truncate font-mono text-[9.5px] leading-[1.35] text-muted-foreground">{date}</p>,
  }
  // TWO WAYS A STORED MONTHLY ROW IS UNDRAWABLE: no key resolved (its KEYS
  // moved on), or `staleMonthlySnapshot` (its reading SHAPE moved on, a
  // version 1 row). Either is one sheet that says so.
  if (stale || blocks.length === 0) {
    return (
      <Slide title={data.subject} chrome={chrome} page={1} pages={1} layout="single">
        <p className="m-0 text-[13px] text-muted-foreground">{stale ?? STALE_ARTEFACT_LINE}</p>
      </Slide>
    )
  }
  return (
    <>
      {blocks.map((block, i) => (
        <Slide
          key={block.key}
          // The subject heads the first sheet, where the reader meets the
          // report; every sheet after it is headed by the section it carries.
          title={i === 0 ? data.subject : block.title}
          chrome={chrome}
          page={i + 1}
          pages={blocks.length}
          layout="single"
        >
          {block.render(data.reading, 'print', ctx)}
        </Slide>
      ))}
    </>
  )
}
