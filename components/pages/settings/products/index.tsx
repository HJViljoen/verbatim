import Link from 'next/link'
import type { ReactNode } from 'react'
import { SELECTED } from '@/components/colour-roles'
import { Card } from '@/components/pages/studio/ui'
import { EMPTY, GO, TBL, TD, TH } from '@/components/v2/look'
import { StatStrip, type StatItem } from '@/components/v2/ui'
import { fmtInt } from '@/lib/format'
import { noReadingYet } from '@/lib/pages/v2/market'
import { inlineMonth } from '@/lib/reading/month-label'
import { PRODUCTS_HELD, PRODUCTS_NOT_APPLIED, PRODUCTS_PAGE_OFF, type AliasChip, type OpenCategory, type ProductLine, type ProductSettingsView } from '@/lib/settings/products'
import { cn } from '@/lib/utils'
import { ALIAS_CHIP, CHECKED_TAG } from './chip'
import { AddCategory, AddName, AddProduct, EditProduct, RemovableAlias, RenameCategory } from './controls'

// Settings › Your products (depth redesign v2, T10b), drawn to the E8 board:
// the note on where the list came from, then the categories on the left and
// the open one on the right (`?group=`): its products, the other names people
// use for each, and how many of this month's videos named it. Under it, the
// videos we could place in the category but not under one product, with the
// way to Your products, where they are tagged.
//
// PALETTE A, LOCALLY, as the board writes it and the other Settings tabs do
// (components/pages/studio/ui.tsx): ink #26292C, muted #5F656B, hair #E4E2DC,
// the row rule #ECEAE4, ground #F7F6F2. Cards on the card shadow; the open
// category lit in the pale yellow (the colour roles' selected state).
//
// EVERY COUNT IS A FIGURE NODE (the copy contract). The names are the client's
// own words and print as they were typed.
//
// Owners and admins see the controls; everyone else reads the list.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings-Products.dc.html): the note a plain
// tile with no icon; the categories at 44px rows in sans; the open category a
// 24px title over a figures row (Products, came up in the month, couldn't
// place yet) where the " · " line was; its words and range names under
// labels, every name the one `.term` look; the products a real table
// (Product, Other names people use, the month, Edit), stacked below 1024 as
// before (decision 14); a month nothing has read said once in the dashed box,
// its column gone (the lone dot was a middle dot); "Tag them in Your
// products" a link with no arrow; the empty states in the dashed box.

const MUTED = 'text-muted-foreground'

/** The board's `.term` (./chip): a name on the ground. A common word carries
 *  "checked", and the key under the table says what that means. */
function Alias({ a }: { a: AliasChip }) {
  return (
    <li data-alias={a.kind} className={ALIAS_CHIP}>
      {a.alias}
      {a.needsConfirm ? <span className={CHECKED_TAG}>checked</span> : null}
    </li>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <Card className="px-6 py-[18px] text-[15px] leading-[1.6] text-secondary-foreground max-sm:px-[18px]"><p className="m-0">{children}</p></Card>
}

/** The note over the list: where it came from, and what to add; for a
 *  locked tenant's owner or admin, the lock's line in place of what to add. */
function Seeded({ view }: { view: ProductSettingsView }) {
  const lead = view.seeded ? <b className="font-semibold text-foreground">We filled this in from {view.seeded.from} on {view.seeded.on}. </b> : null
  if (view.locked) return <Note>{lead}{PRODUCTS_HELD}</Note>
  if (!view.canEdit) return lead ? <Note>{lead}</Note> : null
  if (view.total === 0 && !lead) return null
  return (
    <Note>
      {lead}
      {lead ? 'Check the list, and add' : 'Add'} the other names people use for a product: nicknames, misspellings, short forms. The more names we know, the more comments we can place under the right product.
    </Note>
  )
}

function Categories({ view }: { view: ProductSettingsView }) {
  return (
    <Card className="px-4 py-[22px]">
      <div className="flex items-baseline justify-between gap-3 px-3.5 pb-2.5">
        <h2 className="m-0 text-[17px] font-semibold leading-[1.3]">Categories</h2>
        {view.categories.length > 0 ? (
          <span className={`text-[14px] ${MUTED}`}>
            <span data-copy="figure">{fmtInt(view.total)}</span> {view.total === 1 ? 'product' : 'products'}
          </span>
        ) : null}
      </div>
      {view.categories.length > 0 ? (
        <nav aria-label="Categories" className="flex flex-col gap-0.5">
          {view.categories.map((c) => (
            <Link
              key={c.id}
              href={c.href}
              scroll={false}
              aria-current={c.selected ? 'true' : undefined}
              className={cn(
                'flex h-11 items-center justify-between gap-2.5 rounded-[8px] px-3.5 text-[15px] text-foreground no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                c.selected ? `${SELECTED} font-semibold` : 'hover:bg-inner',
              )}
            >
              <span className="min-w-0 truncate">{c.name}</span>
              <span data-copy="figure" className="shrink-0 tabular-nums">{fmtInt(c.products)}</span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className={cn(EMPTY, 'm-0 mx-1.5')}>No categories yet.</p>
      )}
      {view.canEdit ? <AddCategory locked={view.locked} /> : null}
    </Card>
  )
}

/** The open category's own words: for the kind of product in general, and for
 *  the range as a whole. Not on the board, which draws a product's names only;
 *  drawn where there are any, or where they can be added. */
function CategoryWords({ open, canEdit, locked }: { open: OpenCategory; canEdit: boolean; locked: boolean }) {
  const rows = [
    { key: 'words', label: 'Words for the category', items: open.words, kind: 'category_word' as const, add: 'Add a word' },
    { key: 'ranges', label: 'Names for the whole range', items: open.ranges, kind: 'nickname' as const, add: 'Add a name' },
  ].filter((r) => r.items.length > 0 || canEdit)
  if (rows.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-start">
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <h3 className="m-0 text-[13px] font-semibold leading-[1.3] text-secondary-foreground sm:mt-1.5">{r.label}</h3>
          <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
            {r.items.map((a) => (canEdit ? <RemovableAlias key={a.id} alias={a} locked={locked} /> : <Alias key={a.id} a={a} />))}
            {canEdit ? <li><AddName groupId={open.id} kind={r.kind} label={r.add} owner={open.name} locked={locked} /></li> : null}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** A product's count this month: its videos, "quiet" where the month was read
 *  and none named it, and where the month holds no row for it, that it is not
 *  read yet (a month nothing has read at all is said once, over the table). */
function Month({ videos }: { videos: number | null }) {
  if (videos == null) return <span className="text-secondary-foreground">Not read yet</span>
  if (videos === 0) return <span className="text-secondary-foreground">quiet</span>
  return (
    <span className="whitespace-nowrap">
      <span data-copy="figure" className="tabular-nums">{fmtInt(videos)}</span> {videos === 1 ? 'video' : 'videos'}
    </span>
  )
}

// The table's own stacking point (lg, as the div grid before it): below it a
// row is a grid, the name and Edit on its first line, the names under them,
// the month under those with its name.
const T_ROW = 'max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-4 max-lg:gap-y-2 max-lg:border-t max-lg:border-track max-lg:py-3.5'
const T_CELL = 'max-lg:border-0 max-lg:p-0'

function ProductRow({ p, open, view, month }: { p: ProductLine; open: OpenCategory; view: ProductSettingsView; month: string | null }) {
  return (
    <tr className={T_ROW}>
      <th scope="row" className={cn(TD, T_CELL, 'text-left font-semibold lg:align-middle max-lg:col-start-1 max-lg:row-start-1 max-lg:self-center')}>{p.name}</th>
      <td className={cn(TD, T_CELL, 'max-lg:col-span-2 max-lg:row-start-2')}>
        <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
          {p.aliases.map((a) => <Alias key={a.id} a={a} />)}
          {view.canEdit ? <li><AddName productId={p.id} kind="nickname" label="Add a name" owner={p.name} locked={view.locked} /></li> : null}
        </ul>
      </td>
      {month ? (
        <td className={cn(TD, T_CELL, 'lg:align-middle max-lg:col-start-1 max-lg:row-start-3')}>
          <span className="lg:hidden">{month}: </span><Month videos={p.videos} />
        </td>
      ) : null}
      {view.canEdit ? (
        <td className={cn(TD, T_CELL, 'pr-0 text-right lg:align-middle max-lg:col-start-2 max-lg:row-start-1')}>
          <EditProduct id={p.id} name={p.name} groupId={open.id} aliases={p.aliases} choices={view.choices} locked={view.locked} />
        </td>
      ) : null}
    </tr>
  )
}

function OpenCategoryCard({ open, view }: { open: OpenCategory; view: ProductSettingsView }) {
  // The month the counts read: "October so far", or the reading month with
  // its label where it is not the current one (decision 3).
  const monthText = inlineMonth(view.monthWords, view.monthLabel)
  const stats: StatItem[] = [
    { key: 'products', term: 'Products', value: <span data-copy="figure">{fmtInt(open.products)}</span> },
  ]
  if (open.cameUp != null) stats.push({ key: 'came-up', term: `Came up in ${monthText}`, value: <span data-copy="figure">{fmtInt(open.cameUp)}</span> })
  if (open.unclear) stats.push({ key: 'unclear', term: 'Couldn\u2019t place yet', value: <><span data-copy="figure">{fmtInt(open.unclear)}</span> {open.unclear === 1 ? 'video' : 'videos'}</> })
  // The month column, named for its month in the figures row's own words
  // ("October so far", or "September" once it has ended), only where the
  // month was read: a month nothing has read is said once, in the dashed box.
  const month = view.readingsOn && open.cameUp != null ? `${view.monthWords.charAt(0).toUpperCase()}${view.monthWords.slice(1)}` : null
  return (
    <Card className="min-w-0 p-[30px] max-sm:p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="m-0 min-w-0 text-[24px] font-bold leading-[1.25]">{open.name}</h2>
        {view.canEdit ? (
          <div className="flex gap-2">
            <RenameCategory id={open.id} name={open.name} products={open.products} locked={view.locked} />
            <AddProduct groupId={open.id} groupName={open.name} locked={view.locked} />
          </div>
        ) : null}
      </div>
      <div className="mt-[18px]"><StatStrip items={stats} /></div>
      {view.readingsOn && open.cameUp == null ? <p className={cn(EMPTY, 'm-0 mt-5')}>{noReadingYet(monthText)}</p> : null}
      <div className="mt-5"><CategoryWords open={open} canEdit={view.canEdit} locked={view.locked} /></div>
      {open.rows.length > 0 ? (
        <table aria-label={`Products in ${open.name}`} className={cn(TBL, 'mt-7 max-lg:block')}>
          <thead className="max-lg:hidden">
            <tr>
              <th scope="col" className={cn(TH, 'w-[26%]')}>Product</th>
              <th scope="col" className={TH}>Other names people use</th>
              {/* The figures row's month: "October so far" while it fills, the
                  month's name once it has ended (decision 3). */}
              {month ? <th scope="col" className={cn(TH, 'w-[12%]')}>{month}</th> : null}
              {view.canEdit ? <th scope="col" className={cn(TH, 'w-[70px] pr-0')}><span className="sr-only">Edit</span></th> : null}
            </tr>
          </thead>
          <tbody className="max-lg:block">
            {open.rows.map((p) => <ProductRow key={p.id} p={p} open={open} view={view} month={month} />)}
          </tbody>
        </table>
      ) : (
        <p className={cn(EMPTY, 'm-0 mt-7')}>No products in {open.name} yet.</p>
      )}
      {view.anyConfirm ? (
        <p className="m-0 mt-4 text-[14px] leading-[1.55] text-secondary-foreground">
          <span className="font-semibold text-foreground">checked:</span> an everyday word as well, so each mention is checked before it counts.
        </p>
      ) : null}
      {open.unclear ? (
        <div className="mt-[22px] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-track pt-[18px]">
          <p className="m-0 min-w-0 text-[15px] leading-[1.5]">
            <span data-copy="figure">{fmtInt(open.unclear)}</span> {open.unclear === 1 ? 'video' : 'videos'} in {view.monthName}{' '}
            {open.unclear === 1 ? 'is' : 'are'} about one of your products in {open.name}, but we couldn’t tell which.
          </p>
          <Link href={open.tagHref} className={cn(GO, 'inline-flex min-h-11 items-center sm:min-h-0')}>Tag them in Your products</Link>
        </div>
      ) : null}
    </Card>
  )
}

/** An empty list, or one not switched on: one card, in the tab's place, its
 *  line in the dashed box. */
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="max-w-[720px] gap-3 p-[26px] max-sm:p-[18px]">
      <h2 className="m-0 text-[21px] font-semibold leading-[1.3]">{title}</h2>
      <p className={cn(EMPTY, 'm-0')}>{children}</p>
    </Card>
  )
}

/** The tab. `view` null: the products tables are not there yet. */
export function ProductsTab({ view }: { view: ProductSettingsView | null }) {
  if (!view) {
    return (
      <Empty title="Your products">
        {PRODUCTS_NOT_APPLIED} When they are, this is where you keep the list of your products and the other names people use for them.
      </Empty>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-5 text-foreground">
      {/* The page that counts these products is off: no count prints here
          either, and the tab says so. */}
      {view.readingsOn ? null : <Note>{PRODUCTS_PAGE_OFF}</Note>}
      <Seeded view={view} />
      <section aria-label="Your products" className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Categories view={view} />
        {view.open ? (
          <OpenCategoryCard open={view.open} view={view} />
        ) : (
          <Card className="min-w-0 gap-3 p-[30px] max-sm:p-[18px]">
            <h2 className="m-0 text-[21px] font-semibold leading-[1.3]">No products listed yet</h2>
            <p className={cn(EMPTY, 'm-0')}>
              {view.locked
                ? PRODUCTS_HELD
                : view.canEdit
                ? 'Add a category, then the products in it and the other names people use for them. What your market says about a product is placed under it once it is on this list.'
                : 'Nothing is listed for this workspace yet. An owner or admin can add your products here.'}
            </p>
          </Card>
        )}
      </section>
    </div>
  )
}
