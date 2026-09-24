import Link from 'next/link'

import type { DateFilter } from '@/lib/reports/archive'

// RP4's date filter. A GET form, so it works without JavaScript, keeps the
// reader's group and selection in the URL, and is shareable — the same rule
// the horizon control follows.
//
// THE CONTROLS ARE 32px, NOT 20px (Block D wave 2 fix pass). Two date inputs
// and a submit button at `py-0.5` were the smallest targets on the page — a
// 20px tap target inside a form a reader is expected to USE, next to 26px
// chips and 44px buttons. 32px is the archive's own density rather than the
// Studio's 44px pill; the gap to 44 is a system-wide one this package did not
// introduce and does not close on its own.

export function ArchiveDateFilter({
  filter,
  hidden,
  line,
}: {
  filter: DateFilter
  /** The other URL params to carry through, so filtering does not drop the
   *  reader's group or their open item. */
  hidden: Record<string, string>
  /** "12 of 47 items from 1 Sep 2026." — null where nothing is filtered. */
  line: string | null
}) {
  const clearHref = `/dashboard/reports${Object.keys(hidden).length ? `?${new URLSearchParams(hidden).toString()}` : ''}`
  return (
    /* ONE ROW, AND THE COUNT LINE IS IN IT. The form was a column of two — the
       controls, then the item count under them — inside a stack of chrome that
       was already three rows deep above the lists (see `ArchiveTile`). The
       count wraps onto its own line when the row runs out of width, which is
       what it did before at every width. */
    <form method="get" action="/dashboard/reports" className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="font-mono text-[10.5px] text-muted-foreground" htmlFor="from">From</label>
        <input
          id="from" name="from" type="date" defaultValue={filter.from ?? ''}
          className="h-[32px] rounded-[4px] bg-background px-2 font-mono text-[11px] ring-1 ring-border"
        />
        <label className="font-mono text-[10.5px] text-muted-foreground" htmlFor="to">To</label>
        <input
          id="to" name="to" type="date" defaultValue={filter.to ?? ''}
          className="h-[32px] rounded-[4px] bg-background px-2 font-mono text-[11px] ring-1 ring-border"
        />
        <button type="submit" className="h-[32px] rounded-[4px] px-3 font-mono text-[10.5px] ring-1 ring-border hover:bg-tile">Filter</button>
        {(filter.from || filter.to) && (
          <Link href={clearHref} className="inline-flex h-[32px] items-center px-1 font-mono text-[10.5px] text-muted-foreground underline underline-offset-2">Clear</Link>
        )}
        {line && <p className="m-0 basis-full font-mono text-[10.5px] text-muted-foreground lg:basis-auto">{line}</p>}
      </div>
    </form>
  )
}
