import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuote } from '@/components/blocks/quote'
import { BlockStat } from '@/components/blocks/stat'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, longMonth } from '@/lib/format'
import { type Riser, type WeekData } from '@/lib/pages/week'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'

// WK §3 · Moving now (design §3 WK4 "Rising now"; the mock's §9).
//
// THE HEADING IS NOT THE MOCK'S, AND THE REASON IS THE MOCK'S OWN RULE. The
// design and the artboard both call this section "Rising now". "Rising" is a
// direction word — it is in the scrubber's own list — and D1 says a direction
// word is earned only by three consecutive monthly readings under one
// grouping. What this block draws is ONE comparison: a month-to-date share
// against the three months pooled behind it. That comparison can say a theme
// moved and cleared its band; it cannot say where the theme is headed, and
// every row's verdict carries no `direction` for exactly that reason. So the
// heading says "Moving", the rows print the difference with its band inside a
// verdict node, and the key stays `week.rising` because a block key is a
// stored contract and the section is "rising now" everywhere the plan names
// it. Reported as a deviation.
//
// THREE THEMES, FROM THE MONTH'S READING AND NOT FROM THE UPDATE'S. The design
// asks for "the three themes that moved most in the current month's reading …
// every figure month-to-date with the trailing baseline beside it", and that is
// a deliberate re-base: the tile this section is descended from — `voice.movers`
// — reads a theme's share per RUN over the cumulative corpus, which is the
// series D1 gates off, and flipping its constant would give this page back the
// object the constant exists to suppress. So the numbers here come from
// `month_theme_readings` keyed on `theme_registry.id`, month-to-date against
// the three complete months behind, banded by the same rule every other
// comparison on the product uses.
//
// WHICH MEANS A ROW IS EARNED HERE, NOT ASSERTED. One appears only where
// `bandVerdict` came back `moved` with a positive difference — a comparison
// that was drawn, on two sides that cleared the floor, and cleared its band.
// `no_clear_change` is an answer and not a movement; `too_little_data` and
// `refused` are the product declining to answer. An empty list is the design's
// own "nothing moved clearly", and on Sealand today that is what it is.
//
// FRAMED AS A MAKE-THIS PROMPT, WITH THE QUOTES. The design's word. A theme
// with a share and no words under it is a number; the point of this section is
// that somebody can film an answer to it this week.

export const weekRising: Block<WeekData> = {
  key: 'week.rising',
  title: 'Moving now',
  question: 'What is worth making something about this week?',

  render(data, mode = 'app', ctx) {
    const r = data.rising
    const email = mode === 'email'
    const empty = weekRising.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/voice`

    return (
      <BlockFrame
        title={weekRising.title}
        question={weekRising.question}
        mode={mode}
        meta={`${longMonth(r.month)} so far · of ${fmtInt(r.monthOf)} category videos`}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Voice →</a>
          : <Link href={href} className="hover:underline">Open Voice →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {r.rows.map((riser) => <Row key={riser.id} riser={riser} mode={mode} month={r.month} />)}
        {r.rows.length > 0 ? (
          <Note mode={mode}>
            {/* A CLAIM ABOUT THE THEMES THAT ARE NOT PRINTED, so it names how
                many were compared. "Nothing else moved clearly" was printed
                whenever exactly three rows fitted, while the loader stopped
                banding the moment it had three — so the page stated as fact
                something it had never tested. §1's shape, in §3's words. */}
            {r.moved > r.rows.length
              ? `${fmtInt(r.moved)} themes cleared their band in this month’s reading; the ${fmtInt(r.rows.length)} largest are printed.`
              : `Nothing else of the ${fmtInt(r.pooled)} themes read against their band this month moved clearly.`}
          </Note>
        ) : null}
        {r.rows.length > 0 ? (
          <Note mode={mode}>
            {/* THE BASELINE IS VIDEO-MONTHS, NOT DISTINCT VIDEOS, and a reader
                comparing one month with three has to be told. The three months
                are summed on both sides, so a video that carried conversation
                in two of them counts in both — which lib/reading/anomaly.ts
                carries twenty lines about, and it is anti-conservative exactly
                where the week side does NOT dominate the variance, which is
                this block's shape. Measured read-only on production: Sealand's
                category Jun–Aug is 449 video-months against 446 distinct
                videos, so the numbers are fine today and the exposure is the
                rule. */}
            The three months behind it are added together, so a video that was
            talked about in two of them is counted in both.
          </Note>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    data.rising.rows.forEach((r, i) => {
      out[`riser_${i + 1}_videos`] = { value: r.month.k, unit: 'videos', label: `${r.label} — videos this month` }
      if (r.verdict.changePts != null) {
        out[`riser_${i + 1}_change`] = { value: r.verdict.changePts, unit: 'pts', label: `${r.label} — the difference` }
      }
    })
    return out
  },

  verdicts(data): Verdict[] {
    return data.rising.rows.map((r) => r.verdict)
  },

  quotes(data) {
    return data.rising.rows.flatMap((r) => r.quotes.map((q) => q.quote.ref))
  },

  emptyState(data) {
    if (data.rising.unread) return data.rising.unread
    if (data.rising.rows.length > 0) return null
    // THE DESIGN'S OWN ANSWER. "Nothing moved clearly" is a legitimate reading
    // and reads differently from "we could not look": the comparisons were
    // drawn and came back inside their bands.
    return `Nothing moved clearly in ${longMonth(data.rising.month)}’s reading so far. A month that is still filling moves late, and a theme that has not cleared its band has not moved.`
  },
}

function Row({ riser, mode, month }: { riser: Riser; mode: 'app' | 'print' | 'email'; month: string }) {
  const email = mode === 'email'
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'} style={email ? { marginTop: 12 } : undefined}>
      <BlockStat
        mode={mode}
        value={fmtInt(riser.month.k)}
        unit="videos"
        level={{
          // The theme's own name, not a calibrated word: `pass_b_theme` is
          // policy 'none', so the label is never direction-scrubbed and the
          // register carries labels like "Concerns about declining quality".
          word: <span data-copy="subject">{riser.label}</span>,
          of: `of ${fmtInt(riser.month.n)} category videos in ${longMonth(month)}`,
        }}
        base={`against ${fmtPct(pct(riser.baseline.k, riser.baseline.n), 1)} across the three months behind it${
          riser.addedVideos != null ? ` · ${fmtInt(riser.addedVideos)} of them arrived with this update` : ''
        }`}
        aside={<BlockMovement verdict={riser.verdict} unit="pts" mode={mode} />}
      />
      {riser.quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
    </div>
  )
}

function Note({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{children}</div>
  }
  return <p className="m-0 text-[11.5px] text-muted-foreground">{children}</p>
}

const pct = (k: number, n: number): number => (n > 0 ? (k / n) * 100 : 0)
