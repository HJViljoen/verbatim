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
import type { Mover } from '@/lib/pages/overview'

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

/**
 * The artboard's counted row: a title, a mono 16/600 figure at the right end,
 * and a mono sub-line under it (`weekly.s5.reply`, `weekly.s5.format`).
 *
 * The same anatomy WR4 draws, at the same scale — three counted rows in a row
 * are what §4 and §5 are, and a reader crossing from one to the other should
 * not have to learn a second shape.
 */
/** "Worth a reply" over its comments: a title and no count (WR-32). */
function ReplyRow({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '11px 0' }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink }}>Worth a reply</div>
        {children}
      </div>
    )
  }
  return (
    <div className="flex min-h-[44px] flex-col gap-1.5 border-t border-border/70 py-2.5">
      <span className="min-w-0 text-[14px]">Worth a reply</span>
      {children}
    </div>
  )
}

/**
 * The movers, as ONE row of the section's own shape: the title on the left,
 * each theme on its own line under it with its reading and its verdict at the
 * right end, and the basis in the mono sub-line.
 *
 * `CountedRow` cannot draw it, because this row has no single figure — three
 * themes have three readings — and inventing one would be a figure nobody
 * measured. What it borrows is the ANATOMY: a 14px title, a mono 11px note,
 * and every number at the right end of its line.
 */
function MoverRows({ movers, mode }: { movers: readonly Mover[]; mode: RenderMode }) {
  const title = 'What moved most'
  const note = 'in the category this month'
  const line = (m: Mover) => {
    // THE READING IS UNBREAKABLE, THE ROW IS NOT. A share and its denominator
    // may not be split across a line (`movers.tsx:291-305` made the trail
    // points unbreakable for exactly this), but the BADGE may drop below
    // them: nowrap on the whole cell set a ~300px floor under the card, which
    // on a 320px screen is a horizontally scrolling email.
    const reading = (
      <>
        <span data-copy="figure" style={{ whiteSpace: 'nowrap' }}>{m.pct == null ? `${fmtInt(m.k)} of ${fmtInt(m.n)}` : `${fmtPct(m.pct)} · ${fmtInt(m.k)} of ${fmtInt(m.n)}`}</span>{' '}
        {/* `good="neutral"`, for the reason WR1's badge is: "Zips failing
            after a year — +1.9 pts" is not good news because the number went
            up, and the title over these rows is deliberately direction-free. */}
        <BlockMovement verdict={m.verdict} unit="pts" mode={mode} good="neutral" />
      </>
    )
    if (mode === 'email') {
      return (
        <table key={m.id} width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 5 }}>
          <tbody>
            <tr>
              <td style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink }}>{m.label}</td>
              <td align="right" style={{ paddingLeft: 14 }}>{reading}</td>
            </tr>
          </tbody>
        </table>
      )
    }
    return (
      <div key={m.id} className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3.5 text-[12.5px]">
        <span className="min-w-0">{m.label}</span>
        <span className="flex-none">{reading}</span>
      </div>
    )
  }
  if (mode === 'email') {
    return (
      <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '11px 0' }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink }}>{title}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.5, color: EMAIL.muted, marginTop: 5 }}>{note}</div>
        {movers.map(line)}
      </div>
    )
  }
  return (
    <div className="flex min-h-[44px] flex-col gap-1.5 border-t border-border/70 py-2.5">
      <span className="text-[14px]">{title}</span>
      <span className="font-mono text-[11px] leading-relaxed text-muted-foreground">{note}</span>
      {movers.map(line)}
    </div>
  )
}

function Note({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, padding: '4px 0' }}>{children}</div>
    : <p className="m-0 py-1 text-[11.5px] text-muted-foreground">{children}</p>
}

export const weeklyContent: Block<WeeklyData> = {
  key: 'weekly.content',
  title: 'For content',

  render(data, mode = 'app', ctx) {
    const c = data.content
    // ABSOLUTE IN EVERY MODE (lib/blocks/types.ts, BlockContext.appUrl): print
    // goes into a PDF and the share page is read outside the app, so a relative
    // href is a dead link there. The app passes appUrl '' and keeps the
    // relative form it wants.
    const weekHref = `${ctx.appUrl}${c.weekHref}`
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={weeklyContent.title}
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
        {/* WORTH A REPLY: THE COMMENTS, NOT THE CAPPED COUNT (T0a, mechanism
            6; WR-32). The surfaced count is the length of a ranked, capped
            list (at most fifteen, three a kind), so at 16px it misstated how
            much is waiting; the number goes, and so do the per-intent counts
            and the empty note. The comments print under their own title. */}
        {c.worthAReply.length > 0 ? (
          <ReplyRow mode={mode}>
            {c.worthAReply.map((q, i) => (
              <div key={`${q.ref}:${i}`} style={mode === 'email' ? { marginTop: 6 } : undefined} className={mode === 'email' ? undefined : 'mt-1.5'}>
                <BlockQuote
                  quote={q}
                  mode={mode}
                  cite={q.href
                    ? mode === 'email'
                      ? <a href={q.href} style={{ color: EMAIL.link, textDecoration: 'none' }}>{q.intentLabel} · {q.context} →</a>
                      : <a href={q.href} className="hover:underline">{q.intentLabel} · {q.context} →</a>
                    : `${q.intentLabel} · ${q.context}`}
                />
              </div>
            ))}
          </ReplyRow>
        ) : null}

        {/* THE MOVERS, IN THE SECTION'S OWN ROW SHAPE (weekly.s5.rising).
            They were a `Rail` holding a mono uppercase eyebrow over two
            sentence rows with amber verdict pills mid-line — a second and
            third row shape in a section the artboard draws as three of one,
            and an extra all-caps eyebrow on an artefact that has one per
            section. The artboard's middle row is "Rising now — wet commute ·
            zips · 16-inch laptop fit" with a mono sub-line under it: a title
            and a note, exactly like the two rows around it.

            NOT "RISING NOW", which the design writes and the copy contract
            refuses: a direction word in a heading is a claim made before any
            row has earned one (rule (c); WP11 made the same change to OV3).
            Each row still carries its own banded verdict in the badge, at the
            right end where every other figure in this section sits, rather
            than inline halfway through a sentence. */}
        {c.rising.length > 0 ? (
          <MoverRows movers={c.rising} mode={mode} />
        ) : (
          <Note mode={mode}>{c.risingNote}</Note>
        )}

        {/* NO FORMAT ROW (T0a, mechanism 6; WR-34). Its multiple is
            run-indexed (the latest run's videos against this update's median
            video), and under a masthead that says every figure is the month
            so far it read as the month's; a bare reword is not honest, and
            it is not re-based on a dated window, so the row is omitted. */}
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
    return c.worthAReply.length === 0 && c.rising.length === 0
      ? 'Nothing is waiting for a reply and nothing in the category cleared its band this month.'
      : null
  },
}
