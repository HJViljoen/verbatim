import Link from 'next/link'

import { FigureCell } from '@/components/blocks/frame'
import { Tile, TileBlock } from '@/components/shell/tile'
import { PageGrid } from '@/components/shell/page-grid'
import { LEADERSHIP_LINE, deliveryLine, latestBriefLine, type BriefCard } from '@/lib/reports/briefs'
import { STUDIO_HREF } from '@/lib/studio-visibility'
import { fmtBytes } from '@/lib/reports/files'

// RP1 — the three brief cards (Phase 1 WP19, decision R), ported to the
// artboard (Block D wave 2, package E-reports; `reports.briefs.*`).
//
// A CARD IS A BRIEF, A CADENCE AND A LIST OF PEOPLE, plus the last one built
// and the day it read. Nothing on it writes: the recipients have one editor
// (Settings › Reports and recipients) and the build has one (the Studio), and
// a second control for either is a second thing to keep in step.
//
// WHAT THE PORT CHANGED. The card had no second nesting level at all — no flat
// tinted inner block — so the artboard's four figure rows had nowhere to sit,
// and it drew `ring-1 ring-border` where the system's card anatomy is the
// ambient shadow with no border (design-system.md rule 4). It is a `Tile` now,
// which is that anatomy, and it gains the artboard's four elements: the mono
// month chip top-right, the tinted role pill, the four-row inner block, and a
// hairline footer with the actions left and the reading stamp right. The row
// markup inside the block is the archive detail pane's own, lifted — label
// left, mono tabular figure right — through `FigureCell`, so the copy contract
// is kept by construction rather than by a hand-rolled cell.
//
// THE ROWS ARE FIGURES AND NOT LEVELS, deliberately. `sentFigures` is keyed by
// COVER SLOT and its values are the strings the document PRINTED ("3.4%",
// "1,388") — the denominators behind them were spent when the table was
// rendered and are not in the snapshot. So `FigureCell` is given no `of`: it
// stamps `figure` and not `level`, which is the honest claim ("this is what
// that report printed"), and the caption above them says which report. A level
// here would need a denominator the snapshot does not hold.
//
// NO WINDOW CONTROL. RP2's window control sat here and did nothing: no Studio
// route read `?horizon=`, nothing wrote it into a report's settings, and the
// build itself is now pinned to the month it stamps. A control that highlights
// a choice and changes nothing is worse than none, so the header says what the
// window is instead.

export function BriefCards({
  cards, meta, studio = true, basePath = '/dashboard/reports',
}: {
  cards: readonly BriefCard[]
  /** The section's mono meta, right — what the scheduler actually does. */
  meta?: string
  /** Whether this session is shown a way into the Studio. */
  studio?: boolean
  basePath?: string
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">The role briefs</h2>
        {meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}
      </div>

      <PageGrid>
        {cards.map((c) => (
          <Tile
            key={c.role}
            col={4}
            row={2}
            eyebrow={c.label}
            meta={c.monthChip ?? undefined}
            distribute="between"
            footer={<BriefActions card={c} studio={studio} basePath={basePath} />}
            footerNote={c.stamp ?? undefined}
          >
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[12.5px] leading-[1.45] text-foreground">{c.what}</p>
              {c.reader && (
                <span className="inline-block self-start whitespace-nowrap rounded-full bg-inner px-2 py-0.5 text-[12px] font-medium text-muted-foreground">
                  For {c.reader}
                </span>
              )}
              {/* The build has this and the mock has no slot for it, and it is
                  the answer the page exists to give on both live workspaces:
                  "nobody receives this yet". It stays, in mono, above the
                  figures. */}
              <p className="m-0 font-mono text-[10.5px] leading-[1.4] text-muted-foreground">{deliveryLine(c)}</p>
            </div>

            {c.figures.length > 0 ? (
              <TileBlock className="flex flex-col gap-1.5">
                <p className="m-0 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  What the last one printed
                </p>
                {c.figures.map((f) => (
                  <div key={f.key} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[11.5px] leading-[1.35] text-secondary-foreground">{f.label}</span>
                    <FigureCell value={f.value} align="right" />
                  </div>
                ))}
              </TileBlock>
            ) : (
              <TileBlock>
                <p className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{latestBriefLine(c)}</p>
              </TileBlock>
            )}
          </Tile>
        ))}
      </PageGrid>

      <p className="m-0 text-[11.5px] leading-[1.45] text-muted-foreground">{LEADERSHIP_LINE}</p>
    </>
  )
}

/**
 * The footer's left half — the artboard's `PDF` and `Share link`, and neither
 * of them drawn where there is nothing behind it.
 *
 * The mock draws both on every card. A card with no build has no PDF to
 * download and no snapshot to share, and a link that opens nothing is the
 * same defect as the window control this component already lost.
 */
function BriefActions({ card, studio, basePath }: { card: BriefCard; studio: boolean; basePath: string }) {
  const link = 'text-[12px] font-medium underline underline-offset-2'
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {card.latest && (
        <Link href={`${basePath}?view=${card.latest.snapshotId}`} scroll={false} className={link}>Open</Link>
      )}
      {card.pdf && (
        <a href={`/api/artifacts/${card.pdf.id}`} className={link}>
          PDF · {fmtBytes(card.pdf.bytes)}
        </a>
      )}
      {card.latest && (
        <Link href={`${basePath}?group=built&item=${card.latest.snapshotId}`} scroll={false} className={link}>Share link</Link>
      )}
      {studio && (
        <Link href={card.reportId ? `${STUDIO_HREF}?item=${card.reportId}` : `${STUDIO_HREF}/new`} className={link}>
          {card.reportId ? 'Build it in the Studio' : 'Set it up in the Studio'}
        </Link>
      )}
    </span>
  )
}
