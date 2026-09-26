import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { MARKET_BRANDS_TITLE } from '@/components/pages/overview/rivals'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { MonthlyBrands } from '@/lib/reports/monthly-slots'
import type { FigureTable } from '@/lib/reading/verdicts'
import { Inner, Num, RowLabel, Table } from './email'
import { slotSection } from './slot'

/**
 * 8 · Brands in your market (market-first WP2.1; the front page's block 9 in
 * its D3 form, WP2.6's slot). Absent until WP2.6 fills the slot: the front
 * page's deploy 2 line ("arrive with the 11 Oct update") is a promise about
 * the page, not something to send a client.
 *
 * FIRST CUT, IN THE PLAN'S WORDS (§2.2 block 9): the name line first ("In
 * September your name came up in none of your market's 655 videos. The 8
 * videos that name you are your own posts."), then each brand counted in
 * every video it comes up in, without our own rival searches and in all, and
 * a brand whose name is mostly another word as "mostly another word · not
 * counted" (WP2.6). WP2.6 moves these words beside its front-page block, and
 * both print them from there.
 */

const fig = (n: number, mode: RenderMode): ReactNode => (
  <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono font-semibold tabular-nums text-foreground'} style={mode === 'email' ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink } : undefined}>{fmtInt(n)}</span>
)

/** The name line, or null where it was not measured. */
function nameLine(b: MonthlyBrands, mode: RenderMode): ReactNode {
  const l = b.nameLine
  if (!l) return null
  const month = longMonth(l.month)
  return (
    <>
      In {month} your name came up in {l.k === 0 ? 'none' : fig(l.k, mode)} of your market’s {fig(l.n, mode)} videos.
      {l.ownPosts > 0 ? <> The {fig(l.ownPosts, mode)} {l.ownPosts === 1 ? 'video that names you is your own post' : 'videos that name you are your own posts'}.</> : null}
    </>
  )
}

const NOISE = 'mostly another word · not counted'

function body(b: MonthlyBrands, mode: RenderMode): ReactNode {
  const n = b.topics[0]?.n ?? null
  const nOrganic = b.topics[0]?.nOrganic ?? null
  if (mode === 'email') {
    return (
      <>
        {b.nameLine ? <Inner marginTop={0}><div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2 }}>{nameLine(b, mode)}</div></Inner> : null}
        {b.topics.length > 0 ? (
          <Table
            marginTop={b.nameLine ? 24 : 0}
            columns={[
              { head: 'Brand' },
              { head: <span data-copy="level">Without our rival searches<br />of {nOrganic == null ? '·' : fmtInt(nOrganic)}</span>, align: 'right', width: 132 },
              { head: <span data-copy="level">In all<br />of {n == null ? '·' : fmtInt(n)}</span>, align: 'right', width: 64 },
            ]}
            rows={b.topics.map((t) => t.noise
              ? [<RowLabel key="l" tag={NOISE}>{t.label}</RowLabel>, null, null]
              : [<RowLabel key="l">{t.label}</RowLabel>, <Num key="o">{fmtInt(t.kOrganic)}</Num>, <Num key="a" prev>{fmtInt(t.kAny)}</Num>])}
          />
        ) : null}
      </>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      {b.nameLine ? <p className="m-0 rounded-md bg-inner px-6 py-4 text-[15px] leading-[1.55] text-secondary-foreground">{nameLine(b, mode)}</p> : null}
      {b.topics.length > 0 ? (
        <div role="table" className="flex flex-col">
          <div role="row" className="grid grid-cols-[minmax(0,1fr)_120px_72px] items-end gap-x-4 border-b border-border pb-2.5 text-[13px] font-medium text-muted-foreground">
            <span role="columnheader">Brand</span>
            <span role="columnheader" data-copy="level" className="text-right">Without our rival searches<br /><span className="font-mono text-[12px] font-normal">of {nOrganic == null ? '·' : fmtInt(nOrganic)}</span></span>
            <span role="columnheader" data-copy="level" className="text-right">In all<br /><span className="font-mono text-[12px] font-normal">of {n == null ? '·' : fmtInt(n)}</span></span>
          </div>
          {b.topics.map((t) => (
            <div key={t.brandKey} role="row" className="grid min-h-11 grid-cols-[minmax(0,1fr)_120px_72px] items-center gap-x-4 border-b border-border/60 py-1.5 text-[15px]">
              <span role="rowheader">{t.label}{t.noise ? <span className="block font-mono text-[12px] text-muted-foreground">{NOISE}</span> : null}</span>
              <span className="text-right font-mono font-semibold tabular-nums">{t.noise ? null : <span data-copy="figure">{fmtInt(t.kOrganic)}</span>}</span>
              <span className="text-right font-mono tabular-nums text-muted-foreground">{t.noise ? null : <span data-copy="figure">{fmtInt(t.kAny)}</span>}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function figures(b: MonthlyBrands): FigureTable {
  const out: FigureTable = {}
  const month = longMonth(b.window)
  if (b.nameLine) {
    out.brands_name_k = { value: b.nameLine.k, unit: 'videos', label: `videos in your market that named you in ${month}` }
    out.brands_name_n = { value: b.nameLine.n, unit: 'videos', label: `videos in your market in ${month}` }
    out.brands_own_posts = { value: b.nameLine.ownPosts, unit: 'videos', label: `your own posts that name you in ${month}` }
  }
  for (const t of b.topics) {
    if (t.noise) continue
    const id = t.brandKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
    out[`brand_${id}_organic`] = { value: t.kOrganic, unit: 'videos', label: `videos naming ${t.label} in ${month}, without our rival searches` }
    out[`brand_${id}_any`] = { value: t.kAny, unit: 'videos', label: `videos naming ${t.label} in ${month}` }
  }
  return out
}

export const monthlyBrands = slotSection({
  key: 'monthly.brands',
  title: MARKET_BRANDS_TITLE,
  slot: 'brands',
  link: () => {
    const page = surface('competitive')
    return { href: page.href, label: `Open ${page.label} →` }
  },
  stub: 'Brands counted in every video they come up in are read here once they are measured.',
  body: (value, _data, mode) => body(value, mode),
  figures: (value) => figures(value),
})
