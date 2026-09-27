import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { PairChip } from '@/components/blocks/pair-chip'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { BRANDS_HEAD_ALL, BRANDS_HEAD_ORGANIC } from '@/lib/pages/overview-market'
import {
  prevPrinted, TOPICS_NOT_READ, TOPICS_TITLE, topicsCounted, topicWords,
  type TopicRow, type TopicsBlock,
} from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import type { FigureTable } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { InnerLine } from '@/components/pages/overview/market'
import { emailCell, emailHead, SubHead, Swatch } from './parts'

// B1 · Brands in your market (market-first WP3.5, plan §2.5 B1; the approved
// preview's second block on Brands).
//
// EVERY BRAND YOU TRACK, COUNTED IN EVERY VIDEO IT COMES UP IN (decision E):
// the headline count leaves out every video any of our rival searches found
// (the 27 Sep ruling: one base for every brand, under its column head), "in
// all" beside it, and the month before beside that, in grey. Two levels on
// one axis, never a change: the pair's chip says why they are not read as one.
// A brand prints its counts only once production's hand check holds it
// (WP2.6), else "not counted yet", or "mostly {another word} · not counted"
// where the check measured it under the floor.
//
// NAMED, BUT NOT SEARCHED: the brands the market names that we do not search
// (MF3's operator list), counted the same way, in all. No list, no column.
//
// THE HEADER IS THE TITLE ALONE, THE FOOTER A LINK ALONE (25 Sep rulings);
// each column head carries its base (§1 B ruling 3).

/** The inks: the headline count in the rivals' orange, in all at 48% of it,
 *  the month before as the grey tick (the preview's and Your market's). */
const ORGANIC_INK = 'var(--comp)'
const ALL_INK = 'color-mix(in srgb, var(--comp) 48%, var(--tile))'
const PREV_INK = 'var(--cat)'

/** The bars' axis: a little over the largest count drawn. */
export function topicsAxis(rows: readonly TopicRow[]): number {
  const max = Math.max(0, ...rows.flatMap((r) => [r.kAny ?? 0, r.prevK ?? 0]))
  return Math.max(1, Math.ceil(max * 1.06))
}

const pct = (k: number | null, axis: number) => `${Math.max(0, Math.min(100, ((k ?? 0) / axis) * 100)).toFixed(1)}%`

/** A column head over its base: "In all" over "of 654". */
function Head({ words, n, ink, bar = false, wrap = false }: { words: string; n: number | null; ink?: string; bar?: boolean; wrap?: boolean }) {
  return (
    <span role="columnheader" data-copy={n == null ? undefined : 'level'} className="flex flex-col items-end text-right">
      <span className={wrap ? '[text-wrap:balance]' : 'whitespace-nowrap'}>{ink ? <Swatch ink={ink} bar={bar} /> : null}{words}</span>
      {n == null ? null : <span className="whitespace-nowrap font-mono text-[12px] font-normal">of {fmtInt(n)}</span>}
    </span>
  )
}

/** The tracked brands' table, in the app and on paper. */
function TrackedTable({ t }: { t: TopicsBlock }) {
  const counted = topicsCounted(t.tracked)
  const prev = counted && prevPrinted(t.tracked) && t.prevMonth != null
  const axis = topicsAxis(t.tracked)
  // WIDE FROM 560px OF BLOCK: label, bar, the two counts, the month before.
  // Narrower, the bar leaves (Your market's rule for its tables).
  const cols = prev
    ? 'grid-cols-[minmax(0,1fr)_6.5rem_3rem_3.5rem] @min-[560px]:grid-cols-[minmax(9rem,11.5rem)_minmax(64px,1fr)_8.5rem_3.5rem_4.5rem]'
    : 'grid-cols-[minmax(0,1fr)_6.5rem_3.5rem] @min-[560px]:grid-cols-[minmax(9rem,11.5rem)_minmax(64px,1fr)_8.5rem_3.5rem]'
  const bar = '@max-[560px]:hidden'
  const spanAll = prev ? 'col-span-3 @min-[560px]:col-span-4' : 'col-span-2 @min-[560px]:col-span-3'
  return (
    <div className="@container min-w-0">
      <div role="table" aria-label="Brands we track" className="flex flex-col">
        {counted ? (
          <div className="flex flex-col justify-end gap-2 border-b border-border pb-2.5">
            <div aria-hidden className={cn('grid items-end gap-x-4 text-[13px] font-semibold leading-[1.35] text-secondary-foreground', cols)}>
              <span />
              <span className={bar} />
              <span className="col-span-2 border-b border-border pb-1.5 text-right">{longMonth(t.month)}</span>
              {prev ? <span className="border-b border-border pb-1.5 text-right">{longMonth(t.prevMonth as string)}</span> : null}
            </div>
            <div role="row" className={cn('grid items-end gap-x-4 text-[13px] font-medium leading-[1.35] text-muted-foreground', cols)}>
              <span role="columnheader" className="whitespace-nowrap">Brand</span>
              <span aria-hidden className={bar} />
              <Head words={BRANDS_HEAD_ORGANIC} n={t.nOrganic} ink={ORGANIC_INK} wrap />
              <Head words={BRANDS_HEAD_ALL} n={t.n} ink={ALL_INK} />
              {prev ? <Head words={BRANDS_HEAD_ALL} n={t.prevN} ink={PREV_INK} bar /> : null}
            </div>
          </div>
        ) : (
          <div role="row" className="border-b border-border pb-2.5 text-[13px] font-medium text-muted-foreground">
            <span role="columnheader">Brand</span>
          </div>
        )}
        {t.tracked.map((r, i) => {
          const words = topicWords(r)
          const last = i === t.tracked.length - 1
          return (
            <div key={r.brandKey} role="row" className={cn('grid min-h-11 items-center gap-x-4 py-1.5', counted ? cols : 'grid-cols-[minmax(9rem,11.5rem)_minmax(0,1fr)]', last ? null : 'border-b border-border/60')}>
              <span role="rowheader" className="min-w-0 text-[15px] leading-[1.35] text-foreground [overflow-wrap:anywhere]">{r.label}</span>
              {words ? (
                <span role="cell" className={cn('text-[14px] leading-[1.4] text-muted-foreground', counted ? spanAll : null)}>{words}</span>
              ) : (
                <>
                  <span aria-hidden className={cn('relative block h-2', bar)}>
                    <span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: pct(r.kAny, axis), background: ALL_INK }} />
                    <span className="absolute inset-y-0 left-0 rounded-l-[2px]" style={{ width: pct(r.kOrganic, axis), background: ORGANIC_INK }} />
                    {prev && r.prevK != null ? <span className="absolute -top-1 h-4 w-[2px] rounded-[1px]" style={{ left: `calc(${pct(r.prevK, axis)} - 1px)`, background: PREV_INK }} /> : null}
                  </span>
                  <span role="cell" data-copy="figure" className="text-right font-mono text-[15px] font-semibold tabular-nums text-foreground">{fmtInt(r.kOrganic ?? 0)}</span>
                  <span role="cell" data-copy="figure" className="text-right font-mono text-[15px] tabular-nums text-secondary-foreground">{fmtInt(r.kAny ?? 0)}</span>
                  {prev ? <span role="cell" data-copy={r.prevK == null ? undefined : 'figure'} className="text-right font-mono text-[15px] tabular-nums text-muted-foreground">{r.prevK == null ? '·' : fmtInt(r.prevK)}</span> : null}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The brands the market names that we do not search: in all, each month. */
function WatchedTable({ t, rows }: { t: TopicsBlock; rows: readonly TopicRow[] }) {
  const counted = topicsCounted(rows)
  const prev = counted && prevPrinted(rows) && t.prevMonth != null
  const cols = prev ? 'grid-cols-[minmax(0,1fr)_4.5rem_4rem]' : 'grid-cols-[minmax(0,1fr)_4.5rem]'
  return (
    <div role="table" aria-label="Named, but not searched" className="flex flex-col">
      {counted ? (
        <div role="row" className={cn('grid items-end gap-x-4 border-b border-border pb-2.5 text-[13px] leading-[1.35]', cols)}>
          <span role="columnheader" className="font-medium text-muted-foreground">Brand</span>
          <span role="columnheader" data-copy={t.n == null ? undefined : 'level'} className="flex flex-col items-end text-right">
            <span className="font-semibold text-secondary-foreground">{longMonth(t.month)}</span>
            {t.n == null ? null : <span className="font-mono text-[12px] text-muted-foreground">of {fmtInt(t.n)}</span>}
          </span>
          {prev ? (
            <span role="columnheader" data-copy={t.prevN == null ? undefined : 'level'} className="flex flex-col items-end text-right">
              <span className="font-semibold text-secondary-foreground">{longMonth(t.prevMonth as string)}</span>
              {t.prevN == null ? null : <span className="font-mono text-[12px] text-muted-foreground">of {fmtInt(t.prevN)}</span>}
            </span>
          ) : null}
        </div>
      ) : (
        <div role="row" className="border-b border-border pb-2.5 text-[13px] font-medium text-muted-foreground"><span role="columnheader">Brand</span></div>
      )}
      {rows.map((r, i) => {
        const words = topicWords(r)
        return (
          <div key={r.brandKey} role="row" className={cn('grid min-h-11 items-center gap-x-4', counted ? cols : 'grid-cols-[minmax(0,1fr)_auto]', i === rows.length - 1 ? null : 'border-b border-border/60')}>
            <span role="rowheader" className="min-w-0 text-[15px] text-foreground [overflow-wrap:anywhere]">{r.label}</span>
            {words ? <span role="cell" className={cn('text-right text-[14px] text-muted-foreground', counted && prev ? 'col-span-2' : null)}>{words}</span> : (
              <>
                <span role="cell" data-copy="figure" className="text-right font-mono text-[15px] font-semibold tabular-nums text-foreground">{fmtInt(r.kAny ?? 0)}</span>
                {prev ? <span role="cell" data-copy={r.prevK == null ? undefined : 'figure'} className="text-right font-mono text-[15px] tabular-nums text-muted-foreground">{r.prevK == null ? '·' : fmtInt(r.prevK)}</span> : null}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EmailTopics({ t }: { t: TopicsBlock }) {
  const counted = topicsCounted(t.tracked)
  const prev = counted && prevPrinted(t.tracked) && t.prevMonth != null
  const table = (rows: readonly TopicRow[], organic: boolean) => (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
      <thead>
        <tr>
          <th style={emailHead}>Brand</th>
          {counted && organic ? <th style={{ ...emailHead, textAlign: 'right' }}><span data-copy="level">{BRANDS_HEAD_ORGANIC} · of {fmtInt(t.nOrganic ?? 0)}</span></th> : null}
          {counted ? <th style={{ ...emailHead, textAlign: 'right' }}>{t.n == null ? longMonth(t.month) : <span data-copy="level">{longMonth(t.month)} · of {fmtInt(t.n)}</span>}</th> : null}
          {prev ? <th style={{ ...emailHead, textAlign: 'right' }}>{t.prevN == null ? longMonth(t.prevMonth as string) : <span data-copy="level">{longMonth(t.prevMonth as string)} · of {fmtInt(t.prevN)}</span>}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const words = topicWords(r)
          return (
            <tr key={r.brandKey}>
              <td style={emailCell}>{r.label}{words ? <div style={{ fontSize: 12, color: EMAIL.muted }}>{words}</div> : null}</td>
              {counted && organic ? <td style={{ ...emailCell, textAlign: 'right' }}>{words ? null : <span data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600 }}>{fmtInt(r.kOrganic ?? 0)}</span>}</td> : null}
              {counted ? <td style={{ ...emailCell, textAlign: 'right' }}>{words ? null : <span data-copy="figure" style={{ fontFamily: FONT.mono }}>{fmtInt(r.kAny ?? 0)}</span>}</td> : null}
              {prev ? <td style={{ ...emailCell, textAlign: 'right', color: EMAIL.muted }}>{words || r.prevK == null ? null : <span data-copy="figure" style={{ fontFamily: FONT.mono }}>{fmtInt(r.prevK)}</span>}</td> : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
  return (
    <div>
      <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>Brands we track</div>
      {table(t.tracked, true)}
      {t.watched && t.watched.length > 0 ? (
        <>
          <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink, marginTop: 16 }}>Named, but not searched</div>
          {table(t.watched, false)}
        </>
      ) : null}
    </div>
  )
}

export const competitiveTopics: Block<CompetitiveSurfaceData> = {
  key: 'competitive.topics',
  title: TOPICS_TITLE,
  question: 'Which brands come up in your market, and how often?',

  render(data, mode = 'app', ctx) {
    const t = data.brands?.topics ?? null
    const footer = t ? openLink(mode, `${ctx.appUrl}${surface('ask').href}`, 'Ask about a brand →') : null
    if (!t) {
      return (
        <BlockFrame title={TOPICS_TITLE} mode={mode} roomy>
          <InnerLine mode={mode}>{TOPICS_NOT_READ}</InnerLine>
        </BlockFrame>
      )
    }
    if (mode === 'email') {
      return (
        <BlockFrame title={TOPICS_TITLE} mode={mode} footer={footer}>
          <EmailTopics t={t} />
          <PairChip words={t.chip} mode={mode} />
        </BlockFrame>
      )
    }
    const watched = t.watched && t.watched.length > 0 ? t.watched : null
    return (
      <BlockFrame title={TOPICS_TITLE} mode={mode} footer={footer} roomy>
        <div className={watched ? 'grid min-w-0 grid-cols-1 items-start gap-y-8 xl:grid-cols-[minmax(0,1fr)_304px] xl:gap-x-[88px]' : 'min-w-0'}>
          <div className="flex min-w-0 flex-col gap-4">
            <SubHead title="Brands we track" note="videos each came up in" mode={mode} />
            <TrackedTable t={t} />
            <PairChip words={t.chip} mode={mode} className="mt-2" />
          </div>
          {watched ? (
            <div className="flex min-w-0 flex-col gap-4">
              <SubHead title="Named, but not searched" mode={mode} />
              <WatchedTable t={t} rows={watched} />
            </div>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const t = data.brands?.topics
    if (!t) return {}
    const out: FigureTable = {}
    for (const r of [...t.tracked, ...(t.watched ?? [])]) {
      if (r.count !== 'counted' || r.kAny == null) continue
      const id = r.brandKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      out[`brand_${id}_any`] = { value: r.kAny, unit: 'videos', label: `videos naming ${r.label} in ${longMonth(t.month)}` }
      if (r.kOrganic != null && t.watched?.every((w) => w.brandKey !== r.brandKey)) {
        out[`brand_${id}_organic`] = { value: r.kOrganic, unit: 'videos', label: `videos naming ${r.label} in ${longMonth(t.month)}, without any video our rival searches found` }
      }
    }
    return out
  },

  emptyState(data) {
    return data.brands?.topics ? null : TOPICS_NOT_READ
  },
}
