import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { QUARTERLY_RULE } from '@/lib/reports/quarterly'
import { staleQuarterlySnapshot, type QuarterlySnapshotData } from '@/lib/reports/quarterly-build'
import { quarterlyBlocksFor } from '@/components/blocks/quarterly'
import { Slide } from './slide'

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

const fmtDate = (d: Date) => fullDate(d.toISOString())

export function QuarterlyDeck({ data, date = fmtDate(new Date()) }: { data: QuarterlySnapshotData; date?: string }) {
  const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
  // Asked before anything dereferences `data.reading`, whose shape changed
  // incompatibly in block D (`QUARTERLY_SNAPSHOT_VERSION`).
  const stale = staleQuarterlySnapshot(data)
  const blocks = stale ? [] : quarterlyBlocksFor(data.keys)
  const chrome = {
    context: `${data.company} · ${data.period} · reading as at ${fullDate(data.readingAt)}`,
    // TWO LINES, NOT ONE, BECAUSE THE SECOND SENTENCE IS THE GATE. The weekly
    // deck's one-line `truncate` footer carries a 134-character rule; this one
    // is 195, and the clause ellipsed on every sheet was "A quarter is
    // compared with the quarter before it only where six monthly readings
    // stand behind both sides" — the artefact's central fact, and the reason
    // half its columns are empty.
    footer: (
      <p className="line-clamp-2 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
        <span className="text-secondary-foreground">{QUARTERLY_RULE}</span>
        <span aria-hidden> · </span>
        <span>{date}</span>
      </p>
    ),
  }
  if (blocks.length === 0) {
    return (
      <Slide title={data.title} chrome={chrome} page={1} pages={1} layout="single">
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
        >
          {block.render(data.reading, 'print', ctx)}
        </Slide>
      ))}
    </>
  )
}
