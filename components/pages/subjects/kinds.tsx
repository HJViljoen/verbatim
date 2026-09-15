import Link from 'next/link'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockRanked } from '@/components/blocks/bars'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import { KIND_ORDER } from '@/lib/reading/kinds'
import type { SubjectSide, SubjectsData } from '@/lib/pages/subjects'

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

function Audience({ side, mode }: { side: SubjectSide; mode: RenderMode }) {
  const email = mode === 'email'
  const shown = side.kinds
    .filter((k) => k.pct != null && k.pct > 0)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, 5)
  if (shown.length === 0) return null
  const max = Math.max(...shown.map((k) => k.pct ?? 0), 1)

  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-1.5'} style={email ? { paddingTop: 8 } : undefined}>
      <span
        className={email ? undefined : 'flex items-baseline justify-between gap-2 text-[11px] font-medium text-secondary-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, display: 'block' } : undefined}
      >
        {side.label}{' '}
        <span data-copy="level" className={email ? undefined : 'font-mono text-[10.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, color: EMAIL.faint } : undefined}>
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
    const reddit = (withKinds.find((s) => s.kind === 'category') ?? withKinds[0])?.reddit ?? null

    return (
      <BlockFrame
        title={subjectsKinds.title}
        question={subjectsKinds.question}
        mode={mode}
        meta="every video in the audience"
        footer={footer}
      >
        {withKinds.map((s) => <Audience key={s.audience} side={s} mode={mode} />)}
        {reddit && reddit.pct != null ? (
          <p
            className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, paddingTop: 6 } : undefined}
          >
            Reddit carried <span data-copy="figure">{fmtInt(reddit.reddit)} of {fmtInt(reddit.videos)}</span> of the
            question-and-objection videos{reddit.exact ? '' : ' (a video carrying both is counted in each)'}.
          </p>
        ) : null}
      </BlockFrame>
    )
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
