import Link from 'next/link'
import type { ReactNode } from 'react'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { PairChip } from '@/components/blocks/pair-chip'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { carriesShare } from '@/lib/reading/level'
import type { FigureTable } from '@/lib/reading/verdicts'
import {
  FLAG_NOT_A_CHANGE,
  FLAG_WORDS,
  MAKERS_NOT_MEASURED,
  groupedMakerWords,
  makerCell,
  marketKindLabel,
  prevReadK,
  type ConversationBoard,
  type MarketTheme,
} from '@/lib/pages/overview-market'
import { voiceSurfaceHref, type VoiceSurfaceData, type VoiceSurfaceParams } from '@/lib/pages/voice-surface'
import { BarLegend, BaseHead, LevelBar, MakerMark, RULE, SCALE, barAxis, shortMonthName } from '@/components/pages/overview/market'

// C2 · Every theme at 10 videos or more (market-first WP2.4, plan §2.4 C2;
// `voice.board`, new, replacing the movers arms on this page).
//
// NOTHING SKIPPED (§5.9). Every category theme the reading month read on 10
// videos or more is a row here: the ones not led by makers first, biggest
// first, then the maker-led ones grouped in their own tinted block, then any
// set aside as off-topic (decision F). No cap: on staging's September that is
// 21 rows where the movers arms drew 7 (GR F30). The pool at 3 to 9 is counted
// in the footer's link and listed on request.
//
// EACH ROW IS LEVELS, NEVER A CHANGE. The month before rides beside the month
// as a level of its own ("Aug of 351" in the column head), the bar draws both
// on one axis with no arrow, and the flag is a level against the floor: New
// (no earlier month holds the theme) or Now 10+ (under 10 last month), with
// last month's count under it and "too few last month to call it a change" on
// the flag. Where the themes view's month pair is refused, the one chip says
// why (R3).
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings):
// the base lives in the column heads, the refusal in the chip, and nothing
// explains itself under the table.

/** The board's desktop columns, from 900px of board (a container query, as
 *  the front page's board does it: the tile's width decides, not the
 *  window's): the rank, the theme, the bar, Videos, the month, the month
 *  before, where its videos came from, and the flag. Below 900px a row is the
 *  theme and its three figures, with the rest on a line of its own. Written
 *  out in full for Tailwind's scanner. */
const COLS = 'grid grid-cols-[minmax(0,1fr)_44px_48px_48px] gap-x-3 @min-[900px]:grid-cols-[32px_minmax(200px,1fr)_minmax(96px,176px)_56px_52px_52px_104px_96px] @min-[900px]:gap-x-4'
const WIDE = '@max-[900px]:hidden'
const NARROW = '@min-[900px]:hidden'

/** A level cell: the share at 100 videos or more, the count under, and "·"
 *  where the month did not read the theme (`prevReadK`). */
function levelCell(k: number | null, n: number | null): string {
  if (k == null || n == null || n <= 0) return '·'
  return carriesShare(n) ? `${Math.round((k / n) * 100)}%` : fmtInt(k)
}

/** The bar's mark for the month before, and none where that month did not
 *  read the theme: its cell prints "·", so no tick is drawn at zero. */
function prevShareOf(t: MarketTheme, prevN: number | null): number | null {
  const k = prevReadK(t)
  return k != null && prevN ? k / prevN : null
}

/** "9 in Aug", "none in Aug": last month's count under a flag. */
function flagBase(t: MarketTheme): string | null {
  if (!t.prev) return null
  const month = shortMonthName(t.prev.month)
  return t.prev.k > 0 ? `${fmtInt(t.prev.k)} in ${month}` : `none in ${month}`
}

/** The flag cell: its word, and last month's count under it. The flag is not
 *  a verdict, and it says so to every reader: on its title for the pointer,
 *  and in words for a screen reader. */
function Flag({ t, mode }: { t: MarketTheme; mode: RenderMode }) {
  const flag = t.flags[0]
  if (!flag) return null
  const base = flagBase(t)
  if (mode === 'email') {
    return (
      <span style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.ink2 }}>
        {FLAG_WORDS[flag]}{base ? <span style={{ fontFamily: FONT.mono, fontWeight: 400, color: EMAIL.muted }}> · {base}</span> : null}
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-0.5" title={FLAG_NOT_A_CHANGE}>
      <span className="whitespace-nowrap text-[13px] font-semibold leading-[18px] text-secondary-foreground">{FLAG_WORDS[flag]}</span>
      {base ? <span data-copy="figure" className="whitespace-nowrap font-mono text-[12px] leading-4 tabular-nums text-muted-foreground">{base}</span> : null}
      <span className="sr-only">, {FLAG_NOT_A_CHANGE}</span>
    </span>
  )
}

/** "Ready to buy · about a third makers": the row's second line. */
function RowTags({ t, board }: { t: MarketTheme; board: ConversationBoard }) {
  const kind = t.kind ? marketKindLabel(t.kind) : null
  const makers = board.segments === 'measured' ? groupedMakerWords(t.makerShare) ?? makerCell(t.makerShare) : null
  if (!kind && !makers) return null
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-[13px] leading-[18px]">
      {/* EACH TAG WRAPS WHOLE, and below sm the "·" is not drawn (the deploy-3
          design review: at 390 a lone "·" wrapped onto its own line). */}
      {kind ? <span className="whitespace-nowrap text-muted-foreground">{kind}</span> : null}
      {kind && makers ? <span aria-hidden className="text-muted-foreground/70 max-sm:hidden">·</span> : null}
      {makers === MAKERS_NOT_MEASURED
        ? <span className={SCALE.tag}>makers {makers}</span>
        : makers
          ? <span className="inline-flex items-center gap-2 whitespace-nowrap text-secondary-foreground"><MakerMark />{makers}</span>
          : null}
    </span>
  )
}

function Row({ t, rank, board, params, openId, axis }: {
  t: MarketTheme; rank: number; board: ConversationBoard; params: VoiceSurfaceParams; openId: string | null; axis: number
}) {
  const prevN = board.prev?.n ?? null
  const open = t.registryId === openId
  const provenance = t.provenance ? fmtInt(t.provenance.fromNewSearches) : '·'
  const prevMonth = board.prev ? shortMonthName(board.prev.month) : null
  return (
    <div role="row" className={`${COLS} min-h-14 items-center py-2 ${RULE.row}`}>
      <span className={`${WIDE} font-mono text-[13px] tabular-nums text-muted-foreground`}>{rank}</span>
      <span role="rowheader" className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
          {open ? (
            <span className={`min-w-0 [text-wrap:pretty] ${SCALE.row} font-medium`}>
              <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
            </span>
          ) : (
            <Link href={`${voiceSurfaceHref(params, { theme: t.registryId })}#theme`} className={`min-w-0 [text-wrap:pretty] ${SCALE.row} hover:underline`}>
              <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
            </Link>
          )}
          {open ? (
            <a href="#theme" className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-secondary-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none text-muted-foreground"><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></svg>
              in full below
            </a>
          ) : null}
        </span>
        <RowTags t={t} board={board} />
        {/* THE NARROW LAYOUT'S THIRD LINE: where its videos came from and the
            flag, which have no column under 900px of board. */}
        {t.provenance || t.flags.length > 0 ? (
          <span className={`${NARROW} ${SCALE.tag} flex flex-wrap gap-x-2`}>
            {/* Two units that each wrap whole ("Now 10+" never splits), and
                the "·" between them only where they share a line (sm up). */}
            {t.provenance ? <span className="whitespace-nowrap"><span data-copy="figure">{provenance}</span> from searches added in {shortMonthName(board.month)}</span> : null}
            {t.provenance && t.flags.length > 0 ? <span aria-hidden className="max-sm:hidden">·</span> : null}
            {t.flags[0] ? <span className="whitespace-nowrap" title={FLAG_NOT_A_CHANGE}>{FLAG_WORDS[t.flags[0]]}{flagBase(t) ? <>, <span data-copy="figure">{flagBase(t)}</span></> : null}</span> : null}
          </span>
        ) : null}
      </span>
      <span className={`block ${WIDE}`}>
        <LevelBar share={t.k / t.n} prevShare={prevShareOf(t, prevN)} axis={axis} />
      </span>
      <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(t.k)}</span></span>
      <span className={SCALE.num}><span data-copy="figure">{levelCell(t.k, t.n)}</span></span>
      <span className={SCALE.prev}>{prevMonth ? <span data-copy="figure">{levelCell(prevReadK(t), prevN)}</span> : null}</span>
      <span className={`${WIDE} text-right font-mono text-[15px] tabular-nums text-foreground`}><span data-copy="figure">{provenance}</span></span>
      <span className={WIDE}><Flag t={t} mode="app" /></span>
    </div>
  )
}

/** A group's head: its name and count, and the one-line answer that says
 *  what put a theme in it. */
function GroupHead({ words, count, answer, mark }: { words: string; count: number; answer?: string; mark?: boolean }) {
  return (
    <div className={`flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2 ${RULE.row}`}>
      {mark ? <MakerMark /> : null}
      <h3 className="m-0 text-[15px] font-semibold text-foreground">
        {words} <span data-copy="figure" className="font-mono font-medium text-muted-foreground">{fmtInt(count)}</span>
      </h3>
      {answer ? <span className="text-[15px] text-secondary-foreground">{answer}</span> : null}
    </div>
  )
}

/** The board's groups, in the order a reader meets them. */
function groups(board: ConversationBoard): { key: string; words: string | null; answer?: string; rows: MarketTheme[]; tinted: boolean; mark?: boolean }[] {
  const out: ReturnType<typeof groups> = []
  const measured = board.segments === 'measured'
  out.push({ key: 'market', words: measured ? 'Not led by makers' : null, rows: board.rows, tinted: false })
  if (board.makers && board.makers.length > 0) {
    out.push({ key: 'makers', words: 'Makers and DIY, grouped', answer: 'half or more of each theme’s videos are makers’ own', rows: board.makers, tinted: true, mark: true })
  }
  if (board.setAside && board.setAside.length > 0) {
    out.push({ key: 'set-aside', words: 'Set aside as off-topic', answer: 'half or more of each theme’s videos are off-topic', rows: board.setAside, tinted: true })
  }
  if (board.below.rows && board.below.rows.length > 0) {
    out.push({ key: 'below', words: 'At 3 to 9 videos', rows: board.below.rows, tinted: false })
  }
  return out
}

function EmailBoard({ board }: { board: ConversationBoard }) {
  const cell = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 10px 4px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
  const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const }
  const head = { ...cell, borderTop: 0, color: EMAIL.muted, fontSize: 11 }
  const prev = board.prev
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: 'left' }}>Theme</th>
          <th style={{ ...head, textAlign: 'right' }}>Videos</th>
          <th style={{ ...num, borderTop: 0 }}><BaseHead month={board.month} n={board.n} mode="email" /></th>
          {prev ? <th style={{ ...num, borderTop: 0 }}><BaseHead month={prev.month} n={prev.n} mode="email" /></th> : null}
          <th style={{ ...head, textAlign: 'right' }}>From searches added in {shortMonthName(board.month)}</th>
          <th style={{ ...head, textAlign: 'left' }}>Flag</th>
        </tr>
      </thead>
      <tbody>
        {groups(board).flatMap((g) => [
          ...(g.words ? [<tr key={`${g.key}-head`}><td colSpan={6} style={{ ...cell, fontWeight: 600 }}>{g.words} <span data-copy="figure" style={{ fontFamily: FONT.mono, color: EMAIL.muted }}>{fmtInt(g.rows.length)}</span></td></tr>] : []),
          ...g.rows.map((t) => (
            <tr key={t.registryId}>
              <td style={cell}><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></td>
              <td style={num}><span data-copy="figure">{fmtInt(t.k)}</span></td>
              <td style={num}><span data-copy="figure">{levelCell(t.k, t.n)}</span></td>
              {prev ? <td style={{ ...num, color: EMAIL.muted }}><span data-copy="figure">{levelCell(prevReadK(t), prev.n)}</span></td> : null}
              <td style={num}><span data-copy="figure">{t.provenance ? fmtInt(t.provenance.fromNewSearches) : '·'}</span></td>
              <td style={cell}><Flag t={t} mode="email" /></td>
            </tr>
          )),
        ])}
      </tbody>
    </table>
  )
}

function Board({ data, mode }: { data: VoiceSurfaceData; mode: RenderMode }) {
  const board = data.board
  if (mode === 'email') {
    return (
      <div>
        <EmailBoard board={board} />
        <PairChip words={board.chip} mode={mode} />
      </div>
    )
  }
  const prevN = board.prev?.n ?? null
  const all = groups(board).flatMap((g) => g.rows)
  const axis = barAxis(all.flatMap((t) => [t.k / t.n, prevShareOf(t, prevN)]))
  const openId = data.theme.id
  const head = (
    <div role="row" className={`${COLS} items-end ${RULE.head}`}>
      <span role="columnheader" className={WIDE} />
      <span role="columnheader" className={`flex flex-col ${SCALE.head}`}>
        Theme
        <span className="font-mono text-[12px] font-normal">{board.segments === 'measured' ? 'kind · makers' : 'kind'}</span>
      </span>
      <span role="columnheader" className={WIDE}><BarLegend month={board.month} prevMonth={board.prev?.month ?? null} /></span>
      <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
      <span role="columnheader"><BaseHead month={board.month} n={board.n} mode={mode} /></span>
      <span role="columnheader">{board.prev ? <BaseHead month={board.prev.month} n={board.prev.n} mode={mode} /> : null}</span>
      <span role="columnheader" className={`${WIDE} flex flex-col items-end text-right ${SCALE.head}`}>
        From searches
        <span className="whitespace-nowrap font-mono text-[12px] font-normal">added in {shortMonthName(board.month)}</span>
      </span>
      <span role="columnheader" className={`${WIDE} flex flex-col ${SCALE.head}`}>
        Flag
        <span className="whitespace-nowrap font-mono text-[12px] font-normal">New · Now 10+</span>
      </span>
    </div>
  )
  const body: ReactNode[] = []
  for (const g of groups(board)) {
    const rows = g.rows.map((t, i) => <Row key={t.registryId} t={t} rank={i + 1} board={board} params={data.params} openId={openId} axis={axis} />)
    const section = (
      <>
        {g.words ? <GroupHead words={g.words} count={g.rows.length} answer={g.answer} mark={g.mark} /> : null}
        {rows}
      </>
    )
    body.push(g.tinted
      ? <div key={g.key} className="-mx-4 mt-4 rounded-md bg-inner px-4 pb-1">{section}</div>
      : <div key={g.key}>{section}</div>)
  }
  return (
    <div id="board" className="flex min-w-0 flex-col gap-6 @container">
      <div role="table" className="flex min-w-0 flex-col">
        {head}
        {body}
      </div>
      {board.segments === 'unknown' ? (
        <p className="m-0 rounded-md bg-inner px-4 py-4 text-[15px] leading-[1.55] text-secondary-foreground sm:px-6">Makers’ videos are not marked yet; this list groups them once they are.</p>
      ) : null}
      <PairChip words={board.chip} mode={mode} />
    </div>
  )
}

/** The footer's one link: the pool under the floor, or back to the board. */
function footerLink(data: VoiceSurfaceData, mode: RenderMode, appUrl: string): ReactNode {
  const b = data.board
  if (b.below.rows) return openLink(mode, `${appUrl}${voiceSurfaceHref(data.params, { board: null })}#board`, 'Only the themes at 10 or more →')
  if (b.below.count === 0) return null
  return openLink(
    mode,
    `${appUrl}${voiceSurfaceHref(data.params, { board: 'all' })}#board`,
    `${fmtInt(b.below.count)} more ${b.below.count === 1 ? 'theme' : 'themes'} at 3 to 9 videos →`,
  )
}

export const voiceBoard: Block<VoiceSurfaceData> = {
  key: 'voice.board',
  title: 'Every theme at 10 videos or more',
  question: 'Everything your market talked about, biggest first?',

  render(data, mode = 'app', ctx) {
    const empty = voiceBoard.emptyState(data)
    return (
      <BlockFrame title={voiceBoard.title} mode={mode} footer={footerLink(data, mode, ctx.appUrl)} roomy>
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : <Board data={data} mode={mode} />}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const b = data.board
    // The base every row's share is of. The rows' own counts are the page's
    // longest list and are not declared one by one (the 30-number budget).
    return { board_n: { value: b.n, unit: 'videos', label: `category videos in ${longMonth(b.month)}` } }
  },

  emptyState(data) {
    const b = data.board
    if (b.atTen === 0 && !(b.below.rows && b.below.rows.length > 0)) {
      return `No theme reached 10 videos in ${longMonth(b.month)} yet; the list opens at 10.`
    }
    return null
  },
}
