import Link from 'next/link'

import { shortDate } from '@/lib/format'
import { effectiveWords, QUEUE_FLOOR, type QueueLine } from '@/lib/settings/queue'
import { settingsSubPage } from '@/lib/settings/rail'
import { PAGES_CAN_SAY_LEAD, timelineRows } from '@/lib/settings/record-additions'
import { cn } from '@/lib/utils'

import { RecordSection } from './frame'

// Settings › What we changed, what deploy 5 adds (market-first WP3.10, plan
// §2.10 D5; the approved SettingsRecord artboard): the held-still aside in
// What we changed, and "What the pages can say, and when" beside "When two
// months are compared". Each its title alone, a footer of links only, and no
// footnote (the 25 Sep rulings).

/** The request path (decision I): What we read's search set, where a change
 *  is queued for the 1st ("Queue a change"), or before MF3 is refused with
 *  "tell us". */
const ASK_HREF = `${settingsSubPage('tracking').href}#search-set`
export const ASK_FOR_A_CHANGE = 'Ask for a change'

/**
 * "Searches held still until January" as the artboard draws it: an aside in
 * What we changed, beside the headline, not a tile of its own. What the lock
 * keeps, the request path (decision I: What we read's "Queue a change", or,
 * before MF3, "tell us"), when a change lands, and each queued change with the
 * month it lands in.
 */
export function HeldStillAside({ state, lines }: { state: 'available' | 'unavailable'; lines: readonly QueueLine[] }) {
  return (
    <aside id="held-still" className="flex scroll-mt-6 flex-col gap-4 self-start rounded-lg bg-inner p-6">
      <h3 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-secondary-foreground">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Searches held still until January
      </h3>
      <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground [text-wrap:pretty]">
        {state === 'available'
          ? 'This keeps October and November comparable. A change you queue waits for the 1st.'
          : 'This keeps October and November comparable. Tell us what you would change and we will note it for then.'}
      </p>
      {lines.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {lines.map((l) => (
            <li key={`${l.field}-${l.queuedAt}`} className="flex flex-col gap-0.5 border-t border-border py-2.5 first:border-t-0 first:pt-0">
              <span className="text-[14px] leading-[1.5]"><span className="font-semibold">{l.label}:</span> {l.words}</span>
              <span className="font-mono text-[12px] text-muted-foreground">from {effectiveWords(l.month)}</span>
            </li>
          ))}
        </ul>
      ) : state === 'available' ? (
        <p className="m-0 font-mono text-[13px] text-muted-foreground">queued: none yet</p>
      ) : null}
      <Link href={ASK_HREF} className="inline-flex h-11 items-center gap-2 self-start rounded-lg bg-tile px-4 text-[14px] font-medium text-foreground ring-1 ring-border transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted-foreground">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        {ASK_FOR_A_CHANGE}
      </Link>
      <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">A change lands on the 1st of a month, no earlier than {shortDate(`${QUEUE_FLOOR}T00:00:00.000Z`)} {QUEUE_FLOOR.slice(0, 4)}.</p>
    </aside>
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
