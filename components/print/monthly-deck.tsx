import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { appBaseUrl } from '@/lib/site'
import { monthlyRuleFor, readingCaveat } from '@/lib/reports/monthly'
import type { MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { monthlyBlocksFor } from '@/components/blocks/monthly'
import { staleMonthlySnapshot } from '@/lib/reports/monthly-build'
import { Slide } from './slide'
import { STALE_ARTEFACT_LINE } from '@/lib/reports/stale'

// The monthly report on paper (Phase 1 WP18).
//
// ONE SECTION PER SLIDE, the way every other deck in this codebase paginates
// (`report-deck.tsx`, `document-deck.tsx`, `weekly-deck.tsx`). A slide is a
// fixed 297 × 167 mm box with `overflow: hidden` over a fixed-height body; the
// weekly deck's first cut put all six sections on one of them and lost four in
// silence while the footer still read "1 / 1". Eight sections is more room to
// make that mistake in, not less.
//
// The blocks render in `'print'` mode — the same bodies of code the email and
// the app call — so the PDF a schedule attaches and the email it is attached to
// cannot say different things.
//
// NOT toLocaleDateString: lib/format.ts's own header forbids it, because Intl
// draws on ICU data that differs between the Node server and the browser.
const fmtDate = (d: Date) => fullDate(d.toISOString())

export function MonthlyDeck({ data, date = fmtDate(new Date()) }: { data: MonthlySnapshotData; date?: string }) {
  const ctx = blockContext(appBaseUrl(), EMAIL)
  const stale = staleMonthlySnapshot(data)
  const blocks = stale ? [] : monthlyBlocksFor(data.keys)
  // THE RULE ONCE, ON SHEET 1, and the reading's caveat only on the sheet
  // that draws the movers' lines across the months it is about (copy
  // de-clutter 2026-09-24): repeated on every footer, both read as furniture.
  const caveat = readingCaveat(data.reading.notes)
  const chromeFor = (first: boolean, movers: boolean) => ({
    context: `${data.company} · ${data.period}`,
    footer: (
      <>
        <p className="truncate font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
          {first ? (
            <>
              <span className="text-secondary-foreground">{monthlyRuleFor(data.monthStatus)}</span>
              <span aria-hidden> · </span>
            </>
          ) : null}
          <span>{date}</span>
        </p>
        {caveat && movers ? <p className="line-clamp-2 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">{caveat}</p> : null}
      </>
    ),
  })
  // TWO WAYS A STORED MONTHLY ROW IS UNDRAWABLE, and this knew one of them:
  // no key resolved, which is a row whose KEYS moved on. `staleMonthlySnapshot`
  // is the other — a row whose reading SHAPE moved on — and it is the sibling
  // of the check the weekly and quarterly decks have always made first.
  if (stale || blocks.length === 0) {
    return (
      <Slide title={data.subject} chrome={chromeFor(true, false)} page={1} pages={1} layout="single">
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
          chrome={chromeFor(i === 0, block.key === 'monthly.movers')}
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
