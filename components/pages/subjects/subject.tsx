import Link from 'next/link'
import type { ReactNode } from 'react'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { TrackThisSubject } from '@/components/subjects/track-this'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, fullDate, monthName } from '@/lib/format'
import type { Direction } from '@/lib/reading/bands'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { sideFigures, type SubjectSide, type SubjectsData } from '@/lib/pages/subjects'

// SU2 · One subject, in full — the hero (design §3 SU2, the mock's (a) header).
//
// THREE SIDES AND ONE RULE ABOUT THEM. You, your rivals and the category each
// print a LEVEL with the count under it, because a level is real on every side.
// Only the sides whose own n clears the floor print a CHANGE — on the paying
// tenant that is the category and nobody else — and the axis note says which
// those are, once, above the reading rather than under each dot.
//
// AND TWO THINGS A READER CAN DO. Track this declares a move (the button the
// design makes primary); Ask about this opens the subject in Ask. Both are
// app-only: a button in a PDF is a picture of a button.

/**
 * The direction word, and the only node allowed to print one.
 *
 * Earned by `directionWord` over three consecutive months in one regime, each
 * clearing both floors — never read off a single comparison. Marked `verdict`
 * so the copy contract can see there is a reading behind it (rule (c)).
 */
export function DirectionWord({ direction, mode = 'app' }: { direction: Direction | null; mode?: RenderMode }) {
  if (!direction) return null
  if (mode === 'email') {
    return <span data-copy="verdict" style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}>{direction}, 3 months</span>
  }
  return <span data-copy="verdict" className="text-[11px] text-muted-foreground">{direction}, 3 months</span>
}

/** One side's column: the level, its count, the change where one was drawn. */
function Side({ side, mode }: { side: SubjectSide; mode: RenderMode }): ReactNode {
  const email = mode === 'email'
  if (!side.observed || side.pct == null) {
    return (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'} style={email ? { padding: '4px 0' } : undefined}>
        <span className={email ? undefined : 'text-[11px] font-medium text-secondary-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>{side.label}</span>
        <span className={email ? undefined : 'text-[12px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}>{side.silence === 'no_reading' ? '— no reading yet' : '— not tracked'}</span>
      </div>
    )
  }
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'} style={email ? { padding: '4px 0' } : undefined}>
      <span className={email ? undefined : 'text-[11px] font-medium text-secondary-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>{side.label}</span>
      <span data-copy="figure" className={email ? undefined : 'font-mono text-[20px] font-semibold tabular-nums tracking-[-0.02em]'} style={email ? { fontFamily: FONT.mono, fontSize: 20, fontWeight: 600, color: EMAIL.ink } : undefined}>
        {fmtPct(side.pct)}
      </span>
      <span data-copy="level" className={email ? undefined : 'font-mono text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted } : undefined}>
        {fmtInt(side.k ?? 0)} of {fmtInt(side.n ?? 0)} videos
      </span>
      <span className={email ? undefined : 'flex flex-wrap items-center gap-1.5'}>
        <BlockMovement verdict={side.verdict} unit="pts" mode={mode} />
        <DirectionWord direction={side.direction} mode={mode} />
      </span>
      {side.previous && side.previous.pct != null ? (
        <span className={email ? undefined : 'text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
          {monthName(side.previous.month).split(' ')[0]} <span data-copy="figure">{fmtPct(side.previous.pct)}</span>
        </span>
      ) : null}
    </div>
  )
}

export const subjectsSubject: Block<SubjectsData> = {
  key: 'subjects.subject',
  title: 'This subject',
  question: 'How are we seen on this subject?',

  render(data, mode = 'app', ctx) {
    const pane = data.selected
    const email = mode === 'email'
    const empty = subjectsSubject.emptyState(data)
    if (!pane || empty) {
      return (
        <BlockFrame title={subjectsSubject.title} question={subjectsSubject.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    // THE SUBJECT TRAVELS WITH THE READER. `?subject=<id>` was read by nothing
    // — the Agent page took no params at all — so the button landed a client on
    // a blank composer. A subject id is not a question either; the question is.
    const href = `${ctx.appUrl}/dashboard/agent?ask=${encodeURIComponent(`How are we seen on ${pane.name}?`)}`
    const meta = `named ${fullDate(pane.namedAt)} · ${fmtInt(pane.index)} of ${fmtInt(pane.of)} subjects`

    return (
      <BlockFrame title={pane.name} question={subjectsSubject.question} mode={mode} meta={meta}>
        {pane.notRecorded ? <BlockEmpty mode={mode}>{pane.notRecorded}</BlockEmpty> : null}

        <div className={email ? undefined : 'grid grid-cols-1 gap-4 sm:grid-cols-3'}>
          {pane.sides.map((s) => <Side key={s.audience} side={s} mode={mode} />)}
        </div>

        {pane.axisNote ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}
          >
            {pane.axisNote}
          </p>
        ) : null}

        {pane.calibration === 'calibrating' ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}
          >
            We are still checking how often we get this subject right, so treat these as provisional.
          </p>
        ) : null}

        {mode === 'app' ? (
          <div className="flex flex-wrap items-center gap-3">
            <TrackThisSubject subjectId={pane.id} subjectName={pane.name} move={pane.move} />
            <Link href={href} className="text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline">
              Ask about this →
            </Link>
            {pane.behind ? (
              <Link href={`${ctx.appUrl}${pane.behind.href}`} className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                the <span data-copy="figure">{fmtInt(pane.behind.videos)}</span> videos behind your figure →
              </Link>
            ) : null}
          </div>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return sideFigures(data.selected)
  },

  verdicts(data): Verdict[] {
    return (data.selected?.sides ?? []).map((s) => s.verdict).filter((v): v is Verdict => v != null)
  },

  emptyState(data) {
    if (data.list.notRecorded) return data.list.notRecorded
    if (!data.selected) {
      return data.list.proposed.length > 0
        ? 'Confirm a subject and this is where it is read in full.'
        : 'Name a subject and this is where it is read in full.'
    }
    return null
  },
}
