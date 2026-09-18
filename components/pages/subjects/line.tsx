import Link from 'next/link'

import type { Block } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { calendarBandsFor, calendarRulesFor, seriesToCalendar } from '@/lib/charts/from-series'
import type { CalendarSeries } from '@/lib/charts/calendar'
import { EMAIL } from '@/lib/email/theme'
import { fmtPct } from '@/lib/format'
import type { SubjectsData } from '@/lib/pages/subjects'

// SU2 · the monthly line (design §3 SU2 "you, each rival and the category by
// month as lines with the counts"; the mock's (a)).
//
// ONE LINE PER SIDE, ON A GENERATED CALENDAR AXIS. Every month occupies its own
// slot whether or not it carries a row, because an index-spaced axis closes a
// hollow month up and misdates everything after it — measured on production, a
// rival with conversation in 4 of 68 months. A month below the audience's own
// floor is a gutter mark, not a point: a number that cannot be compared is not
// a reading, and drawing it as one is the lie this layer exists to stop.
//
// THE CAVEATS ARE THE AXIS'S, NOT THE LINE'S. A rename, a tracking change and a
// re-grouping draw ONE dated rule each across the whole chart however many
// lines carry them, and a run of back-read months is one shaded band rather
// than one caveat per bar (lib/charts/from-series.ts).

export const subjectsLine: Block<SubjectsData> = {
  key: 'subjects.line',
  title: 'Month by month',
  question: 'Where has this subject been going?',

  render(data, mode = 'app', ctx) {
    const pane = data.selected
    const empty = subjectsLine.emptyState(data)
    if (!pane || empty) {
      return (
        <BlockFrame title={subjectsLine.title} question={subjectsLine.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    const lines: CalendarSeries[] = pane.sides
      .map((side) => {
        const series = pane.series.find((s) => s.audience === side.audience)
        if (!series) return null
        return seriesToCalendar(series, { color: side.color, label: side.label })
      })
      .filter((s): s is CalendarSeries => s != null)

    // NO CONTROL ON PAPER (package E-marketing, fix pass). This block is
    // borrowed by the marketing brief, and "Compare another subject →" printed
    // on a landscape sheet is an instruction to press something a reader of a
    // PDF cannot press — `lib/reports/monthly.ts` ruled on the same shape when
    // it gave the monthly artefact its own moves empty state, because the
    // page's wording "is a control on a page the reader of an email is not
    // looking at". The screen and the email keep theirs; print gets none.
    const href = `${ctx.appUrl}/dashboard/voice`
    const footer = mode === 'print'
      ? null
      : mode === 'email'
        ? <a href={href} style={{ color: EMAIL.ink }}>Compare another subject →</a>
        : <Link href={href} className="hover:underline">Compare another subject →</Link>

    return (
      <BlockFrame
        title={`Share of videos where ${pane.name.toLowerCase()} came up`}
        question={subjectsLine.question}
        mode={mode}
        meta={`monthly · ${data.axis.length} month${data.axis.length === 1 ? '' : 's'}`}
        footer={footer}
      >
        {lines.length > 0 ? (
          <BlockCalendar
            blockKey={subjectsLine.key}
            axis={data.axis}
            series={lines}
            rules={calendarRulesFor(pane.series)}
            bands={calendarBandsFor(pane.series)}
            format={(v) => fmtPct(v)}
            label={`${pane.name}, share of each audience's videos, month by month`}
            caption={pane.axisNote ?? undefined}
            mode={mode}
            ctx={ctx}
          />
        ) : (
          <BlockEmpty mode={mode}>No audience carried a reading of this subject on this axis.</BlockEmpty>
        )}
      </BlockFrame>
    )
  },

  emptyState(data) {
    if (data.list.notRecorded) return data.list.notRecorded
    if (!data.selected) return 'Nothing is selected, so there is no line to draw.'
    if (data.selected.notRecorded) return data.selected.notRecorded
    if (data.selected.series.length === 0) {
      return 'This subject has no stored months on this axis yet.'
    }
    return null
  },
}
