import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'

// The two sections of Market that are not built (MK3, MK6), each naming what it
// waits for and who owns it.
//
// A SECTION THAT DOES NOT EXIST IS STILL PART OF THE ARGUMENT. The design's own
// rule for the whole of Competitive — "a section whose inputs are not
// configured renders its state with the name of the person who fixes it" (ST1)
// — is the right rule here too: a reader who has been told the surface has
// seven sections and can see four needs to be told where the other three went,
// by the product, on the page.
//
// AND NEITHER NAMES A DATE. Nothing in this product knows when Market's bottom
// section ships, and a delivery date computed from the calendar is wrong the
// first time it is read — the defect OV5's unlock carried into production
// ("arrives in Oct 2026", recomputed monthly, for ever).
//
// AND THE TAIL IS `closes`, NOT AN OWNER (the vocabulary ruling; see
// `CLOSED_BY_US` in lib/readiness/types.ts, and Competitive's own unlocks
// block, which prints the identical tail). MK3 ended "— not built yet ·
// Verbatim engineering": an internal team name in front of the paying reader,
// with no link and nothing they could do with it. A row that is ours carries
// `closes: null` and ends at its state, with its LINE ending in the sentence
// that says what closes it — the shape every brief has printed since WP19. MK6
// keeps its tail, because "You, on Ask" is the reader and a page of theirs.

export const marketUnlocks: Block<MarketSurfaceData> = {
  key: 'market.unlocks',
  title: 'Not on this page yet',
  question: 'What else will this page answer?',

  render(data, mode = 'app') {
    const email = mode === 'email'
    return (
      <BlockFrame title={marketUnlocks.title} question={marketUnlocks.question} mode={mode}>
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
          {data.unlocks.rows.map((row) =>
            email ? (
              <div key={row.section} style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: EMAIL.ink }}>{row.title}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 2 }}>{row.line}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>— not built yet{row.closes ? ` · ${row.closes}` : ''}</div>
              </div>
            ) : (
              <div key={row.section} className="flex min-w-0 flex-col gap-0.5 border-t border-border/70 pt-2">
                <p className="m-0 text-[12.5px] font-medium">{row.title}</p>
                <p className="m-0 text-[12px] text-secondary-foreground">{row.line}</p>
                <p className="m-0 text-[11.5px] text-muted-foreground">— not built yet{row.closes ? ` · ${row.closes}` : ''}</p>
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
