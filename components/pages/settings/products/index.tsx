import Link from 'next/link'
import type { ReactNode } from 'react'
import { Info, Package } from 'lucide-react'
import { IconTile, SELECTED } from '@/components/colour-roles'
import { Card } from '@/components/pages/studio/ui'
import { fmtInt } from '@/lib/format'
import { PRODUCTS_HELD, PRODUCTS_NOT_APPLIED, type AliasChip, type OpenCategory, type ProductLine, type ProductSettingsView } from '@/lib/settings/products'
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

const MUTED = 'text-[#5F656B]'
const ROW_RULE = 'border-[#ECEAE4]'

/** The board's `.alias` (./chip): a name on the ground, in the mono. A common
 *  word carries "checked", and the key under the table says what that means. */
function Alias({ a }: { a: AliasChip }) {
  return (
    <span data-alias={a.kind} className={ALIAS_CHIP}>
      {a.alias}
      {a.needsConfirm ? <span className={CHECKED_TAG}>checked</span> : null}
    </span>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] bg-[#F7F6F2] px-4 py-3.5 text-[14px] leading-[1.5] text-[#26292C]">
      <IconTile icon={Info} className="my-0 mt-px self-start" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** The note over the list: where it came from, and what to add; for a
 *  locked tenant's owner or admin, the lock's line in place of what to add. */
function Seeded({ view }: { view: ProductSettingsView }) {
  const lead = view.seeded ? <b className="font-semibold">We filled this in from {view.seeded.from} on {view.seeded.on}. </b> : null
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
    <Card className="gap-0 px-3.5 pt-4 pb-3.5">
      <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-2">
        <h2 className="m-0 text-[15px] font-semibold leading-[1.3]">Categories</h2>
        {view.categories.length > 0 ? (
          <span className={`font-mono text-[12px] ${MUTED}`}>
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
                'flex items-center justify-between gap-2.5 rounded-[8px] px-3 py-[11px] text-[14.5px] text-[#26292C] no-underline hover:text-[#26292C]',
                c.selected ? `${SELECTED} font-semibold` : 'hover:bg-[#F7F6F2]',
              )}
            >
              <span className="min-w-0 truncate">{c.name}</span>
              <span data-copy="figure" className={`shrink-0 font-mono text-[12.5px] font-normal ${MUTED}`}>{fmtInt(c.products)}</span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className={`m-0 px-2 pb-1 text-[14px] ${MUTED}`}>No categories yet.</p>
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
    <dl className="m-0 flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-baseline">
          <dt className={`text-[11.5px] font-semibold uppercase tracking-[0.05em] ${MUTED}`}>{r.label}</dt>
          <dd className="m-0 flex flex-wrap items-center">
            {r.items.map((a) => (canEdit ? <RemovableAlias key={a.id} alias={a} locked={locked} /> : <Alias key={a.id} a={a} />))}
            {canEdit ? <AddName groupId={open.id} kind={r.kind} label={r.add} owner={open.name} locked={locked} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A product's count this month: its videos, "quiet" where the month was read
 *  and none named it, a dot where the month is not read yet. */
function Month({ videos }: { videos: number | null }) {
  if (videos == null) return <span className={`text-[12.5px] ${MUTED}`}>·</span>
  if (videos === 0) return <span className={`text-[12.5px] ${MUTED}`}>quiet</span>
  return (
    <span className="whitespace-nowrap">
      <span data-copy="figure" className="font-mono text-[14px]">{fmtInt(videos)}</span>{' '}
      <span className={`text-[12px] ${MUTED}`}>{videos === 1 ? 'video' : 'videos'}</span>
    </span>
  )
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_90px_72px]'

function ProductRow({ p, open, view }: { p: ProductLine; open: OpenCategory; view: ProductSettingsView }) {
  return (
    <div role="row" className={`${GRID} gap-y-2 border-t py-3.5 first:border-t-0 lg:items-center ${ROW_RULE}`}>
      <span role="rowheader" className="col-start-1 row-start-1 min-w-0 self-center text-[14.5px] font-semibold">{p.name}</span>
      <div role="cell" className="col-span-2 col-start-1 row-start-2 flex min-w-0 flex-wrap items-center lg:col-span-1 lg:col-start-2 lg:row-start-1 [&>*:last-child]:mb-0 lg:[&>*]:mb-1.5">
        {p.aliases.map((a) => <Alias key={a.id} a={a} />)}
        {view.canEdit ? <AddName productId={p.id} kind="nickname" label="Add a name" owner={p.name} locked={view.locked} /> : null}
      </div>
      <div role="cell" className="col-start-1 row-start-3 lg:col-start-3 lg:row-start-1"><Month videos={p.videos} /></div>
      <div role="cell" className="col-start-2 row-start-1 flex justify-end lg:col-start-4">
        {view.canEdit ? <EditProduct id={p.id} name={p.name} groupId={open.id} aliases={p.aliases} choices={view.choices} locked={view.locked} /> : null}
      </div>
    </div>
  )
}

function OpenCategoryCard({ open, view }: { open: OpenCategory; view: ProductSettingsView }) {
  const parts: ReactNode[] = [<><span data-copy="figure">{fmtInt(open.products)}</span> {open.products === 1 ? 'product' : 'products'}</>]
  if (open.cameUp != null) parts.push(<><span data-copy="figure">{fmtInt(open.cameUp)}</span> came up in {view.monthName} so far</>)
  if (open.unclear) parts.push(<><span data-copy="figure">{fmtInt(open.unclear)}</span> {open.unclear === 1 ? 'video' : 'videos'} we couldn&apos;t place yet</>)
  return (
    <Card className="min-w-0 gap-4 px-[26px] py-6 max-sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[19px] font-semibold leading-[1.3] tracking-[-0.005em]">{open.name}</h2>
          <p className={`m-0 mt-0.5 text-[13px] leading-[1.4] ${MUTED}`}>
            {parts.map((part, i) => <span key={i}>{i > 0 ? ' · ' : ''}{part}</span>)}
          </p>
        </div>
        {view.canEdit ? (
          <div className="flex gap-2">
            <RenameCategory id={open.id} name={open.name} products={open.products} locked={view.locked} />
            <AddProduct groupId={open.id} groupName={open.name} locked={view.locked} />
          </div>
        ) : null}
      </div>
      <CategoryWords open={open} canEdit={view.canEdit} locked={view.locked} />
      {open.rows.length > 0 ? (
        <div role="table" aria-label={`Products in ${open.name}`} className="flex min-w-0 flex-col">
          <div role="row" className={`${GRID} hidden border-b border-[#E4E2DC] pb-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] lg:grid ${MUTED}`}>
            <span role="columnheader">Product</span>
            <span role="columnheader">Other names people use</span>
            <span role="columnheader">This month</span>
            <span role="columnheader">{view.canEdit ? <span className="sr-only">Edit</span> : null}</span>
          </div>
          <div role="rowgroup">
            {open.rows.map((p) => <ProductRow key={p.id} p={p} open={open} view={view} />)}
          </div>
        </div>
      ) : (
        <p className={`m-0 text-[14px] ${MUTED}`}>No products in {open.name} yet.</p>
      )}
      {view.anyConfirm ? (
        <p className={`m-0 text-[12.5px] leading-[1.45] ${MUTED}`}>
          <span className="font-semibold text-[#26292C]">checked:</span> an everyday word as well, so each mention is checked before it counts.
        </p>
      ) : null}
      {open.unclear ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[#F7F6F2] px-4 py-3.5 text-[14px] leading-[1.5]">
          <span className="min-w-0">
            <b className="font-semibold"><span data-copy="figure">{fmtInt(open.unclear)}</span> {open.unclear === 1 ? 'video' : 'videos'}</b> in {view.monthName}{' '}
            {open.unclear === 1 ? 'is' : 'are'} about one of your products in {open.name}, but we couldn&apos;t tell which.
          </span>
          <Link href={open.tagHref} className="shrink-0 text-[13.5px] font-semibold text-orange-text no-underline hover:underline">
            Tag them in Your products →
          </Link>
        </div>
      ) : null}
    </Card>
  )
}

/** An empty list, or one not switched on: one card, in the tab's place. */
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="max-w-[720px] gap-2 px-[26px] py-6 max-sm:px-5">
      <div className="flex items-center gap-2.5">
        <IconTile icon={Package} />
        <h2 className="m-0 text-[17px] font-semibold leading-[1.3]">{title}</h2>
      </div>
      <p className={`m-0 text-[14px] leading-[1.5] ${MUTED}`}>{children}</p>
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
    <div className="flex min-w-0 flex-col gap-5 text-[#26292C]">
      <Seeded view={view} />
      <section aria-label="Your products" className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Categories view={view} />
        {view.open ? (
          <OpenCategoryCard open={view.open} view={view} />
        ) : (
          <Card className="min-w-0 gap-2 px-[26px] py-6 max-sm:px-5">
            <h2 className="m-0 text-[17px] font-semibold leading-[1.3]">No products listed yet</h2>
            <p className={`m-0 text-[14px] leading-[1.5] ${MUTED}`}>
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
