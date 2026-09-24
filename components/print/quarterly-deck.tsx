import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { staleQuarterlySnapshot, type QuarterlySnapshotData } from '@/lib/reports/quarterly-build'
import { quarterlyBlocksFor } from '@/components/blocks/quarterly'
import { Slide } from './slide'
import { withCurrentWords } from '@/lib/reports/legacy-words'

// The quarterly review on paper (Phase 1 WP20).
//
// ONE PAGE PER SLIDE, which for this artefact is not a pagination choice but
// the artefact itself: the design asks for eight pages and the mock draws eight
// frames. A `Slide` is a fixed 297 × 167 mm box with `overflow: hidden` over a
// fixed-height body (app/globals.css), so putting two pages in one would clip
// the second in silence while the footer still counted correctly — the exact
// failure WP17's first cut of the weekly deck shipped.
//
// THE BLOCKS RENDER IN 'print' MODE — the same bodies of code the share link
// and the app call — so the PDF a schedule attaches, the link it carries and
// the page a reader opens cannot say three different things.
//
// THE RULE IS ON EVERY SHEET. A reader of a PDF has no masthead to scroll back
// to, which is why the method note is on every slide of a report and why this
// is on every slide of this one.

/**
 * THE 8pt FLOOR IS DEFERRED ON THIS ARTEFACT, AND THIS IS THE WHOLE REASON.
 *
 * app/globals.css lifts every app tier under 12px inside a `.vb-slide-body`,
 * because a 10px tier under the sheet's `.902` zoom sets at 6.8pt on a 297mm
 * page. It is right, and this deck cannot pay for it today. Measured with
 * `scripts/deck-fit.ts` (`--deck quarterly`), at 1123px, both fixtures:
 *
 *   floor on   populated  p4 +4px · p5 +17px · p6 +144px      forming p6 +29px
 *   floor off  populated                       p6 +108px      forming clean
 *
 * `.vb-slide-body` is `overflow: hidden` over a fixed box, so every one of
 * those numbers is content dropped from the PDF with no ellipsis and no
 * warning — 144px of a 561px body is a quarter of a sheet, on the one artefact
 * that goes to a client's board.
 *
 * IT IS NOT A DENSITY PROBLEM THAT A SIZE FIXES. This deck carries about 58%
 * more text than the drawing does on the same eight sheets, and eight is the
 * artefact: `quarterlyBlocksFor` gives one page one sheet because the mock
 * draws eight frames. `components/blocks/quarterly/parts.tsx` wrote the
 * conclusion down before this wave — "the last 0.6pt is a question about how
 * many sheets this artefact has, not about this constant" — and answering it
 * means deciding whether a quarterly review may run to nine sheets. That is
 * Heinrich's call, not a merge's.
 *
 * WHAT THIS DEFERRAL DOES NOT CLOSE: p6 clips 108px with the floor off too,
 * at f333f63c and before it. It is recorded, not fixed here.
 */
const QUARTERLY_TYPE_FLOOR = 'deferred' as const

const fmtDate = (d: Date) => fullDate(d.toISOString())

export function QuarterlyDeck({ data, date = fmtDate(new Date()) }: { data: QuarterlySnapshotData; date?: string }) {
  // A snapshot built before the em-dash sweep re-renders in the current words.
  data = withCurrentWords(data)
  const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
  // Asked before anything dereferences `data.reading`, whose shape changed
  // incompatibly in block D (`QUARTERLY_SNAPSHOT_VERSION`).
  const stale = staleQuarterlySnapshot(data)
  const blocks = stale ? [] : quarterlyBlocksFor(data.keys)
  const chrome = {
    context: `${data.company} · ${data.period} · reading as at ${fullDate(data.readingAt)}`,
    // THE DATE ALONE. The six-month gate is said once, on the cover's stat
    // card beside the count it depends on (copy de-clutter 2026-09-24); eight
    // copies of it in the footer were the loudest repetition in the document.
    footer: (
      <p className="font-mono text-[10.5px] leading-[1.3] text-muted-foreground">
        <span>{date}</span>
      </p>
    ),
  }
  if (blocks.length === 0) {
    return (
      <Slide title={data.title} chrome={chrome} page={1} pages={1} layout="single" floor={QUARTERLY_TYPE_FLOOR}>
        {/* THE PRODUCT'S OWN WORDS, NOT THE DEVELOPER'S. "this build" and
            "page" are the calibration's pipeline jargon, on the one surface
            that goes to a client's board — and the calibrated sentence for
            the neighbouring fact is right beside it in `stale`. One reader,
            one sheet, one voice, whichever check tripped. */}
        <p className="m-0 text-[13px] text-muted-foreground">
          {stale ?? 'None of this review’s sections can be drawn here. The next scheduled review will be readable.'}
        </p>
      </Slide>
    )
  }
  return (
    <>
      {blocks.map((block, i) => (
        <Slide
          key={block.key}
          // THE ARTEFACT'S NAME ON EVERY SHEET, not the page's. Each block
          // already prints its own heading, so a slide headed with the same
          // words read as a stutter ("Our read / OUR READ") — seen in the
          // browser, invisible in markup. A reader holding sheet 6 of a
          // forwarded PDF also needs to know which document it is.
          title={data.title}
          chrome={chrome}
          page={i + 1}
          pages={blocks.length}
          layout="single"
          floor={QUARTERLY_TYPE_FLOOR}
        >
          {block.render(data.reading, 'print', ctx)}
        </Slide>
      ))}
    </>
  )
}
