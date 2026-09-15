import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { SubjectEditor } from '@/components/subjects/subject-editor'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, fullDate } from '@/lib/format'
import { originLine, type SubjectsData } from '@/lib/pages/subjects'

// SU1 · The subjects, and editing them (design §3 SU1).
//
// THE APP ARM IS THE EDITOR AND THE OTHER TWO ARE A LIST, and that is not a
// shortcut: a rename control inside a PDF or an email is a control nobody can
// press, and a block that draws one is a block claiming an affordance it does
// not have. What survives into both is the part that is a READING — the set,
// each subject's level with its count, and the sentence that explains why the
// list only ever grows.
//
// The editor itself is `components/subjects/subject-editor.tsx`, shared with
// Settings › Subjects (WP16) because the design says they are the same editor
// and because they carry the same dangerous sentence.

export const subjectsList: Block<SubjectsData> = {
  key: 'subjects.list',
  title: 'Your subjects',
  question: 'What did we choose to be known for?',

  render(data, mode = 'app') {
    const l = data.list
    const empty = subjectsList.emptyState(data)

    if (mode === 'app') {
      return (
        <BlockFrame title={subjectsList.title} question={subjectsList.question} mode={mode}>
          <SubjectEditor
            rows={l.rows.map((r) => ({
              id: r.id,
              name: r.name,
              description: r.description,
              namedAt: r.namedAt,
              status: r.status,
              because: originLine(r.origin),
              level: r.level,
              note: r.note,
              selected: r.selected,
              href: r.href,
            }))}
            setLine={l.setLine}
            notRecorded={l.notRecorded}
          />
          {l.proposed.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-border/70 pt-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Proposed, not counted yet
              </span>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {l.proposed.map((p) => (
                  <li key={p.id} className="text-[12px]">
                    {p.name} — <span className="text-muted-foreground">{p.because}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </BlockFrame>
      )
    }

    const email = mode === 'email'
    return (
      <BlockFrame title={subjectsList.title} question={subjectsList.question} mode={mode} meta={l.setLine}>
        {empty ? (
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        ) : (
          <div>
            {l.rows.map((r) => (
              <div
                key={r.id}
                className={email ? undefined : 'flex items-baseline justify-between gap-3 border-t border-border/70 py-1.5 text-[12.5px]'}
                style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}
              >
                <strong>{r.name}</strong>{' '}
                {r.level && r.level.pct != null ? (
                  <span data-copy="level" className={email ? undefined : 'font-mono tabular-nums text-muted-foreground'} style={email ? { fontFamily: FONT.mono, color: EMAIL.muted } : undefined}>
                    {fmtPct(r.level.pct)} of your videos · {fmtInt(r.level.k)} of {fmtInt(r.level.n)} videos
                  </span>
                ) : (
                  <span className={email ? undefined : 'text-muted-foreground'} style={email ? { color: EMAIL.muted } : undefined}>
                    {r.note ?? 'no reading yet'}
                  </span>
                )}{' '}
                <span className={email ? undefined : 'font-mono text-[10.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.faint } : undefined}>
                  named {fullDate(r.namedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div
          className={email ? undefined : 'pt-2 text-[11px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, paddingTop: 6 } : undefined}
        >
          {l.rule}
        </div>
      </BlockFrame>
    )
  },

  emptyState(data) {
    const l = data.list
    if (l.notRecorded) return l.notRecorded
    if (l.rows.length === 0) {
      return l.proposed.length > 0
        ? `We have proposed ${fmtInt(l.proposed.length)} subject${l.proposed.length === 1 ? '' : 's'}. Confirm the set and we start counting from the next update.`
        : 'No subject has been named for this workspace yet.'
    }
    return null
  },
}
