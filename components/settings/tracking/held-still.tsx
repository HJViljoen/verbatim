import { effectiveWords, queuedByWords, type QueueLine } from '@/lib/settings/queue'

import { Section, SectionHead } from '../chrome'

// Settings › Tracking, "Held still until January" (market-first decision I,
// plan §2.10 D5, WP3.10): for a tracking-locked tenant, what the lock does now
// (a term, rival or handle edit waits for the 1st, the first no earlier than
// 1 Jan 2027) and what is waiting, each change with the month it lands in.
// Before MF3 there is no queue, and the section says what deploy 1 said.

export function HeldStillSection({
  line, summary, lines,
}: {
  /** `heldStillLine`: the one line under the title. */
  line: string
  /** `queueSummary`, or null before MF3. */
  summary: string | null
  lines: readonly QueueLine[]
}) {
  return (
    <Section>
      <SectionHead title="Held still until January" />
      <p className="m-0 max-w-[620px] text-[12.5px] leading-[1.5] text-secondary-foreground">{line}</p>
      {summary ? <p className="m-0 font-mono text-[11px] text-muted-foreground">{summary}</p> : null}
      {lines.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lines.map((l) => (
            <li key={`${l.field}-${l.queuedAt}`} className="flex flex-col gap-0.5 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
              <span className="text-[12.5px]"><span className="font-semibold">{l.label}:</span> {l.words}</span>
              <span className="font-mono text-[11px] text-muted-foreground">from {effectiveWords(l.month)} · {queuedByWords(l)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  )
}
