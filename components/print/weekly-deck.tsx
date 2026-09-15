import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { appBaseUrl } from '@/lib/site'
import { WEEKLY_RULE } from '@/lib/reports/weekly'
import type { WeeklySnapshotData } from '@/lib/reports/weekly-build'
import { weeklyBlocksFor } from '@/components/blocks/weekly'
import { Slide } from './slide'

// The weekly report on paper (Phase 1 WP17).
//
// ONE SLIDE, SIX SECTIONS. A weekly report is a page of an email's length, not
// a deck: breaking it into six slides would put "Nothing unusual this week."
// alone on a sheet. The blocks render in `'print'` mode — the same bodies of
// code the email and the app call — so the PDF a schedule attaches and the
// email it is attached to cannot say different things.

export function WeeklyDeck({ data }: { data: WeeklySnapshotData }) {
  const ctx = blockContext(appBaseUrl(), EMAIL)
  const blocks = weeklyBlocksFor(data.keys)
  return (
    <Slide
      title={data.subject}
      chrome={{
        context: `${data.company} · ${data.period}`,
        footer: <span className="font-mono text-[9.5px] text-muted-foreground">{WEEKLY_RULE}</span>,
      }}
      page={1}
      pages={1}
      layout="single"
    >
      <div className="flex min-h-0 flex-col gap-5">
        <p className="m-0 font-mono text-[10.5px] text-muted-foreground">reading as at {data.readingAt.slice(0, 10)}</p>
        {blocks.map((block) => (
          <div key={block.key}>{block.render(data.reading, 'print', ctx)}</div>
        ))}
      </div>
    </Slide>
  )
}
