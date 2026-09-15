import Link from 'next/link'
import type { Block, QuoteRef } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuotes } from '@/components/blocks/quote'
import { INTERPRETATION_LABEL } from '@/lib/prose/interpret'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { AnomalyLine, OverviewData } from '@/lib/pages/overview'
import { TokenProse } from './prose'

// OV1 · In one sentence, anything unusual, and the one thing to do
// (design §3 OV1). The first sixty seconds of the meeting.

/** The anomaly line, in the reader's words. One line, with its band, its n and
 *  one quote — and ABSENT when nothing fired, never replaced by a reassurance:
 *  a block that prints "nothing unusual" every week trains the reader to skip
 *  it. ("Nothing unusual this week" is printed on This week and on the weekly
 *  report, where it answers a question the reader arrived with.) */
function anomalySentence(a: AnomalyLine): string {
  return `${a.label} — ${fmtInt(a.k)} of ${fmtInt(a.n)} ${a.denominator} in the week of ${shortDate(a.weekStart)}, against the three months behind it (band ±${Math.abs(a.bandPts)} points).`
}

export const overviewSentence: Block<OverviewData> = {
  key: 'overview.sentence',
  title: 'In one sentence',
  question: 'What moved this month, and what should we do about it?',

  render(data, mode = 'app', ctx) {
    const s = data.sentence
    const email = mode === 'email'
    const market = `${ctx.appUrl}/dashboard/market`
    const week = `${ctx.appUrl}/dashboard/week`

    const head = (
      <div className={email ? undefined : 'flex flex-wrap items-baseline gap-x-2 gap-y-1'}>
        <TokenProse body={s.body} figures={s.figures} mode={mode} />
        {s.lead ? <BlockMovement verdict={s.lead} unit="pts" mode={mode} /> : null}
      </div>
    )

    const unusual = s.anomaly ? (
      email ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 8 }}>
          <strong style={{ color: EMAIL.ink }}>Unusual this week:</strong> {anomalySentence(s.anomaly)}
        </div>
      ) : (
        <p className="m-0 rounded-md bg-inner px-2.5 py-1.5 text-[12.5px] text-secondary-foreground">
          <span className="font-medium text-foreground">Unusual this week:</span> {anomalySentence(s.anomaly)}{' '}
          <Link href={week} className="underline underline-offset-2">This week →</Link>
        </p>
      )
    ) : null

    const read = s.interpretation.sentences.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-1'}>
        <span
          className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}
        >
          Our read · {INTERPRETATION_LABEL}
        </span>
        <TokenProse body={s.interpretation.sentences.join(' ')} figures={s.figures} mode={mode} model />
        {s.interpretation.note ? (
          <span
            className={email ? undefined : 'text-[11px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}
          >
            {s.interpretation.note}
          </span>
        ) : null}
      </div>
    ) : null

    const ledger = s.ledger ? (
      email ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginTop: 8 }}>
          {s.ledger.title}
          <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>
            {ledgerMeta(s.ledger)}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Top recommendation</span>
          <Link href={s.ledger.href} className="text-[13px] font-medium underline-offset-2 hover:underline">{s.ledger.title}</Link>
          <span className="text-[11.5px] text-muted-foreground">{ledgerMeta(s.ledger)}</span>
        </div>
      )
    ) : null

    const voices = s.voices.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-2'}>
        <span
          className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}
        >
          {/* "TWO OF N VOICES" (disposition #18). The N is the readable voices
              the sentence's own videos held, so a reader can see that two were
              chosen and not that two were all there was. */}
          {s.voices.length} of {fmtInt(Math.max(s.voicesFrom, s.voices.length))} voices
        </span>
        <BlockQuotes
          mode={mode}
          quotes={s.voices.map((v) => ({
            quote: v.quote,
            // platform · date · LINK (design §3 OV1). The words stay the words
            // when there is nowhere to send the reader.
            cite: v.href ? <a href={v.href} rel="noreferrer" target="_blank" style={email ? { color: EMAIL.muted } : undefined}>{v.cite}</a> : v.cite,
          }))}
        />
      </div>
    ) : null

    const empty = overviewSentence.emptyState(data)
    return (
      <BlockFrame
        title={overviewSentence.title}
        question={overviewSentence.question}
        mode={mode}
        footer={email ? <a href={market} style={{ color: EMAIL.ink }}>Open Market →</a> : <Link href={market} className="hover:underline">Open Market →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'flex flex-col gap-3'}>
          {head}
          {unusual}
          {read}
          {ledger}
          {voices}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = { ...data.sentence.figures }
    const a = data.sentence.anomaly
    if (a) {
      out.unusual_week_videos = { value: a.k, unit: 'videos', label: `videos that raised ${a.label} this week` }
      out.unusual_week_of = { value: a.n, unit: 'videos', label: 'videos read in the week' }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return data.sentence.lead ? [data.sentence.lead] : []
  },

  quotes(data): QuoteRef[] {
    const refs = data.sentence.voices.map((v) => v.quote.ref)
    return data.sentence.anomaly?.quote ? [...refs, data.sentence.anomaly.quote.ref] : refs
  },

  emptyState(data) {
    const s = data.sentence
    if (s.lead || s.anomaly || s.ledger || s.voices.length > 0) return null
    return 'There is nothing to report on this month yet.'
  },
}

/** "first raised 3 months ago · you marked it Working on it on 2 Sep" — with
 *  the age absent until a lineage has been kept for two updates, because a
 *  recommendation dated from its newest copy is not an age. */
function ledgerMeta(l: NonNullable<OverviewData['sentence']['ledger']>): string {
  const parts: string[] = []
  if (l.monthsOld != null && l.monthsOld > 0) parts.push(`first raised ${l.monthsOld} ${l.monthsOld === 1 ? 'month' : 'months'} ago`)
  parts.push(
    l.decidedAt
      ? `you marked it ${l.statusLabel} on ${shortDate(l.decidedAt)}`
      : `no decision recorded — it stands at ${l.statusLabel}`,
  )
  return parts.join(' · ')
}
