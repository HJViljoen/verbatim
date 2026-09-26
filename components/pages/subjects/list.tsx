import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { AddSubjectFooter, SubjectEditor } from '@/components/subjects/subject-editor'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, fullDate, shortDate } from '@/lib/format'
import type { Verdict } from '@/lib/reading/verdicts'
import { originLine, SUBJECTS_UNREADABLE_WHY, type SubjectsData } from '@/lib/pages/subjects'
import { CalibrationTag } from '@/components/blocks/calibration-tag'
import { calibrationWord, isFailed } from '@/lib/subjects/calibration-state'
import { levelText } from '@/lib/reading/level'

// SU1 · The subjects, and editing them (design §3 SU1; the mock's first rail
// tile).
//
// THE APP ARM IS THE EDITOR AND THE OTHER TWO ARE A LIST, and that is not a
// shortcut: a rename control inside a PDF or an email is a control nobody can
// press, and a block that draws one is a block claiming an affordance it does
// not have. What survives into both is the part that is a READING — the set,
// each subject's level with its count, and the sentence that explains why the
// list only ever grows.
//
// THE CHROME IS THE TILE'S NOW (wave 2). The mock puts "6 named" in the tile's
// header-right meta and "Add a subject →" on its footer rail with the set's
// date stamp beside it; the build had both as body lines, which cost the rail
// two of the rows it exists to show and left the tile's own footer empty.
// `SubjectEditor` keeps every control — it is one client component and the
// sheets live inside it — and stops drawing the two lines the frame now draws.
//
// The editor itself is `components/subjects/subject-editor.tsx`, shared with
// Settings › Subjects (WP16) because the design says they are the same editor
// and because they carry the same dangerous sentence.

/** A rail row's badge in the two modes that have no badge component — the
 *  word, or the movement with its band, from the same table the screen reads. */
function verdictWords(verdict: SubjectsData['list']['rows'][number]['verdict']): string | null {
  if (!verdict) return null
  if (verdict.state === 'moved' && verdict.changePts != null) {
    const band = verdict.bandPts != null ? ` · band ${Math.abs(verdict.bandPts)}` : ''
    return `${verdict.changePts > 0 ? '▲' : '▼'} ${Math.abs(verdict.changePts)} pts${band}`
  }
  return verdict.state === 'moved' ? MOVEMENT_WORDS.too_little_data : MOVEMENT_WORDS[verdict.state]
}

/** The market's level on a paper or email rail row: "16% · 103 of 654" at 100
 *  videos or more, `levelText`'s "8 of 50" under it. */
function marketLevel(m: { k: number; n: number }): string {
  const level = levelText(m.k, m.n)
  if (!level) return `${fmtInt(m.k)} of ${fmtInt(m.n)}`
  return level.kind === 'share' ? `${level.text} · ${fmtInt(m.k)} of ${fmtInt(m.n)}` : level.text
}

export const subjectsList: Block<SubjectsData> = {
  key: 'subjects.list',
  title: 'Your subjects',
  question: 'What did we choose to be known for?',

  render(data, mode = 'app') {
    const l = data.list
    const empty = subjectsList.emptyState(data)

    if (mode === 'app') {
      const active = l.rows.filter((r) => r.status === 'active').length
      // The mock's footer stamp: the day the SET was last added to, which is
      // the one date a header of six rows has room for. Every row still carries
      // its own "named …" line.
      const named = l.rows.map((r) => r.namedAt).sort()
      const stamp = named.length > 0 ? shortDate(named[named.length - 1]) : null
      return (
        <BlockFrame
          title={subjectsList.title}
          question={subjectsList.question}
          mode={mode}
          meta={l.notRecorded ? undefined : l.setLine}
          footer={l.notRecorded ? undefined : <AddSubjectFooter canEdit={l.canEdit} activeCount={active} />}
          truncateFooter
          footerNote={l.notRecorded ? undefined : stamp}
        >
          <SubjectEditor
            chrome={false}
            rows={l.rows.map((r) => ({
              id: r.id,
              name: r.name,
              description: r.description,
              namedAt: r.namedAt,
              status: r.status,
              because: originLine(r.origin),
              level: r.level,
              market: r.market ?? null,
              note: r.note,
              verdict: r.verdict,
              selected: r.selected,
              href: r.href || undefined,
              withheld: isFailed(r.calibration),
            }))}
            setLine={l.setLine}
            notRecorded={l.notRecorded}
            canEdit={l.canEdit}
          />
        </BlockFrame>
      )
    }

    const email = mode === 'email'
    return (
      <BlockFrame title={subjectsList.title} question={subjectsList.question} mode={mode} meta={l.setLine}>
        {empty ? (
          <>
            <BlockEmpty mode={mode}>{empty}</BlockEmpty>
            {/* The same sentence the app arm prints where the button would be:
                the set cannot be READ here, which is not the same event as a
                client who has named nothing. */}
            {l.notRecorded ? <BlockEmpty mode={mode}>{SUBJECTS_UNREADABLE_WHY}</BlockEmpty> : null}
          </>
        ) : (
          <div>
            {l.rows.map((r) => {
              // THE CALIBRATION WORD IS A ROW TAG UNDER THE NAME (design
              // pass), where the app's rail, Overview's table and the preview
              // put it. It rode along the row as a fourth flex item, so under
              // `justify-between` a provisional row spread its level to a
              // different x from every other row's, and "provisional" floated
              // in a column of its own. A note that IS the word is not said a
              // second time in the level's place.
              const word = calibrationWord(r.calibration)
              const failed = isFailed(r.calibration)
              const note = r.note && r.note !== word ? r.note : null
              // A ROW WITH NO FIGURE AND ITS OWN SENTENCE (a subject the
              // month was not read for, "first reading with the 27 Sep
              // update", or one not confirmed yet) says that sentence and no
              // word under its name, as the app's rail does: one line saying
              // why there is no figure, not two.
              const tagged = failed || r.market != null || r.level != null || note == null
              const level = r.level && r.level.pct != null ? (
                <>
                  <span data-copy="level" className={email ? undefined : 'font-mono tabular-nums text-muted-foreground'} style={email ? { fontFamily: FONT.mono, color: EMAIL.muted } : undefined}>
                    {fmtPct(r.level.pct)} of your videos · {fmtInt(r.level.k)} of {fmtInt(r.level.n)} videos
                  </span>
                  {r.verdict ? (
                    <>
                      {' '}
                      <span data-copy="verdict" className={email ? undefined : 'font-mono text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted } : undefined}>
                        {verdictWords(r.verdict)}
                      </span>
                    </>
                  ) : null}
                </>
              ) : r.status === 'active' && r.market ? (
                // The market's level, named (decision C with E). Never your
                // own level.
                // Through `levelText` (WP1.1 review, finding 5): a whole
                // percent over its count at 100 videos or more, the count
                // alone under it.
                <span data-copy="level" className={email ? undefined : 'font-mono tabular-nums text-muted-foreground'} style={email ? { fontFamily: FONT.mono, color: EMAIL.muted } : undefined}>
                  {marketLevel(r.market)} videos in your market
                </span>
              ) : note || !word ? (
                <span className={email ? undefined : 'text-muted-foreground'} style={email ? { color: EMAIL.muted } : undefined}>
                  {note ?? 'no reading yet'}
                </span>
              ) : null
              const named = (
                <span className={email ? undefined : 'font-mono text-[10.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.faint } : undefined}>
                  named {fullDate(r.namedAt)}
                </span>
              )
              return email ? (
                <div key={r.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
                  <strong style={failed ? { color: EMAIL.muted } : undefined}>{r.name}</strong>{' '}
                  {word && tagged ? <><CalibrationTag calibration={r.calibration} mode={mode} />{' '}</> : null}
                  {level}{level ? ' ' : null}
                  {named}
                </div>
              ) : (
                // ONE GRID, SO EVERY ROW'S LEVEL AND DATE SIT ON THE SAME TWO
                // RIGHT-HAND EDGES: the name takes what is left.
                <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-6 border-t border-border/70 py-1.5 text-[12.5px]">
                  <span className="min-w-0">
                    <strong className={failed ? 'text-muted-foreground' : undefined}>{r.name}</strong>
                    {tagged ? <CalibrationTag calibration={r.calibration} mode={mode} block /> : null}
                  </span>
                  <span className="text-right">{level}</span>
                  {named}
                </div>
              )
            })}
          </div>
        )}
        {/* L3: "Renaming or adding a subject starts a new line" is said by the
            Add and Rename dialogs, at the moment it matters, not on the rail. */}
      </BlockFrame>
    )
  },

  // EVERY RAIL ROW PRINTS A BADGE, SO THE BLOCK DECLARES ONE. The badge is a
  // real `Verdict` — `monthChange` on the same points `buildSides` uses — and
  // `blockAnswers(subjectsList, data).verdicts` was empty, which is where a
  // reviewer, a prompt and a test read a block's movement claims from
  // (lib/blocks/types.ts).
  verdicts(data): Verdict[] {
    return data.list.rows.map((r) => r.verdict).filter((v): v is Verdict => v != null)
  },

  emptyState(data) {
    const l = data.list
    if (l.notRecorded) return l.notRecorded
    // NOT "no rows" — NO CONFIRMED ROW. A named subject that nobody has
    // confirmed is visible in the editor and is counted by nothing, and the
    // block whose whole job is the set has to say which of those two it is.
    if (!l.rows.some((r) => r.status === 'active')) {
      return l.proposed.length > 0
        ? `We have proposed ${fmtInt(l.proposed.length)} subject${l.proposed.length === 1 ? '' : 's'}. Confirm the set and we start counting from the next update.`
        : 'No subject has been named for this workspace yet.'
    }
    return null
  },
}
