import Link from 'next/link'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockRanked } from '@/components/blocks/bars'
import { BlockMovement } from '@/components/blocks/movement'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
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

function Audience({ side, brand, mode }: { side: SubjectSide; brand: string; mode: RenderMode }) {
  const email = mode === 'email'
  const shown = side.kinds
    .filter((k) => k.pct != null && k.pct > 0)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, 5)
  if (shown.length === 0) return null
  const max = Math.max(...shown.map((k) => k.pct ?? 0), 1)

  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'} style={email ? { paddingTop: 8 } : undefined}>
      <span
        className={email ? undefined : 'flex items-baseline justify-between gap-2 text-[12.5px] font-medium text-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, display: 'block' } : undefined}
      >
        {sideEyebrow(side, brand)}{' '}
        <span data-copy="level" className={email ? undefined : 'shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground decoration-dotted underline-offset-[3px] [text-decoration-line:underline]'} style={email ? { fontFamily: FONT.mono, color: EMAIL.faint } : undefined}>
          of {fmtInt(side.n ?? 0)} videos
        </span>
      </span>
      {/* THE SHARE RIDES ON THE LABEL AND THE COUNT IS THE COUNT. `RankedBar`
          gives the count a 28px column (it is built for one short token), and
          "34% · 472" wrapped onto two lines in it — a number broken across a
          line break is a number a reader has to reassemble. */}
      <BlockRanked
        mode={mode}
        rows={shown.map((k) => ({
          label: (
            <>
              {k.label}{' '}
              <span data-copy="figure" className={email ? undefined : 'font-mono text-[11px] text-muted-foreground'}>
                {fmtPct(k.pct ?? 0)}
              </span>
            </>
          ),
          pct: ((k.pct ?? 0) / max) * 100,
          color: side.color,
          count: fmtInt(k.videos),
        }))}
      />
    </div>
  )
}

/** The mock's movement strip: one banded verdict per kind, on one audience. */
function KindMovement({ side, brand, prevMonth, mode }: { side: SubjectSide; brand: string; prevMonth: string; mode: RenderMode }) {
  const email = mode === 'email'
  const rows = side.kinds
    .filter((k) => side.kindVerdicts[k.kind] != null)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, 4)
  if (rows.length === 0) return null

  const body = (
    <>
      <span className={email ? undefined : 'text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
        {sideEyebrow(side, brand)}, since {monthName(prevMonth).split(' ')[0]}:
      </span>
      {rows.map((k) => (
        <span key={k.kind} className={email ? undefined : 'flex items-center gap-1.5 text-[12px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginRight: 10 } : undefined}>
          {k.label.toLowerCase()} <BlockMovement verdict={side.kindVerdicts[k.kind]} unit="pts" mode={mode} />
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
    const href = `${ctx.appUrl}/dashboard/voice`
    const footer = email
      ? <a href={href} style={{ color: EMAIL.ink }}>Open Voice →</a>
      : <Link href={href} className="hover:underline">Open Voice →</Link>

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
    const prevMonth = pane.series[0]?.points.map((p) => p.month).filter((m) => m < data.month).slice(-1)[0] ?? null

    return (
      <BlockFrame
        title={subjectsKinds.title}
        question={subjectsKinds.question}
        mode={mode}
        // THE MONTH IS ON THE META LINE, as the mock draws it ("Sep · every
        // video in the audience"). This block is always ONE month while the
        // rest of the page follows the horizon, so on Last 12 months an
        // unlabelled one-month kind mix sat among twelve-month furniture.
        meta={`${monthName(data.month).split(' ')[0]} · every video in the audience`}
        footer={footer}
        // THE REDDIT READ INTO THE FOOTER NOTE, where the mock puts it — a
        // basis, in the mono face a reader skips until they want it. It was a
        // body paragraph of raw counts, which reads as one of the block's
        // findings rather than as a caveat about where they came from.
        footerNote={reddit && reddit.pct != null ? (
          <span data-copy="level">Reddit · {fmtInt(reddit.reddit)} of {fmtInt(reddit.videos)} question videos</span>
        ) : undefined}
      >
        {withKinds.map((s) => <Audience key={s.audience} side={s} brand={data.brand} mode={mode} />)}
        {category && prevMonth ? <KindMovement side={category} brand={data.brand} prevMonth={prevMonth} mode={mode} /> : null}
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

  verdicts(data) {
    const sides = data.selected?.sides ?? []
    return sides.flatMap((s) => Object.values(s.kindVerdicts)).filter((v) => v != null)
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

