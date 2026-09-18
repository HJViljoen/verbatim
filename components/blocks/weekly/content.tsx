import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { BlockMovement } from '@/components/blocks/movement'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import { inPeriod } from '@/lib/reports/weekly'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { WeeklyData } from '@/lib/pages/weekly'

// WR5 · For content (design §3 WR section 5).
//
// THREE THINGS, EACH WITH ITS n. Worth a reply (the inbox's own top three,
// with the inbox's own empty state kept verbatim), what moved most — three
// themes from the MONTH's reading, each with the band it cleared, never a
// weekly mover, which no n on this artefact could support — and the one format
// that carried, with the videos it is an average over.
//
// THE DESIGN CALLS THAT MIDDLE ONE "rising now" AND THE HEADING DOES NOT SAY
// SO. A direction word in a heading is a claim made before any row has earned
// one, which is rule (c) of the copy contract; WP11 made exactly this change to
// OV3's "What grew and what faded". Each row still carries its own direction,
// in the badge, where a verdict computed it.
//
// THE INBOX'S WORDS ARE THE INBOX'S. The rows come from the Content loader
// unchanged, so the queue a content person opens and the queue this section
// names cannot disagree; when Phase 2 moves the inbox to This week, this
// section follows it by changing one loader call.

function Rail({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '7px 0' }}>{children}</div>
    : <div className="border-t border-border/70 py-1.5">{children}</div>
}

/**
 * The artboard's counted row: a title, a mono 16/600 figure at the right end,
 * and a mono sub-line under it (`weekly.s5.reply`, `weekly.s5.format`).
 *
 * The same anatomy WR4 draws, at the same scale — three counted rows in a row
 * are what §4 and §5 are, and a reader crossing from one to the other should
 * not have to learn a second shape.
 */
function CountedRow({ title, value, note, mode, children }: {
  title: ReactNode
  value: string
  note?: ReactNode
  mode: RenderMode
  children?: ReactNode
}) {
  const figure = mode === 'email'
    ? <span style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 600, color: EMAIL.ink }}>{value}</span>
    : <span className="font-mono text-[16px] font-semibold tabular-nums">{value}</span>
  if (mode === 'email') {
    return (
      <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '11px 0' }}>
        <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
          <tbody>
            <tr>
              <td style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink }}>{title}</td>
              <td align="right" style={{ whiteSpace: 'nowrap', paddingLeft: 14 }}>{figure}</td>
            </tr>
          </tbody>
        </table>
        {note ? <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.5, color: EMAIL.muted, marginTop: 5 }}>{note}</div> : null}
        {children}
      </div>
    )
  }
  return (
    <div className="flex min-h-[44px] flex-col gap-1.5 border-t border-border/70 py-2.5">
      <div className="flex items-baseline justify-between gap-3.5">
        <span className="min-w-0 text-[14px]">{title}</span>
        <span className="flex-none">{figure}</span>
      </div>
      {note ? <span className="font-mono text-[11px] leading-relaxed text-muted-foreground">{note}</span> : null}
      {children}
    </div>
  )
}

/** "1.8× over 24 of 402" — a multiple with the n it was read over, on either
 *  side of the head-to-head. */
const multipleOf = (m: number): string => `${(Math.round(m * 10) / 10).toFixed(1)}×`

function Eyebrow({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.mono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.5px', color: EMAIL.muted }}>{children}</div>
    : <div className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{children}</div>
}

function Note({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, padding: '4px 0' }}>{children}</div>
    : <p className="m-0 py-1 text-[11.5px] text-muted-foreground">{children}</p>
}

export const weeklyContent: Block<WeeklyData> = {
  key: 'weekly.content',
  title: 'For content',
  question: 'Who should we answer, and what should we make?',

  render(data, mode = 'app', ctx) {
    const c = data.content
    // The window's own word — Sealand's is thirty days long (`periodNounFor`).
    const noun = data.section1.check.noun
    // ABSOLUTE IN EVERY MODE (lib/blocks/types.ts, BlockContext.appUrl): print
    // goes into a PDF and the share page is read outside the app, so a relative
    // href is a dead link there. The app passes appUrl '' and keeps the
    // relative form it wants.
    const weekHref = `${ctx.appUrl}${c.weekHref}`
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={weeklyContent.title}
        question={weeklyContent.question}
        mode={mode}
        footer={mode === 'email'
          ? <a href={weekHref} style={{ color: EMAIL.ink }}>Open This week →</a>
          : <Link href={weekHref} className="hover:underline">Open This week →</Link>}
      >
        {children}
      </BlockFrame>
    )
    const empty = weeklyContent.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        {/* ONE COUNTED ROW, THEN THE WORDS (weekly.s5.reply). The mock counts
            the queue and splits it by intent; the artefact printed three quote
            rails and no count, so a content person could not tell three from
            thirty.

            AND THE ROW SAYS "SURFACED", BECAUSE THAT IS WHAT THE NUMBER IS.
            It was headed "Worth a reply this week" over `inbox.total`, which
            is the length of a RANKED, CAPPED list — `rankEngageCandidates`
            allows three per kind and twelve in all, plus three flagged, so the
            figure is bounded at fifteen for every tenant forever and the
            intent split at three apiece (lib/engage.ts; the field's own
            docblock in lib/pages/weekly.ts has the chain). A cap printed at
            16px under "worth a reply" tells a content person how much of their
            week is waiting, and it cannot know that. The queue's own verb —
            lib/pages/content.ts's method note, "the reply inbox SURFACES N
            comments the analysis already cited" — is the honest one, and the
            sub-line states the cap so the number can be weighed. */}
        {c.surfaced != null ? (
          <CountedRow
            mode={mode}
            title={`Surfaced for a reply ${inPeriod(noun)}`}
            value={fmtInt(c.surfaced)}
            note={
              <>
                {c.surfacedCounts.length > 0
                  ? c.surfacedCounts.map((i) => `${i.label} ${fmtInt(i.count)}`).join(' · ')
                  : 'grouped by what the comment was'}
                {c.worthAReply.length > 0 && c.surfaced > c.worthAReply.length
                  ? ` · ${fmtInt(c.worthAReply.length)} below in full`
                  : ''}
                {' · '}the queue ranks and caps what it shows, so this is what was surfaced and not everything worth answering
              </>
            }
          >
            {c.worthAReply.map((q, i) => (
              <div key={`${q.ref}:${i}`} style={mode === 'email' ? { marginTop: 6 } : undefined} className={mode === 'email' ? undefined : 'mt-1.5'}>
                <Eyebrow mode={mode}>{q.intentLabel}</Eyebrow>
                <BlockQuote
                  quote={q}
                  mode={mode}
                  cite={q.href
                    ? mode === 'email'
                      ? <a href={q.href} style={{ color: EMAIL.link, textDecoration: 'none' }}>{q.context} →</a>
                      : <a href={q.href} className="hover:underline">{q.context} →</a>
                    : q.context}
                />
              </div>
            ))}
          </CountedRow>
        ) : (
          <Note mode={mode}>{c.worthAReplyNote}</Note>
        )}

        {c.rising.length > 0 ? (
          <Rail mode={mode}>
            {/* NOT "RISING NOW", which the design writes and the copy contract
                refuses: a direction word in a heading is a claim made before any
                row has earned one (rule (c); WP11 made the same change to OV3).
                The rows below each carry their own banded verdict, and the badge
                is where a direction may be spoken. */}
            <Eyebrow mode={mode}>What moved most · from this month’s reading</Eyebrow>
            {c.rising.map((m) => (
              <div
                key={m.id}
                style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginTop: 3 } : undefined}
                className={mode === 'email' ? undefined : 'mt-0.5 text-[12.5px]'}
              >
                {m.label} — <span data-copy="figure">{m.pct == null ? `${fmtInt(m.k)} of ${fmtInt(m.n)}` : `${fmtPct(m.pct)} · ${fmtInt(m.k)} of ${fmtInt(m.n)}`}</span>{' '}
                <BlockMovement verdict={m.verdict} unit="pts" mode={mode} />
              </div>
            ))}
          </Rail>
        ) : (
          <Note mode={mode}>{c.risingNote}</Note>
        )}

        {c.format ? (
          <CountedRow
            mode={mode}
            title={c.runnerUp ? <>{c.format.label} outperformed {c.runnerUp.label}</> : <>{c.format.label}</>}
            value={multipleOf(c.format.multiple)}
            note={
              <>
                {c.runnerUp ? <>{c.runnerUp.label} <span data-copy="level">{multipleOf(c.runnerUp.multiple)} over {fmtInt(c.runnerUp.videos)} of {fmtInt(c.format.of)} videos</span> · </> : null}
                {/* D9: the median is THIS UPDATE'S, and the clause is not
                    decoration. Unlike everything above it in this block the
                    figure is run-indexed — the Content loader filters videos to
                    the latest run before it measures — so under a masthead
                    reading "every number below is this month so far" an
                    unlabelled multiple reads as the month's. */}
                against this update’s median video · <span data-copy="level">{fmtInt(c.format.videos)} of {fmtInt(c.format.of)} videos</span> carry it
              </>
            }
          />
        ) : (
          <Note mode={mode}>No format carried enough videos this update to be worth naming.</Note>
        )}
      </div>,
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const m of data.content.rising) {
      if (m.pct == null) continue
      out[`rising_${m.id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`] = {
        value: m.pct,
        unit: 'pct',
        label: `${m.label}, share of the category this month`,
      }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return data.content.rising.map((m) => m.verdict)
  },

  quotes(data) {
    return data.content.worthAReply.map((q) => q.ref)
  },

  emptyState(data) {
    const c = data.content
    return c.worthAReply.length === 0 && c.rising.length === 0 && !c.format
      ? 'Nothing is waiting for a reply and nothing in the category cleared its band this month.'
      : null
  },
}
