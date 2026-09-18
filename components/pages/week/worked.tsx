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
// WHICH MEDIAN, SAID ON THE ROW GROUP (D9). The artboard's header reads "median
// engagement · TikTok · month to date"; what is actually computed is the median
// video of THIS UPDATE, across every platform whose rate is comparable. Those
// are different numbers and the second is not the first, so the group says so
// rather than borrowing the mock's words.
//
// THE MOCK'S STACKED HOOK BAR IS REFUSED (D4). The artboard draws hooks as one
// proportion bar summing to the update — and as a taxonomy this product does
// not have ("on-screen text against spoken"; the classifier's column is
// `hook_style`, and nothing reduces `ocr_text` and `transcript_en` to a mix).
// A stacked bar reads as a partition and invites summing, so each hook keeps
// its own row with its own "of N" in the artboard's row shape, under the
// enum's own words.
//
// REDDIT IS OUT, AND THE BLOCK SAYS WHY. Reddit carries no engagement rate this
// product can read, so including it would drag the median toward zero and make
// every other format look like it worked. Excluding it silently would leave a
// reader thinking the whole update was read.
//
// AND NO DIRECTION WORD. "Talking-head review, 1.8× the update's median over
// 128 videos" is a level. Whether that format is doing better than last month
// is a question about two periods, and this block reads one update.
//
// AND IT IS NOT A READING OF THE CLIENT'S OWN CONTENT — except in the one panel
// that says it is. The pooled rows are every video this update touched (Össur's
// 609 rated videos are 52 of the client's and 557 of everybody else's), which
// is the right population for "did this format work" and the wrong one for
// "what am I making". `WorkedBlock.sides` is the client's own month, on the
// PUBLISHED clock, and it carries its own basis line for that reason.

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
        // WHOSE VIDEOS, SAID OUT LOUD. The population is every video this
        // update touched — Össur's 609 rated videos are 52 of the client's own
        // and 557 of everybody else's — and the block sits four inches below
        // "Your own brand — 52 analysed". It is the Content playbook's own
        // population and it is the right one (a format works or does not,
        // whoever filmed it), but a reader who is not told will read these
        // rows as a verdict on their own content.
        meta={`of ${fmtInt(w.rated)} videos with an engagement figure · yours, your rivals’ and the category’s together`}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open the content brief →</a>
          : <Link href={href} className="hover:underline">Open the content brief →</Link>}
        // THE MOCK'S RIGHT-HAND NOTE, in the slot it draws it in rather than as
        // a body line.
        footerNote={w.excluded.length > 0 ? `${listNames(w.excluded)} excluded from engagement` : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {w.formats.length > 0 ? (
          <Group title="Formats this update" rows={w.formats} rated={w.rated} mode={mode} />
        ) : null}
        {w.hooks.length > 0 ? (
          <Group title="Hooks this update" rows={w.hooks} rated={w.rated} mode={mode} />
        ) : null}
        {w.excluded.length > 0 ? (
          <Note mode={mode}>
            {listNames(w.excluded)} carries no engagement figure this product can read and is out of the median above.
          </Note>
        ) : null}
        <OwnSide sides={w.sides} mode={mode} />
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
      <div className={mode === 'email' ? undefined : 'flex items-baseline justify-between gap-2'}>
        <Heading mode={mode}>{title}</Heading>
        {mode !== 'email' ? (
          // WHICH MEDIAN (D9). Not the mock's "TikTok · month to date" — that
          // is a figure nothing here computes.
          <span className="flex-none font-mono text-[10.5px] text-muted-foreground">
            against this update’s own median video
          </span>
        ) : null}
      </div>
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

/**
 * "Your own hooks, month to date" — the mock's tinted panel
 * (`week.worked.yourhooks`), and the one panel on this block that IS about the
 * client's own content.
 *
 * DATED BY THE PUBLISHED CLOCK, AND IT SAYS SO (D9). Everything above is dated
 * by the update that gathered the video; these are the videos the client
 * PUBLISHED in the month, off `upload_date`, so the two figures may not be read
 * as one. `basisLine` is `formatReading`'s own ("videos published in
 * September") and `coverageLine` names how many of them carry a hook at all —
 * the artboard prints one number where there are two, and the larger.
 *
 * A NULL CELL IS TWO DIFFERENT FACTS. Where the side was read and has none of
 * that hook, the cell is a real "0 of N"; where the side was not read for hooks
 * at all, it says so. `FormatMatrixSide.unread` is what tells them apart, and a
 * panel printing 0 for both would claim a measurement nobody made.
 */
function OwnSide({ sides, mode }: { sides: WeekData['worked']['sides']; mode: 'app' | 'print' | 'email' }) {
  const email = mode === 'email'
  if (!sides) {
    return (
      <Note mode={mode}>
        What you published this month has not been read here, so your own hooks cannot be set beside the field’s.
      </Note>
    )
  }
  const side = sides.hooks.sides[0]
  if (!side) return null
  const cells = sides.hooks.keys
    .map(({ key, label }) => ({ label, row: side.byKey[key] ?? null }))
    .filter((c) => c.row != null && c.row.value.k > 0)
    .slice(0, 4)

  const body = side.unread
    ? side.unread
    : cells.length === 0
      ? `None of the ${fmtInt(side.of)} you published this month carries a hook we could read.`
      : null

  if (email) {
    return (
      <div style={{ marginTop: 10 }}>
        <Heading mode={mode}>Your own hooks, month to date</Heading>
        <div style={{ fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted }}>
          {body ?? cells.map((c) => `${c.label} ${fmtInt(c.row!.value.k)}`).join(' · ')}
          {body ? '' : ` · of ${fmtInt(side.of)} posts with a hook, ${fmtInt(side.published)} published`}
        </div>
        <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{sides.basisLine}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[4px] bg-inner px-3 py-2.5">
      <Heading mode={mode}>Your own hooks, month to date</Heading>
      {body ? (
        <span className="text-[11.5px] text-muted-foreground">{body}</span>
      ) : (
        <span data-copy="level" className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {cells.map((c) => `${c.label} ${fmtInt(c.row!.value.k)}`).join(' · ')} · of {fmtInt(side.of)} posts with a hook, {fmtInt(side.published)} published
        </span>
      )}
      {/* THE BASIS TRAVELS WITH THE FIGURE (D15): these are published-dated and
          everything above them is gather-dated. `sides.coverageLine` is NOT
          printed beside them — it counts the videos carrying a FORMAT (84 of
          Össur's 109) and the cell above counts the ones carrying a HOOK (81),
          so the two numbers would sit a line apart claiming to be the same
          coverage. */}
      <span className="text-[11px] text-muted-foreground">{sides.basisLine}</span>
    </div>
  )
}

function Heading({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{children}</div>
  }
  return <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{children}</h3>
}

function Note({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{children}</div>
  }
  return <p className="m-0 text-[11.5px] text-muted-foreground">{children}</p>
}

