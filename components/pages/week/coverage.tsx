import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'

// WK · The coverage line (the mock's footer; the weekly report's WR6).
//
// ONE SENTENCE AT THE FOOT OF THE PAGE, composed in the loader so the report's
// own coverage line is this line and not a second one: who the reading is for,
// which update it is, which one came before it, the days it covered, the
// platforms it read and how much it read. Then the privacy sentence, which is
// a standing promise and not a measurement.
//
// AND THE TWO SECTIONS THAT ARE NOT HERE. The mock draws nine and Phase 1
// builds seven: comments worth a reply and the claims flagged for awareness are
// the Content page's reply inbox, and the design is explicit that the inbox
// moves in Phase 2 in the same phase Content is switched off — "never a phase
// later, because it is the content person's only work queue". Naming them here
// is the difference between a page that is incomplete and a page that is
// silently missing two of its answers.
//
// IT DECLARES NO FIGURES. Every number in the line is a number a block above
// has already declared; counting them again would spend a page's budget twice
// on one reading.

export const weekCoverage: Block<WeekData> = {
  key: 'week.coverage',
  title: 'What this reading rests on',
  question: undefined,

  render(data, mode = 'app') {
    return (
      <BlockFrame title={weekCoverage.title} mode={mode}>
        {/* THE ARTBOARD'S FOOTNOTE FACE. Its method note is 9.5px mono in two
            lines with the "Prepared by" half in darker ink; these are the same
            two lines and they take the same face, a little larger because they
            sit inside a tile rather than under the page. */}
        <Line mode={mode} strong mono>{data.coverage.line}</Line>
        <Line mode={mode} mono>{data.coverage.privacy}</Line>
        <Line mode={mode}>{data.laterLine}</Line>
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

function Line({ mode, strong, mono, children }: { mode: 'app' | 'print' | 'email'; strong?: boolean; mono?: boolean; children: React.ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: mono ? FONT.mono : FONT.sans, fontSize: 11, color: strong ? EMAIL.ink2 : EMAIL.muted, marginTop: 4 }}>
        {children}
      </div>
    )
  }
  const face = mono ? 'font-mono text-[10.5px] leading-[1.45]' : 'text-[11.5px]'
  return <p className={`m-0 ${face} ${strong ? 'text-secondary-foreground' : 'text-muted-foreground'}`}>{children}</p>
}
