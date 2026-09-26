import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { surface } from '@/lib/nav'
import type { MonthlyArrivals } from '@/lib/reports/monthly-slots'
import type { FigureTable } from '@/lib/reading/verdicts'
import { slotSection } from './slot'
import { ArrivalsColumns, arrivalsFigures } from '@/components/pages/overview/arrivals'

/**
 * 3 · With this update (market-first WP2.1; the front page's block 3, WP2.7's
 * slot). The came-in lines only: the monthly carries no weekly volume bars
 * (plan §2.9). Absent until WP2.7 fills the slot.
 *
 * THE FRONT PAGE'S WORDS (WP2.7): `ArrivalsColumns` (components/pages/
 * overview/arrivals.tsx) is the one wording of "Came in" and "Heard for the
 * first time", on the page and here, so the artefact cannot say a different
 * thing from the block it reprints. Counts that add to months, never a
 * verdict over a week (§9.1 #5).
 */

function body(a: MonthlyArrivals, month: string, mode: RenderMode): ReactNode {
  return <ArrivalsColumns a={a} month={month} mode={mode} />
}

function figures(a: MonthlyArrivals, month: string): FigureTable {
  return arrivalsFigures(a, month)
}

export const monthlyArrivals = slotSection({
  key: 'monthly.arrivals',
  title: 'With this update',
  slot: 'arrivals',
  link: () => {
    const page = surface('week')
    return { href: page.href, label: `Open ${page.label} →` }
  },
  stub: 'What came in with the latest update is read here once it is counted.',
  body: (value, data, mode) => body(value, data.month, mode),
  figures: (value, data) => figures(value, data.month),
})
