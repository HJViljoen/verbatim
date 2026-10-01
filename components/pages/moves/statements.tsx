import type { MarketLabels } from '@/lib/brands/labels'
import type { StatementReading, StatementsBlockData, StatementView } from '@/lib/statements/types'
import { AddStatement } from './add-statement'
import { Bar, Card, SectionHead } from './parts'
import { StatementMenu } from './statement-menu'
import {
  COLUMN_HEADS, NOBODY_ANYWHERE, OF_MARKET_VIDEOS, STANCE_LABELS, STATEMENTS_TITLE,
  barWidth, fmt, nobodyInMarket, pct, statementsBase, statementsLead, whoParts,
} from './words'

// "Your statements" (pages build, package MOVES; Page-Your-moves.dc.html): what
// the client says about itself, and how its market treats each claim. The
// artboard's card, its base stated once in the subtitle, the add form, and one
// four-column row per statement: the words and whose talk it is · the share
// of the month's market videos · how people treat it · the menu.
//
// A ROW NOT YET MEASURED shows its words and nothing else: no "measuring", no
// placeholder (the brief, rule 2). An ABSENCE THAT WAS READ is a finding and
// prints as one ("Nobody in your market raised it in September.").
//
// MARKERS. The share and the counts are code's figures (`data-copy="figure"`),
// the sentence is model prose stored by the measurement under its own slot
// (`stored` · `statement_says`), and the statement is the client's own words
// (`quote`: rule (c) does not police what a person typed).

/** The four tracks: the words, the share, the treatment, the menu. */
const TRACKS = 'grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_220px_minmax(0,1.45fr)_32px] lg:gap-7'
const GRID = `grid ${TRACKS}`

function WhoLine({ reading, brand, market }: { reading: StatementReading; brand: string; market: MarketLabels }) {
  const parts = whoParts(reading.who, brand, market)
  if (parts.length === 0) return null
  const name = (p: (typeof parts)[number]) => (
    <span className={p.tone === 'client' ? 'font-semibold text-[#9A6B00]' : p.tone === 'rival' ? 'font-semibold text-[#26292C]' : 'text-[#5F656B]'}>{p.name}</span>
  )
  return (
    <div className="text-[12px] leading-[1.45]">
      {parts.length === 1
        ? name(parts[0])
        : parts.map((p, i) => (
            <span key={p.key}>
              {i > 0 ? <span className="text-[#5F656B]"> · </span> : null}
              {name(p)} <span data-copy="figure" className="font-mono text-[#5F656B]">{fmt(p.videos)}</span>
            </span>
          ))}
    </div>
  )
}

function TalkColumn({ reading }: { reading: StatementReading }) {
  const { videos: k, base: n } = reading.market
  const share = pct(k, n)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span data-copy="figure" className="font-mono text-[26px] font-medium text-[#26292C]">{share}%</span>
        <span className="text-[13px] text-[#5F656B]">{OF_MARKET_VIDEOS}</span>
      </div>
      <Bar width={share} />
      {k > 0 ? (
        <div className="text-[13px] text-[#5F656B]">
          <span data-copy="figure" className="font-mono text-[#26292C]">{fmt(k)}</span> of {fmt(n)} videos
        </div>
      ) : (
        <div className="text-[13px] leading-[1.5] text-[#26292C]">{nobodyInMarket(reading.month, reading.complete)}</div>
      )}
      {reading.own.videos > 0 ? (
        <div className="text-[13px] leading-[1.5] text-[#26292C]">
          Talked about under <span data-copy="figure" className="font-mono">{fmt(reading.own.videos)}</span> of your own posts.
        </div>
      ) : null}
    </div>
  )
}

function TreatRow({ label, k, base }: { label: string; k: number; base: number }) {
  return (
    <div className="flex items-center gap-3 border-t border-[#E4E2DC] py-1.5">
      <div className="w-[104px] shrink-0 text-[13.5px] text-[#26292C]">{label}</div>
      <Bar width={barWidth(k, base)} />
      <div className="w-11 shrink-0 text-right">
        <span data-copy="figure" className="font-mono text-[14px] font-medium text-[#26292C]">{fmt(k)}</span>
      </div>
    </div>
  )
}

function TreatColumn({ reading }: { reading: StatementReading }) {
  const s = reading.stance
  if (!s) return <p className="m-0 text-[13.5px] leading-[1.55] text-[#26292C]">{NOBODY_ANYWHERE}</p>
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12px] text-[#5F656B]">
        Of the <span data-copy="figure" className="font-mono text-[#26292C]">{fmt(s.base)}</span> videos{s.of === 'own' ? ' under your posts' : ''}
      </div>
      <div className="flex flex-col">
        <TreatRow label={STANCE_LABELS.backs} k={s.backs} base={s.base} />
        <TreatRow label={STANCE_LABELS.doubts} k={s.doubts} base={s.base} />
        <TreatRow label={STANCE_LABELS.asks} k={s.asks} base={s.base} />
      </div>
      {reading.says ? (
        <p data-copy="stored" data-slot="statement_says" className="m-0 mt-0.5 text-[13.5px] leading-[1.55] text-[#26292C]">{reading.says}</p>
      ) : null}
    </div>
  )
}

function StatementLine({ s, brand, market, canEdit }: { s: StatementView; brand: string; market: MarketLabels; canEdit: boolean }) {
  const r = s.reading
  return (
    <div className={`${GRID} items-start border-t border-[#E4E2DC] py-[18px]`} data-statement={s.id}>
      <div className="flex flex-col gap-2">
        <p data-copy="quote" className="m-0 text-[16px] font-semibold leading-[1.4] text-[#26292C]">{s.text}</p>
        {r ? <WhoLine reading={r} brand={brand} market={market} /> : null}
      </div>
      {r ? <TalkColumn reading={r} /> : <div className="hidden lg:block" />}
      {r ? <TreatColumn reading={r} /> : <div className="hidden lg:block" />}
      <div className="flex justify-end lg:block">{canEdit ? <StatementMenu id={s.id} text={s.text} /> : null}</div>
    </div>
  )
}

export function YourStatements({ data }: { data: StatementsBlockData }) {
  const sub = data.base != null && data.month ? statementsBase(data.base, data.month, data.complete) : undefined
  return (
    <Card pad="px-7 pt-6 pb-2.5" gap="gap-3">
      <SectionHead title={STATEMENTS_TITLE} sub={sub} />
      <p className="m-0 -mt-1 mb-0.5 max-w-[820px] text-[14.5px] leading-[1.55] text-[#5F656B]">{statementsLead(data.brand)}</p>
      {data.canEdit ? <AddStatement /> : null}
      {data.statements.length > 0 ? (
        <div className="flex flex-col pt-1.5">
          <div className={`hidden ${TRACKS} pt-1.5 pb-2 lg:grid`}>
            {COLUMN_HEADS.map((h) => <div key={h} className="text-[12px] font-semibold text-[#5F656B]">{h}</div>)}
            <div />
          </div>
          {data.statements.map((s) => <StatementLine key={s.id} s={s} brand={data.brand} market={data.market} canEdit={data.canEdit} />)}
        </div>
      ) : null}
    </Card>
  )
}
