import Link from 'next/link'

import { FigureCell } from '@/components/blocks/frame'
import { Tile, TileBlock } from '@/components/shell/tile'
import { PageGrid } from '@/components/shell/page-grid'
import { deliveryLine, latestBriefLine, type BriefCard } from '@/lib/reports/briefs'
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
  // ONE FACT ABOUT THE WORKSPACE, SAID ONCE (fix pass). `deliveryLine` is a
  // statement about this workspace's SCHEDULES, and with no `brief:*` schedule
  // — the shipped state, and both live workspaces — it returns the identical
  // 106-character sentence for all three cards. Rendered, that was two mono
  // lines × three cards, the largest block of body copy in the row, identical
  // in all three and sitting between the only parts of the cards that differ;
  // the artboard has no slot for it at all. Deviation 3 argues the fact must
  // not be lost, which it is not — it moves to the section head, beside the
  // other sentence about the row as a whole. Where the three DIFFER each card
  // keeps its own, because then it is a fact about that brief.
  const lines = cards.map((c) => deliveryLine(c))
  const shared = lines.length > 1 && lines.every((l) => l === lines[0]) ? lines[0] : null

  return (
    <>
      {/* THE SECTION'S OWN HEAD, AND THE FOURTH BRIEF'S LINE IS PART OF IT.
          `LEADERSHIP_LINE` sat under the card row as the only full-bleed
          paragraph on the page — a caption that had lost its tile, breaking
          the rhythm between two grids. It belongs where a reader asks the
          question ("why are there three?"), which is beside the heading. */}
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">The role briefs</h2>
          {meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}
        </div>
        {shared && (
          <p className="m-0 max-w-[92ch] font-mono text-[10.5px] leading-[1.45] text-muted-foreground">{shared}</p>
        )}
      </div>

      {/* The artboard's cards are `min-height:248px` and GROW; `PageGrid`'s
          116px row unit is a fixed track, and a fixed track clips under the
          tile's `overflow-hidden`. `auto-rows-min` is the artboard's own rule,
          and the tiles keep the 248px floor. */}
      {/* A STEP BETWEEN 1280 AND ONE COLUMN. `PageGrid` is `xl:grid-cols-12`,
          so at 1024 the three cards went full width and each figure row became
          label-left / value-right across ~950px of nothing. The artboard's
          density is the three-up card; two-up from `md` keeps it until the
          page's own twelve columns take over.
          AND THREE-UP FROM `lg`, BECAUSE TWO COLUMNS ORPHAN THE THIRD. There
          are exactly three cards: at 1024 `md:grid-cols-2` drew 2 + 1, a
          half-width empty cell above two full-width tiles, which is the
          loudest thing in the row and says nothing. Three-up at 1024 is about
          240px a card against the artboard's 262px at 1440 — the same card,
          slightly narrower — and the row reads as one row at every width above
          `md`. */}
      <PageGrid className="md:grid-cols-2 lg:grid-cols-3 xl:auto-rows-min">
        {cards.map((c) => (
          <Tile
            key={c.role}
            col={4}
            row={2}
            eyebrow={c.label}
            meta={c.monthChip ?? undefined}
            distribute="between"
            className="xl:min-h-[248px]"
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
                  "nobody receives this yet". It stays, in mono — on the card
                  where it is this brief's own fact, and in the section head
                  where it is the same sentence for all three. */}
              {!shared && (
                <p className="m-0 font-mono text-[10.5px] leading-[1.4] text-muted-foreground">{deliveryLine(c)}</p>
              )}
              {c.pdf?.stale && (
                <p className="m-0 font-mono text-[10.5px] leading-[1.4] text-muted-foreground">rebuilt on download</p>
              )}
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
    </>
  )
}

/**
 * The footer's left half — the artboard's actions, and none of them drawn
 * where there is nothing behind it.
 *
 * The mock draws PDF and Share link on every card. A card with no build has no
 * PDF to download and no snapshot to share, and a link that opens nothing is
 * the same defect as the window control this component already lost.
 *
 * ONE ROW, BECAUSE THE FOOTER IS ONE ROW. `Tile`'s footer is a single
 * `items-center` line with the note on its right; four wrapping actions took
 * it to two rows at every width and left the reading stamp floating at the
 * midpoint between them, aligned to neither. So the cluster does not wrap —
 * and the way to make three fit is to drop the fourth rather than to shrink
 * them. `Share link` is the one that goes: it navigated to the archive row for
 * this very snapshot, which is now visible on the same screen (the three lists
 * are drawn at once), and the archive's own footer says where a share link is
 * made. Open reaches the artefact; the Studio rebuilds it.
 *
 * AND A STALE PDF DOES NOT STATE A SIZE. `artifacts.stale` means the file was
 * cleared from storage and `/api/artifacts/[id]` re-renders it on the way out:
 * a different file from the one whose bytes we hold, and a render that counts
 * against `EXPORT_DAILY_LIMIT` and can answer 429. Printing "812 KB" beside a
 * link that will not hand back 812 KB is the quietest wrong number on the
 * card. The action drops the size, and the CARD says what will happen —
 * `staleLine`, in the body's mono voice, because the sentence the detail pane
 * uses ("· rebuilt on download") is longer than the footer's one row will
 * hold and truncating it is how the warning would be lost.
 */
function BriefActions({ card, studio, basePath }: { card: BriefCard; studio: boolean; basePath: string }) {
  // 32px OF TARGET, WHICH IS WHAT M7 GAVE THE ARCHIVE'S INPUTS. These nine
  // links were 17px high — the most-used controls on the page and the smallest
  // thing on it, on a page that had four target sizes after M7 raised one of
  // them. `inline-flex h-8 items-center` keeps the row one line and the text at
  // 12px; only the hit area grows, and `-my-1` keeps the footer's own height
  // where it was.
  const link = 'inline-flex h-8 -my-1 items-center whitespace-nowrap text-[12px] font-medium underline underline-offset-2'
  return (
    <span className="flex min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden">
      {card.latest && (
        <Link href={`${basePath}?view=${card.latest.snapshotId}`} scroll={false} className={link}>Open</Link>
      )}
      {card.pdf && (
        <a href={`/api/artifacts/${card.pdf.id}`} className={link}>
          PDF{card.pdf.stale ? '' : ` · ${fmtBytes(card.pdf.bytes)}`}
        </a>
      )}
      {studio && (
        <Link href={card.reportId ? `${STUDIO_HREF}?item=${card.reportId}` : `${STUDIO_HREF}/new`} className={link}>
          {card.latest ? 'Studio' : card.reportId ? 'Build it in the Studio' : 'Set it up in the Studio'}
        </Link>
      )}
    </span>
  )
}
