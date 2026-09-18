import type { ReactNode } from 'react'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import type { FormatMatrix, FormatMatrixSide, FormatRow } from '@/lib/reading/formats'
import type { FigureTable } from '@/lib/reading/verdicts'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { LEAD_MIN_RATED, PLAYBOOK_GONE, type ContentBriefData } from '@/lib/pages/content-brief'

// The content brief's page 3 — "Hooks and formats that worked" (Block D wave 2,
// package E-content; artboard ContentBrief.dc.html slide 3).
//
// WHAT THE ARTBOARD DRAWS AND WHAT IS PRINTED INSTEAD, IN FOUR PLACES:
//
//   D4 · the mock's five format shares read as a mix of one whole, with an
//   "Other" remainder. They are not: a video carries a format AND a hook, and
//   the three columns are three independent audiences. So every cell prints its
//   OWN "of N" through `FigureCell`, there is no remainder row, and no bar is
//   scaled so that a column's bars add up to the width of the table.
//
//   D9 · the mock stamps the slide "September 2026" over figures that are on
//   the PUBLISHED clock (`videos.upload_date`), not the comment's. Every table
//   here carries `basisLine` — "videos published in September" — and the
//   coverage line names the classified n against the published one.
//
//   D10 · the mock's category column prints a bare "41%". A level without its
//   "of N" is a score. The category cell is the share over the classified
//   denominator it was measured on.
//
//   D5 · the mock's takeaway says one format "outperformed" another. The
//   sentence printed here is `matrixConclusion`'s, composed in code from the
//   two medians with the videos each was measured over, and it says nothing
//   about direction: a comparison between two formats at one moment is not a
//   claim that either is going anywhere.
//
// A NULL CELL IS TWO DIFFERENT FACTS AND THE TABLE SAYS WHICH (see
// `FormatMatrixSide.byKey`). Where the side was read and has none of that
// format, the cell is "0 of N" — the mock's "0 of 9" said honestly. Where the
// side was not read for this key at all (a rival's hooks: own-post hooks are
// counted for tracked accounts only), the COLUMN prints that sentence once and
// its cells print nothing, because a 0 for both states is a measurement nobody
// made.

const COLOUR: Record<string, string> = {
  [INDUSTRY_AUDIENCE]: 'var(--cat)',
  [CLIENT_AUDIENCE]: 'var(--you)',
}

const sideColour = (side: FormatMatrixSide): string => COLOUR[side.audience] ?? 'var(--comp)'

/** What the two tables left off, said ONCE. Every key dropped is still counted
 *  in every "of N" above it, so the shares stay shares of the same thing. */
function moreLine(p: { formats: FormatMatrix; hooks: FormatMatrix }): string {
  const f = Math.max(0, p.formats.keys.length - (SHOWN['What gets made'] ?? 0))
  const h = Math.max(0, p.hooks.keys.length - (SHOWN['How they open'] ?? 0))
  const parts: string[] = []
  if (f > 0) parts.push(`${f} more ${f === 1 ? 'format' : 'formats'}`)
  if (h > 0) parts.push(`${h} more ${h === 1 ? 'hook' : 'hooks'}`)
  return parts.length === 0 ? '' : `${parts.join(' and ')} not drawn, counted in every denominator`
}

const pctOf = (row: FormatRow | null): number | null => (row ? row.pct : null)

/**
 * The widest share in the TABLE, so every bar on it is drawn at one scale.
 *
 * IT WAS PER COLUMN, AND THAT INVERTED ROWS (design review 4, code review 3).
 * Each column scaled against its own largest value, so Össur's 28 of 84 — a
 * 33% share — drew a full-width bar beside the category's 40.8% at 60% width:
 * the longest bar in the row belonged to the smallest share. A bar is a reading
 * aid for a SHARE and a share is comparable across sides whatever each side's
 * denominator is, so one scale is the only one that can be read across a row.
 *
 * Still never a partition (D4): nothing sums to the width of the table, there
 * is no remainder row, and the number beside each bar carries its own "of N".
 */
function matrixMax(sides: readonly FormatMatrixSide[], keys: readonly { key: string }[]): number {
  const values = sides.flatMap((side) => keys.map((k) => pctOf(side.byKey[k.key]) ?? 0))
  return Math.max(...values, 1)
}

function Bar({ pct, max, colour }: { pct: number | null; max: number; colour: string }) {
  return (
    <span className="h-[11px] flex-1 overflow-hidden rounded-[3px] bg-inner">
      {pct == null || pct <= 0 ? null : (
        <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, (pct / max) * 100)}%`, background: colour }} />
      )}
    </span>
  )
}

/**
 * One cell: the bar, then the figure over its own denominator.
 *
 * THE UNIT IS DECIDED BY WHICH SIDE, NEVER BY HOW BIG (design review 4, code
 * review 3). It was `n >= 100`, evaluated per CELL, so a row whose two named
 * sides straddled a hundred printed "40.8% of 687 · 28 of 84 · 21.8% of 124" —
 * the two columns the page exists to compare, in two different units, decided
 * by a cutoff that happened to fall between them. The comment claimed the
 * artboard's authority for it; the artboard prints the CATEGORY as a share and
 * both named columns as counts ("2 of 9" · "6 of 14"), which is a rule about
 * which side. That rule is here: the category is a share of a population nobody
 * can name a member of, and you and your rival are counts, in the same unit as
 * each other, whatever either one's total. The denominator is in the cell
 * either way (D10).
 */
export function cellFigure(side: FormatMatrixSide, row: FormatRow | null): { value: string; of: string } {
  const k = row?.value.k ?? 0
  const n = row?.value.n ?? side.of
  const share = side.audience === INDUSTRY_AUDIENCE
  return { value: share ? fmtPct(row?.pct ?? 0) : fmtInt(k), of: `of ${fmtInt(n)}` }
}

function Cell({ side, row, max, mode }: { side: FormatMatrixSide; row: FormatRow | null; max: number; mode: RenderMode }) {
  if (side.unread) return <span role="cell" />
  const figure = cellFigure(side, row)
  return (
    <span role="cell" className="flex items-center gap-2.5">
      <Bar pct={pctOf(row)} max={max} colour={sideColour(side)} />
      <span className="w-[62px] flex-none">
        <FigureCell mode={mode} value={figure.value} of={figure.of} />
      </span>
    </span>
  )
}

/**
 * FORMAT · THE CATEGORY · ÖSSUR · OTTOBOCK — the only labels telling a reader
 * which number is theirs, and the smallest type on the slide.
 *
 * AT FULL STRENGTH, WHICH IS ONE PLACE THE MOCK IS NOT COPIED (design review 8,
 * code review 12). The artboard sets these at `rgba(110,115,120,.8)`, measured
 * at 3.77:1 on white and worse on paper at 297mm. The size, the tracking and
 * the colour FAMILY are the artboard's; the 80% alpha is not, because it is the
 * one thing on the slide a reader cannot afford to lose — `#6E7378` at full
 * strength is 4.87:1 and identical in every other respect.
 */
function ColumnHead({ children }: { children: ReactNode }) {
  return <span role="columnheader" className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{children}</span>
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
      <span className="inline-block h-[2px] w-4 rounded-full bg-primary" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function Legend({ sides }: { sides: readonly FormatMatrixSide[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {sides.map((s) => (
        <span key={s.audience} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: sideColour(s) }} aria-hidden />
          {s.label}, {fmtInt(s.published)} {s.published === 1 ? 'post' : 'posts'}
        </span>
      ))}
    </div>
  )
}

/**
 * How many rows each table prints before the tail is left to the "of N".
 *
 * A DISPLAY DECISION, AND IT SAYS SO ON THE PAGE. `formatMatrix` already keeps
 * the whole reading and shortens only the key list a column PRINTS, and every
 * key dropped here is still counted in every `of` above it — so the shares stay
 * shares of the same thing. The counts are the artboard's own (five formats,
 * three hooks), and they are what fits a 1123 × 631 sheet beside the engagement
 * card; the line under the table names what was left off.
 */
const SHOWN: Record<string, number> = { 'What gets made': 4, 'How they open': 3 }

function Matrix({ matrix, heading, mode, legend = true }: { matrix: FormatMatrix; heading: string; mode: RenderMode; legend?: boolean }) {
  const { sides } = matrix
  const limit = SHOWN[heading] ?? matrix.keys.length
  const keys = matrix.keys.slice(0, limit)
  if (keys.length === 0 || sides.length === 0) return null
  const max = matrixMax(sides, keys)
  const cols = `168px repeat(${sides.length}, minmax(0, 1fr))`
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Eyebrow>{heading}</Eyebrow>
        {legend ? <Legend sides={sides} /> : null}
      </div>
      {/* A TABLE THAT SAYS IT IS ONE (design review 9). The layout is the
          artboard's CSS grid and stays exactly that — `display: contents` on
          each row keeps every cell a direct grid child — but the grid now
          carries table semantics, so a screen reader and a text extraction get
          "Story · The category · 40.8% of 687" instead of a row of numbers with
          the column names four lines above them. The numbers card next door has
          had `<dl>` since it was written; this is the same instinct applied
          evenly. */}
      <div role="table" aria-label={`${heading}, ${matrix.basisLine}`} className="grid items-center gap-x-5 gap-y-[3px]" style={{ gridTemplateColumns: cols }}>
        <div role="row" className="contents">
          <ColumnHead>{heading === 'What gets made' ? 'Format' : 'Hook'}</ColumnHead>
          {sides.map((s) => <ColumnHead key={s.audience}>{s.label}</ColumnHead>)}
        </div>
        {keys.map((k) => (
          <Row key={k.key} label={k.label}>
            {sides.map((s) => (
              <Cell key={s.audience} side={s} row={s.byKey[k.key]} max={max} mode={mode} />
            ))}
          </Row>
        ))}
      </div>
      {sides.filter((s) => s.unread).map((s) => (
        <p key={s.audience} className="m-0 text-[12px] leading-[1.45] text-muted-foreground">{s.unread}</p>
      ))}
    </div>
  )
}

/** One row: its own element, so it can BE a row, and `display: contents` so
 *  the grid still sees the label and the cells as its own children. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="row" className="contents">
      <span role="rowheader" className="truncate text-[13.5px] text-foreground">{label}</span>
      {children}
    </div>
  )
}

/** The artboard's four rows. Best MEDIAN first, which is `PlaybookBlock
 *  .engagement`'s own order and not the count order of the table beside it. */
const ENGAGEMENT_SHOWN = 3

// EVERY PERCENTAGE ON THIS SLIDE GOES THROUGH `fmtPct` (code review 5). Three
// places wrote `${median}%` by hand while the file imported the formatter for
// the matrix cells, and the result was on the page: 3.7% beside 21.8%, rounded
// by two different rules. AGENTS.md names this exactly — "three hand-rolled
// ones is how '3.4%', '3%' and '3.4 pct' reach one product". What `fmtPct` does
// NOT do is pad a whole number to one decimal, so "21%" still sits beside
// "21.8%" down the category column; that is the product's one rounding rule and
// a second one here to make a column look even would be the defect over again.
/**
 * The card's rows, with the ones a finding may rest on first.
 *
 * `PlaybookBlock.engagement` is ordered by median alone, so the top row of the
 * card was regularly a format with four rated videos in it — the same row the
 * slide's takeaway used to promote (design review 5). A row under the floor is
 * still SHOWN, with its own "of N"; it just does not take the top slot from a
 * row measured over two hundred videos.
 */
export function engagementOrder(rows: readonly FormatRow[], floor: number): FormatRow[] {
  const clears = (r: FormatRow) => r.engagement.n >= floor
  return [...rows].sort((a, b) => Number(clears(b)) - Number(clears(a)) || (b.engagement.median ?? 0) - (a.engagement.median ?? 0))
}

function Engagement({ rows: all, mode, of, basisLine }: { rows: readonly FormatRow[]; mode: RenderMode; of: number; basisLine: string }) {
  const rows = engagementOrder(all, LEAD_MIN_RATED).slice(0, ENGAGEMENT_SHOWN)
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.engagement.median ?? 0), 1)
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-tile px-4 py-3">
      <Eyebrow>Median engagement per format</Eyebrow>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className="w-[118px] flex-none truncate text-[13px] text-foreground">{r.label}</span>
            <span className="h-[11px] flex-1 overflow-hidden rounded-[3px] bg-inner">
              <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, ((r.engagement.median ?? 0) / max) * 100)}%`, background: 'var(--cat)' }} />
            </span>
            <span className="w-[92px] flex-none">
              <FigureCell mode={mode} align="right" value={fmtPct(r.engagement.median ?? 0)} of={`of ${fmtInt(r.engagement.n)} rated`} />
            </span>
          </div>
        ))}
      </div>
      <p className="m-0 border-t border-border pt-2.5 text-[12.5px] leading-[1.45] text-muted-foreground">
        Read from {fmtInt(of)} classified {basisLine}. A Reddit post carries no engagement rate and is in no row here.
      </p>
    </div>
  )
}

function EmailArm({ data }: { data: ContentBriefData }) {
  const p = data.playbook.playbook
  if (!p) return null
  const line = (side: FormatMatrixSide) =>
    p.formats.keys
      .map((k) => {
        const row = side.byKey[k.key]
        return `${k.label} ${fmtInt(row?.value.k ?? 0)} of ${fmtInt(row?.value.n ?? side.of)}`
      })
      .join(' · ')
  return (
    <div>
      {p.formats.sides.map((s) => (
        <div key={s.audience} style={{ marginTop: 8 }}>
          <div style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: EMAIL.ink }}>{s.label}</div>
          <div data-copy="level" style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{line(s)}</div>
        </div>
      ))}
      <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 8 }}>{p.coverageLine}</div>
      {p.formats.conclusion ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, marginTop: 6 }}>{p.formats.conclusion}</div>
      ) : null}
    </div>
  )
}

export const contentPlaybook: Block<ContentBriefData> = {
  key: 'content.playbook',
  title: 'Hooks and formats that worked',
  question: 'What does the category make, what do you make, and what is rated highest?',

  render(data, mode = 'app') {
    const slide = data.playbook
    const p = slide.playbook
    // `emptyState` NAMES THE ABSENCE — a failed read, a month nothing was read
    // in, or a corpus nothing has classified (see `buildPlaybookSlide`). The
    // `?? PLAYBOOK_GONE` behind it is the unreachable-by-construction arm: a
    // slide with no playbook always carries a sentence, and a block that
    // printed a hole instead would be the defect over again.
    const empty = contentPlaybook.emptyState(data)
    if (empty || !p) {
      return (
        <BlockFrame title={contentPlaybook.title} question={contentPlaybook.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty ?? PLAYBOOK_GONE}</BlockEmpty>
        </BlockFrame>
      )
    }
    if (mode === 'email') {
      return (
        <BlockFrame title={contentPlaybook.title} question={contentPlaybook.question} mode={mode} meta={data.monthLabel} footerNote={p.basisLine}>
          <EmailArm data={data} />
        </BlockFrame>
      )
    }
    const category = p.formats.sides[0]
    return (
      <BlockFrame
        title={contentPlaybook.title}
        question={contentPlaybook.question}
        mode={mode}
        heading={mode !== 'print'}
        meta={data.monthLabel}
        // NO `footerNote` (design review 7). It printed "videos published in
        // September" at the right-hand end of a footer whose own sentence ends
        // "…videos published in September." — the same clause twice on one
        // line. The basis is named by `coverageLine`, by every table's own
        // reading and by the engagement card, which is D9 kept without saying
        // it three times.
        footer={moreLine(p) ? `${p.coverageLine} ${moreLine(p)}.` : p.coverageLine}
      >
        <div className="flex min-w-0 flex-col gap-2.5">
          <Matrix matrix={p.formats} heading="What gets made" mode={mode} />
          {/* THE TAKEAWAY, COMPOSED IN CODE FROM THE TWO MEDIANS (D5). Two
              formats at one moment, each with the videos its median was read
              over, and not a word about direction. */}
          {p.formats.conclusion ? (
            <p className="m-0 flex items-start gap-2.5 text-[12.5px] leading-[1.4] text-foreground">
              <span className="mt-[7px] inline-block h-[6px] w-[6px] flex-none rounded-full bg-primary" aria-hidden />
              <span>{p.formats.conclusion}</span>
            </p>
          ) : null}
          <div className="grid gap-x-10 gap-y-3 md:grid-cols-[7fr_5fr]">
            <Matrix matrix={p.hooks} heading="How they open" mode={mode} legend={false} />
            <Engagement rows={p.engagement} mode={mode} of={category?.of ?? 0} basisLine={p.basisLine} />
          </div>
          {slide.below.length > 0 ? (
            /* "WHAT NOT TO MAKE", AS THE INVERSE OF THE PLAYBOOK RATHER THAN AS
               AN INSTRUCTION (`belowMedian`). Every row carries the videos its
               median was read over, and the sentence stops at what the numbers
               say. */
            <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span>Under {slide.brand}&rsquo;s own median video this month:</span>
              {slide.below.map((r) => (
                <span key={r.key} className="flex items-baseline gap-1.5 text-secondary-foreground">
                  <span>{r.label}</span>
                  <FigureCell mode={mode} value={fmtPct(r.engagement.median ?? 0)} of={`of ${fmtInt(r.engagement.n)} rated`} />
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const p = data.playbook.playbook
    if (!p) return {}
    const out: FigureTable = {}
    const category = p.formats.sides[0]
    if (category) {
      out.content_formats_read_from = { value: category.of, unit: 'videos', label: `${fmtInt(category.of)} classified videos` }
      out.content_formats_published = { value: category.published, unit: 'videos', label: `${fmtInt(category.published)} videos published` }
    }
    // THE BEST FORMAT A MODEL MAY NAME CLEARS THE SAME FLOOR THE TAKEAWAY DOES
    // (design review 5): a token labelled "median engagement" that was measured
    // over four videos is a finding rested on four videos wherever it lands.
    const best = engagementOrder(p.engagement, LEAD_MIN_RATED).filter((r) => r.engagement.n >= LEAD_MIN_RATED)[0]
    if (best?.engagement.median != null) {
      out.content_best_format_engagement = { value: best.engagement.median, unit: 'pct', label: `${fmtPct(best.engagement.median)} median engagement` }
      out.content_best_format_videos = { value: best.engagement.n, unit: 'videos', label: `${fmtInt(best.engagement.n)} rated videos` }
    }
    return out
  },

  // NO `verdicts()`. Nothing on this slide is a movement claim: the two medians
  // are one moment's reading of two formats, and `belowMedian` is a comparison
  // with the audience's own median video, not with a month before. A block that
  // published a verdict it had not banded would licence a direction word
  // somewhere downstream (copy contract rule (c)).

  quotes: () => [],

  emptyState(data) {
    return data.playbook.empty
  },
}
