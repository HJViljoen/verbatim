import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { MARKET_BRANDS_TITLE, MarketBrandsBody, brandAxis } from '@/components/pages/overview/rivals'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { BRANDS_HEAD_ALL, BRANDS_HEAD_ORGANIC, nameLineParts, organicBase, topicNote } from '@/lib/pages/overview-market'
import type { MonthlyBrands } from '@/lib/reports/monthly-slots'
import type { FigureTable } from '@/lib/reading/verdicts'
import { Inner, Num } from './email'
import { T, presentation } from './email-table'
import { slotSection } from './slot'

/**
 * 8 · Brands in your market (market-first WP2.1; the front page's block 9 in
 * its D3 form, WP2.6's slot). Absent until the slot is filled: the front
 * page's deploy 2 line ("arrive with the 4 Oct update") is a promise about
 * the page, not something to send a client.
 *
 * THE PAGE'S BODY, THE PAGE'S WORDS (WP2.6). In the app and on paper the
 * section draws the front page's body (`MarketBrandsBody`): the name line
 * first, then each brand counted in every video it comes up in, without any
 * video our rival searches found (one base for every brand) and in all, a
 * brand not counted saying so ("none found" where production's list held no
 * match of it, "not counted yet", or "mostly the German word for Friday · not
 * counted"). In an inbox it
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

/** The two counts as one bar, table-safe: the headline count in orange, the
 *  rest of the count in all in its paler step, set
 *  on the row's middle as the artboard draws it. */
function EmailBar({ organic, all, axis }: { organic: number; all: number; axis: number }) {
  const px = (k: number) => Math.round((Math.max(0, k) / axis) * BAR_WIDTH)
  const a = px(organic)
  const b = Math.max(0, px(all) - a)
  const seg = (w: number, bg: string) => (w > 0 ? <td style={{ width: w, height: 8, background: bg, fontSize: 0, lineHeight: 0 }}>&nbsp;</td> : null)
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} aria-hidden style={{ borderCollapse: 'collapse', marginTop: 7 }}>
      <tbody><tr>{seg(a, ORGANIC_HEX)}{seg(b, ALL_HEX)}</tr></tbody>
    </table>
  )
}

const cellBase = { fontFamily: FONT.sans, verticalAlign: 'top' as const }
const headCell = (align: 'left' | 'right', width?: number) => ({
  ...cellBase, padding: '0 0 8px 8px', borderBottom: `1px solid ${EMAIL.border}`, fontSize: 12, lineHeight: '16px',
  color: EMAIL.muted, textAlign: align, verticalAlign: 'bottom' as const, ...(width ? { width } : {}),
})
const rowCell = (last: boolean, align: 'left' | 'right' = 'left', width?: number) => ({
  ...cellBase, padding: '11px 0 11px 8px', borderBottom: last ? 0 : `1px solid ${EMAIL.hairline}`, fontSize: 15, lineHeight: '22px',
  color: EMAIL.ink, textAlign: align, ...(width ? { width } : {}),
})

/**
 * The artboard's table, drawn by hand rather than with the section `Table`,
 * because a brand not counted says so ACROSS the bar and the two figures in
 * one line ("Freitag · mostly the German word for Friday · not counted"), and
 * that cell must survive a phone, where the bar column leaves (`vb-m-bar`).
 */
function EmailTable({ b }: { b: MonthlyBrands }) {
  const n = b.topics[0]?.n ?? null
  const nOrganic = organicBase(b)
  const axis = brandAxis(b)
  const counted = b.topics.some((t) => topicNote(t) == null)
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop: 24 }}>
      <thead>
        <tr>
          <th style={{ ...headCell('left'), paddingLeft: 0 }}>Brand</th>
          {/* The figure columns' widths only where a brand prints figures:
              with every brand "not counted yet" the heads are empty, and
              fixed widths squeezed the names beside an empty area (the
              deploy-3 design review). */}
          <th className="vb-m-bar" style={headCell('left', counted ? BAR_WIDTH : undefined)}>{''}</th>
          <th style={headCell('right', counted ? 144 : undefined)}>{counted ? (nOrganic == null
            ? <>{swatch(ORGANIC_HEX)}{BRANDS_HEAD_ORGANIC}</>
            : <span data-copy="level">{swatch(ORGANIC_HEX)}{BRANDS_HEAD_ORGANIC}<br />of {fmtInt(nOrganic)}</span>) : null}</th>
          <th style={headCell('right', counted ? 64 : undefined)}>{counted ? <span data-copy="level">{swatch(ALL_HEX)}{BRANDS_HEAD_ALL}<br />of {n == null ? '·' : fmtInt(n)}</span> : null}</th>
        </tr>
      </thead>
      <tbody>
        {b.topics.map((t, i) => {
          const last = i === b.topics.length - 1
          const note = topicNote(t)
          return (
            <tr key={t.brandKey}>
              <td style={{ ...rowCell(last), paddingLeft: 0 }}>{t.label}</td>
              {note ? (
                <td colSpan={3} style={{ ...rowCell(last), fontSize: 13, color: EMAIL.muted }}>{note}</td>
              ) : (
                <>
                  <td className="vb-m-bar" style={rowCell(last, 'left', BAR_WIDTH)}><EmailBar organic={t.kOrganic ?? 0} all={t.kAny ?? 0} axis={axis} /></td>
                  <td style={rowCell(last, 'right', 144)}><Num>{fmtInt(t.kOrganic ?? 0)}</Num></td>
                  <td style={rowCell(last, 'right', 64)}><Num prev>{fmtInt(t.kAny ?? 0)}</Num></td>
                </>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const swatch = (hex: string) => <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: hex, marginRight: 6 }} />

function emailBody(b: MonthlyBrands): ReactNode {
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
      {b.topics.length > 0 ? <EmailTable b={b} /> : null}
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
  const nOrganic = organicBase(b)
  if (nOrganic != null && b.topics.some((t) => !topicNote(t))) {
    out.brands_organic_n = { value: nOrganic, unit: 'videos', label: `videos in your market in ${month}, without any video our rival searches found` }
  }
  for (const t of b.topics) {
    // A brand not counted has no figure: never a 0.
    if (topicNote(t) || t.kOrganic == null || t.kAny == null) continue
    const id = t.brandKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
    out[`brand_${id}_organic`] = { value: t.kOrganic, unit: 'videos', label: `videos naming ${t.label} in ${month}, without any video our rival searches found` }
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
