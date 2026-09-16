import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { TokenProse } from '@/components/pages/overview/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtDelta, fmtInt } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { WeeklyData } from '@/lib/pages/weekly'
import { INTERPRETATION_LABEL } from '@/lib/prose/interpret'
import { flagFigures, levelOf, weeklyPeriod, type WeekFlag } from '@/lib/reports/weekly'

// WR1 · The week in one sentence, and anything unusual (design §3 WR section 1).
//
// THE FIRST SCREEN, AND THE ONLY WEEKLY VERDICT ON THE ARTEFACT. The sentence
// is code's and states the month so far against the same point last month; the
// check is the one thing here that is a statement about the WEEK, and it is a
// statement about whether the week is unusual against three months rather than
// a reading of the week on its own.
//
// "NOTHING UNUSUAL THIS WEEK." IS PRINTED IN FULL, and that is deliberate
// against OV1, where the same line is suppressed. The design says why: on
// Overview a reassurance printed every week trains the reader to skip the
// block; here it is the answer to the question the reader came with.
//
// THE BUDGET IS THE COMPOSER'S, NOT THE MARKUP'S. `weekCheck` has already
// trimmed to twelve figures before this renders (lib/reports/weekly.ts), so
// this block prints what it is given and never decides how much to show.

function Muted({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginTop: 4 }}>{children}</div>
    : <p className="m-0 mt-1 text-[12px] text-muted-foreground">{children}</p>
}

/** The explanation's evidence, under the interpretation and inside the
 *  section, where the mock puts it — never a block of its own. A frozen quote
 *  whose ref no longer resolves prints the honest line instead of an empty
 *  pair of quotation marks (BlockQuote's own rule). */
function FlagQuotes({
  quotes, mode = 'app',
}: {
  quotes: readonly { text: string; lang?: string | null; english?: string | null; cite?: string }[]
  mode?: RenderMode
}) {
  if (!quotes.length) return null
  return (
    <div className={mode === 'email' ? undefined : 'mt-2 flex flex-col gap-2'} style={mode === 'email' ? { marginTop: 8 } : undefined}>
      {quotes.map((q, i) => <BlockQuote key={i} quote={q} cite={q.cite} mode={mode} />)}
    </div>
  )
}

/** One flag: what it is on, this week against the three months behind it, and
 *  the movement with the band it had to clear. */
function Flag({ flag, index, mode, appUrl }: { flag: WeekFlag; index: number; mode: RenderMode; appUrl: string }) {
  const href = `${appUrl}${flag.href}`
  const week = levelOf(flag.weekK, flag.weekN)
  const baseline = levelOf(flag.baselineK, flag.baselineN)
  // ONE DECIMAL, BOTH SIDES. A change of 10.7 rounded to 11 against a band of
  // 5.0 is a different claim from the one the arithmetic made, and the band is
  // printed beside it because this product never states a change without it.
  const movement = `${fmtDelta(flag.changePts, 'pts', 1)} on a band of ${(Math.round(flag.bandPts * 10) / 10).toFixed(1)}`
  const body = (
    <>
      <span data-copy="figure">{week}</span> this week, against <span data-copy="figure">{baseline}</span> across the three months behind it — <span data-copy="verdict">{movement}</span>.
      {' '}Counted against {flag.denominator}.
    </>
  )
  if (mode === 'email') {
    return (
      <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '8px 0' }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>{flag.label}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 3 }}>{body}</div>
        {flag.sentences.length > 0 ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.5px', color: EMAIL.faint }}>{INTERPRETATION_LABEL}</div>
            <TokenProse body={flag.sentences.join(' ')} figures={flagFigures(flag, index)} mode={mode} model />
          </div>
        ) : null}
        <FlagQuotes quotes={flag.quotes} mode={mode} />
        <div style={{ marginTop: 6 }}><a href={href} style={{ color: EMAIL.link, fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>See the week →</a></div>
      </div>
    )
  }
  return (
    <div className="border-t border-border/70 py-2">
      <p className="m-0 text-[13px] font-semibold">{flag.label}</p>
      <p className="m-0 mt-0.5 text-[12.5px] text-secondary-foreground">{body}</p>
      {flag.sentences.length > 0 ? (
        <div className="mt-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{INTERPRETATION_LABEL}</span>
          <TokenProse body={flag.sentences.join(' ')} figures={flagFigures(flag, index)} mode={mode} model />
        </div>
      ) : null}
      <FlagQuotes quotes={flag.quotes} mode={mode} />
      <Link href={href} className="mt-1.5 inline-block text-[12px] font-semibold hover:underline">See the week →</Link>
    </div>
  )
}

export const weeklyWeek: Block<WeeklyData> = {
  key: 'weekly.week',
  title: 'The week in one sentence',
  question: 'What is the state of the week, and does anything need me?',

  render(data, mode = 'app', ctx) {
    const s = data.section1
    return (
      <BlockFrame
        title={weeklyWeek.title}
        question={weeklyWeek.question}
        mode={mode}
        meta={weeklyPeriod(s.window, s.month)}
      >
        <TokenProse body={s.sentence.body} figures={s.sentence.figures} mode={mode} />
        <div style={mode === 'email' ? { marginTop: 10 } : undefined} className={mode === 'email' ? undefined : 'mt-2.5'}>
          {s.check.state === 'flagged' ? (
            <>
              <Muted mode={mode}>{s.check.line}</Muted>
              {s.check.flags.map((f, i) => <Flag key={`${f.objectKind}:${f.label}`} flag={f} index={i} mode={mode} appUrl={ctx.appUrl} />)}
              {s.check.moreFlags > 0 ? (
                <Muted mode={mode}>{fmtInt(s.check.moreFlags)} more cleared the band and are on This week.</Muted>
              ) : null}
            </>
          ) : (
            <BlockEmpty mode={mode}>{s.check.line}</BlockEmpty>
          )}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = { ...data.section1.sentence.figures }
    data.section1.check.flags.forEach((f, i) => Object.assign(out, flagFigures(f, i)))
    return out
  },

  quotes(data) {
    return data.section1.check.flags.flatMap((f) => f.quotes.map((q) => q.ref))
  },

  emptyState(data) {
    // NEVER NULL, and never "nothing": section 1 always says something, because
    // the reader came with a question and silence is not an answer to it. The
    // check's own line IS the empty state when nothing fired — and when the
    // record says something fired but no flag survived the read, which is a
    // line of its own rather than a count of zero things.
    const check = data.section1.check
    return check.state === 'flagged' && check.flags.length > 0 ? null : check.line
  },
}

