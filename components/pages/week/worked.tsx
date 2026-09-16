import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockRanked } from '@/components/blocks/bars'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, listNames } from '@/lib/format'
import { type WeekData, type WorkedRow } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'

// WK §6 · What worked (the mock's §6; the weekly report's WR5 content half).
//
// FORMATS AND HOOKS, WITH AN n ON EVERY ROW. `perfVsMedian` compares a group's
// average engagement rate with the update's median video and needs three rated
// videos in a group before it will speak — so a row here is a measurement over
// a named number of videos, and the number is printed because a multiple
// without its n is the shape of a claim that one fluke can make.
//
// REDDIT IS OUT, AND THE BLOCK SAYS WHY. Reddit carries no engagement rate this
// product can read, so including it would drag the median toward zero and make
// every other format look like it worked. Excluding it silently would leave a
// reader thinking the whole update was read.
//
// AND NO DIRECTION WORD. "Talking-head review, 1.8× the update's median over
// 128 videos" is a level. Whether that format is doing better than last month
// is a question about two periods, and this block reads one update.

export const weekWorked: Block<WeekData> = {
  key: 'week.worked',
  title: 'What worked',
  question: 'Which formats and hooks earned attention in this update?',

  render(data, mode = 'app', ctx) {
    const w = data.worked
    const email = mode === 'email'
    const empty = weekWorked.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/reports`

    return (
      <BlockFrame
        title={weekWorked.title}
        question={weekWorked.question}
        mode={mode}
        meta={`${fmtInt(w.rated)} videos with an engagement figure`}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open the content brief →</a>
          : <Link href={href} className="hover:underline">Open the content brief →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {w.formats.length > 0 ? <Group title="Formats" rows={w.formats} rated={w.rated} mode={mode} /> : null}
        {w.hooks.length > 0 ? <Group title="Hooks" rows={w.hooks} rated={w.rated} mode={mode} /> : null}
        {w.excluded.length > 0 ? (
          <Note mode={mode}>
            {listNames(w.excluded)} carries no engagement figure this product can read and is out of the median above.
          </Note>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {
      worked_rated: { value: data.worked.rated, unit: 'videos', label: 'videos with an engagement figure' },
    }
    data.worked.formats.forEach((r, i) => {
      out[`format_${i + 1}_videos`] = { value: r.videos, unit: 'videos', label: `${r.label} — videos` }
    })
    data.worked.hooks.forEach((r, i) => {
      out[`hook_${i + 1}_videos`] = { value: r.videos, unit: 'videos', label: `${r.label} — videos` }
    })
    return out
  },

  emptyState(data) {
    return data.worked.unread
  },
}

function Group({
  title, rows, rated, mode,
}: {
  title: string
  rows: readonly WorkedRow[]
  rated: number
  mode: 'app' | 'print' | 'email'
}) {
  const max = Math.max(1, ...rows.map((r) => r.videos))
  return (
    <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-2'} style={mode === 'email' ? { marginTop: 10 } : undefined}>
      <Heading mode={mode}>{title}</Heading>
      <BlockRanked
        mode={mode}
        rows={rows.map((r) => ({
          // ALREADY A LABEL — humanised by `workedLabel` in the loader, and
          // never CSS `capitalize`: an email client applies no stylesheet, and
          // a slug that reads as a label on screen would read as
          // `trend-riding` in the inbox. It happens there rather than here
          // because one of the enum's own values humanises into a direction
          // word, which is a decision about the product's vocabulary and not
          // about this markup.
          label: r.label,
          pct: (r.videos / max) * 100,
          color: 'var(--cat)',
          // THE LEVEL AND ITS DENOMINATOR TOGETHER. A multiple on its own is a
          // score; "1.8× the update's median · 128 of 331 videos" is a
          // measurement (copy contract rule (b)).
          count: (
            <span data-copy="level">
              {r.multiple.toFixed(1)}× the median · {fmtInt(r.videos)} of {fmtInt(rated)} videos
            </span>
          ),
          // A PLAIN STRING, NOT A STYLED SPAN. `BlockRanked`'s email arm
          // renders a badge verbatim into its table cell, so a className here
          // would ship a Tailwind class into an inbox that has no stylesheet —
          // which the email-safety test catches, and which is the whole reason
          // the primitives own their own markup per mode.
          // `engagement_rate` IS ALREADY A PERCENTAGE in the column, not a
          // share — the Content page prints `fmtPct(avgEng)` straight. A ×100
          // here read "Promotional 998%" against a 3.3× multiple on
          // production, which is the kind of number a reader stops trusting a
          // page over.
          badge: fmtPct(r.engagement, 1),
        }))}
      />
    </div>
  )
}

function Heading({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{children}</div>
  }
  return <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{children}</h3>
}

function Note({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{children}</div>
  }
  return <p className="m-0 text-[11.5px] text-muted-foreground">{children}</p>
}
