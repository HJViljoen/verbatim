import { openLink } from '@/components/blocks/open-link'
import { shortDate } from '@/lib/format'
import { effectiveWords, heldStillLine, type QueueLine } from '@/lib/settings/queue'
import { settingsSubPage } from '@/lib/settings/rail'
import { PAGES_CAN_SAY_LEAD, timelineRows, type CheckMethod } from '@/lib/settings/record-additions'
import { cn } from '@/lib/utils'

import { RecordSection } from './frame'

// Settings › What we changed, the three sections deploy 5 adds (market-first
// WP3.10, plan §2.10 D5; the approved SettingsRecord artboard). Each its title
// alone, a footer of links only, and no footnote (the 25 Sep rulings).

/** Tracking, where a change is saved and, for a locked tenant, queued. */
const TRACKING_HREF = settingsSubPage('tracking').href

/** The request path (decision I): Tracking, where the change is saved and
 *  waits for the 1st, or before MF3 is refused with "tell us". */
export const ASK_FOR_A_CHANGE = 'Ask for a change →'

export function SearchesHeldStill({ state, lines }: { state: 'available' | 'unavailable'; lines: readonly QueueLine[] }) {
  return (
    <RecordSection title="Searches held still until January" id="held-still" footer={openLink('app', TRACKING_HREF, ASK_FOR_A_CHANGE)}>
      <p className="m-0 max-w-[620px] text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]">{heldStillLine(state)}</p>
      {lines.length > 0 ? (
        <ul className="m-0 flex max-w-[720px] list-none flex-col p-0">
          {lines.map((l) => (
            <li key={`${l.field}-${l.queuedAt}`} className="flex flex-col gap-0.5 border-t border-border/60 py-3 first:border-t-0">
              <span className="text-[15px] leading-[1.5]"><span className="font-semibold">{l.label}:</span> {l.words}</span>
              <span className="font-mono text-[13px] text-muted-foreground">from {effectiveWords(l.month)}</span>
            </li>
          ))}
        </ul>
      ) : state === 'available' ? (
        <p className="m-0 font-mono text-[13px] text-muted-foreground">queued: none yet</p>
      ) : null}
    </RecordSection>
  )
}

export function HowWeCheck({ methods }: { methods: readonly CheckMethod[] }) {
  return (
    <RecordSection title="How we check, mark and file videos">
      <div role="table" className="flex max-w-[860px] flex-col">
        {methods.map((m) => (
          <div key={m.key} role="row" className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-border/60 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_200px]">
            <span role="cell" className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold leading-[22px]">{m.title}</span>
              <span className="max-w-[560px] text-[15px] leading-[1.5] text-secondary-foreground [text-wrap:pretty]">{m.does}</span>
            </span>
            <span role="cell" className="font-mono text-[13px] leading-[22px] text-muted-foreground lg:text-right">
              {m.lastChanged ? `changed by us ${shortDate(m.lastChanged)}` : 'no change of ours on record'}
            </span>
          </div>
        ))}
      </div>
    </RecordSection>
  )
}

export function PagesCanSay({ now }: { now: string }) {
  const rows = timelineRows(now)
  return (
    <RecordSection title="What the pages can say, and when">
      <p className="m-0 max-w-[620px] text-[17px] font-medium leading-[1.5] tracking-[-0.01em] [text-wrap:pretty]">{PAGES_CAN_SAY_LEAD}</p>
      <ol className="m-0 flex max-w-[760px] list-none flex-col p-0">
        {rows.map((r) => (
          <li key={r.when} className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 border-b border-border/60 py-3 last:border-b-0">
            <span className={cn('font-mono text-[13px] leading-[1.6]', r.state === 'next' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{r.when}</span>
            <span className={cn('text-[15px] leading-[1.5] [text-wrap:pretty]', r.state === 'reached' ? 'text-secondary-foreground' : 'text-foreground')}>{r.says}</span>
          </li>
        ))}
      </ol>
    </RecordSection>
  )
}
