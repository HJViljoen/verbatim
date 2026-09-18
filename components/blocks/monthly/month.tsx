import Link from 'next/link'
import type { Block, QuoteRef } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuotes } from '@/components/blocks/quote'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, shortDate } from '@/lib/format'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { AnomalyLine } from '@/lib/pages/overview'
import type { MonthlyData } from '@/lib/pages/monthly'

/**
 * MR1 · The month (Phase 1 WP18; design §3 MR, the mock's section 1).
 *
 * OV0's LINE AND OV1's SENTENCE, AND NEITHER OF THE TWO THINGS THAT BELONG AT
 * THE END. Overview's OV1 block carries four things: the code sentence, the
 * unusual-week line, the labelled interpretation and the standing advice.
 * Heinrich's revision 6 moves the decision to the end of the monthly report —
 * "what to decide before the next reading" is the mock's seventh section — so
 * the interpretation and the advice travel there, and printing them here as
 * well would put one paragraph on one artefact twice, under two headings, six
 * sections apart. That is the deviation from the WP's "the month (OV0/OV1)",
 * and it is the smallest one that lets both sections exist.
 *
 * WHAT STAYS: the sentence, which is CODE's and carries its figures as tokens;
 * the week that was unusual, because a month's report is still the place a
 * reader meets that; and the two voices, because the sentence is about a number
 * and the voices are what the number is made of.
 */
export const monthlyMonth: Block<MonthlyData> = {
  key: 'monthly.month',
  title: 'The month',
  question: 'Where do we stand, and what moved to get us here?',

  render(data, mode = 'app', ctx) {
    const s = data.overview.sentence
    const b = data.overview.bar
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard`

    // TWO LINES, NOT ONE. OV0 prints the filling line and the reading counter
    // as separate paragraphs; joined by a space they read as one sentence
    // running off the end of itself — "last month at this point: not recorded
    // yet your 4th monthly reading" — which is what the live render showed.
    const stamp = email ? (
      <>
        <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{b.line}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>{b.counter}</div>
      </>
    ) : (
      <div className="flex flex-col gap-0.5">
        <p className="m-0 text-[12px] text-muted-foreground">{b.line}</p>
        <p className="m-0 text-[11.5px] text-muted-foreground">{b.counter}</p>
      </div>
    )

    // THE MONTH'S SENTENCE IS THE ARTEFACT'S HERO (Block D wave 2, E-monthly).
    // The artboard sets it in serif at 23px — it is the one sentence the whole
    // report is about, and at 13.5px sans it read as the first of eight
    // paragraphs. The badge goes UNDER it rather than beside it: a chip on the
    // baseline of a 23px serif line sits in the middle of the sentence when the
    // line wraps, which it does at 600px.
    const head = (
      <div className={email ? undefined : 'flex flex-col items-start gap-1.5'}>
        <TokenProse body={s.body} figures={s.figures} mode={mode} size="hero" />
        {s.lead ? (
          <div style={email ? { marginTop: 8 } : undefined}><BlockMovement verdict={s.lead} unit="pts" mode={mode} /></div>
        ) : null}
      </div>
    )

    const unusual = s.anomaly ? (
      email ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 8 }}>
          <strong style={{ color: EMAIL.ink }}>One unusual week:</strong> {anomalySentence(s.anomaly)}
        </div>
      ) : (
        <p className="m-0 rounded-md bg-inner px-2.5 py-1.5 text-[12.5px] text-secondary-foreground">
          <span className="font-medium text-foreground">One unusual week:</span> {anomalySentence(s.anomaly)}{' '}
          <Link href={`${ctx.appUrl}/dashboard/week`} className="underline underline-offset-2">This week →</Link>
        </p>
      )
    ) : null

    // LAST MONTH, CONFIRMED. The other half of item 13's loop, and it belongs
    // here rather than in the masthead: a reader meets the month's own numbers
    // first and is then told what the month before them settled at.
    const confirming = data.confirming ? (
      email ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 8 }}>{data.confirming}</div>
      ) : (
        <p className="m-0 text-[11.5px] text-muted-foreground">{data.confirming}</p>
      )
    ) : null

    // A WITHDRAWN COMMENT LEAVES ITS WRAPPER BEHIND. The quote is a FIELD of
    // `{ quote, cite, href }`, so `resolveQuotes` nulls it where it stands
    // rather than dropping it from the list; the count and the renderer both
    // have to read the survivors, not the wrappers.
    const said = s.voices.filter(hasQuote)
    const voices = said.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-2'}>
        <span
          className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}
        >
          {said.length} of {fmtInt(Math.max(s.voicesFrom, said.length))} voices
        </span>
        <BlockQuotes
          mode={mode}
          quotes={said.map((v) => ({
            quote: v.quote,
            cite: v.href
              ? <a href={v.href} rel="noreferrer" target="_blank" style={email ? { color: EMAIL.muted } : undefined}>{v.cite}</a>
              : v.cite,
          }))}
        />
      </div>
    ) : null

    const empty = monthlyMonth.emptyState(data)
    return (
      <BlockFrame
        title={monthlyMonth.title}
        question={monthlyMonth.question}
        mode={mode}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open the month →</a>
          : <Link href={href} className="hover:underline">Open the month →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'flex flex-col gap-3'}>
          {stamp}
          {head}
          {unusual}
          {confirming}
          {voices}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const s = data.overview.sentence
    const b = data.overview.bar
    const out: FigureTable = { ...s.figures }
    // The month's own size, which is the figure "the report of {date} read X"
    // is most often about — AND ONLY WHERE IT WAS READ. `?? 0` wrote "0 videos
    // read into this month" into a frozen snapshot and into a record that can
    // never be rewritten; n = 0 is not a reading of zero, it is a month nobody
    // counted, which is the distinction verdictsWorthRecording refuses two
    // files away. A missing figure is a silence and prints as one.
    if (b.videos != null) {
      out.month_videos = { value: b.videos, unit: 'videos', label: 'videos read into this month' }
    }
    if (b.atLastMonthKnown && b.atLastMonth != null) {
      out.month_at_last_month = { value: b.atLastMonth, unit: 'videos', label: 'videos at this point last month' }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return data.overview.sentence.lead ? [data.overview.sentence.lead] : []
  },

  quotes(data): QuoteRef[] {
    const s = data.overview.sentence
    const refs = s.voices.filter(hasQuote).map((v) => v.quote.ref)
    return hasQuote(s.anomaly) ? [...refs, s.anomaly.quote.ref] : refs
  },

  emptyState(data) {
    const s = data.overview.sentence
    if (s.lead || s.anomaly || s.voices.length > 0 || data.overview.bar.videos != null) return null
    return 'There is nothing to report on this month yet.'
  },
}

/** The unusual week, in the reader's words. The same sentence OV1 composes —
 *  one week, its band, its n and where it sat.
 *
 *  HEADED "ONE UNUSUAL WEEK", not "Unusual this month". The line names a week
 *  ("in the week of 13 Sep") and is read on an artefact whose every other
 *  number is a whole calendar month; "Unusual this month" over it reads as a
 *  claim about the month rather than about one week inside it. OV1 says "this
 *  week" for the same sentence on a weekly surface, where the period is
 *  unambiguous. */
function anomalySentence(a: AnomalyLine): string {
  return `${a.label} — ${fmtInt(a.k)} of ${fmtInt(a.n)} ${a.denominator} in the week of ${shortDate(a.weekStart)}, against the three months behind it (band ±${Math.abs(a.bandPts)} points).`
}
