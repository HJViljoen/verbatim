import { Fragment } from 'react'
import { pageModule } from '@/components/pages/registry'
import { CoverSlide } from '@/components/print/cover-slide'
import { Slide } from '@/components/print/slide'
import { catalogueTitle } from '@/lib/reports/catalogue'
import { deckSlides } from '@/lib/reports/compose'
import type { ReportSnapshotData } from '@/lib/reports/types'

// A report's deck from its (hydrated) snapshot data: the cover, then every
// section's slides in the order the operator set, numbered once across the
// report, the framing on a section's first slide. Rendered inside a PrintRoot
// by /render/<snapshot> for the PDF and by the Studio's preview: one
// component, one look.
//
// Chrome on a report's pages (Heinrich, 2026-08-30): the page's name top
// right, and at the foot only "Created by {company} with Verbatim", the date
// and the page number. The method note stays on single-page exports.

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The line along the foot of every sheet.
 *
 * `note` is what the sheet was READ FROM, where the deck knows it — the
 * artboards' own footer is "September 2026 reading · as at 28 Sep · TikTok,
 * YouTube, Instagram, Reddit · 2,359 videos", and the brief printed only the
 * provenance half. Optional, because a report's sheet has no single corpus to
 * name (package E-marketing, fix pass).
 *
 * AND THE TYPE CLEARS 8pt. At 9.5px under the sheet's .902 zoom this line set
 * at about 6.4pt on a 297mm page, below what print work holds to; 11px is
 * about 7.4pt, and the page number beside it moves with it.
 */
export function DeckFooter({ company, date, note }: { company: string; date: string; note?: string | null }) {
  return (
    <p className="truncate font-mono text-[11px] leading-[1.35] text-muted-foreground">
      <span className="text-secondary-foreground">Created by {company} with Verbatim</span>
      <span aria-hidden> · </span>
      <span>{date}</span>
      {note ? <><span aria-hidden> · </span><span>{note}</span></> : null}
    </p>
  )
}

export function ReportDeck({ data, date = fmtDate(new Date()) }: { data: ReportSnapshotData; date?: string }) {
  const deck = deckSlides(data, (p) => pageModule(p))
  const pages = deck.length
  return (
    <>
      {deck.map((s) => {
        if (s.kind === 'cover') return <CoverSlide key="cover" data={data} pages={pages} />
        const sec = data.sections[s.sectionIndex]
        const mod = pageModule(sec.section.page)
        if (!mod) return null
        const chrome = { context: catalogueTitle(sec.section.page), footer: <DeckFooter company={data.company} date={date} /> }
        return (
          <Slide
            key={`${sec.section.id}-${s.n}`}
            title={s.slide.title}
            chrome={chrome}
            page={s.n}
            pages={pages}
            layout={s.slide.layout === 'grid' ? 'grid' : 'single'}
            note={s.first ? sec.section.framing : null}
          >
            {s.slide.keys.map((k) => <Fragment key={k}>{mod.renderables[k]?.render(sec.data, 'print') ?? null}</Fragment>)}
          </Slide>
        )
      })}
    </>
  )
}
