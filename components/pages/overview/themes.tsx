import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { carriesShare } from '@/lib/reading/level'
import type { FigureTable } from '@/lib/reading/verdicts'
import { MAKERS_NOT_MEASURED, boardPrev, groupFigures, makerCell, prevReadK, themeFigures, type MarketTheme, type ThemeBoard } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import { BarLegend, BaseHead, InnerLine, LevelBar, MakerMark, RULE, SCALE, barAxis, isMarketPage } from './market'

// "What your market talked about" (market-first WP1.6, plan §2.2 block 2):
// the ten biggest themes not led by makers, the previous month beside each as
// a level, each row's maker share at a fifth or more, and the makers and
// set-aside lines (decision F).
//
// THE HEADER IS THE TITLE ALONE, THE FOOTER A LINK ALONE (25 Sep rulings): the
// base lives in the column heads ("Sep of 626"), the refusal in the one chip
// at the block's foot, and nothing explains itself under the table.

/**
 * THE BOARD'S BREAKPOINT IS ITS OWN WIDTH (deploy 2 review): the desktop grid
 * from 820px of board, the phone layout below it, as a container query on the
 * board (`@container`). Written out in full for Tailwind's scanner. On paper
 * the board is laid out at the app's 1440 width (`.vb-print`), so it keeps the
 * desktop grid there.
 */
const BOARD_COLS = 'grid-cols-[minmax(0,1fr)_44px_48px_48px] gap-x-3 @min-[820px]:gap-x-4'
const BOARD_HIDDEN = '@max-[820px]:hidden'
const BOARD_OWN_LINE = '@max-[820px]:order-last @max-[820px]:col-span-full'

/** A row's level cell: its share at 100 videos or more, its count under, and
 *  "·" where the month did not read the theme (`prevReadK`). */
function levelCell(k: number | null, n: number | null): string {
  if (k == null || n == null || n <= 0) return '·'
  return carriesShare(n) ? `${Math.round((k / n) * 100)}%` : fmtInt(k)
}

/** "Makers and DIY, grouped: 7 themes at 10+, led by …", and in the app the
 *  preview's "Show the 7 →" at the line's right-hand end, to the same group on
 *  Conversation (d3 polish; the approved preview's makers line). */
function GroupLine({ words, group, mode, show }: { words: string; group: { count: number; lead: MarketTheme[] }; mode: 'app' | 'print' | 'email'; show?: string }) {
  if (group.count === 0) return null
  const lead = group.lead
  const link = mode === 'app' && show ? openLink(mode, show, `Show the ${fmtInt(group.count)} →`) : null
  const line = (
    <>
      {mode === 'email' ? null : <span className="mr-3 inline-flex align-[-1px] text-muted-foreground"><MakerMark /></span>}
      <strong className="font-semibold text-foreground">{words}:</strong>{' '}
      <span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(group.count)}</span>{' '}
      {group.count === 1 ? 'theme' : 'themes'} at 10+
      {lead.length > 0 ? ', led by ' : ''}
      {lead.map((t, i) => (
        <span key={t.registryId}>
          {i > 0 ? ' and ' : ''}
          <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>{' '}
          (<span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(t.k)}</span>)
        </span>
      ))}
    </>
  )
  if (!link) return <InnerLine mode={mode}>{line}</InnerLine>
  // THE PREVIEW'S LINE: one row, the words in the ink at the left and the
  // link at the right, 56px tall, the words taking the width (no reading
  // measure: the link closes the line).
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-md bg-inner px-4 py-2 sm:px-6">
      <p className="m-0 min-w-0 flex-1 basis-[28ch] text-[15px] leading-[1.55] text-foreground [text-wrap:pretty]">{line}</p>
      <span className="flex min-h-11 flex-none items-center whitespace-nowrap text-[14px] font-medium text-foreground [&_[data-link-text]]:underline [&_[data-link-text]]:decoration-neutral-seg [&_[data-link-text]]:decoration-1 [&_[data-link-text]]:underline-offset-[5px] [&_a:hover_[data-link-text]]:decoration-foreground [&_[data-link-text]+span]:pl-0.5">{link}</span>
    </div>
  )
}

function Board({ board, mode, voiceHref }: { board: ThemeBoard; mode: 'app' | 'print' | 'email'; voiceHref?: string }) {
  // No month before beside a refused themes pair, and no refusal chip (T0a).
  const shown = boardPrev(board)
  const prev = shown && shown.n != null ? shown : null
  const makersColumn = board.segments === 'measured'
  // No August mark where August did not read the theme (`prevReadK`): the
  // cell beside it prints "·", so the bar draws no tick at zero either.
  const prevShare = (t: MarketTheme): number | null => {
    const k = prevReadK(t)
    return prev && k != null ? k / (prev.n as number) : null
  }
  const shares = board.rows.flatMap((t) => [t.k / t.n, prevShare(t)])
  const axis = barAxis(shares)

  if (mode === 'email') {
    const cell = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 10px 4px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
    const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const }
    return (
      <div>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...cell, borderTop: 0, textAlign: 'left', color: EMAIL.muted, fontSize: 11 }}>Theme</th>
              <th style={{ ...num, borderTop: 0, color: EMAIL.muted, fontSize: 11 }}>Videos</th>
              <th style={{ ...num, borderTop: 0 }}><BaseHead month={board.month} n={board.n} mode={mode} /></th>
              {prev ? <th style={{ ...num, borderTop: 0 }}><BaseHead month={prev.month} n={prev.n} mode={mode} /></th> : null}
              {makersColumn ? <th style={{ ...cell, borderTop: 0, textAlign: 'left', color: EMAIL.muted, fontSize: 11 }}>Makers</th> : null}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((t) => (
              <tr key={t.registryId}>
                <td style={cell}><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></td>
                <td style={num}><span data-copy="figure">{fmtInt(t.k)}</span></td>
                <td style={num}><span data-copy="figure">{levelCell(t.k, t.n)}</span></td>
                {prev ? <td style={{ ...num, color: EMAIL.muted }}><span data-copy="figure">{levelCell(prevReadK(t), prev.n)}</span></td> : null}
                {makersColumn ? <td style={{ ...cell, color: makerCell(t.makerShare) === MAKERS_NOT_MEASURED ? EMAIL.muted : EMAIL.ink2 }}>{makerCell(t.makerShare) ?? ''}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {board.makers ? <GroupLine words="Makers and DIY, grouped" group={board.makers} mode={mode} /> : null}
        {board.setAside ? <GroupLine words="Set aside as off-topic" group={board.setAside} mode={mode} /> : null}
        {board.segments === 'unknown' ? <InnerLine mode={mode}>Makers’ videos are not marked yet; this list groups them once they are.</InnerLine> : null}
      </div>
    )
  }

  // THE PREVIEW'S COLUMNS (Main.dc.html: 32 · 300 · 1fr · 72 · 64 · 64 · 200,
  // 16px apart; d3 polish): the rank, the theme up to 300px, the bar taking
  // what is left, "Videos" at 72px and the two levels at 64px, and the makers
  // tag up to 200px. At 1440 the tracks are the preview's to the pixel; under
  // it the theme and the tag give way to their floors before the bar does.
  //
  // ON A PHONE (below `sm`; WP1.6 review) the table fits the tile with no
  // sideways scroll, so the first screen carries the board's figures: the
  // rank and the bar go, the theme wraps instead of truncating, and the
  // makers tag takes a line of its own under its row (`BOARD_COLS`).
  //
  // THE THEME WRAPS AT EVERY WIDTH, NEVER TRUNCATES (fresh design check, 26
  // Sep): at 1024 its track is about 210px and seven of Sealand's ten labels
  // ended in "…", the one cell a reader came for. At 1440 they fit on a line.
  //
  // THE BOARD'S OWN WIDTH DECIDES, NOT THE WINDOW'S (deploy 2 review). Its
  // columns need about 760px and its makers tag about 60 more, and the tile
  // sits beside the 224px sidebar: keyed to `sm`, the desktop grid ran from
  // 640 to about 1180 in a tile too narrow for it, the legend printed over
  // "Videos" ("AugVideos"), and the makers tag was clipped or cut ("about a
  // thi"). A container query (`@min-[820px]`) keeps the phone layout (no rank,
  // no bar, the makers tag on a line of its own) until the board has room.
  // The makers track holds "about a third makers" whole from 172px (its width
  // at 1440, where the preview is drawn); at 140 it read "about a third
  // make…" at every width under about 1400.
  const cols = makersColumn
    ? `${BOARD_COLS} @min-[820px]:grid-cols-[32px_minmax(200px,300px)_minmax(96px,1fr)_72px_64px_64px_minmax(172px,200px)]`
    : `${BOARD_COLS} @min-[820px]:grid-cols-[32px_minmax(200px,1.2fr)_minmax(96px,1fr)_72px_64px_64px]`
  return (
    <div className="flex min-w-0 flex-col gap-6 @container">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="@min-[820px]:min-w-[680px]" role="table">
          <div role="row" className={`grid ${cols} items-end ${RULE.head}`}>
            <span role="columnheader" className={BOARD_HIDDEN} />
            <span role="columnheader" className={SCALE.head}>Theme</span>
            <span role="columnheader" className={BOARD_HIDDEN}><BarLegend month={board.month} prevMonth={prev?.month ?? null} /></span>
            <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
            <span role="columnheader"><BaseHead month={board.month} n={board.n} mode={mode} /></span>
            <span role="columnheader">{prev ? <BaseHead month={prev.month} n={prev.n} mode={mode} /> : null}</span>
            {makersColumn ? <span role="columnheader" className={`${BOARD_HIDDEN} ${SCALE.head}`}>Makers</span> : null}
          </div>
          {board.rows.map((t, i) => {
            const words = makerCell(t.makerShare)
            const unmeasured = words === MAKERS_NOT_MEASURED
            return (
              <div key={t.registryId} role="row" className={`grid ${cols} min-h-11 items-center py-1.5 ${RULE.row}`}>
                <span className={`${BOARD_HIDDEN} font-mono text-[13px] tabular-nums text-muted-foreground`}>{i + 1}</span>
                <span role="rowheader" className={`min-w-0 [text-wrap:pretty] ${SCALE.row}`} title={t.label}>
                  <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
                </span>
                <span className={`block ${BOARD_HIDDEN}`}>
                  <LevelBar share={t.k / t.n} prevShare={prevShare(t)} axis={axis} />
                </span>
                <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(t.k)}</span></span>
                <span className={SCALE.num}><span data-copy="figure">{levelCell(t.k, t.n)}</span></span>
                <span className={SCALE.prev}>{prev ? <span data-copy="figure">{levelCell(prevReadK(t), prev.n)}</span> : null}</span>
                {makersColumn ? (
                  <span className={`inline-flex min-w-0 items-center gap-2 text-[13px] text-secondary-foreground ${BOARD_OWN_LINE}`}>
                    {/* In the narrow layout the column head is gone, so the tag names makers itself. */}
                    {unmeasured ? <span className={SCALE.tag}><span className="@min-[820px]:hidden">makers </span>{words}</span> : words ? <><MakerMark /><span className="truncate">{words}</span></> : null}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      {board.makers || board.setAside || board.segments === 'unknown' ? (
        <div className="flex flex-col gap-2">
          {board.makers ? <GroupLine words="Makers and DIY, grouped" group={board.makers} mode={mode} show={voiceHref ? `${voiceHref}#makers` : undefined} /> : null}
          {board.setAside ? <GroupLine words="Set aside as off-topic" group={board.setAside} mode={mode} show={voiceHref ? `${voiceHref}#set-aside` : undefined} /> : null}
          {board.segments === 'unknown' ? <InnerLine mode={mode}>Makers’ videos are not marked yet; this list groups them once they are.</InnerLine> : null}
        </div>
      ) : null}
    </div>
  )
}

export const overviewThemes: Block<OverviewData> = {
  key: 'overview.themes',
  title: 'What your market talked about',
  question: 'What did your market talk about, biggest first?',

  render(data, mode = 'app', ctx) {
    const board = data.themes ?? null
    // "ALL 23 ON CONVERSATION →" ONCE WP2.4 HAS SHIPPED (plan §3.3, WP1.6's
    // board rule): Conversation lists every theme at 10 or more, so the link
    // names how many it holds, under the page's CURRENT sidebar label
    // (plan §4.0). With nothing at 10 it is a plain link to the page.
    const voice = surface('voice')
    const atTen = board?.atTen ?? 0
    const footer = openLink(mode, `${ctx.appUrl}${voice.href}`, atTen > 0 ? `All ${fmtInt(atTen)} on ${voice.label} →` : `Open ${voice.label} →`)
    const empty = overviewThemes.emptyState(data)
    return (
      <BlockFrame title={overviewThemes.title} mode={mode} footer={footer} roomy>
        {empty || !board ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : <Board board={board} mode={mode} voiceHref={`${ctx.appUrl}${voice.href}`} />}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return data.themes ? { ...themeFigures(data.themes), ...groupFigures(data.themes) } : {}
  },

  emptyState(data) {
    if (!isMarketPage(data) || !data.themes) return 'The themes your market talked about are read on the front page as it is built today, not on this copy.'
    if (data.themes.rows.length === 0 && (data.themes.makers?.count ?? 0) === 0) {
      return `No theme reached 10 videos in ${longMonth(data.themes.month)} yet; the list opens at 10.`
    }
    return null
  },
}
