import Link from 'next/link'

import { LEADERSHIP_LINE, NOT_BUILT_YET, deliveryLine, type BriefCard } from '@/lib/reports/briefs'

// RP1 — the three brief cards (Phase 1 WP19, decision R).
//
// A CARD IS A BRIEF, A CADENCE AND A LIST OF PEOPLE, plus the last one built
// and the day it read. Nothing on it writes: the recipients have one editor
// (Settings › Reports and recipients) and the build has one (the Studio), and
// a second control for either is a second thing to keep in step.
//
// NO WINDOW CONTROL. RP2's window control sat here and did nothing: no Studio
// route read `?horizon=`, nothing wrote it into a report's settings, and the
// build itself is now pinned to the month it stamps. A control that highlights
// a choice and changes nothing is worse than none, so the header says what the
// window is instead.

export function BriefCards({ cards }: { cards: readonly BriefCard[] }) {
  return (
    <section className="flex shrink-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">Your briefs</h2>
        <span className="font-mono text-[10.5px] text-muted-foreground">Each one reads the month in hand</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <article key={c.role} className="flex flex-col gap-2 rounded-[6px] bg-tile p-3.5 ring-1 ring-border">
            <div className="flex flex-col gap-1">
              <h3 className="text-[13.5px] font-semibold leading-[1.25]">{c.label}</h3>
              <p className="text-[12px] leading-[1.45] text-muted-foreground">{c.what}</p>
            </div>

            <p className="font-mono text-[10.5px] leading-[1.4] text-muted-foreground">{deliveryLine(c)}</p>

            <p className="mt-auto font-mono text-[10.5px] leading-[1.4] text-secondary-foreground">
              {c.latest ? c.latest.readingLine : NOT_BUILT_YET}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-0.5">
              {c.latest && (
                <Link href={`/dashboard/reports?view=${c.latest.snapshotId}`} scroll={false} className="text-[12px] font-medium underline underline-offset-2">
                  Open the last one
                </Link>
              )}
              <Link
                href={c.reportId ? `/dashboard/studio?item=${c.reportId}` : '/dashboard/studio/new'}
                className="text-[12px] font-medium underline underline-offset-2"
              >
                {c.reportId ? 'Build it in the Studio' : 'Set it up in the Studio'}
              </Link>
            </div>
          </article>
        ))}
      </div>

      <p className="text-[11.5px] leading-[1.45] text-muted-foreground">{LEADERSHIP_LINE}</p>
    </section>
  )
}
