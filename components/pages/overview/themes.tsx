import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { PairChip } from '@/components/blocks/pair-chip'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { carriesShare } from '@/lib/reading/level'
import type { FigureTable } from '@/lib/reading/verdicts'
import { makerWords, themeFigures, type MarketTheme, type ThemeBoard } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import { BarLegend, BaseHead, InnerLine, LevelBar, MakerMark, barAxis, isMarketPage } from './market'

// "What your market talked about" (market-first WP1.6, plan §2.2 block 2):
// the ten biggest themes not led by makers, the previous month beside each as
// a level, each row's maker share at a fifth or more, and the makers and
// set-aside lines (decision F).
//
// THE HEADER IS THE TITLE ALONE, THE FOOTER A LINK ALONE (25 Sep rulings): the
// base lives in the column heads ("Sep of 626"), the refusal in the one chip
// at the block's foot, and nothing explains itself under the table.

/** A row's level cell: its share at 100 videos or more, its count under. */
function levelCell(k: number | null, n: number | null): string {
  if (k == null || n == null || n <= 0) return '·'
  return carriesShare(n) ? `${Math.round((k / n) * 100)}%` : fmtInt(k)
}

/** "Makers and DIY, grouped: 7 themes at 10+, led by …". */
function GroupLine({ words, group, mode }: { words: string; group: { count: number; lead: MarketTheme[] }; mode: 'app' | 'print' | 'email' }) {
  if (group.count === 0) return null
  const lead = group.lead
  return (
    <InnerLine mode={mode}>
      {mode === 'email' ? null : <span className="mr-2 inline-flex align-[-1px] text-muted-foreground"><MakerMark /></span>}
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
    </InnerLine>
  )
}

function Board({ board, mode, chip }: { board: ThemeBoard; mode: 'app' | 'print' | 'email'; chip: string | null }) {
  const prev = board.prev && board.prev.n != null ? board.prev : null
  const makersColumn = board.segments === 'measured'
  const shares = board.rows.flatMap((t) => [t.k / t.n, prev && t.prev ? t.prev.k / (prev.n as number) : null])
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
                {prev ? <td style={{ ...num, color: EMAIL.muted }}><span data-copy="figure">{levelCell(t.prev?.k ?? 0, prev.n)}</span></td> : null}
                {makersColumn ? <td style={{ ...cell, color: EMAIL.ink2 }}>{makerWords(t.makerShare) ?? ''}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {board.makers ? <GroupLine words="Makers and DIY, grouped" group={board.makers} mode={mode} /> : null}
        {board.setAside ? <GroupLine words="Set aside as off-topic" group={board.setAside} mode={mode} /> : null}
        {board.segments === 'unknown' ? <InnerLine mode={mode}>Makers’ videos are not marked yet; this list groups them once they are.</InnerLine> : null}
        <PairChip words={chip} mode={mode} />
      </div>
    )
  }

  const cols = makersColumn
    ? 'grid-cols-[24px_minmax(0,1.6fr)_minmax(64px,1fr)_56px_56px_56px_minmax(120px,0.9fr)]'
    : 'grid-cols-[24px_minmax(0,1.6fr)_minmax(64px,1fr)_56px_56px_56px]'
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[640px]" role="table">
          <div role="row" className={`grid ${cols} items-end gap-x-4 border-b border-border pb-2.5`}>
            <span role="columnheader" />
            <span role="columnheader" className="text-[12px] font-medium text-muted-foreground">Theme</span>
            <span role="columnheader"><BarLegend month={board.month} prevMonth={prev?.month ?? null} /></span>
            <span role="columnheader" className="text-right text-[12px] font-medium text-muted-foreground">Videos</span>
            <span role="columnheader"><BaseHead month={board.month} n={board.n} mode={mode} /></span>
            <span role="columnheader">{prev ? <BaseHead month={prev.month} n={prev.n} mode={mode} /> : null}</span>
            {makersColumn ? <span role="columnheader" className="text-[12px] font-medium text-muted-foreground">Makers</span> : null}
          </div>
          {board.rows.map((t, i) => {
            const words = makerWords(t.makerShare)
            return (
              <div key={t.registryId} role="row" className={`grid ${cols} min-h-11 items-center gap-x-4 border-b border-border/60 py-1.5`}>
                <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
                <span role="rowheader" className="min-w-0 truncate text-[14px]" title={t.label}>
                  <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
                </span>
                <LevelBar share={t.k / t.n} prevShare={prev && t.prev ? t.prev.k / (prev.n as number) : null} axis={axis} />
                <span className="text-right font-mono text-[14px] font-semibold tabular-nums"><span data-copy="figure">{fmtInt(t.k)}</span></span>
                <span className="text-right font-mono text-[14px] tabular-nums"><span data-copy="figure">{levelCell(t.k, t.n)}</span></span>
                <span className="text-right font-mono text-[14px] tabular-nums text-muted-foreground">{prev ? <span data-copy="figure">{levelCell(t.prev?.k ?? 0, prev.n)}</span> : null}</span>
                {makersColumn ? (
                  <span className="inline-flex min-w-0 items-center gap-2 text-[12.5px] text-secondary-foreground">
                    {words ? <><MakerMark /><span className="truncate">{words}</span></> : null}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      {board.makers ? <GroupLine words="Makers and DIY, grouped" group={board.makers} mode={mode} /> : null}
      {board.setAside ? <GroupLine words="Set aside as off-topic" group={board.setAside} mode={mode} /> : null}
      {board.segments === 'unknown' ? <InnerLine mode={mode}>Makers’ videos are not marked yet; this list groups them once they are.</InnerLine> : null}
      <PairChip words={chip} mode={mode} />
    </div>
  )
}

export const overviewThemes: Block<OverviewData> = {
  key: 'overview.themes',
  title: 'What your market talked about',
  question: 'What did your market talk about, biggest first?',

  render(data, mode = 'app', ctx) {
    const board = data.themes ?? null
    const voice = surface('voice')
    const footer = openLink(mode, `${ctx.appUrl}${voice.href}`, `Open ${voice.label} →`)
    const empty = overviewThemes.emptyState(data)
    return (
      <BlockFrame title={overviewThemes.title} mode={mode} footer={footer}>
        {empty || !board ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : <Board board={board} mode={mode} chip={board.chip ?? null} />}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return data.themes ? themeFigures(data.themes) : {}
  },

  emptyState(data) {
    if (!isMarketPage(data) || !data.themes) return 'The themes your market talked about are read on the front page as it is built today, not on this copy.'
    if (data.themes.rows.length === 0 && (data.themes.makers?.count ?? 0) === 0) {
      return `No theme reached 10 videos in ${longMonth(data.themes.month)} yet; the list opens at 10.`
    }
    return null
  },
}
