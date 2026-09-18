import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { TileColumns } from '@/components/shell/page-grid'
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

    const max = Math.max(1, ...r.rows.map((row) => (row.month.n > 0 ? row.month.k / row.month.n : 0)))
    return (
      <BlockFrame
        title={weekRising.title}
        question={weekRising.question}
        mode={mode}
        meta={`${longMonth(r.month)} so far · of ${fmtInt(r.monthOf)} category videos`}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Voice →</a>
          : <Link href={href} className="hover:underline">Open Voice →</Link>}
        // THE POOLED-BASELINE CAVEAT IN THE FOOTER'S OWN SLOT. It is a fact
        // about the comparison's arithmetic rather than a finding, and the mono
        // face is where a reader's eye skips it until it wants it. It prints
        // only while the window read cannot answer: once M3 is applied the
        // baseline is a window and the sentence would be false.
        footerNote={r.rows.length > 0 && r.pooledBaseline
          ? 'the three months behind are added together, so a video talked about in two of them counts in both'
          : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {r.rows.length > 0 ? (
          email
            ? <>{r.rows.map((riser) => <Row key={riser.id} riser={riser} mode={mode} month={r.month} max={max} />)}</>
            : (
              // THE ARTBOARD'S THREE-ACROSS STRIP. `RISING_SHOWN` is three and
              // has been since the design named it, so the columns and the rows
              // are the same three.
              <TileColumns of={3}>
                {r.rows.map((riser) => <Row key={riser.id} riser={riser} mode={mode} month={r.month} max={max} />)}
              </TileColumns>
            )
        ) : null}
        {r.rows.length > 0 ? (
          <Note mode={mode}>
            {/* A CLAIM ABOUT THE THEMES THAT ARE NOT PRINTED, so it names how
                many were compared. "Nothing else moved clearly" was printed
                whenever exactly three rows fitted, while the loader stopped
                banding the moment it had three — so the page stated as fact
                something it had never tested. §1's shape, in §3's words. */}
            {/* "CLEARED THEIR BAND" COUNTED ONLY THE ONES THAT WENT UP. The
                loop that fills `moved` does `if (verdict.state !== 'moved' ||
                (verdict.changePts ?? 0) <= 0) continue`, so a theme that
                cleared its band downward did clear its band and was not
                counted. It cannot fire today — both tenants have at most one
                riser, so the other arm prints — but it would the first time a
                month has four or more. The sentence now says which half it is
                counting, in VO2's own words ("a larger share"). */}
            {r.moved > r.rows.length
              ? `${fmtInt(r.moved)} themes cleared their band with a larger share in this month’s reading; the ${fmtInt(r.rows.length)} largest are printed.`
              : `Nothing else of the ${fmtInt(r.pooled)} themes read against their band this month moved clearly.`}
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

/**
 * One column of the artboard's strip.
 *
 * THE MONTH LEADS AND THE UPDATE FOLLOWS, which is the inversion this whole
 * page turns on: the mock's column leads with "34 videos this week" and puts
 * the month-to-date share second. A week alone is not a period (D6), so the
 * level printed is the month's, with its "of N", and what this update put into
 * it is stated under it as a contribution.
 *
 * NO DIRECTION WORD AND NO "Nth MONTH". The mock's chips read "growing, 3rd
 * month" / "up, 2nd month" / "up". This block draws ONE comparison — a
 * month-to-date share against the three months pooled behind it — and a
 * direction is earned only by three consecutive readings under one grouping, on
 * a surface whose own flag is true. `voice.movers` is false, and the badge says
 * points with its band instead.
 */
function Row({ riser, mode, month, max }: { riser: Riser; mode: 'app' | 'print' | 'email'; month: string; max: number }) {
  const email = mode === 'email'
  const share = riser.month.n > 0 ? riser.month.k / riser.month.n : 0
  if (email) {
    return (
      <div style={{ marginTop: 12 }}>
        <BlockStat
          mode={mode}
          value={fmtInt(riser.month.k)}
          unit="videos"
          level={{
            word: <span data-copy="subject" data-slot="pass_b_theme">{riser.label}</span>,
            of: `of ${fmtInt(riser.month.n)} category videos in ${longMonth(month)}`,
          }}
          base={baseLine(riser)}
          aside={<BlockMovement verdict={riser.verdict} unit="pts" mode={mode} />}
        />
        {riser.quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        {/* The theme's own name, not a calibrated word: `pass_b_theme` is
            policy 'none', so the label is never direction-scrubbed and the
            register carries labels like "Concerns about declining quality". */}
        <span data-copy="subject" data-slot="pass_b_theme" className="min-w-0 flex-1 truncate text-[12.5px] font-medium" title={riser.label}>
          {riser.label}
        </span>
        <BlockMovement verdict={riser.verdict} unit="pts" mode={mode} />
      </div>
      <span className="flex items-baseline gap-1.5">
        <span data-copy="figure" className="font-mono text-[18px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
          {fmtInt(riser.month.k)}
        </span>
        <span className="text-[12px] font-medium text-muted-foreground">videos this month</span>
      </span>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-inner">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(1, (share / max) * 100)}%`, background: 'var(--cat)' }} />
      </span>
      <span data-copy="level" className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {fmtInt(riser.month.k)} of {fmtInt(riser.month.n)} category videos in {longMonth(month)} · {fmtPct(share * 100, 1)}
      </span>
      <span className="text-[11px] text-muted-foreground">{baseLine(riser)}</span>
      {riser.quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
    </div>
  )
}

/** What the month is being read against, and what this update put into it. */
function baseLine(riser: Riser): string {
  return `against ${fmtPct(pct(riser.baseline.k, riser.baseline.n), 1)} across the three months behind it${
    riser.addedVideos != null ? ` · ${fmtInt(riser.addedVideos)} of them arrived with this update` : ''
  }`
}

function Note({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{children}</div>
  }
  return <p className="m-0 text-[11.5px] text-muted-foreground">{children}</p>
}

const pct = (k: number, n: number): number => (n > 0 ? (k / n) * 100 : 0)
