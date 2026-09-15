import { fmtInt, fmtPct, round1 } from '../format'
import type { FigureTable as ReadingFigures } from '../reading/verdicts'
import type { Figure, FigureTable } from '../reports/types'

// The one crossing between the reading layer's figures and the prose layer's.
//
// WHY THERE ARE TWO SHAPES. `lib/reading/verdicts.ts` holds a figure as it is
// MEASURED — `{ value: 3.4, unit: 'pct', label: 'share of the category' }` —
// because a reading is a number with a unit, and everything downstream of it
// (a band, a comparison, a chart axis) needs the number. `lib/reports/types.ts`
// holds a figure as it is PRINTED — `{ label, value: '3.4%', kind: 'pct' }` —
// because a cover, a document and an interpretation substitute a rendered
// string into prose at render and must not each decide how a percentage reads.
// Both are right for their side, and neither is right for the other.
//
// WHY THIS FILE. Without it, `verdictBlock` took a union of the two and cast
// its way out (`as Record<string, { label: string }>`), and WP8, WP18 and WP20
// — every one of which gets its figures from the reading layer and its prose
// from this one — would each have written the same conversion, differently.
// Three hand-rolled conversions of one unit vocabulary is how "3.4%" and "3%"
// and "3.4 pct" end up in three places in one product.
//
// The formatting rules are the product's own (lib/format.ts): counts carry
// their thousands separators, percentages one decimal with a bare `.0`
// dropped, and a points figure carries its sign, because a change of −4.1
// points that prints as "4.1 pts" is a different claim.

/** How each measured unit prints, and what kind of placeholder it becomes. */
function render(f: ReadingFigures[string]): Figure {
  switch (f.unit) {
    case 'pct':
      return { label: f.label, value: fmtPct(f.value), kind: 'pct' }
    case 'pts': {
      const v = round1(f.value)
      const sign = v > 0 ? '+' : ''
      return { label: f.label, value: `${sign}${v} ${Math.abs(v) === 1 ? 'pt' : 'pts'}`, kind: 'count' }
    }
    case 'videos':
    case 'comments':
    default:
      return { label: f.label, value: fmtInt(f.value), kind: 'count' }
  }
}

/**
 * A reading's figures, as the prose layer takes them.
 *
 * The model still never sees a value — `verdictBlock` hands it the key and the
 * label only. The rendered string exists for the surface that substitutes the
 * `[[key]]` back in, and for the digit rule, which needs a table to check a
 * cited key against.
 */
export function proseFigures(reading: ReadingFigures): FigureTable {
  const out: FigureTable = {}
  for (const [key, figure] of Object.entries(reading)) out[key] = render(figure)
  return out
}
