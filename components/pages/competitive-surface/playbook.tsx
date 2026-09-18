import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import type { FormatMatrix, FormatMatrixSide, FormatRow } from '@/lib/reading/formats'
import type { PlaybookBlock } from '@/lib/pages/playbook'
import { playbookFigures } from '@/lib/pages/playbook'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'

// CO7 · How the category makes content (the artboard's full-width
// `grid-column: span 12` — three tables abreast at 410 · 336 · 1fr).
//
// TWO NUMBERS, NOT ONE (D6). The artboard heads this tile "read from all 1,388
// category videos" over shares the classifier reached 41% of; the spec's own
// §Competitive says 569 of 1,388. So every column's legend carries its
// CLASSIFIED n — what the shares are actually shares of — and `coverageLine`
// prints the classified against the published for all three sides. A share of
// a population the measurement never reached is not a share of what it says it
// is.
//
// "NONE OF 9" BECOMES "0 of 9", AND ONLY WHERE WE LOOKED. A null cell is two
// different facts and `FormatMatrixSide` says which: where the side's `unread`
// is null it WAS read and simply has none of that format, so the cell prints
// `0 of N` off the side's own denominator; where `unread` is set the side was
// not read for this key at all and the whole column prints that sentence
// instead of a wall of zeros. A renderer that prints 0 for both is claiming a
// measurement nobody made — which is exactly what the mock's "none of 14" does
// beside its own footnote saying Freitag's hooks were not read.
//
// NOTHING SUMS, AND NOTHING IS DRAWN AS IF IT DID (D4). One video carries a
// format AND a hook, and the three columns are three independent audiences.
// The bars are per row against that row's own denominator — never a stacked
// partition, never an "Other" remainder, because a mix that adds to 100%
// invites the one arithmetic the reading layer exists to stop.
//
// DATED BY THE UPLOAD, AND IT SAYS SO (D9). A format, a hook and an engagement
// rate are properties of a VIDEO, not of a comment, so this whole tile keeps
// `basis: 'published'` and prints `basisLine` where the rest of the page prints
// its month.
//
// THE MEDIAN COLUMN IS MEDIAN-ORDERED, NOT COUNT-ORDERED. `playbook.engagement`
// is sorted by the median and every row in it cleared `ENGAGEMENT_MIN_VIDEOS`,
// because a format's median read off one video is not a property of the format.

/** The artboard's three tables, at its own widths, wrapping to one column
 *  before they would squeeze. The tile is full width, so the three fit at
 *  1440 exactly as the mock draws them. */
const COLUMNS = 'grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,410px)_minmax(0,336px)_minmax(0,1fr)]'

const HEAD = 'font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground'

/** The matrix grid, by how many sides follow the widest one. */
const GRID_FOR: Record<number, string> = {
  0: 'grid items-center gap-2 grid-cols-[minmax(0,1fr)_112px]',
  1: 'grid items-center gap-2 grid-cols-[minmax(0,1fr)_112px_72px]',
  2: 'grid items-center gap-2 grid-cols-[minmax(0,1fr)_112px_72px_72px]',
}

const COLOR: Record<string, string> = {
  [INDUSTRY_AUDIENCE]: 'var(--cat)',
  [CLIENT_AUDIENCE]: 'var(--you)',
}
const sideColor = (audience: string): string => COLOR[audience] ?? 'var(--comp)'

/** The mock's thin track-and-fill, per row and against that row's OWN
 *  denominator — never a segment of a shared whole. */
function Track({ pct, color, width = 92 }: { pct: number; color: string; width?: number }) {
  return (
    <span className="h-1.5 shrink-0 overflow-hidden rounded-full bg-inner" style={{ width }} aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} />
    </span>
  )
}

/** One side's cell for one key.
 *
 *  Three outcomes and they are three different sentences: a row (k of n), a
 *  side that was read and has none of this format (0 of n), and a side that
 *  was not read for this key at all (nothing here — the column's own sentence
 *  says why, once, under the table). */
function Cell({ side, formatKey, mode }: { side: FormatMatrixSide; formatKey: string; mode: RenderMode }) {
  if (side.unread) return mode === 'email' ? <span /> : <span aria-hidden />
  const row = side.byKey[formatKey] ?? null
  const value = row ? row.value.k : 0
  return <FigureCell value={fmtInt(value)} of={`of ${fmtInt(side.of)}`} align="right" mode={mode} />
}

/** Formats or hooks: the key down the left, the widest side drawn as a bar, the
 *  remaining sides as their own counts over their own denominators. */
function Matrix({
  matrix, label, mode,
}: {
  matrix: FormatMatrix
  label: string
  mode: RenderMode
}) {
  const email = mode === 'email'
  const [lead, ...rest] = matrix.sides
  if (!lead) return null
  // WRITTEN OUT IN FULL, NEVER INTERPOLATED — Tailwind v4's scanner reads the
  // source, so a template-built class string compiles to nothing and the table
  // silently collapses to one column (the span maps in `tile.tsx` follow the
  // same rule for the same reason). Two entries because a tenant with no rival
  // selected draws two sides and one with a rival draws three.
  const grid = GRID_FOR[rest.length] ?? GRID_FOR[2]

  if (email) {
    return (
      <div>
        <div style={{ fontFamily: FONT.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: EMAIL.muted, paddingBottom: 4 }}>{label}</div>
        {matrix.keys.map((key) => (
          <div key={key.key} style={{ padding: '3px 0', borderTop: `1px solid ${EMAIL.hairline}`, fontFamily: FONT.sans, fontSize: 12 }}>
            {key.label}{' — '}
            {[lead, ...rest].map((side) => (
              <span key={side.audience}>
                {side.label}{' '}<Cell side={side} formatKey={key.key} mode={mode} />{' '}
              </span>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={`${grid} border-b border-border/70 pb-1.5`}>
        <span className={HEAD}>{label}</span>
        <span className={HEAD}>{lead.label}</span>
        {rest.map((s) => <span key={s.audience} className={`${HEAD} text-right`}>{s.label}</span>)}
      </div>
      {matrix.keys.map((key) => {
        const leadRow = lead.byKey[key.key] ?? null
        return (
          <div key={key.key} className={`${grid} min-h-[22px]`}>
            <span className="min-w-0 truncate text-[12.5px]">{key.label}</span>
            {lead.unread ? <span aria-hidden /> : (
              <span className="flex items-center gap-2">
                <Track pct={leadRow?.pct ?? 0} color={sideColor(lead.audience)} />
                <FigureCell
                  value={leadRow?.pct != null ? fmtPct(leadRow.pct, 0) : '0%'}
                  of={`${fmtInt(leadRow?.value.k ?? 0)} of ${fmtInt(lead.of)}`}
                  mode={mode}
                />
              </span>
            )}
            {rest.map((s) => <Cell key={s.audience} side={s} formatKey={key.key} mode={mode} />)}
          </div>
        )
      })}
      {/* A COLUMN NEVER READ PRINTS A SENTENCE, NOT A ZERO. */}
      {matrix.sides.filter((s) => s.unread).map((s) => (
        <p key={s.audience} className="m-0 font-mono text-[10px] leading-[1.35] text-muted-foreground">{s.unread}</p>
      ))}
    </div>
  )
}

/** The mock's third column: the category's formats by MEDIAN engagement, each
 *  with the videos its median was read off. */
function Medians({ rows, mode }: { rows: readonly FormatRow[]; mode: RenderMode }) {
  const email = mode === 'email'
  const top = rows.reduce((m, r) => Math.max(m, r.engagement.median ?? 0), 0)
  if (rows.length === 0) return null

  if (email) {
    return (
      <div>
        <div style={{ fontFamily: FONT.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: EMAIL.muted, paddingBottom: 4 }}>Median engagement</div>
        {rows.map((r) => (
          <div key={r.key} style={{ padding: '3px 0', borderTop: `1px solid ${EMAIL.hairline}`, fontFamily: FONT.sans, fontSize: 12 }}>
            {r.label} <span data-copy="figure" style={{ fontFamily: FONT.mono }}>{fmtPct(r.engagement.median ?? 0)}</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted }}> n {fmtInt(r.engagement.n)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,176px)] items-center border-b border-border/70 pb-1.5">
        <span className={HEAD}>Median engagement</span>
        {/* NOT "Category · TikTok". The median is read across every platform
            except the ones the exclusion list names, and Reddit's rate is
            measured against a 40-comment ceiling. */}
        <span className={`${HEAD} text-right`}>The category · Reddit excluded</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid min-h-[22px] grid-cols-[minmax(0,1fr)_minmax(0,176px)] items-center">
          <span className="min-w-0 truncate text-[12.5px]">{r.label}</span>
          <span className="flex items-center justify-end gap-2">
            <Track pct={top > 0 ? ((r.engagement.median ?? 0) / top) * 100 : 0} color="var(--cat)" width={84} />
            <span data-copy="figure" className="shrink-0 font-mono text-[11.5px] font-semibold tabular-nums">{fmtPct(r.engagement.median ?? 0)}</span>
            <span className="w-[42px] shrink-0 text-right font-mono text-[10.5px] tabular-nums text-muted-foreground">n {fmtInt(r.engagement.n)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** The legend the mock draws over the three tables — each side with its own
 *  CLASSIFIED n, which is the denominator its shares are shares of. */
function Legend({ sides, mode }: { sides: readonly FormatMatrixSide[]; mode: RenderMode }) {
  const email = mode === 'email'
  if (email) {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}>
        {sides.map((s) => `${s.label}, n ${fmtInt(s.of)}`).join(' · ')}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {sides.map((s) => (
        <span key={s.audience} data-copy="level" className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2 shrink-0 rounded-[2px]" style={{ background: sideColor(s.audience) }} aria-hidden />
          {s.label}, <span data-copy="figure" className="font-mono tabular-nums">{fmtInt(s.of)} of {fmtInt(s.published)}</span> classified
        </span>
      ))}
    </div>
  )
}

export const PLAYBOOK_NO_READING =
  'Nothing published this month has been read for its format yet, so there is no playbook to draw.'

export const competitivePlaybook: Block<CompetitiveSurfaceData> = {
  key: 'competitive.playbook',
  title: 'How the category makes content',
  question: 'What shape is the content each of you puts out?',

  render(data, mode = 'app') {
    const p: PlaybookBlock | null = data.playbook
    const email = mode === 'email'
    const empty = competitivePlaybook.emptyState(data)
    const note = email ? undefined : 'm-0 text-[11px] text-muted-foreground'
    const noteStyle = email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 4 } : undefined

    return (
      <BlockFrame
        title={competitivePlaybook.title}
        question={competitivePlaybook.question}
        mode={mode}
        meta={p ? p.basisLine : undefined}
        footer={
          p && !p.unread
            ? mode === 'app'
              ? <Link href="/dashboard/reports" className="hover:underline">Open the content brief →</Link>
              : 'Open the content brief.'
            : undefined
        }
        // THE MOCK SAYS "shares are of the 1,388 category videos" AND IT IS NOT
        // TRUE OF ANY COLUMN BUT THE FIRST. Each column's shares are of that
        // column's own classified videos, and the legend above prints all three.
        footerNote={p && !p.unread ? 'each column is of its own classified videos' : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {p && !p.unread ? (
          <>
            <Legend sides={p.formats.sides} mode={mode} />
            <div className={email ? undefined : COLUMNS}>
              <Matrix matrix={p.formats} label="Format" mode={mode} />
              <Matrix matrix={p.hooks} label="Hook" mode={mode} />
              <Medians rows={p.engagement} mode={mode} />
            </div>
            <p className={note} style={noteStyle}>{p.coverageLine}</p>
            {p.formats.conclusion ? <p className={note} style={noteStyle}>{p.formats.conclusion}</p> : null}
            <p className={note} style={noteStyle}>{p.excludedNote}</p>
          </>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return playbookFigures(data.playbook)
  },

  emptyState(data) {
    if (!data.playbook) return PLAYBOOK_NO_READING
    return data.playbook.unread
  },
}
