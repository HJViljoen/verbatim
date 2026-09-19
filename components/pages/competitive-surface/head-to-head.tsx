import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, monthName } from '@/lib/format'
import { prevMonth } from '@/lib/reading/month-key'
import type { FaceOffMeasure, FaceOffSide, HeadToHead } from '@/lib/reading/head-to-head'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { headToHeadFigures } from '@/lib/pages/playbook'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'

// CO3 · Head to head, then and now (design §3 CO3; the artboard's 7-column
// table at `grid-column: span 7`).
//
// THE ARTBOARD'S LAYOUT, THE READING LAYER'S ANSWERS. The mock draws
// measure · you-now · you-then · you-change · them-now · them-then · them-change
// on one fixed grid, and that is what this draws. What changes is what goes in
// three of the seven columns, and every change is a rule:
//
//   · THE "of N" IS PER SIDE, NOT SHARED (D10), AND IT IS ON BOTH MONTHS. The
//     mock puts one `n 84 · 142` beside the measure label and then prints two
//     bare percentages under it — but "84" is your denominator and "142" is
//     theirs, and a level printed without its own denominator is the score this
//     product does not show. So each side's now-figure is a `FigureCell`
//     carrying its own "of N" — and so is its THEN figure, which shipped bare
//     until the review caught it: last month's share is a level too, and
//     `prev.value` was in hand the whole time. The measure label keeps the
//     CLOCK instead (`basisLine`) — which is the other thing the mock's shared
//     `n` was hiding, because two of these five rows are dated by the comment
//     and three by the video's upload.
//
//   · THREE ROWS CARRY NO BADGE, ON PURPOSE (D3). `proportionDelta` is a
//     two-PROPORTION band. Videos-about and positive share are k of n and are
//     banded; comments per video is a rate, engagement per video is a median of
//     rates, and own posts published is a bare count. The mock prints "+2",
//     "+0.2 pt" and "▼ 2" on exactly those three, which is a confidence the
//     arithmetic does not have. `verdictWhy` is the reason and it prints under
//     the table rather than being swallowed by a `title` nobody on paper can
//     see.
//
//   · THE BADGE IS YOUR SIDE AGAINST LAST MONTH, NEVER YOU AGAINST THEM
//     (lib/reading/head-to-head.ts's own header). Two shares of two different
//     populations have no honest margin between them, so the cross-brand
//     difference is left as two levels printed beside each other and each side
//     carries its own month-on-month verdict.
//
//   · A SIDE THAT IS ABSENT IS NOT A SIDE THAT IS ZERO. `FaceOffMeasure.why`
//     says which, in the reader's words, and the cells stay empty.

/** The artboard's grid, with the two "now" columns widened for the "of N" the
 *  mock pushed into a shared footnote. Fixed widths on purpose — the table is
 *  a comparison and its columns must line up across five rows — inside an
 *  `overflow-x-auto` so a narrow viewport scrolls the table and never reflows
 *  it into a different comparison. */
// The change column is 112px because that is what the WORD needs: a
// non-answer is "too few to compare" or "comparison refused" in 12px sans,
// which is wider than the mock's "+0.2 pt" and the mock never has to draw one.
// A `Tile` is `overflow-hidden`, so a column too narrow does not scroll — it
// clips the answer off the page.
const GRID = 'grid grid-cols-[minmax(140px,1fr)_68px_64px_112px_68px_64px_112px] items-center'

const HEAD = 'font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground'

/** One side's "then" — mono 11.5 muted, the mock's second column, WITH ITS OWN
 *  DENOMINATOR.
 *
 *  IT PRINTED A BARE PERCENTAGE, TWO COLUMNS FROM A HEADER ARGUING AGAINST
 *  EXACTLY THAT. `prev` carries `value` — `shareSide` and `sentimentSide` both
 *  compute it — and the cell threw it away and rendered `prev.text` alone
 *  inside a `figure` marker, so "8.1%" reached the page as the score this
 *  product does not show and rule (b), which reads LEVEL nodes, could not see
 *  it. Same rule as `Now`: `n === 0` is the measure that is not a share of
 *  anything, and only there is the denominator dropped. */
function Then({ level, mode }: { level: FaceOffSide | null; mode: RenderMode }) {
  const prev = level?.prev ?? null
  if (!prev) return mode === 'email' ? <span /> : <span aria-hidden />
  const of = prev.value.n > 0 ? `of ${fmtInt(prev.value.n)}` : null
  if (mode === 'email') {
    return (
      <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted }}>
        {of ? (
          <span data-copy="level">
            <span data-copy="figure">{prev.text}</span> {of}
          </span>
        ) : <span data-copy="figure">{prev.text}</span>}
      </span>
    )
  }
  const cell = (
    <span className="flex min-w-0 flex-col gap-px font-mono text-[11.5px] tabular-nums text-muted-foreground">
      <span data-copy="figure" className="leading-none">{prev.text}</span>
      {of ? <span className="text-[10px] leading-none">{of}</span> : null}
    </span>
  )
  return of ? <span data-copy="level" className="flex min-w-0">{cell}</span> : cell
}

/** One side's "now" — the figure over what it is of.
 *
 *  `n === 0` MEANS THE MEASURE IS NOT A SHARE OF ANYTHING and the denominator
 *  is deliberately omitted (own posts published, where a denominator would have
 *  to be invented) — `FigureCell` documents that as the one case where leaving
 *  `of` off is a statement rather than an omission. */
function Now({ level, mode }: { level: FaceOffSide | null; mode: RenderMode }) {
  if (!level) return mode === 'email' ? <span /> : <span aria-hidden />
  const of = level.value.n > 0 ? `of ${fmtInt(level.value.n)}` : undefined
  return <FigureCell value={level.text} of={of} mode={mode} />
}

/** The change cell. A badge only where a `Verdict` earned one; otherwise the
 *  column is empty and the row's reason is printed under the table — never a
 *  magnitude beside a refusal (D2), and never a blank with no explanation
 *  anywhere on the page. */
function Change({ verdict, mode }: { verdict: Verdict | null; mode: RenderMode }) {
  if (!verdict) return mode === 'email' ? <span /> : <span aria-hidden />
  return <BlockMovement verdict={verdict} unit="pts" mode={mode} />
}

function Row({ measure: m, mode }: { measure: FaceOffMeasure; mode: RenderMode }) {
  const email = mode === 'email'
  const label = (
    <>
      <span className={email ? undefined : 'block text-[12.5px]'} style={email ? { fontSize: 12.5, color: EMAIL.ink } : undefined}>{m.label}</span>
      {/* THE CLOCK, PER ROW. Two of the five are comment-dated and three are
          dated by the video's upload; printing all five under one month
          heading without saying so is decision D9's exact defect. */}
      <span className={email ? undefined : 'block font-mono text-[10.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted } : undefined}>{m.basisLine}</span>
    </>
  )

  if (email) {
    return (
      <div style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}`, fontFamily: FONT.sans }}>
        {label}
        <div style={{ marginTop: 3 }}>
          <Now level={m.you} mode={mode} /> <Then level={m.you} mode={mode} /> <Change verdict={m.verdict} mode={mode} />
          {' · '}
          <Now level={m.them} mode={mode} /> <Then level={m.them} mode={mode} /> <Change verdict={m.rivalVerdict} mode={mode} />
        </div>
        {m.why ? <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{m.why}</div> : null}
      </div>
    )
  }

  return (
    <div className={`${GRID} min-h-[34px] border-t border-border/70 py-1`}>
      <span className="min-w-0 pr-3">{label}</span>
      <Now level={m.you} mode={mode} />
      <Then level={m.you} mode={mode} />
      <Change verdict={m.verdict} mode={mode} />
      <Now level={m.them} mode={mode} />
      <Then level={m.them} mode={mode} />
      <Change verdict={m.rivalVerdict} mode={mode} />
    </div>
  )
}

/** The measure's colour dot and name, the mock's column-group header. */
function SideHead({ label, color, mode }: { label: string; color: string; mode: RenderMode }) {
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.ink }}>{label}</span>
  }
  return (
    <span className="col-span-3 flex items-center gap-1.5 pb-1.5 text-[11px] font-semibold">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}

/** Every distinct reason a COLUMN is empty, in the order the rows appear.
 *
 *  `FaceOffMeasure.why` — "Nothing was read for Rareform in September." — was
 *  computed on all five measures and rendered nowhere, so a tracked rival
 *  nothing of whose content was read got five blank cells and no sentence, and
 *  an empty column reads as a measured nothing. The block's own header says a
 *  side that is absent is not a side that is zero and names `why` as the thing
 *  that says which; it now prints, beside the verdict reasons, on the same
 *  deduplicated rule (the five measures share one sentence per absent side). */
export function sideReasons(h2h: HeadToHead): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of h2h.measures) {
    if (!m.why || seen.has(m.why)) continue
    seen.add(m.why)
    out.push(m.why)
  }
  return out
}

/** Every distinct reason a row drew no band, in the order the rows appear.
 *  Three of the five share one shape of reason and each states its own; a
 *  deduplicated list is what keeps five sentences from becoming five lines
 *  saying the same thing twice. */
export function verdictReasons(h2h: HeadToHead): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of h2h.measures) {
    if (!m.verdictWhy || seen.has(m.verdictWhy)) continue
    seen.add(m.verdictWhy)
    out.push(m.verdictWhy)
  }
  return out
}

/** The mock's quiet footer note, and the short form of the exclusion. The
 *  REASON (the 40-comment cap) is `excludedNote` and prints in the open under
 *  the table — a footer note is metadata and a cap is an argument. */
export const H2H_EXCLUDED_SHORT = 'Reddit excluded from the engagement rows'

export const H2H_NO_RIVAL =
  'No rival is selected, so there is nothing to put beside you. Choose one above and this table fills in.'

export const competitiveHeadToHead: Block<CompetitiveSurfaceData> = {
  key: 'competitive.h2h',
  title: 'Head to head, then and now',
  question: 'Where do the two of you stand, this month against last?',

  render(data, mode = 'app') {
    const h = data.headToHead
    const email = mode === 'email'
    const empty = competitiveHeadToHead.emptyState(data)

    // `Sep · Aug` — the mock's meta, and the two months the table is about.
    const meta = h ? `${monthName(h.month)} · ${monthName(prevMonth(h.month))}` : undefined
    // THE STANDINGS' APRON REGISTER, NOT A SECOND ONE (CO15). These were
    // 11.5px sans, full width, and on the populated fixture CO3's six reasons
    // are the tile's largest block of text — sitting directly under the
    // standings apron, which the previous pass moved to mono 10 for exactly
    // that reason. Two aprons on one page in two registers reads as two kinds
    // of statement; they are the same kind. Same words, one register.
    const note = email ? undefined : 'm-0 font-mono text-[10px] leading-[1.45] text-muted-foreground'
    const noteStyle = email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 4 } : undefined
    // NOT MARKED AS A LEVEL. `footerLine` has two forms — "42 videos of theirs
    // read in September, of 449 read in all." and "No month has been read for
    // Ottobock in September." — and the second carries no denominator because
    // there is nothing for it to be a share of. A `level` marker would fail
    // rule (b) on the honest sentence, which is the wrong way round.
    const footer = h && !h.unread ? h.footerLine : undefined

    return (
      <BlockFrame
        title={competitiveHeadToHead.title}
        // THE BLOCK FILLS ITS TILE, WHICH IS WHAT PUTS ITS FOOTER ON THE
        // FLOOR. `Tile`'s body is `flex-1 flex-col`, but the block renders as
        // its ONE child and was never stretched, so `BlockFrame`'s `mt-auto`
        // footer had no spare height to push against and floated mid-card with
        // up to 431px of empty tile beneath it. `distribute="between"` could
        // not help either: `justify-between` needs two children to spread.
        className={mode === 'app' ? 'h-full' : undefined}
        question={competitiveHeadToHead.question}
        mode={mode}
        meta={meta}
        footer={footer}
        footerNote={h && !h.unread ? H2H_EXCLUDED_SHORT : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {h && !h.unread ? (
          <>
            {email ? (
              <div>
                <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}>
                  <SideHead label={data.brand} color="var(--you)" mode={mode} />
                  {' · '}
                  <SideHead label={h.rivalLabel} color="var(--comp)" mode={mode} />
                </div>
                {h.measures.map((m) => <Row key={m.key} measure={m} mode={mode} />)}
              </div>
            ) : (
              <div className="-mx-1 overflow-x-auto px-1">
                <div className="min-w-[638px]">
                  <div className={`${GRID} border-b border-border/70`}>
                    <span className={`${HEAD} pb-1.5`}>Measure</span>
                    <SideHead label={data.brand} color="var(--you)" mode={mode} />
                    <SideHead label={h.rivalLabel} color="var(--comp)" mode={mode} />
                  </div>
                  {h.measures.map((m) => <Row key={m.key} measure={m} mode={mode} />)}
                </div>
              </div>
            )}
            {/* AN EMPTY COLUMN IS NOT A MEASURED ZERO, AND IT SAYS SO FIRST. */}
            {sideReasons(h).map((why) => (
              <p key={why} className={note} style={noteStyle}>{why}</p>
            ))}
            {/* THE REASONS, IN THE OPEN. Three rows are a rate, a median and a
                count and no band may be drawn over any of them; the mock prints
                a green number on all three instead. */}
            {verdictReasons(h).map((why) => (
              <p key={why} className={note} style={noteStyle}>{why}</p>
            ))}
            <p className={note} style={noteStyle}>{h.excludedNote}</p>
          </>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return headToHeadFigures(data.headToHead)
  },

  verdicts(data): Verdict[] {
    if (!data.headToHead) return []
    return data.headToHead.measures.flatMap((m) =>
      [m.verdict, m.rivalVerdict].filter((v): v is Verdict => v != null),
    )
  },

  emptyState(data) {
    if (!data.headToHead) return H2H_NO_RIVAL
    return data.headToHead.unread
  },
}
