import type { ReactNode } from 'react'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import type { FormatMatrix, FormatMatrixSide, FormatRow } from '@/lib/reading/formats'
import type { FigureTable } from '@/lib/reading/verdicts'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import type { ContentBriefData } from '@/lib/pages/content-brief'

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

const pctOf = (row: FormatRow | null): number | null => (row ? row.pct : null)

/** The widest share in a column, so one column's bars are scaled against each
 *  other and never against another column's. Never a partition: the bar is a
 *  reading aid inside one audience, and the number beside it is the claim. */
function columnMax(side: FormatMatrixSide, keys: readonly { key: string }[]): number {
  const values = keys.map((k) => pctOf(side.byKey[k.key]) ?? 0)
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

/** One cell: the bar, then the figure over its own denominator. */
function Cell({ side, row, max, mode }: { side: FormatMatrixSide; row: FormatRow | null; max: number; mode: RenderMode }) {
  if (side.unread) return <span />
  const k = row?.value.k ?? 0
  const n = row?.value.n ?? side.of
  // THE CATEGORY COLUMN IS A PERCENTAGE AND THE NARROW ONES ARE COUNTS, which
  // is the artboard's own choice and the honest one: "2 of 9" is readable and
  // "22.2% of 9" pretends to a precision nine videos do not carry. The rule
  // that matters is the same either way — the denominator is in the cell.
  const wide = n >= 100
  return (
    <span className="flex items-center gap-2.5">
      <Bar pct={pctOf(row)} max={max} colour={sideColour(side)} />
      <span className="w-[62px] flex-none">
        <FigureCell mode={mode} value={wide ? fmtPct(row?.pct ?? 0) : fmtInt(k)} of={`of ${fmtInt(n)}`} />
      </span>
    </span>
  )
}

function ColumnHead({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">{children}</span>
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

function Matrix({ matrix, heading, mode }: { matrix: FormatMatrix; heading: string; mode: RenderMode }) {
  const { keys, sides } = matrix
  if (keys.length === 0 || sides.length === 0) return null
  const maxes = sides.map((s) => columnMax(s, keys))
  const cols = `168px repeat(${sides.length}, minmax(0, 1fr))`
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Eyebrow>{heading}</Eyebrow>
        <Legend sides={sides} />
      </div>
      <div className="grid items-center gap-x-5 gap-y-[7px]" style={{ gridTemplateColumns: cols }}>
        <ColumnHead>{heading === 'What gets made' ? 'Format' : 'Hook'}</ColumnHead>
        {sides.map((s) => <ColumnHead key={s.audience}>{s.label}</ColumnHead>)}
        {keys.map((k) => (
          <Row key={k.key} label={k.label}>
            {sides.map((s, i) => (
              <Cell key={s.audience} side={s} row={s.byKey[k.key]} max={maxes[i]} mode={mode} />
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

/** A `<Fragment>` would be right here and is not: the grid needs each cell as
 *  its own child, so the row is the label plus its cells, flattened. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="truncate text-[13.5px] text-foreground">{label}</span>
      {children}
    </>
  )
}

function Engagement({ rows, mode, of, basisLine }: { rows: readonly FormatRow[]; mode: RenderMode; of: number; basisLine: string }) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.engagement.median ?? 0), 1)
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-tile px-5 py-4">
      <Eyebrow>Median engagement per format</Eyebrow>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className="w-[118px] flex-none truncate text-[13px] text-foreground">{r.label}</span>
            <span className="h-[11px] flex-1 overflow-hidden rounded-[3px] bg-inner">
              <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, ((r.engagement.median ?? 0) / max) * 100)}%`, background: 'var(--cat)' }} />
            </span>
            <span className="w-[92px] flex-none">
              <FigureCell mode={mode} align="right" value={`${r.engagement.median}%`} of={`of ${fmtInt(r.engagement.n)} rated`} />
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
        meta={data.monthLabel}
        footerNote={p.basisLine}
        footer={p.coverageLine}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Matrix matrix={p.formats} heading="What gets made" mode={mode} />
          <div className="grid gap-x-12 gap-y-4 md:grid-cols-[7fr_5fr]">
            <Matrix matrix={p.hooks} heading="How they open" mode={mode} />
            <Engagement rows={p.engagement} mode={mode} of={category?.of ?? 0} basisLine={p.basisLine} />
          </div>
          {p.formats.conclusion ? (
            <p className="m-0 flex items-start gap-2.5 rounded-md bg-inner px-4 py-3 text-[13.5px] leading-[1.45] text-foreground">
              <span className="mt-[7px] inline-block h-[6px] w-[6px] flex-none rounded-full bg-primary" aria-hidden />
              <span>{p.formats.conclusion}</span>
            </p>
          ) : null}
          {slide.below.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Eyebrow>Under your own median video</Eyebrow>
              <ul className="m-0 flex flex-wrap gap-x-5 gap-y-1 p-0">
                {slide.below.map((r) => (
                  <li key={r.key} className="flex items-baseline gap-2 text-[12.5px] text-secondary-foreground">
                    <span>{r.label}</span>
                    <FigureCell mode={mode} value={`${r.engagement.median}%`} of={`of ${fmtInt(r.engagement.n)} rated`} />
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[11.5px] leading-[1.4] text-muted-foreground">
                Each of these ran under {slide.brand}&rsquo;s own median video this month. That is what the numbers say; what to make of it is yours.
              </p>
            </div>
          ) : null}
          <p className="m-0 text-[11.5px] leading-[1.4] text-muted-foreground">{p.excludedNote}</p>
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
    const best = p.engagement[0]
    if (best?.engagement.median != null) {
      out.content_best_format_engagement = { value: best.engagement.median, unit: 'pct', label: `${best.engagement.median}% median engagement` }
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

const PLAYBOOK_GONE = 'The formats behind this brief could not be read.'
