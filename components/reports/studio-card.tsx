import Link from 'next/link'
import { Plus } from 'lucide-react'

import { Tile } from '@/components/shell/tile'
import { AUDIENCES } from '@/lib/reports/types'
import { STUDIO_HREF } from '@/lib/studio-visibility'

/**
 * The Studio card (Block D wave 2, package E-reports; `reports.studio.header`
 * · `.catalogue` · `.audience` · `.actions`).
 *
 * The Studio is a separate route and Reports reached it by one pill in the
 * page bar. The artboard draws the relationship `lib/nav.ts:UNDER` already
 * states — the Studio lives under Reports — as a card that says what it is
 * before a reader opens it.
 *
 * THE CHIPS PRINT WHAT IS TRUE, which is the one place this card departs from
 * the artboard in words:
 *
 *  · The catalogue is `studioCatalogue()` and it is a list of PAGES — eight of
 *    them. The mock draws nine chips whose names ("Movers", "Head to head",
 *    "Quotes", "Method") are closer to the TILES inside a page than to
 *    anything a section may name. A chip naming something the picker does not
 *    offer is a promise the next screen breaks.
 *  · The audiences are `AUDIENCES` and their labels are Leadership ·
 *    Marketing · Sales · Content · General. The mock relabels them as five
 *    personas (Digital director · Sales lead · …). Those are not options: the
 *    Studio's own control stores one of the five KEYS, and a card offering
 *    "Founder" advertises a choice that is not there. The mock's intent —
 *    naming the human the cover is written for — is kept by printing the
 *    audience's own `reader` string as the chip's title.
 *
 * Mounted only where `canSeeStudio` is true (owner's call, 2026-09-17): a
 * client is never shown a door into a page they cannot find, and that includes
 * copy naming it.
 */
export function StudioCard({
  pages, col = 5, row = 3,
}: {
  /** `studioCatalogue().map(p => p.title)` — the pages a section may name. */
  pages: readonly string[]
  col?: number
  row?: number
}) {
  return (
    <Tile col={col} row={row} eyebrow="Report Studio" meta="build your own" distribute="between">
      <p className="m-0 text-[12.5px] leading-[1.45] text-foreground">
        Arrange pages from the catalogue; the cover is written for an audience.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">
          Pages in the catalogue
        </span>
        <div className="flex flex-wrap gap-1.5">
          {pages.map((p) => <Chip key={p}>{p}</Chip>)}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">
          Cover written for
        </span>
        <div className="flex flex-wrap gap-1.5">
          {AUDIENCES.map((a) => <Chip key={a.key} title={a.reader}>{a.label}</Chip>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${STUDIO_HREF}/new`}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-[18px] text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-accent-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
          Start a report
        </Link>
        <Link
          href={STUDIO_HREF}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-tile px-[18px] text-[12px] font-medium text-secondary-foreground ring-1 ring-border transition-colors hover:bg-inner"
        >
          Open the catalogue
        </Link>
      </div>
    </Tile>
  )
}

/** The artboard's grey chip — a single-line pill, which is the only thing
 *  `rounded-full` is allowed on (design-system.md rule 5). */
function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-block whitespace-nowrap rounded-full bg-inner px-2 py-0.5 text-[12px] font-medium text-muted-foreground"
    >
      {children}
    </span>
  )
}
