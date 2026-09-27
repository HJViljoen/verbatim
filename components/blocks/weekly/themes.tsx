import type { ReactNode } from 'react'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { overviewThemes } from '@/components/pages/overview/themes'
import { shortMonthName } from '@/components/pages/overview/market'
import { HeardTable } from '@/components/pages/week/heard'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { carriesShare } from '@/lib/reading/level'
import { groupFigures, makerCell, MAKERS_NOT_MEASURED, makerWords, prevReadK, themeFigures, type MarketTheme, type ThemeBoard } from '@/lib/pages/overview-market'
import type { WeeklyData } from '@/lib/pages/weekly'
import { WEEKLY_THEMES } from '@/lib/reports/weekly'
import type { FigureTable } from '@/lib/reading/verdicts'
import { ChipLine, Inner, Num, RowLabel, SubHead, Table } from './email'
import { redress, weeklyFooter, type WeeklyBlock } from './section'

// WR3 · What your market talked about (market-first WP3.7, plan §2.9 "the top
// five themes by size with their trail, plus new this update with
// provenance"; the approved preview's WeeklyReport): the front page's board on
// the reading month, its first five rows (themes not led by makers, the month
// before beside as a level, maker shares as row tags), the makers line and
// the pair's one chip; then "New with this update": the themes This week
// heard for the first time at the floor, each with how many of its videos came
// from searches added in the month (This week's `week.heard`, the same rows).
// Footer: "All 21 themes at 10+ on Conversation".

export const WEEKLY_THEMES_TITLE = overviewThemes.title

/** The board's first five rows (the weekly's top five). */
function topFive(board: ThemeBoard): ThemeBoard {
  return { ...board, rows: board.rows.slice(0, WEEKLY_THEMES) }
}

/** A level cell: the share at 100 videos or more, the count under, and "·"
 *  where the month did not read the theme. */
function levelCell(k: number | null, n: number | null): string {
  if (k == null || n == null || n <= 0) return '·'
  return carriesShare(n) ? `${Math.round((k / n) * 100)}%` : fmtInt(k)
}

function makerTag(t: MarketTheme, measured: boolean): string | null {
  if (!measured) return null
  const w = makerCell(t.makerShare)
  return w === MAKERS_NOT_MEASURED ? null : w
}

function boardEmail(board: ThemeBoard): ReactNode {
  const b = topFive(board)
  const prev = b.prev && b.prev.n != null ? b.prev : null
  const measured = b.segments === 'measured'
  const lead = b.makers?.lead ?? []
  return (
    <>
      <Table
        columns={[
          { head: 'Theme' },
          { head: 'Videos', align: 'right', width: 52 },
          { head: <span data-copy="level">{shortMonthName(b.month)}<br />of {fmtInt(b.n)}</span>, align: 'right', width: 56 },
          ...(prev ? [{ head: <span data-copy="level">{shortMonthName(prev.month)}<br />of {fmtInt(prev.n as number)}</span>, align: 'right' as const, width: 56 }] : []),
        ]}
        rows={b.rows.map((t) => [
          <RowLabel key="l" tag={makerTag(t, measured)}><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></RowLabel>,
          <Num key="k">{fmtInt(t.k)}</Num>,
          <Num key="s" weight={400}>{levelCell(t.k, t.n)}</Num>,
          ...(prev ? [<Num key="p" prev>{levelCell(prevReadK(t), prev.n)}</Num>] : []),
        ])}
      />
      {b.makers && b.makers.count > 0 ? (
        <Inner marginTop={20}>
          <div style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.ink2 }}>
            <span style={{ fontWeight: 600, color: EMAIL.ink }}>Makers and DIY, grouped:</span>{' '}
            <Num>{fmtInt(b.makers.count)}</Num> {b.makers.count === 1 ? 'theme' : 'themes'} at 10+
            {lead.length > 0 ? ', led by ' : ''}
            {lead.map((t, i) => (
              <span key={t.registryId}>{i > 0 ? ' and ' : ''}<span data-copy="subject" data-slot="pass_b_theme">{t.label}</span> <Num>{fmtInt(t.k)}</Num></span>
            ))}
          </div>
        </Inner>
      ) : null}
      <ChipLine words={b.chip ?? null} />
    </>
  )
}

/** "New with this update": This week's first-heard themes, in an inbox. */
function heardEmail(data: WeeklyData): ReactNode {
  const h = data.heard
  if (!h || h.regrouped || h.rows.length === 0) return null
  const month = shortMonthName(h.month)
  const measured = h.segments === 'measured'
  return (
    <>
      <SubHead marginTop={28}>New with this update</SubHead>
      <div style={{ height: 12, fontSize: 0, lineHeight: 0 }}>&nbsp;</div>
      <Table
        columns={[
          { head: 'Theme' },
          { head: 'Videos', align: 'right', width: 52 },
          { head: <>From searches<br />added in {month}</>, align: 'right', width: 96 },
        ]}
        rows={h.rows.map((t) => [
          <RowLabel key="l" tag={measured ? makerWords(t.makerShare) : null}><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></RowLabel>,
          <Num key="k">{fmtInt(t.k)}</Num>,
          <Num key="p" prev>{t.provenance ? fmtInt(t.provenance.fromNewSearches) : '·'}</Num>,
        ])}
      />
    </>
  )
}

/** The same, on the share page and on paper, under the page's board. */
function heardApp(data: WeeklyData, mode: RenderMode): ReactNode {
  const h = data.heard
  if (!h || h.regrouped || h.rows.length === 0) return null
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="m-0 text-[15px] font-semibold text-foreground">New with this update</h3>
      <HeardTable h={h} mode={mode} />
    </div>
  )
}

export const weeklyThemes: WeeklyBlock = {
  key: 'weekly.themes',
  title: WEEKLY_THEMES_TITLE,

  render(data, mode = 'app', ctx) {
    const board = data.overview.themes ?? null
    const voice = surface('voice')
    const atTen = board?.atTen ?? 0
    const footer = weeklyFooter(mode, ctx, { href: voice.href, label: atTen > 0 ? `All ${fmtInt(atTen)} themes at 10+ on ${voice.label} →` : `Open ${voice.label} →` })
    const empty = weeklyThemes.emptyState(data)
    if (mode === 'email') {
      return (
        <BlockFrame title={WEEKLY_THEMES_TITLE} mode={mode} card footer={footer}>
          {empty || !board ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : boardEmail(board)}
          {heardEmail(data)}
        </BlockFrame>
      )
    }
    const view = board ? { ...data.overview, themes: topFive(board) } : data.overview
    return redress(overviewThemes.render(view, mode, ctx), { title: WEEKLY_THEMES_TITLE, mode, footer, extra: heardApp(data, mode) })
  },

  figures(data): FigureTable {
    const board = data.overview.themes
    const out: FigureTable = board ? { ...themeFigures(board, board.rows.slice(0, WEEKLY_THEMES)), ...groupFigures(board) } : {}
    for (const t of data.heard?.rows ?? []) {
      const id = t.registryId.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      out[`heard_t_${id}_videos`] = { value: t.k, unit: 'videos', label: `${t.label}: videos in the month it was first heard` }
      if (t.provenance) out[`heard_t_${id}_new_searches`] = { value: t.provenance.fromNewSearches, unit: 'videos', label: `${t.label}: videos from searches added in the month` }
    }
    return out
  },

  emptyState(data) {
    return overviewThemes.emptyState(data.overview)
  },
}
