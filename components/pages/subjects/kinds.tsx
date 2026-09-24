import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, monthName } from '@/lib/format'
import { levelText } from '@/lib/reading/level'
import { KIND_ORDER } from '@/lib/reading/kinds'
import { sideEyebrow, type SubjectSide, type SubjectsData } from '@/lib/pages/subjects'

// SU2 · the kinds of thing said, per audience (design §3 SU2, the mock's (b)).
//
// THE DENOMINATOR IS THE AUDIENCE'S, NOT THE SUBJECT'S, and the block says so
// on its own meta line — which is what the approved mock draws ("Sep · every
// video in the audience", over 84 / 142 / 1,388). There is no stored kind
// reading per subject: `month_kind_readings` is kind x audience x month, and
// computing a subject x kind split live would be a second, differently-dated
// answer sitting beside the first. A reader is told which question this block
// answers rather than left to assume it is the other one.
//
// AND THE SHARES DO NOT SUM. A video carries several kinds at once — the
// per-kind distinct video counts run to 175% of one month's denominator on
// Össur's category and 228% on Sealand's — so this is a set of independent
// shares of one denominator and never a pie (decision T, lib/reading/kinds.ts).
// That is the one place this block keeps its own shape against the artboard
// (D4): the mock draws three segmented proportion bars with an "Other kinds"
// remainder, which is a figure the data cannot produce. The mock's ROW layout
// is kept — one audience, its denominator on the right, its kinds under it —
// and each kind carries its own "of N" where a segment would have been.
//
// WHAT WAS MISSING UNTIL NOW is the mock's movement line ("Category, since
// August: questions ▲ 3 pts · praise ▼ 4 pts …"). `kindChange` has existed
// since WP3, Overview and Voice both call it, and this block drew the same rows
// and printed no change at all — mock-gap called it the cheapest real gap on
// the page. The verdicts are banded and each carries its own k and n, so they
// are honest to print; they do NOT sum and nothing here adds them.

/** A column's short head: the audience by name, the reader's own words. */
const columnHead = (side: SubjectSide): string =>
  side.kind === 'you' ? 'You' : side.kind === 'category' ? 'Category' : side.label

/**
 * ONE TABLE, NOT SIX CHARTS (the calm pass). Rows are the kinds, columns the
 * audiences, and each cell is that audience's level for that kind. It used to
 * be five or six bar sets in per-rival orange, with "100.0%" on a five-video
 * audience: loud beside the rest of the page and precise about a sample that
 * cannot carry a percentage. Now:
 *
 *   · Under the floor (`LEVEL_FLOOR_N`, the band's 100 videos) a cell is a
 *     count, "4 of 5"; at or over it, a whole-number share. The column head
 *     carries the audience's "of N videos" either way.
 *   · Neutral ink throughout, one accent: your own column's head takes the
 *     green dot, the way the rest of the product marks "you".
 *   · The kinds still do not sum (decision T): a table of independent levels
 *     says that better than a bar that looks like a part of a whole.
 */
function KindTable({ sides, mode }: { sides: SubjectSide[]; mode: RenderMode }) {
  const email = mode === 'email'
  const kinds = KIND_ORDER.filter((kind) => sides.some((s) => s.kinds.some((k) => k.kind === kind && (k.videos ?? 0) > 0))).slice(0, 6)
  const labelOf = new Map(sides.flatMap((s) => s.kinds.map((k) => [k.kind, k.label] as const)))
  const cellOf = (side: SubjectSide, kind: string) => {
    const k = side.kinds.find((x) => x.kind === kind)
    return levelText(k?.videos ?? 0, side.n)
  }

  const th = email
    ? { fontFamily: FONT.sans, fontSize: 11.5, fontWeight: 500, color: EMAIL.ink, textAlign: 'right' as const, padding: '0 0 6px 12px', verticalAlign: 'bottom' as const }
    : undefined
  const td = email
    ? { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.ink2, textAlign: 'right' as const, padding: '5px 0 5px 12px', borderTop: `1px solid ${EMAIL.hairline}`, whiteSpace: 'nowrap' as const }
    : undefined

  return (
    <div className={email ? undefined : 'min-w-0 overflow-x-auto'}>
      <table className={email ? undefined : 'w-full border-collapse'} style={email ? { width: '100%', borderCollapse: 'collapse' } : undefined}>
        <thead>
          <tr>
            <th aria-label="Kind" style={email ? { ...th, textAlign: 'left', padding: '0 0 6px 0' } : undefined} className={email ? undefined : 'pb-1.5'} />
            {sides.map((s) => (
              <th key={s.audience} scope="col" style={th} className={email ? undefined : 'pb-1.5 pl-3 text-right align-bottom font-normal'}>
                <span className={email ? undefined : 'flex items-center justify-end gap-1.5 whitespace-nowrap text-[12px] font-medium text-foreground'}>
                  {s.kind === 'you' ? (
                    email
                      ? <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 9999, background: EMAIL.up, marginRight: 5 }} />
                      : <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--you)]" />
                  ) : null}
                  {columnHead(s)}
                </span>
                <span
                  data-copy="level"
                  className={email ? undefined : 'block whitespace-nowrap font-mono text-[10.5px] tabular-nums text-muted-foreground'}
                  style={email ? { display: 'block', fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 400, color: EMAIL.muted } : undefined}
                >
                  of {fmtInt(s.n ?? 0)} videos
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kinds.map((kind) => (
            <tr key={kind} className={email ? undefined : 'border-t border-border/70'}>
              <th
                scope="row"
                className={email ? undefined : 'py-1.5 pr-2 text-left text-[12.5px] font-normal text-foreground'}
                style={email ? { ...td, fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, textAlign: 'left', padding: '5px 8px 5px 0', whiteSpace: 'normal' } : undefined}
              >
                {labelOf.get(kind) ?? kind}
              </th>
              {sides.map((s) => {
                const cell = cellOf(s, kind)
                return (
                  <td
                    key={s.audience}
                    data-copy={cell?.kind === 'count' ? 'level' : cell ? 'figure' : undefined}
                    className={email ? undefined : `whitespace-nowrap py-1.5 pl-3 text-right font-mono text-[12px] tabular-nums ${s.kind === 'you' ? 'text-foreground' : 'text-secondary-foreground'}`}
                    style={td}
                  >
                    {cell?.text ?? '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The mock's movement strip: one banded verdict per kind, on one audience.
 *
 * THE MONTH COMES OFF THE VERDICT, NOT OFF THE SERIES (fix pass). "since Aug"
 * was re-derived as the last month on `pane.series[0]` before `data.month`,
 * while the verdicts beside it were built by `buildSides` against
 * `previousMonthOf(month)`. The two agree on the fixture and are not guaranteed
 * to agree on a series with a gap — and a movement claim whose month label
 * comes from a different derivation than its band is precisely the class of bug
 * AGENTS.md's window rule exists for. Every `Verdict` carries its own
 * `basis.from`; that is the month it was measured against and the month the
 * strip names.
 */
function KindMovement({ side, brand, mode }: { side: SubjectSide; brand: string; mode: RenderMode }) {
  const email = mode === 'email'
  const rows = side.kinds
    .filter((k) => side.kindVerdicts[k.kind] != null)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, 4)
  if (rows.length === 0) return null
  // ONE MONTH FOR THE STRIP, and it has to be one: four verdicts measured
  // against two different months under one "since …" is two claims wearing one
  // label, so the strip draws only while its verdicts agree.
  const froms = new Set(rows.map((k) => side.kindVerdicts[k.kind]?.basis?.from).filter(Boolean) as string[])
  if (froms.size !== 1) return null
  const prevMonth = [...froms][0]

  const body = (
    <>
      <span className={email ? undefined : 'text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
        {sideEyebrow(side, brand)}, since {monthName(prevMonth).split(' ')[0]}:
      </span>
      {rows.map((k) => (
        <span key={k.kind} className={email ? undefined : 'flex items-center gap-1.5 text-[12px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginRight: 10 } : undefined}>
          {k.label.toLowerCase()} <BlockMovement verdict={side.kindVerdicts[k.kind]} unit="pts" mode={mode} good="neutral" />
        </span>
      ))}
    </>
  )
  if (email) return <div style={{ paddingTop: 8 }}>{body}</div>
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-[4px] bg-inner px-3 py-2">{body}</div>
  )
}

export const subjectsKinds: Block<SubjectsData> = {
  key: 'subjects.kinds',
  title: 'Kind of thing said',
  question: 'What kind of thing is being said in each audience?',

  render(data, mode = 'app', ctx) {
    const pane = data.selected
    const empty = subjectsKinds.emptyState(data)
    const email = mode === 'email'
    // `openLink`, not a hand-rolled pair: print draws no in-app control, which
    // matters now that this page exports (a PDF and a share page have no
    // session to open Voice with).
    const footer = openLink(mode, `${ctx.appUrl}/dashboard/voice`, 'Open Voice →')

    if (!pane || empty) {
      return (
        <BlockFrame title={subjectsKinds.title} question={subjectsKinds.question} mode={mode} footer={footer}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    const withKinds = pane.sides.filter((s) => s.kinds.length > 0)
    // THE CATEGORY'S Reddit share, not the first side's. Reddit is where the
    // questions are and the category is where Reddit is; naming your own
    // audience's figure here would answer a question nobody asked about a
    // handful of videos.
    const category = withKinds.find((s) => s.kind === 'category') ?? withKinds[0] ?? null
    const reddit = category?.reddit ?? null

    return (
      <BlockFrame
        title={subjectsKinds.title}
        question={subjectsKinds.question}
        mode={mode}
        // THE MONTH IS ON THE META LINE, as the mock draws it ("Sep · every
        // video in the audience"). This block is always ONE month while the
        // rest of the page follows the horizon, so on Last 12 months an
        // unlabelled one-month kind mix sat among twelve-month furniture.
        meta={monthName(data.month).split(' ')[0]}
        footer={footer}
        truncateFooter
        // THE REDDIT READ INTO THE FOOTER NOTE, where the mock puts it — a
        // basis, in the mono face a reader skips until they want it. It was a
        // body paragraph of raw counts, which reads as one of the block's
        // findings rather than as a caveat about where they came from.
      >
        <KindTable sides={withKinds} mode={mode} />
        {category ? <KindMovement side={category} brand={data.brand} mode={mode} /> : null}
        {/* THE OVERLAP, WITH THE SHARES IT IS ABOUT. The footer note states
            Reddit's share; this states why the kinds it pools do not sum, and
            it belongs beside the bars rather than in the mono slot a reader
            skips. */}
        {reddit && !reddit.exact ? (
          <p
            className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, paddingTop: 6 } : undefined}
          >
            A video carrying both a question and an objection is counted in each.
          </p>
        ) : null}
      </BlockFrame>
    )
  },

  // WHAT THIS BLOCK PRINTS, AND ONLY THAT. `verdicts()` is where a reviewer, a
  // prompt and a test read a block's movement claims off it, and this returned
  // EVERY side's kind verdicts — including the two audiences whose movement
  // strip the block never draws. The strip is the category's (or the first side
  // that has kinds), and so is this.
  verdicts(data) {
    const withKinds = (data.selected?.sides ?? []).filter((s) => s.kinds.length > 0)
    const drawn = withKinds.find((s) => s.kind === 'category') ?? withKinds[0] ?? null
    return drawn ? Object.values(drawn.kindVerdicts).filter((v) => v != null) : []
  },

  emptyState(data) {
    // THE REASON, NOT THE SYMPTOM. "Nothing is selected" is true on a tenant
    // whose subjects table does not exist yet, and it is the wrong sentence:
    // it reads as "click one" at a client who has nothing to click.
    if (data.list.notRecorded) return data.list.notRecorded
    const pane = data.selected
    if (!pane) {
      return data.list.proposed.length > 0
        ? 'Confirm a subject and this is what the audiences are saying around it.'
        : 'Name a subject and this is what the audiences are saying around it.'
    }
    if (pane.sides.every((s) => s.kinds.length === 0)) {
      return 'What kind of thing is being said is not recorded month by month for this workspace yet.'
    }
    return null
  },
}

