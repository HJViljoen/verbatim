import Link from 'next/link'

import type { DateFilter } from '@/lib/reports/archive'

// RP4's date filter. A GET form, so it works without JavaScript, keeps the
// reader's group and selection in the URL, and is shareable — the same rule
// the horizon control follows.

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
    <form method="get" action="/dashboard/reports" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="font-mono text-[10.5px] text-muted-foreground" htmlFor="from">From</label>
        <input
          id="from" name="from" type="date" defaultValue={filter.from ?? ''}
          className="rounded-[4px] bg-background px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-border"
        />
        <label className="font-mono text-[10.5px] text-muted-foreground" htmlFor="to">To</label>
        <input
          id="to" name="to" type="date" defaultValue={filter.to ?? ''}
          className="rounded-[4px] bg-background px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-border"
        />
        <button type="submit" className="rounded-[4px] px-2 py-0.5 font-mono text-[10.5px] ring-1 ring-border hover:bg-tile">Filter</button>
        {(filter.from || filter.to) && (
          <Link href={clearHref} className="font-mono text-[10.5px] text-muted-foreground underline underline-offset-2">Clear</Link>
        )}
      </div>
      {line && <p className="font-mono text-[10.5px] text-muted-foreground">{line}</p>}
    </form>
  )
}
