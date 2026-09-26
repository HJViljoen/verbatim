import type { RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { PairChip } from '@/components/blocks/pair-chip'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { marketLevel, type MarketKinds } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import type { FigureTable } from '@/lib/reading/verdicts'
import { BarLegend, BaseHead, LevelBar, PHONE_COLS, PHONE_HIDDEN, PHONE_OWN_LINE, RULE, SCALE, barAxis } from './market'

// "What people did in the comments" (market-first WP1.6, plan §2.2 block 4):
// every kind and the four moods as levels on the market's base, the month
// before beside each, one chip at the foot (R3). No depth line and no
// off-topic note under the block (25 Sep rulings); each kind's maker share
// arrives as a row tag with deploy 3 (WP2.3), never as a note.

export const MARKET_KINDS_TITLE = 'What people did in the comments'

/** A kind's level cell: a share at 100 videos and 10 of its own, else the
 *  count (the column head carries the "of N"); a dot where nothing was read. */
const cell = (k: number | null, n: number | null): string => {
  const l = marketLevel(k, n)
  return l?.kind === 'share' ? l.text : '·'
}

/** A kind under the floor this month: the row prints its count and says so,
 *  with the month before's count beside it (the preview's "under 10, a count
 *  only · August 3"). */
const underFloor = (k: number | null, n: number | null): boolean => k != null && marketLevel(k, n)?.kind === 'count'

const MOOD_DOT: Record<string, string> = {
  positive: 'bg-positive',
  mixed: 'bg-mixed',
  neutral: 'bg-neutral-seg',
  negative: 'bg-negative',
}

const kindToken = (kind: string, suffix: 'k' | 'share' | 'prev'): string => `market_kind_${kind}_${suffix}`
const moodToken = (mood: string, suffix: 'k' | 'share' | 'prev'): string => `market_mood_${mood}_${suffix}`

/** The block's figures: each kind's and mood's videos and level, both months. */
export function marketKindsFigures(m: MarketKinds): FigureTable {
  const out: FigureTable = {}
  const month = longMonth(m.month)
  const level = (k: number | null, n: number | null, label: string): FigureTable[string] | null => {
    const l = marketLevel(k, n)
    if (!l || k == null || n == null) return null
    return l.kind === 'share' ? { value: Math.round((k / n) * 100), unit: 'pct', label } : { value: k, unit: 'videos', label }
  }
  for (const r of m.kinds) {
    if (r.k != null) out[kindToken(r.kind, 'k')] = { value: r.k, unit: 'videos', label: `videos where people were ${r.label.toLowerCase()} in ${month}` }
    const share = level(r.k, m.n, `${r.label}'s share of ${month}`)
    if (share && share.unit === 'pct') out[kindToken(r.kind, 'share')] = share
    const prev = m.prev ? level(r.prevK, m.prev.n, `${r.label} in ${longMonth(m.prev.month)}`) : null
    if (prev) out[kindToken(r.kind, 'prev')] = prev
  }
  for (const r of m.mood) {
    if (r.k != null) out[moodToken(r.mood, 'k')] = { value: r.k, unit: 'videos', label: `${r.label} videos in ${month}` }
    const share = level(r.k, m.judged, `${r.label}'s share of ${month}`)
    if (share && share.unit === 'pct') out[moodToken(r.mood, 'share')] = share
    const prev = m.prev ? level(r.prevK, m.prev.judged, `${r.label} in ${longMonth(m.prev.month)}`) : null
    if (prev) out[moodToken(r.mood, 'prev')] = prev
  }
  return out
}

function KindsTable({ m, mode }: { m: MarketKinds; mode: RenderMode }) {
  const prev = m.prev
  const axis = barAxis(m.kinds.flatMap((r) => [
    r.k != null && m.n ? r.k / m.n : null,
    prev && r.prevK != null && prev.n ? r.prevK / prev.n : null,
  ]))
  if (mode === 'email') {
    const c = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '3px 10px 3px 0', borderTop: `1px solid ${EMAIL.hairline}` }
    const num = { ...c, fontFamily: FONT.mono, textAlign: 'right' as const }
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...c, borderTop: 0, textAlign: 'left', color: EMAIL.muted, fontSize: 11 }}>Kind</th>
            <th style={{ ...num, borderTop: 0, color: EMAIL.muted, fontSize: 11 }}>Videos</th>
            <th style={{ ...num, borderTop: 0 }}><BaseHead month={m.month} n={m.n} mode={mode} /></th>
            {prev ? <th style={{ ...num, borderTop: 0 }}><BaseHead month={prev.month} n={prev.n} mode={mode} /></th> : null}
          </tr>
        </thead>
        <tbody>
          {m.kinds.map((r) => (
            <tr key={r.kind}>
              <td style={c}>{r.label}</td>
              <td style={num}><span data-copy="figure">{r.k == null ? '·' : fmtInt(r.k)}</span></td>
              <td style={num}><span data-copy="figure">{cell(r.k, m.n)}</span></td>
              {prev ? <td style={{ ...num, color: EMAIL.muted }}><span data-copy="figure">{cell(r.prevK, prev.n)}</span></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  // In a narrow block the label and the three figure columns only
  // (`PHONE_COLS`, a container query on the table's wrapper).
  const cols = `${PHONE_COLS} @min-[600px]:grid-cols-[minmax(150px,1.1fr)_minmax(96px,1fr)_64px_64px_64px]`
  return (
    <div className="-mx-1 overflow-x-auto px-1 @container">
      <div className="@min-[600px]:min-w-[520px]" role="table">
        <div role="row" className={`grid ${cols} items-end ${RULE.head}`}>
          <span role="columnheader" className={SCALE.head}>Kind</span>
          <span role="columnheader" className={PHONE_HIDDEN}><BarLegend month={m.month} prevMonth={prev?.month ?? null} /></span>
          <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
          <span role="columnheader"><BaseHead month={m.month} n={m.n} mode={mode} /></span>
          <span role="columnheader">{prev ? <BaseHead month={prev.month} n={prev.n} mode={mode} /> : null}</span>
        </div>
        {m.kinds.map((r) => (
          <div key={r.kind} role="row" className={`grid ${cols} min-h-11 items-center py-1.5 ${RULE.row}`}>
            <span role="rowheader" className={SCALE.row}>{r.label}</span>
            {underFloor(r.k, m.n) ? (
              <span className={`text-[13px] text-muted-foreground ${PHONE_OWN_LINE}`}>
                under 10, a count only{prev && r.prevK != null ? <> · {longMonth(prev.month)} <span data-copy="figure" className="font-mono font-semibold tabular-nums text-secondary-foreground">{fmtInt(r.prevK)}</span></> : null}
              </span>
            ) : (
              <span className={`block ${PHONE_HIDDEN}`}>
                <LevelBar share={r.k != null && m.n ? r.k / m.n : null} prevShare={prev && r.prevK != null && prev.n ? r.prevK / prev.n : null} axis={axis} />
              </span>
            )}
            <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{r.k == null ? '·' : fmtInt(r.k)}</span></span>
            <span className={SCALE.num}><span data-copy="figure">{cell(r.k, m.n)}</span></span>
            <span className={SCALE.prev}>{prev ? <span data-copy="figure">{cell(r.prevK, prev.n)}</span> : null}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoodTable({ m, mode }: { m: MarketKinds; mode: RenderMode }) {
  if (m.mood.length === 0) return null
  const prev = m.prev
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginTop: 10 }}>
        <span data-copy="level">Mood, of <span data-copy="figure">{m.judged == null ? '·' : fmtInt(m.judged)}</span>:</span>{' '}
        {m.mood.map((r, i) => (
          <span key={r.mood}>{i > 0 ? ' · ' : ''}{r.label} <span data-copy="figure">{r.k == null ? '·' : fmtInt(r.k)}</span> (<span data-copy="figure">{cell(r.k, m.judged)}</span>)</span>
        ))}
      </div>
    )
  }
  const total = m.mood.reduce((n, r) => n + (r.k ?? 0), 0)
  // Narrower figure columns on a phone, so the four fit without a scroll.
  const cols = 'grid-cols-[minmax(88px,1fr)_52px_56px_56px] sm:grid-cols-[minmax(104px,1fr)_64px_64px_64px]'
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div role="table">
        <div role="row" className={`grid ${cols} items-end gap-x-3 sm:gap-x-4 ${RULE.head}`}>
          <span role="columnheader" className={SCALE.head}>Mood</span>
          <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
          <span role="columnheader"><BaseHead month={m.month} n={m.judged} mode={mode} /></span>
          <span role="columnheader">{prev ? <BaseHead month={prev.month} n={prev.judged} mode={mode} /> : null}</span>
        </div>
        {m.mood.map((r) => (
          <div key={r.mood} role="row" className={`grid ${cols} min-h-11 items-center gap-x-3 py-1.5 sm:gap-x-4 ${RULE.row}`}>
            <span role="rowheader" className={`inline-flex items-center gap-2.5 ${SCALE.row}`}><span aria-hidden className={`size-2 flex-none rounded-[2px] ${MOOD_DOT[r.mood] ?? 'bg-cat'}`} />{r.label}</span>
            <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{r.k == null ? '·' : fmtInt(r.k)}</span></span>
            <span className={SCALE.num}><span data-copy="figure">{cell(r.k, m.judged)}</span></span>
            <span className={SCALE.prev}>{prev ? <span data-copy="figure">{cell(r.prevK, prev.judged)}</span> : null}</span>
          </div>
        ))}
      </div>
      {total > 0 ? (
        <div aria-hidden className="flex h-2 w-full gap-px overflow-hidden rounded-[2px]">
          {m.mood.map((r) => <span key={r.mood} className={MOOD_DOT[r.mood] ?? 'bg-cat'} style={{ width: `${((r.k ?? 0) / total) * 100}%` }} />)}
        </div>
      ) : null}
    </div>
  )
}

/** The block, on a page built as "Your market". */
export function renderMarketKinds(data: OverviewData, mode: RenderMode, appUrl: string) {
  const m = data.category.market
  const voice = surface('voice')
  const footer = openLink(mode, `${appUrl}${voice.href}`, `Open ${voice.label} →`)
  if (!m || (m.kinds.length === 0 && m.mood.length === 0)) {
    return (
      <BlockFrame title={MARKET_KINDS_TITLE} mode={mode} footer={footer} roomy>
        <BlockEmpty mode={mode}>{marketKindsEmpty(data)}</BlockEmpty>
      </BlockFrame>
    )
  }
  return (
    <BlockFrame title={MARKET_KINDS_TITLE} mode={mode} footer={footer} roomy>
      {mode === 'email' ? (
        <div><KindsTable m={m} mode={mode} /><MoodTable m={m} mode={mode} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-x-20 gap-y-8 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]" data-print-cols="2">
          <KindsTable m={m} mode={mode} />
          <MoodTable m={m} mode={mode} />
        </div>
      )}
      <PairChip words={m.chip} mode={mode} />
    </BlockFrame>
  )
}

export function marketKindsEmpty(data: OverviewData): string | null {
  const m = data.category.market
  if (m && (m.kinds.length > 0 || m.mood.length > 0)) return null
  return `Nothing people did in the comments has been read into ${longMonth(data.month)} yet.`
}
