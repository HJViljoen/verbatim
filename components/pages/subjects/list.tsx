import Link from 'next/link'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { BaseHead, InnerLine, MakerMark, RULE, SCALE } from '@/components/pages/overview/market'
import { prevCell } from '@/components/pages/overview/market-subjects'
import { surface } from '@/lib/nav'
import { makerWords } from '@/lib/pages/overview-market/board'
import { marketLevel as marketLevelOf } from '@/lib/pages/overview-market/kinds'
import { NO_READING_YET } from '@/lib/subjects/read-in'

import { AddSubjectFooter, SubjectEditor } from '@/components/subjects/subject-editor'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, fullDate, longMonth, shortDate } from '@/lib/format'
import type { Verdict } from '@/lib/reading/verdicts'
import { originLine, SUBJECTS_UNREADABLE_WHY, type SubjectRail, type SubjectsData } from '@/lib/pages/subjects'
import { CalibrationTag } from '@/components/blocks/calibration-tag'
import { calibrationWord, FAILED_EXPLAINED, isFailed } from '@/lib/subjects/calibration-state'
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

/**
 * A rail row's tag line (WP2.2, the preview's second line under the name): the
 * calibration word, the maker share at a fifth or more (decision F), "under
 * 10, a count" where the month's k cannot carry a share (§2.12), or the
 * sentence a row with no figure says instead ("no reading yet", "being
 * re-described", "not counted yet"). Null for a ready row with nothing to say.
 */
export function railTags(r: SubjectRail, n: number | null): { word: string | null; maker: string | null; count: boolean } {
  const failed = isFailed(r.calibration)
  const figure = !failed && r.status === 'active' && r.market != null
  const word = failed ? calibrationWord(r.calibration) : figure ? calibrationWord(r.calibration) : r.note ?? NO_READING_YET
  return {
    word,
    maker: figure ? makerWords(r.makerShare ?? null) : null,
    count: figure && marketLevelOf(r.market!.k, n)?.kind === 'count',
  }
}

/** The rail's one line where no subject is named (plan §2.13, Össur). */
export const NO_SUBJECTS_LINE = 'No subjects named yet.'

/** The share cell: a whole percent where the month's k and n carry one, a dot
 *  where they do not (the count is in the Videos column). */
const shareCell = (k: number, n: number | null): string => {
  const l = marketLevelOf(k, n)
  return l?.kind === 'share' ? l.text : '·'
}

/**
 * THE RAIL ON THE MARKET (WP2.2, §2.3 S1; the approved preview's "Your
 * subjects"): a ranked table, one row per subject, its videos in the market
 * this month, its share of the market, and the month before on the same base;
 * the column heads carry the base ("Sep of 654"). No editing control: a rename
 * or a stop is Settings › Subjects' (the preview draws the rail as a reading).
 */
function MarketRail({ data, mode }: { data: SubjectsData; mode: RenderMode }) {
  const l = data.list
  const base = l.base!
  const email = mode === 'email'
  const n = base.n
  const prev = base.prev
  // ONE PLAIN LINE UNDER THE RAIL where a subject is being re-described
  // (finish-list item 21), never on a rail without one. On the page only: the
  // briefs that borrow this block are on hold and print as they did.
  const explained = mode === 'app' && l.rows.some((r) => isFailed(r.calibration)) ? FAILED_EXPLAINED : null
  if (email) {
    const c = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 10px 4px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
    const num = { ...c, fontFamily: FONT.mono, textAlign: 'right' as const }
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...c, borderTop: 0, textAlign: 'left', color: EMAIL.muted, fontSize: 11 }}>Subject</th>
            <th style={{ ...num, borderTop: 0, color: EMAIL.muted, fontSize: 11 }}>Videos</th>
            <th style={{ ...num, borderTop: 0 }}><BaseHead month={base.month} n={n} mode={mode} /></th>
            {prev ? <th style={{ ...num, borderTop: 0 }}><BaseHead month={prev.month} n={prev.n} mode={mode} /></th> : null}
          </tr>
        </thead>
        <tbody>
          {l.rows.map((r) => {
            const t = railTags(r, n)
            const figure = !isFailed(r.calibration) && r.status === 'active' && r.market != null
            const tag = [t.word, t.maker, t.count ? 'under 10, a count' : null].filter(Boolean).join(' · ')
            return (
              <tr key={r.id}>
                <td style={c}>{r.name}{tag ? <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>{tag}</div> : null}</td>
                <td style={num}>{figure ? <span data-copy="figure">{fmtInt(r.market!.k)}</span> : null}</td>
                <td style={num}>{figure ? <span data-copy="figure">{shareCell(r.market!.k, n)}</span> : null}</td>
                {prev ? <td style={{ ...num, color: EMAIL.muted }}>{figure ? <span data-copy="figure">{r.marketPrev ? prevCell(r.marketPrev.k, prev.n) : '·'}</span> : null}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }
  const cols = 'grid grid-cols-[minmax(0,1fr)_44px_48px_48px] gap-x-3'
  const table = (
    <div role="table" className="flex min-w-0 flex-col">
      <div role="row" className={`${cols} items-end ${RULE.head}`}>
        <span role="columnheader" className="flex flex-col leading-[1.35]">
          <span className={SCALE.head}>Subject</span>
          <span className="font-mono text-[12px] text-muted-foreground">ranked by {longMonth(base.month)}</span>
        </span>
        <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
        <span role="columnheader"><BaseHead month={base.month} n={n} mode={mode} /></span>
        <span role="columnheader">{prev ? <BaseHead month={prev.month} n={prev.n} mode={mode} /> : null}</span>
      </div>
      {l.rows.map((r) => {
        const t = railTags(r, n)
        const failed = isFailed(r.calibration)
        const figure = !failed && r.status === 'active' && r.market != null
        const tags = (
          <span className={`col-span-full flex flex-wrap items-center gap-x-1.5 pt-0.5 ${SCALE.tag}`}>
            {t.word ? <span>{t.word}</span> : null}
            {t.maker ? <>{t.word ? <span aria-hidden>·</span> : null}<span className="inline-flex items-center gap-1.5 whitespace-nowrap"><MakerMark />{t.maker}</span></> : null}
            {t.count ? <>{t.word || t.maker ? <span aria-hidden>·</span> : null}<span>under 10, a count</span></> : null}
          </span>
        )
        const body = (
          <>
            <span role="rowheader" className={`min-w-0 [text-wrap:pretty] ${SCALE.row} ${r.selected ? 'font-semibold' : ''} ${failed ? 'text-muted-foreground' : ''}`}>{r.name}</span>
            <span className={`${SCALE.num} font-semibold`}>{figure ? <span data-copy="figure">{fmtInt(r.market!.k)}</span> : null}</span>
            <span className={SCALE.num}>{figure ? <span data-copy="figure">{shareCell(r.market!.k, n)}</span> : null}</span>
            <span className={SCALE.prev}>{figure && prev ? <span data-copy="figure">{r.marketPrev ? prevCell(r.marketPrev.k, prev.n) : '·'}</span> : null}</span>
            {/* THE ROW'S TAGS UNDER THE WHOLE ROW, as the preview sets them
                ("provisional · ▨ over a third makers"), never squeezed into
                the name's column. */}
            {t.word || t.maker || t.count ? tags : null}
          </>
        )
        const rowClass = `${cols} items-baseline py-3 ${RULE.row} last:border-b-0`
        // THE SELECTED ROW SITS ON THE INNER GROUND (the preview's Looks &
        // style row), pulled out by its own padding so its figures keep the
        // column edges.
        const selected = r.selected ? '-mx-3 rounded-md border-b-transparent bg-inner px-3' : ''
        return mode === 'app' && r.href ? (
          <Link key={r.id} role="row" href={r.href} aria-current={r.selected ? 'true' : undefined} className={`${rowClass} ${selected} transition-colors hover:bg-inner/60`}>
            {body}
          </Link>
        ) : (
          <div key={r.id} role="row" className={`${rowClass} ${selected}`}>{body}</div>
        )
      })}
    </div>
  )
  // The wrapper only where the line is drawn, so a rail without one (and every
  // printed rail) keeps the markup it had.
  return explained ? (
    <div className="flex min-w-0 flex-col gap-3">
      {table}
      <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground [text-wrap:pretty]">{explained}</p>
    </div>
  ) : table
}

export const subjectsList: Block<SubjectsData> = {
  key: 'subjects.list',
  title: 'Your subjects',
  question: 'What did we choose to be known for?',

  render(data, mode = 'app', ctx) {
    const l = data.list
    const empty = subjectsList.emptyState(data)

    // THE MARKET'S RAIL (WP2.2): every list the loader builds carries its
    // base; a list stored before WP2.2 has none and renders as sent (below).
    if (l.base) {
      const voice = surface('voice')
      const footer = empty ? null : openLink(mode, `${ctx?.appUrl ?? ''}${voice.href}`, `The rest is on ${voice.label} →`)
      // NO SUBJECT NAMED (Össur): one line (§2.13), in the plan's words, inside
      // a drawn block as the front page draws it (decision B 2: a waiting
      // state prints as one line inside a drawn block; the deploy-3 review).
      const none = empty && !l.notRecorded && l.proposed.length === 0
      const line = none ? NO_SUBJECTS_LINE : empty
      return (
        <BlockFrame title={subjectsList.title} question={subjectsList.question} mode={mode} footer={footer} roomy>
          {none ? <InnerLine mode={mode}>{NO_SUBJECTS_LINE}</InnerLine> : line ? <BlockEmpty mode={mode}>{line}</BlockEmpty> : <MarketRail data={data} mode={mode} />}
        </BlockFrame>
      )
    }

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
              // month was not read for, "no reading yet", or one not
              // confirmed yet) says that sentence and no
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
