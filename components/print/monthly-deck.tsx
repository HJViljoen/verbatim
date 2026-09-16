import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { appBaseUrl } from '@/lib/site'
import { monthlyRuleFor, readingCaveat } from '@/lib/reports/monthly'
import type { MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { monthlyBlocksFor } from '@/components/blocks/monthly'
import { Slide } from './slide'

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
  const blocks = monthlyBlocksFor(data.keys)
  // THE RULE ON EVERY SHEET. A reader of a PDF has no masthead to scroll back
  // to, which is the same reason the method note is on every slide of a report.
  //
  // AND THE READING'S CAVEAT UNDER IT, for the same reason and with more force:
  // the sheet that carries the movers draws a six-month line per row, and the
  // months it crosses are the ones the caveat is about.
  const caveat = readingCaveat(data.reading.notes)
  const chrome = {
    context: `${data.company} · ${data.period}`,
    footer: (
      <>
        <p className="truncate font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
          <span className="text-secondary-foreground">{monthlyRuleFor(data.monthStatus)}</span>
          <span aria-hidden> · </span>
          <span>{date}</span>
        </p>
        {caveat ? <p className="line-clamp-2 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">{caveat}</p> : null}
      </>
    ),
  }
  if (blocks.length === 0) {
    return (
      <Slide title={data.subject} chrome={chrome} page={1} pages={1} layout="single">
        <p className="m-0 text-[13px] text-muted-foreground">This report names no section this build knows how to draw.</p>
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
