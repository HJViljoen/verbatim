import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuote } from '@/components/blocks/quote'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { WeeklyData } from '@/lib/pages/weekly'
import { INTERPRETATION_LABEL } from '@/lib/prose/interpret'
import { flagFigures, inPeriod, nothingElseUnusual, updateMeta, type PeriodNoun, type WeekFlag } from '@/lib/reports/weekly'

// WR1 · The week in one sentence, and anything unusual (design §3 WR section 1).
//
// THE FIRST SCREEN, AND THE ONLY WEEKLY VERDICT ON THE ARTEFACT. The sentence
// is code's and states the month so far against the same point last month; the
// check is the one thing here that is a statement about the WEEK, and it is a
// statement about whether the week is unusual against three months rather than
// a reading of the week on its own.
//
// THE ARTBOARD'S SHAPE, PORTED (block D wave 2). A 17.5px hero line, then the
// flag inside a tinted inner block at radius 6 — the second of the design
// system's two nesting levels, and the thing the mock most wants a reader to
// stop at. The flat hairline rail this printed before made the one unusual
// thing of the week read like every other row.
//
// WHERE THE MOCK'S CARD BREAKS A RULE, THE LAYOUT IS KEPT AND THE CONTENT IS
// THE HONEST ONE (mock-gap §6 D2, D3, D10):
//
//   · the amber "▲ 3.1× usual" pill is a ratio, and the product's badge
//     vocabulary is fixed at a signed magnitude with the band it cleared
//     (`components/delta-badge.tsx` MOVEMENT_WORDS). `BlockMovement` prints
//     "+10.7 pts · band 5.0" in that slot — the same claim, checkable — and
//     it prints it `good="neutral"`. THE SLOT IS ALWAYS ADVERSE, AND THE
//     BADGE COLOURED IT BY SIGN: a rise in objections came out green on mint
//     inside a card headed "Unusual this week · Objections". The artboard's
//     own pill is amber for exactly this reason, and DESIGN.md reserves green
//     for "you, gaining, supported claims";
//   · the two bar rows carry `38` and `12` as bare counts under a caption
//     ("videos naming it") that is not a denominator. Rule (b) requires the
//     "of N", so each row's figure is a `FigureCell` — the share on top, the
//     count it rests on under it — and the BAR is drawn from those two shares,
//     which is the comparison the verdict beside them is about. Both sides
//     carry an n, so the drawing makes no claim the verdict does not;
//   · "Typical week" names a baseline nobody computed here. The row is
//     labelled what it is: the three complete months behind this update.
//
// "NOTHING ELSE UNUSUAL THIS WEEK." IS A CODA, NOT AN ALTERNATIVE. It printed
// only in the `nothing_unusual` state, so a reader who had just read one flag
// was never told it was the only one — which is the question they are holding
// when they finish reading it.
//
// THE BUDGET IS THE COMPOSER'S, NOT THE MARKUP'S. `weekCheck` has already
// trimmed to twelve figures before this renders (lib/reports/weekly.ts), so
// this block prints what it is given and never decides how much to show.

function Muted({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted, marginTop: 6 }}>{children}</div>
    : <p className="m-0 mt-1.5 text-[12.5px] text-muted-foreground">{children}</p>
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

const pctOf = (k: number, n: number): number => (n > 0 ? Math.round((k / n) * 1000) / 10 : 0)

/**
 * One side of the comparison: a name, a bar, and the level with its "of N".
 *
 * THE BAR IS RELATIVE TO THE LARGER SIDE, not to 100%. Two shares of 14.1% and
 * 3.5% drawn against a full width are two stubs, and the mock's own bars are
 * scaled the same way — its "this week" row is full and its baseline a third of
 * it.
 */
function BarRow({
  label, share, k, n, tone, mode,
}: {
  label: string
  /** 0–100, already scaled against the larger of the two sides. */
  share: number
  k: number
  n: number
  tone: 'flag' | 'base'
  mode: RenderMode
}) {
  const w = Math.max(2, Math.min(100, Math.round(share)))
  const colour = tone === 'flag' ? EMAIL.mixed : EMAIL.neutralSeg
  const cell = <FigureCell mode={mode} align="right" value={fmtPct(pctOf(k, n))} of={`${fmtInt(k)} of ${fmtInt(n)}`} />
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 8 }}>
        <tbody>
          <tr>
            <td width={104} style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, verticalAlign: 'middle', width: 104 }}>{label}</td>
            <td style={{ verticalAlign: 'middle', padding: '0 10px' }}>
              <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                <tbody>
                  <tr>
                    <td width={`${w}%`} height={9} style={{ background: colour, height: 9, fontSize: 1, lineHeight: '9px', borderRadius: 9 }}>&nbsp;</td>
                    {w < 100 ? <td style={{ background: EMAIL.hairline, height: 9, fontSize: 1, lineHeight: '9px', borderRadius: 9 }}>&nbsp;</td> : null}
                  </tr>
                </tbody>
              </table>
            </td>
            <td align="right" width={78} style={{ verticalAlign: 'middle', width: 78 }}>{cell}</td>
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <div className="mt-2 flex items-center gap-2.5">
      <span className="w-[104px] flex-none text-[13px] text-secondary-foreground">{label}</span>
      <span className="h-[9px] min-w-0 flex-1 overflow-hidden rounded-full bg-border/60">
        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: colour }} />
      </span>
      <span className="w-[78px] flex-none">{cell}</span>
    </div>
  )
}

/** One flag: what it is on, this week against the three months behind it, and
 *  the movement with the band it had to clear — inside the artboard's tinted
 *  inner block. */
function Flag({ flag, index, mode, appUrl, noun }: { flag: WeekFlag; index: number; mode: RenderMode; appUrl: string; noun: PeriodNoun }) {
  const href = `${appUrl}${flag.href}`
  const weekPct = pctOf(flag.weekK, flag.weekN)
  const basePct = pctOf(flag.baselineK, flag.baselineN)
  const top = Math.max(weekPct, basePct, 0.1)
  // A MAGNITUDE AND ITS BAND, NEVER A RATIO. `DeltaVerdict` is the shape the
  // badge already reads; a flag cleared both gates by construction, which is
  // the one thing `state: 'moved'` asserts.
  const verdict = { state: 'moved' as const, change: Math.round(flag.changePts * 10) / 10, band: Math.round(flag.bandPts * 10) / 10 }
  const title = `Unusual ${inPeriod(noun)} · ${flag.label}`
  const caption = `videos naming it · counted against ${flag.denominator}`
  const bars = (
    <>
      <BarRow label={noun === 'week' ? 'This week' : 'This update'} share={(weekPct / top) * 100} k={flag.weekK} n={flag.weekN} tone="flag" mode={mode} />
      <BarRow label="Three months behind" share={(basePct / top) * 100} k={flag.baselineK} n={flag.baselineN} tone="base" mode={mode} />
    </>
  )
  const interpretation = flag.sentences.length > 0
    ? (
        <>
          <div
            style={mode === 'email' ? { fontFamily: FONT.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: EMAIL.faint } : undefined}
            className={mode === 'email' ? undefined : 'font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground'}
          >
            {INTERPRETATION_LABEL}
          </div>
          <TokenProse body={flag.sentences.join(' ')} figures={flagFigures(flag, index)} mode={mode} model />
        </>
      )
    : null

  if (mode === 'email') {
    return (
      <div style={{ background: EMAIL.inner, borderRadius: 6, padding: 16, marginTop: 12 }}>
        <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
          <tbody>
            <tr>
              <td style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>{title}</td>
              <td align="right" style={{ whiteSpace: 'nowrap', paddingLeft: 10 }}><BlockMovement verdict={verdict} unit="pts" mode={mode} good="neutral" /></td>
            </tr>
          </tbody>
        </table>
        {bars}
        <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.4, color: EMAIL.faint, marginTop: 8 }}>{caption}</div>
        {interpretation ? <><div style={{ height: 1, background: EMAIL.border, margin: '14px 0', fontSize: 1, lineHeight: '1px' }}>&nbsp;</div>{interpretation}</> : null}
        <FlagQuotes quotes={flag.quotes} mode={mode} />
        <div style={{ marginTop: 8 }}><a href={href} style={{ color: EMAIL.link, fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>See the week →</a></div>
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-md bg-inner p-4">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="flex-none"><BlockMovement verdict={verdict} unit="pts" mode={mode} good="neutral" /></span>
      </div>
      {bars}
      <p className="m-0 mt-2 font-mono text-[11px] leading-snug text-muted-foreground">{caption}</p>
      {interpretation ? <><div className="my-3.5 h-px bg-border" />{interpretation}</> : null}
      <FlagQuotes quotes={flag.quotes} mode={mode} />
      <Link href={href} className="mt-2 inline-block text-[12px] font-semibold hover:underline">See the week →</Link>
    </div>
  )
}

export const weeklyWeek: Block<WeeklyData> = {
  key: 'weekly.week',
  title: 'The week in one sentence',
  question: 'What is the state of the week, and does anything need me?',

  render(data, mode = 'app', ctx) {
    const s = data.section1
    const flagged = s.check.state === 'flagged' && s.check.flags.length > 0
    return (
      <BlockFrame
        // THE HEADING TAKES ITS WORD FROM THE WINDOW. `Block.title` stays the
        // artefact's own generic name for registries and decks; what a reader
        // sees names the window this update actually covered, because Sealand's
        // is thirty days long and "the week" is not true of it.
        title={s.check.noun === 'week' ? weeklyWeek.title : 'The update in one sentence'}
        question={s.check.noun === 'week' ? weeklyWeek.question : 'What is the state of this update, and does anything need me?'}
        mode={mode}
        // THE MOCK'S "n = 312 videos this week", IN THE HONEST FORM (D6): what
        // this update read, and the month it is a contribution to, side by
        // side. The dates that stood here are in the masthead above, once.
        meta={updateMeta(data.incoming.gathered, data.incoming.monthVideos, data.month)}
      >
        {/* THE HERO LINE — the artboard's 17.5px, against the 13.5px body copy
            it printed at. It is the page's one sentence and the type ramp says
            so (design-system §Type ramp, "Hero lead"). */}
        <TokenProse
          body={s.sentence.body}
          figures={s.sentence.figures}
          mode={mode}
          size={17.5}
          className="m-0 text-[17.5px] leading-[1.5]"
        />
        <div style={mode === 'email' ? { marginTop: 10 } : undefined} className={mode === 'email' ? undefined : 'mt-2.5'}>
          {flagged ? (
            <>
              <Muted mode={mode}>{s.check.line}</Muted>
              {s.check.flags.map((f, i) => <Flag key={`${f.objectKind}:${f.label}`} flag={f} index={i} mode={mode} appUrl={ctx.appUrl} noun={s.check.noun} />)}
              {/* THE CODA, BESIDE THE FLAG AND NOT INSTEAD OF IT. */}
              <Muted mode={mode}>
                {s.check.moreFlags > 0
                  ? `${fmtInt(s.check.moreFlags)} more cleared the band and are on This week.`
                  : nothingElseUnusual(s.check.noun)}
              </Muted>
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
