import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { MARKET_BRANDS_TITLE, MarketBrandsBody, brandAxis } from '@/components/pages/overview/rivals'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { nameLineParts, topicNote } from '@/lib/pages/overview-market'
import type { MonthlyBrands } from '@/lib/reports/monthly-slots'
import type { FigureTable } from '@/lib/reading/verdicts'
import { Inner, Num, RowLabel, Table } from './email'
import { slotSection } from './slot'

/**
 * 8 · Brands in your market (market-first WP2.1; the front page's block 9 in
 * its D3 form, WP2.6's slot). Absent until the slot is filled: the front
 * page's deploy 2 line ("arrive with the 11 Oct update") is a promise about
 * the page, not something to send a client.
 *
 * THE PAGE'S BODY, THE PAGE'S WORDS (WP2.6). In the app and on paper the
 * section draws the front page's body (`MarketBrandsBody`): the name line
 * first, then each brand counted in every video it comes up in, without our
 * rival searches and in all, a brand not counted saying so ("not counted
 * yet", or "mostly the German word for Friday · not counted"). In an inbox it
 * draws the email artboard's table from the same words (`nameLineParts`,
 * `topicNote`), so the two print one sentence each.
 */

/** The artboard's inks, as hex: the rivals' orange and its 48% step. */
const ORGANIC_HEX = EMAIL.comp
const ALL_HEX = '#F8BC99'
const BAR_WIDTH = 160

function nameWords(b: MonthlyBrands): ReactNode {
  return nameLineParts(b).map((p, i) => (p.t === 'text' ? <span key={i}>{p.s}</span> : <Num key={i} size={15}>{fmtInt(p.value)}</Num>))
}

/** The two counts as one bar, table-safe: the count without our rival
 *  searches in orange, the rest of the count in all in its paler step. */
function EmailBar({ organic, all, axis }: { organic: number; all: number; axis: number }) {
  const px = (k: number) => Math.round((Math.max(0, k) / axis) * BAR_WIDTH)
  const a = px(organic)
  const b = Math.max(0, px(all) - a)
  const seg = (w: number, bg: string) => (w > 0 ? <td style={{ width: w, height: 8, background: bg, fontSize: 0, lineHeight: 0 }}>&nbsp;</td> : null)
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} aria-hidden style={{ borderCollapse: 'collapse' }}>
      <tbody><tr>{seg(a, ORGANIC_HEX)}{seg(b, ALL_HEX)}</tr></tbody>
    </table>
  )
}

const swatch = (hex: string) => <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: hex, marginRight: 6 }} />

function emailBody(b: MonthlyBrands): ReactNode {
  const n = b.topics[0]?.n ?? null
  const axis = brandAxis(b)
  return (
    <>
      <Inner marginTop={0}>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ width: 20, verticalAlign: 'top', paddingTop: 8 }}><div aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: EMAIL.green, fontSize: 0, lineHeight: 0 }}>&nbsp;</div></td>
              <td style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2 }}>{nameWords(b)}</td>
            </tr>
          </tbody>
        </table>
      </Inner>
      {b.topics.length > 0 ? (
        <Table
          marginTop={24}
          columns={[
            { head: 'Brand' },
            { head: '', width: BAR_WIDTH, className: 'vb-m-bar' },
            { head: <>{swatch(ORGANIC_HEX)}Without our<br />rival searches</>, align: 'right', width: 112 },
            { head: <span data-copy="level">{swatch(ALL_HEX)}In all<br />of {n == null ? '·' : fmtInt(n)}</span>, align: 'right', width: 64 },
          ]}
          rows={b.topics.map((t) => {
            const note = topicNote(t)
            if (note) return [<RowLabel key="l" tag={note}>{t.label}</RowLabel>, null, null, null]
            return [
              <RowLabel key="l">{t.label}</RowLabel>,
              <EmailBar key="b" organic={t.kOrganic ?? 0} all={t.kAny ?? 0} axis={axis} />,
              <Num key="o">{fmtInt(t.kOrganic ?? 0)}</Num>,
              <Num key="a" prev>{fmtInt(t.kAny ?? 0)}</Num>,
            ]
          })}
        />
      ) : null}
    </>
  )
}

function body(b: MonthlyBrands, mode: RenderMode): ReactNode {
  return mode === 'email' ? emailBody(b) : <MarketBrandsBody b={b} mode={mode} />
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
    // A brand not counted has no figure: never a 0.
    if (topicNote(t) || t.kOrganic == null || t.kAny == null) continue
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
