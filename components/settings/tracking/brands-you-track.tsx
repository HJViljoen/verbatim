import type { ReactNode } from 'react'

import { fmtInt, longMonth, monthName } from '@/lib/format'
import { countWord } from '@/lib/settings/search-set'
import { cn } from '@/lib/utils'

import { Card, CardLink, Fig, HeadCell, Swatch } from './card'

// Settings › What we read, "Brands you track" (market-first WP3.10; the
// approved Settings artboard): each brand with what it is searched as, the
// day we started tracking it, the market's videos filed under it in the
// reading month, the videos it came up in (leaving out every video our rival
// searches found, and in all: the Brands page's two counts, lib/pages/
// overview-brands.ts, so the two pages print one figure) and its own posts.
// A brand production has not hand-checked prints the Brands page's words
// ("not counted yet", or "mostly … · not counted"), never a 0.

export interface BrandRow {
  name: string
  /** The "Brands you track" searches that look for it; none: "no search term". */
  searchedAs: readonly string[]
  /** "17 Sep", or "by 28 Jun" where the list names it from before the log. */
  since: string | null
  /** The month's market videos filed under it; null where the market was not
   *  read. */
  filed: number | null
  /** Came up in: both counts, or the words the Brands page prints instead;
   *  null where the brands were not read at all. */
  came: { kOrganic: number; kAny: number } | { note: string } | null
  /** Its own posts dated in the month; null where none of its accounts is read. */
  ownPosts: number | null
}

const COLS = 'minmax(140px,208px) minmax(140px,1fr) 96px 96px 160px 72px 56px 96px'

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** "Four of the seven had videos filed under them in September: 29, all part
 *  of your market." */
function lead(rows: readonly BrandRow[], month: string): ReactNode {
  const n = rows.length
  const filed = rows.filter((r) => (r.filed ?? 0) > 0)
  const total = filed.reduce((s, r) => s + (r.filed ?? 0), 0)
  const m = longMonth(month)
  if (n === 0 || rows.some((r) => r.filed == null)) return null
  if (filed.length === 0) return n === 1 ? <>The brand you track had no video filed under it in {m}.</> : <>None of the {countWord(n)} had a video filed under them in {m}.</>
  const who = n === 1 ? 'The brand you track' : filed.length === n ? `All ${countWord(n)}` : `${cap(countWord(filed.length))} of the ${countWord(n)}`
  return <>{who} had videos filed under {n === 1 ? 'it' : 'them'} in {m}: <Fig n={total} />, all part of your market.</>
}

export function BrandsYouTrackCard({ month, rows, brandsLabel, brandsHref }: {
  month: string
  rows: readonly BrandRow[]
  brandsLabel: string
  brandsHref: string
}) {
  const mon = monthName(month).split(' ')[0]
  const maxAny = rows.reduce((m, r) => (r.came && 'kAny' in r.came ? Math.max(m, r.came.kAny) : m), 0)
  const sentence = lead(rows, month)
  return (
    <Card id="brands" title="Brands you track" footer={<CardLink href={brandsHref}>Open {brandsLabel}</CardLink>}>
      {rows.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">No brand is tracked yet.</p>
      ) : (
        <>
          {sentence ? <p className="-mt-2 mb-0 max-w-[760px] text-[17px] font-medium leading-[1.5] tracking-[-0.01em] [text-wrap:pretty]">{sentence}</p> : null}
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="flex min-w-[980px] flex-col">
              <div className="grid items-end gap-x-4 border-b border-border pb-2.5" style={{ gridTemplateColumns: COLS }}>
                <HeadCell>Brand</HeadCell>
                <HeadCell>Searched as</HeadCell>
                <HeadCell>Tracked since</HeadCell>
                <HeadCell align="right" sub={mon}>Filed under it</HeadCell>
                <span className="col-span-3 flex flex-col items-end gap-0.5 whitespace-nowrap">
                  <span className="text-[13px] font-medium leading-[1.35] text-muted-foreground">Came up in, {mon}</span>
                  <span className="inline-flex items-center gap-3 font-mono text-[12px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Swatch className="bg-ink-rival" />outside our brand searches</span>
                    <span className="inline-flex items-center gap-1.5"><Swatch className="bg-ink-rival/45" />in all</span>
                  </span>
                </span>
                <HeadCell align="right" sub={mon}>Its own posts</HeadCell>
              </div>
              {rows.map((r) => (
                <div key={r.name} className="grid min-h-11 items-center gap-x-4 border-b border-border/60 last:border-b-0" style={{ gridTemplateColumns: COLS }}>
                  <span className="min-w-0 truncate text-[15px]">{r.name}</span>
                  <span className={cn('min-w-0 truncate text-[15px]', r.searchedAs.length ? 'text-secondary-foreground' : 'text-muted-foreground')}>
                    {r.searchedAs.length ? r.searchedAs.join(' · ') : 'no search term'}
                  </span>
                  <span className="font-mono text-[13px] text-secondary-foreground">{r.since ?? ''}</span>
                  <span className={cn('text-right font-mono text-[15px] tabular-nums', r.filed ? 'font-semibold' : 'text-muted-foreground')}>
                    {r.filed == null ? 'not measured' : fmtInt(r.filed)}
                  </span>
                  {r.came && 'kAny' in r.came ? (
                    <>
                      <span aria-hidden className="flex h-2 items-center pl-6">
                        <span className="relative block h-2 rounded-[2px] bg-ink-rival/45" style={{ width: `${maxAny > 0 ? (r.came.kAny / maxAny) * 100 : 0}%` }}>
                          <span className="absolute inset-y-0 left-0 rounded-[2px] bg-ink-rival" style={{ width: `${r.came.kAny > 0 ? (r.came.kOrganic / r.came.kAny) * 100 : 0}%` }} />
                        </span>
                      </span>
                      <span className="text-right font-mono text-[15px] font-semibold tabular-nums">{fmtInt(r.came.kOrganic)}</span>
                      <span className="text-right font-mono text-[15px] tabular-nums text-secondary-foreground">{fmtInt(r.came.kAny)}</span>
                    </>
                  ) : (
                    <span className="col-span-3 truncate pl-6 text-[13px] text-muted-foreground">{r.came ? r.came.note : 'not measured'}</span>
                  )}
                  <span className="text-right font-mono text-[15px] font-medium tabular-nums text-secondary-foreground">{r.ownPosts == null ? '·' : fmtInt(r.ownPosts)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
