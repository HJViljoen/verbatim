import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { SaidAbout } from '@/lib/reading/own-posts'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'

// CO5 · Said about them, by others (the artboard's `grid-column: span 3`).
//
// THE BLOCK THE BUILT PAGE DID NOT EVEN ACKNOWLEDGE. mock-gap records that
// "Said about them, by others" was missing AND unnamed in
// `competitiveUnlockRows()`, so a reader had no way to know the question had
// been asked. It is here now, with its silences said out loud.
//
// EACH NUMERATOR OVER ITS OWN DENOMINATOR (D5). The artboard puts "71 of 1,388"
// on a Freitag row — a Freitag-specific count over the whole category's videos —
// two blocks below giving Freitag its own denominator of 142. Mixing populations
// inside one "k of N" is what the reading layer exists to stop, so `saidAbout`
// takes the denominator from `month_denominators.videos` for the audience the
// numerator was counted over, and the footer note names which population that
// is.
//
// THE UNIT IS DISTINCT VIDEOS, which is the unit every band in this product was
// calibrated on — so a row here sits beside a theme's reading without the unit
// changing under the reader.
//
// THE QUOTE IS A REF, NEVER STORED WORDS. `quoteRef.claim(id)` on the CLAIM's
// own id, so a snapshot keeps the ref and resolves the text at render and a
// voice withdrawn after the freeze disappears from an export. A row that
// arrives without its claim row's id carries no quote at all: an unkeyed
// quotation frozen into a snapshot is the wrong-attribution failure the rule
// exists to stop.
//
// A SILENCE IS NAMED, NOT OMITTED. Every tracked rival gets a row; a rival
// nothing was said about carries `SAID_ABOUT_EMPTY` in its own words, because
// "we read them and heard nothing" and "we did not look" are two answers and a
// block that prints neither is making the reader guess which.

export const SAID_ABOUT_NONE =
  'No rival is tracked for this workspace yet, so there is nobody for the category to talk about. Name one in Settings and this starts reading.'

function Group({ group, mode }: { group: SaidAbout; mode: RenderMode }) {
  const email = mode === 'email'

  const head = (
    <div className={email ? undefined : 'flex items-center gap-2'}>
      {email ? null : <span className="size-1.5 shrink-0 rounded-full bg-[var(--comp)]" aria-hidden />}
      <span className={email ? undefined : 'min-w-0 text-[12.5px] font-semibold'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: EMAIL.ink } : undefined}>
        {group.label}
      </span>
    </div>
  )

  if (group.empty) {
    return email
      ? (
        <div style={{ padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
          {head}
          <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{group.empty}</div>
        </div>
      )
      : (
        <div className="flex min-w-0 flex-col gap-0.5">
          {head}
          <p className="m-0 text-[11.5px] text-muted-foreground">{group.empty}</p>
        </div>
      )
  }

  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-1.5'} style={email ? { padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}>
      {head}
      {group.rows.map((row, i) => (
        <div key={row.quote?.ref ?? `${group.audience}-${i}`} className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
          <div className={email ? undefined : 'flex items-baseline justify-between gap-2.5'}>
            <span
              data-copy="stored"
              data-slot="pass_a_brand_claim"
              className={email ? undefined : 'min-w-0 text-[12.5px] text-secondary-foreground'}
              style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2 } : undefined}
            >
              {row.claim}
            </span>
            <span className={email ? undefined : 'shrink-0'}>
              <FigureCell value={fmtInt(row.value.k)} of={`of ${fmtInt(row.value.n)}`} align="right" mode={mode} />
            </span>
          </div>
          {row.quote ? <BlockQuote quote={row.quote} mode={mode} /> : null}
        </div>
      ))}
    </div>
  )
}

export const competitiveSaidAbout: Block<CompetitiveSurfaceData> = {
  key: 'competitive.saidabout',
  title: 'Said about them, by others',
  question: 'What does everybody else say about each rival?',

  render(data, mode = 'app') {
    const groups = data.saidAbout
    const email = mode === 'email'
    const empty = competitiveSaidAbout.emptyState(data)

    return (
      <BlockFrame
        title={competitiveSaidAbout.title}
        question={competitiveSaidAbout.question}
        mode={mode}
        meta="in videos about them"
        footer={
          mode === 'app'
            ? <Link href="/dashboard/voice" className="hover:underline">Hear these voices →</Link>
            : 'Hear these voices.'
        }
        // THE DENOMINATOR, NAMED IN THE FOOTER (D5). The artboard's own note
        // reads "counted, not quoted"; the thing this block most needs stated
        // is which population each "k of N" is a share of, because the mock got
        // that wrong on the same rows.
        footerNote="of each brand’s own videos"
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-2.5'}>
          {groups.map((g) => <Group key={g.audience} group={g} mode={mode} />)}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const g of data.saidAbout) {
      const top = g.rows[0]
      if (!top) continue
      const key = g.audience.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      out[`saidabout_${key}_top`] = { value: top.value.k, unit: 'videos', label: `videos carrying the most-said thing about ${g.label}` }
      out[`saidabout_${key}_of`] = { value: top.value.n, unit: 'videos', label: `videos about ${g.label} this month` }
    }
    return out
  },

  quotes(data) {
    return data.saidAbout.flatMap((g) => g.rows.flatMap((r) => (r.quote ? [r.quote.ref] : [])))
  },

  emptyState(data) {
    return data.saidAbout.length === 0 ? SAID_ABOUT_NONE : null
  },
}
