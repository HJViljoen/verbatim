import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'

// CO3, CO4, CO6 and CO7 — the four sections of Competitive that are not built,
// each naming what it waits for and who owns it.
//
// THIS IS THE SURFACE'S OWN RULE, NOT A CONVENIENCE. Design §3 CO: "the whole
// surface is gated by the tenant's readiness page (ST1): a section whose inputs
// are not configured renders its '— not tracked' state with the name of the
// person who fixes it."
//
// — and that is CO4 alone. Its inputs are a rival's own accounts, which are the
// client's to name, which is also why its owner is their digital director and
// not engineering: saying "Verbatim engineering" against it would quietly take
// a job off the client's desk and put it on a queue.
//
// The other three have their inputs — head-to-head, findings and category
// content read the same ones CO2 and CO5 have just drawn on the page above —
// and what they are missing is the code. All four used to say "— not tracked",
// which told a client their rivals were not being tracked on a page that had
// just shown them three months of exactly that. Market's own unlocks say
// "— not built yet", and one product does not need two answers to this.
//
// NO DATES. Nothing in this product holds a delivery date, and a date computed
// from the calendar is wrong the first time it is read.

export const competitiveUnlocks: Block<CompetitiveSurfaceData> = {
  key: 'competitive.unlocks',
  title: 'Not on this page yet',
  question: 'What else will this page answer?',

  render(data, mode = 'app') {
    const email = mode === 'email'
    return (
      <BlockFrame title={competitiveUnlocks.title} question={competitiveUnlocks.question} mode={mode}>
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
          {data.unlocks.rows.map((row) =>
            email ? (
              <div key={row.section} style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: EMAIL.ink }}>{row.title}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 2 }}>{row.line}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>— {row.state} · {row.owner}</div>
              </div>
            ) : (
              <div key={row.section} className="flex min-w-0 flex-col gap-0.5 border-t border-border/70 pt-2">
                <p className="m-0 text-[12.5px] font-medium">{row.title}</p>
                <p className="m-0 text-[12px] text-secondary-foreground">{row.line}</p>
                <p className="m-0 text-[11.5px] text-muted-foreground">— {row.state} · {row.owner}</p>
              </div>
            ),
          )}
        </div>
      </BlockFrame>
    )
  },

  figures(): FigureTable {
    return {}
  },

  emptyState() {
    return null
  },
}
