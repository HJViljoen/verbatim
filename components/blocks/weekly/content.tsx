import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { BlockMovement } from '@/components/blocks/movement'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
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

function Eyebrow({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.mono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.5px', color: EMAIL.faint }}>{children}</div>
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
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={weeklyContent.title}
        question={weeklyContent.question}
        mode={mode}
        footer={mode === 'email'
          ? <a href={`${ctx.appUrl}${c.weekHref}`} style={{ color: EMAIL.ink }}>Open This week →</a>
          : <Link href={c.weekHref} className="hover:underline">Open This week →</Link>}
      >
        {children}
      </BlockFrame>
    )
    const empty = weeklyContent.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        {c.worthAReply.length > 0
          ? c.worthAReply.map((q, i) => (
              <Rail key={`${q.ref}:${i}`} mode={mode}>
                <Eyebrow mode={mode}>Worth a reply · {q.intentLabel}</Eyebrow>
                <BlockQuote
                  quote={q}
                  mode={mode}
                  cite={q.href
                    ? mode === 'email'
                      ? <a href={q.href} style={{ color: EMAIL.link, textDecoration: 'none' }}>{q.context} →</a>
                      : <a href={q.href} className="hover:underline">{q.context} →</a>
                    : q.context}
                />
              </Rail>
            ))
          : <Note mode={mode}>{c.worthAReplyNote}</Note>}

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
          <Rail mode={mode}>
            <Eyebrow mode={mode}>What worked</Eyebrow>
            <div
              style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginTop: 3 } : undefined}
              className={mode === 'email' ? undefined : 'mt-0.5 text-[12.5px]'}
            >
              {c.format.label} — <span data-copy="figure">{(Math.round(c.format.multiple * 10) / 10).toFixed(1)}×</span> the median video’s engagement, over <span data-copy="figure">{fmtInt(c.format.videos)}</span> {c.format.videos === 1 ? 'video' : 'videos'}
            </div>
          </Rail>
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
