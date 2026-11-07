import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { GoLink, PeriodSwitch, type StatItem } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { monthTerm } from '@/lib/reading/month-label'
import type { ProductsData } from '@/lib/pages/v2/products'
import { Fig } from './parts'
import { CatalogueCard, CatalogueFrame } from './shelf'
import { StandoutFrames, Standouts } from './standouts'

// YOUR PRODUCTS, drawn to the audit design's board (Products.dc.html, 7
// Nov): the title with the month switch, the figures row (the month, the
// products that came up of the catalogue, those quiet, the categories, and
// the videos about them or their categories: the screen's base said once,
// decision 2); what stands out (up to four cards, picked by code); your
// catalogue (every category a row, every product a tile shaded by its
// videos); the way to Settings.
// Every card, head and tile opens a PAGE (17 Oct, the G4 boards): a
// category's (the hub) or a product's (the evidence), ./levels.tsx. Nothing
// opens in place on this page any more.
// Before any count, the page's honest states: not switched on (the
// migration, or the tenant's switch), no catalogue (a link to Settings), not
// read for the month, or not read just now.
//
// THE BOARD'S PERIOD SWITCH, IN MONTHS: products are read per month only
// (`month_product_readings`), so "This week" and "Over time" would offer views
// with nothing behind them. The switch in the board's place offers the latest
// months read (`monthOptions`), each an address (`?month=`); the month line
// on each level page is the over-time view.
//
// EVERY STATE KEEPS THE BOARD'S FRAME (the parity pass, 13 Oct night): the
// four standout places, the catalogue section and the way on. A state that
// reads no month draws the four frames (`StandoutFrames`) and the catalogue
// with its line in the dashed box: the catalogue itself where there is one
// (every count "not read yet"), the line alone where there is none.

export { CatalogueCard, CatalogueFrame, shelfColumn } from './shelf'
export { StandoutCard, StandoutFrames, Standouts, shareWords } from './standouts'
export { ProductsCategoryPage, ProductsLevelMissing, ProductsProductPage } from './levels'
export { TagControl, TagControlView, tagSaid } from './tag-control'

/** The states that read no month: the page not switched on, its tables not
 *  there, or nothing in the catalogue. Their figures row names no month
 *  (Phase 4 fix round: "September" printed over "not switched on"). */
const READS_NO_MONTH: readonly ProductsData['state'][] = ['not_applied', 'not_on', 'no_catalogue']

const count = (n: number, one: string, many: string) => <><Fig>{fmtInt(n)}</Fig> {n === 1 ? one : many}</>

/**
 * The figures row (the board's `.strip`): the month (`monthTerm`, decision
 * 3), "10 of your 65" products that came up, those quiet in the month (a
 * product read at none, never one not read), the categories, and the videos
 * about them or their categories (small call 10: the board has four cells,
 * the fifth is real information kept). A state that reads no month names
 * none: the catalogue's size, or none added yet. Pure.
 */
export function productsStats(data: ProductsData): StatItem[] {
  const cells: StatItem[] = READS_NO_MONTH.includes(data.state) ? [] : [{ key: 'month', term: monthTerm(data.monthLabel), value: data.monthWords }]
  if (data.state === 'ready' && data.header) {
    const quiet = data.shelf.reduce((s, c) => s + c.products.filter((p) => p.videos === 0).length, 0)
    cells.push({ key: 'came-up', term: 'Your products that came up', value: <><Fig>{fmtInt(data.header.cameUp)}</Fig> of your <Fig>{fmtInt(data.header.products)}</Fig></> })
    cells.push({ key: 'quiet', term: `Quiet in ${data.monthName}`, value: count(quiet, 'product', 'products') })
    cells.push({ key: 'categories', term: 'Categories', value: <Fig>{fmtInt(data.catalogue.categories)}</Fig> })
    if (data.header.videos != null) cells.push({ key: 'videos', term: 'About them or their categories', value: count(data.header.videos, 'video', 'videos') })
  } else if (data.catalogue.products > 0) {
    cells.push({ key: 'products', term: 'Your products', value: <>{count(data.catalogue.products, 'product', 'products')} in {count(data.catalogue.categories, 'category', 'categories')}</> })
  } else if (data.state === 'no_catalogue') {
    cells.push({ key: 'products', term: 'Your products', value: 'None added yet' })
  }
  return cells
}

/** The way on from a state that prints no count. */
export function emptyLink(state: ProductsData['state']): string | null {
  return state === 'no_catalogue'
    ? 'Add your products in Settings'
    : state === 'not_on' || state === 'unread'
      ? 'Review your products in Settings'
      : null
}

/** The page a state that prints no count draws: the four frames, then the
 *  catalogue with the state's one line and its way on. */
export function ProductsEmpty({ data }: { data: ProductsData }) {
  return (
    <>
      <StandoutFrames />
      <CatalogueFrame data={data} link={emptyLink(data.state)} />
    </>
  )
}

/** The bar's month switch (the board's period switch, in months), named
 *  "Month" for a screen reader: it offers months, not periods. */
function MonthSwitch({ data }: { data: ProductsData }) {
  const current = data.months.find((m) => m.current)
  if (!current || data.months.length < 2) return null
  return (
    <PeriodSwitch
      value={current.month}
      options={data.months.map((m) => ({ value: m.month, label: m.label }))}
      hrefFor={(month) => data.months.find((m) => m.month === month)?.href ?? '#'}
      label="Month"
    />
  )
}

export function ProductsPage({ data }: { data: ProductsData }) {
  // The switch, wherever there is a month to switch to (a month not read
  // yet included: the way back to one that is), drawn once (under the title
  // on a phone).
  const showSwitch = data.months.length >= 2 && data.months.some((m) => m.current)
  return (
    <PageFrame className="text-foreground">
      <PageBar title={surface('products').label} stats={productsStats(data)} phoneControls="below">
        {showSwitch ? <MonthSwitch data={data} /> : null}
      </PageBar>
      {data.state !== 'ready' ? <ProductsEmpty data={data} /> : (
        <>
          <Standouts slots={data.slots} monthName={data.monthName} />
          <CatalogueCard data={data} />
          <nav aria-label="More about your products" className="mx-0.5">
            <GoLink href={data.settingsHref}>Edit your products in Settings</GoLink>
          </nav>
        </>
      )}
    </PageFrame>
  )
}
