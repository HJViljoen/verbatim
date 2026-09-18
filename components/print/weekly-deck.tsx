import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { appBaseUrl } from '@/lib/site'
import { periodNounFor, weeklyRuleFor } from '@/lib/reports/weekly'
import { staleWeeklySnapshot, type WeeklySnapshotData } from '@/lib/reports/weekly-build'
import { weeklyBlocksFor } from '@/components/blocks/weekly'
import { Slide } from './slide'

// The weekly report on paper (Phase 1 WP17).
//
// ONE SECTION PER SLIDE, the way every other deck in this codebase paginates
// (`report-deck.tsx`, `document-deck.tsx`). The first cut of this file put all
// six sections inside ONE `Slide` with `page={1} pages={1}` — and a slide is a
// fixed 297 × 167 mm box with `overflow: hidden` over a fixed-height body
// (app/globals.css). Össur's own body is ~26.5 KB of markup, so four of the six
// sections were cut off in silence while the footer still read "1 / 1". None of
// that was theoretical: `renderMany` always runs the pdf job, both live
// schedules carry `attach_pdf = true`, and the file is emailed.
//
// The blocks render in `'print'` mode — the same bodies of code the email and
// the app call — so the PDF a schedule attaches and the email it is attached to
// cannot say different things. A single section longer than a sheet is still
// clipped, by the same rule as every other deck's; what is fixed here is a
// report that dropped two thirds of itself by construction.

// NOT toLocaleDateString. lib/format.ts's own header forbids it — Intl draws
// on ICU data that differs between the Node server and the browser — and it
// printed "16 Sept 2026" in this footer against "Sep" everywhere else. It is
// the same rule the WP15 x WP17 longMonth merge conflict was decided on.
const fmtDate = (d: Date) => fullDate(d.toISOString())

export function WeeklyDeck({ data, date = fmtDate(new Date()) }: { data: WeeklySnapshotData; date?: string }) {
  const ctx = blockContext(appBaseUrl(), EMAIL)
  // Asked before anything dereferences `data.reading` (`WEEKLY_SNAPSHOT_VERSION`).
  const stale = staleWeeklySnapshot(data)
  const blocks = stale ? [] : weeklyBlocksFor(data.keys)
  // THE RULE ON EVERY SHEET. A reader of a PDF has no masthead to scroll back
  // to, which is the same reason the method note is on every slide of a report.
  const chrome = {
    context: `${data.company} · ${data.period} · reading as at ${fullDate(data.readingAt)}`,
    footer: (
      <p className="truncate font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
        <span className="text-secondary-foreground">{stale ? '' : weeklyRuleFor(periodNounFor(data.reading.window))}</span>
        <span aria-hidden> · </span>
        <span>{date}</span>
      </p>
    ),
  }
  if (blocks.length === 0) {
    return (
      <Slide title={data.subject} chrome={chrome} page={1} pages={1} layout="single">
        <p className="m-0 text-[13px] text-muted-foreground">{stale ?? 'This report names no section this build knows how to draw.'}</p>
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
