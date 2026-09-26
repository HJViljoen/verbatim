import type { ReactNode } from 'react'
import { overviewThemes } from '@/components/pages/overview/themes'
import { barAxis, shortMonthName } from '@/components/pages/overview/market'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { MAKERS_NOT_MEASURED, THEME_N, THEME_PREV_N, figureText, makerCell, themeFigures, themeToken, type MarketTheme } from '@/lib/pages/overview-market'
import type { MonthlyData } from '@/lib/pages/monthly'
import { fromFrontPage } from './adapt'
import { Bar, ChipLine, Inner, Num, RowLabel, Table } from './email'

/**
 * 2 · What your market talked about (market-first WP2.1; the front page's
 * block 2): the ten biggest themes not led by makers, the month before beside
 * each as a level, each row's maker share at a fifth or more, the makers and
 * set-aside lines, and the one chip. The page's block in the app and on
 * paper; the artboard's table in an inbox.
 *
 * THE FOOTER NAMES THE PAGE BY ITS CURRENT LABEL (§4.0): "Open Voice →" until
 * WP2.4 renames it Conversation and ships "All N on Conversation →".
 */

function GroupLine({ words, group }: { words: string; group: { count: number; lead: MarketTheme[] } }) {
  if (group.count === 0) return null
  return (
    <Inner marginTop={16}>
      <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2 }}>
        <span style={{ fontWeight: 600, color: EMAIL.ink }}>{words}:</span>{' '}
        <Num size={15}>{fmtInt(group.count)}</Num> {group.count === 1 ? 'theme' : 'themes'} at 10+
        {group.lead.length > 0 ? ', led by ' : ''}
        {group.lead.map((t, i) => (
          <span key={t.registryId}>
            {i > 0 ? ' and ' : ''}
            <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span> (<Num size={15}>{fmtInt(t.k)}</Num>)
          </span>
        ))}
        .
      </div>
    </Inner>
  )
}

function themesEmail(data: MonthlyData): ReactNode {
  const board = data.overview.themes
  if (!board) return null
  const figures = themeFigures(board)
  const prev = board.prev && board.prev.n != null ? board.prev : null
  const measured = board.segments === 'measured'
  const axis = barAxis(board.rows.map((t) => t.k / t.n))
  // The board's own cells: a share at 100 videos or more, the count under
  // (`themeFigures`' tokens, the page's `levelCell`).
  const text = (key: string, fallback: string, isPrev = false) => <Num prev={isPrev} weight={400}>{figureText(figures[key]) || fallback}</Num>
  const tag = (t: MarketTheme): ReactNode => {
    if (!measured) return null
    const words = makerCell(t.makerShare)
    if (!words) return null
    return words === MAKERS_NOT_MEASURED ? `makers ${words}` : words
  }
  return (
    <>
      <Table
        columns={[
          { head: 'Theme' },
          { head: '', width: 88, className: 'vb-m-bar' },
          { head: 'Videos', align: 'right', width: 56 },
          { head: <span data-copy="level">{shortMonthName(board.month)}<br />of {figureText(figures[THEME_N])}</span>, align: 'right', width: 56 },
          ...(prev ? [{ head: <span data-copy="level">{shortMonthName(prev.month)}<br />of {figureText(figures[THEME_PREV_N])}</span>, align: 'right' as const, width: 56 }] : []),
        ]}
        rows={board.rows.map((t) => [
          <RowLabel key="l" tag={tag(t)}><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></RowLabel>,
          <div key="b" style={{ paddingTop: 8 }}><Bar share={t.k / t.n} axis={axis} /></div>,
          <Num key="k">{fmtInt(t.k)}</Num>,
          text(themeToken(t.registryId, 'share'), fmtInt(t.k)),
          ...(prev ? [text(themeToken(t.registryId, 'prev'), '·', true)] : []),
        ])}
      />
      {board.makers ? <GroupLine words="Makers and DIY, grouped" group={board.makers} /> : null}
      {board.setAside ? <GroupLine words="Set aside as off-topic" group={board.setAside} /> : null}
      {board.segments === 'unknown' ? (
        <Inner marginTop={16}><div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2 }}>Makers’ videos are not marked yet; this list groups them once they are.</div></Inner>
      ) : null}
      <ChipLine words={board.chip ?? null} />
    </>
  )
}

export const monthlyThemes = fromFrontPage({
  key: 'monthly.themes',
  title: overviewThemes.title,
  block: overviewThemes,
  link: () => {
    const page = surface('voice')
    return { href: page.href, label: `Open ${page.label} →` }
  },
  email: themesEmail,
})

