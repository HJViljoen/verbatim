import { Fragment, type ReactNode } from 'react'
import { QuoteBlock } from '@/components/quote-block'
import { BlockSlot } from './block-slot'
import { DeckFooter } from '@/components/print/report-deck'
import { Slide } from '@/components/print/slide'
import { Sparkline } from '@/components/charts/sparkline'
import { CountBadge, MovementBadge } from '@/components/delta-badge'
import type { Good } from '@/components/charts/stat'
import type { DeltaVerdict } from '@/lib/report-bands'
import type { ShareSide } from '@/lib/report-delta'
import { substituteFigures } from '@/lib/reports/cover'
import { documentSlides, sectionOfSlide } from '@/lib/reports/documents/compose'
import { blocksFor } from '@/lib/reports/documents/load-reading'
import type { BriefSurface } from '@/lib/reports/documents/sections'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { appBaseUrl } from '@/lib/site'
import { findingHeadlines, overviewTiles, slugOf } from '@/lib/reports/documents/overview'
import { shownTrajectory, type DocBlock, type DocBriefSection, type DocLens, type DocPage, type DocumentSnapshotData } from '@/lib/reports/documents/types'
import type { FigureTable } from '@/lib/reports/types'

// A document's deck from its (hydrated) snapshot data: the cover, then one
// slide per skeleton page, numbered once across the document. The same
// chrome as a report's pages (Heinrich, 2026-08-30): the page's name top
// right, "Created by {company} with Verbatim" and the date at the foot. No
// evidence on paper: the workings never reach this component.
//
// The pages (T6, 2026-08-31, second pass after Heinrich's read): a research
// report composed to fill a landscape sheet. Type at 15–17px on the 1168px
// body (about 11pt on paper), structured blocks with hairlines, pills for
// audiences, bars for shares, a tinted inner block for the pull quote.
// NO blurred shadow on paper: Chrome prints a box-shadow as a bitmap that
// some PDF viewers draw as a grey slab (Heinrich's screenshots, 2026-08-30).
// Depth on paper is the hairline; the ambient shadow stays on screen.

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtCount = (n: number) => new Intl.NumberFormat('en-US').format(n)
const PLATFORM: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit' }

const CARD = 'rounded-lg border border-border bg-tile'
// THE DECK'S BODY TYPE (Block D wave 1, P0 item 7; mock-gap §8 P0). 15.5px on
// a 1168px body zoomed to .902 is about 12pt on a 297mm sheet — a large-print
// research report. Measured across the four brief artboards, the body runs
// 12.5–13px, and it is why the mock fits a finding, its quote, its card and
// its practice list on one slide where the build clips at twenty rows. The
// page LEADS are untouched (the "In short" summary at 17px, the section
// intros at 15–16px): §5 names those sizes and a lead is supposed to sit
// above its body. Only the body moved.
const BODY = 'text-[13px] leading-[1.5] text-foreground'
const BODY_SM = 'text-[12.5px] leading-[1.45] text-foreground'

export function Figured({ text, figures }: { text: string; figures: FigureTable }) {
  return (
    <>
      {substituteFigures(text, figures).map((p, i) =>
        'text' in p ? <Fragment key={i}>{p.text}</Fragment> : <span key={i} className="font-mono tabular-nums text-foreground">{p.figure}</span>,
      )}
    </>
  )
}

function Paragraphs({ text, figures, className }: { text: string; figures: FigureTable; className: string }) {
  return (
    <>
      {text.split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i} className={className}><Figured text={p} figures={figures} /></p>)}
    </>
  )
}

/**
 * A series on paper (Block D wave 1, P0 item 7).
 *
 * The deck could not draw one. `components/charts/sparkline.tsx` has drawn
 * every in-app series since the redesign — gaps kept as gaps, one polyline per
 * unbroken run, no fill under a broken line — and the deck reached for a bar
 * or a sentence instead, so a printed brief said "up from June" where the page
 * showed the shape. This is that component at the deck's scale, with the
 * animation off: a slide is printed once by a headless browser and a draw-in
 * that has not finished is a line that is not there.
 *
 * `months` is the axis in words, and it is REQUIRED because it is the only
 * honest thing a printed sparkline has instead of a hover: a reader with a
 * sheet of paper cannot ask what a point was. Under three readings nothing is
 * drawn at all and the months that CARRIED a reading are named instead — the
 * rule `monthlyLineLabel` already applies on screen (mock-gap §6 D3: a chart
 * is a direction claim too, and two points are not a direction), in the words
 * that rule already prints: "Aug → Sep only", "Sep only", "no month reads".
 * The label named every month it was handed until 2026-09-18, so two readings
 * over a four-month axis printed four month names — the opposite of what the
 * refusal is for, and a fourth phrase for a state the product already had
 * words for.
 *
 * No document in the snapshot carries a series yet, so nothing on the four
 * fixed templates calls this today. It is the seam D-brief (P13–P17) binds
 * when the quarterly's and the leadership one-pager's charts land.
 */
export function DeckSpark({ values, months, color = 'var(--primary)' }: {
  values: (number | null)[]
  /** The months these points are, in order — the printed page's only axis. */
  months: string[]
  color?: string
}) {
  // The months that carried a reading, in order. A slot with no reading is not
  // a month this line can name.
  const read = months.filter((_, i) => values[i] != null)
  if (read.length < 3) {
    return (
      <p className="font-mono text-[10.5px] text-muted-foreground">
        {read.length === 0 ? 'no month reads'
          : read.length === 1 ? `${read[0]} only`
          : `${read[0]} → ${read[read.length - 1]} only`}
      </p>
    )
  }
  // THE DRAWN PATH DEFENDS ITS AXIS. The labels are `months[0]` and the last
  // month, so one month per slot is what makes them the ends of the line that
  // was actually plotted; a list of a different length labels the wrong end,
  // silently, on a sheet of paper with no hover to check it against. The
  // comment above says a printed line without its axis cannot happen, and this
  // is what makes that true rather than intended. Unreachable from a caller
  // that hands over a series and its own months — which is the point.
  if (months.length !== values.length) {
    return <p className="font-mono text-[10.5px] text-muted-foreground">the months and the readings do not line up</p>
  }
  return (
    <span className="flex flex-col gap-1">
      <Sparkline values={values} color={color} width={104} height={22} animate={false} endDot />
      <span className="flex justify-between font-mono text-[9.5px] text-muted-foreground">
        <span>{months[0]}</span>
        <span>{months[months.length - 1]}</span>
      </span>
    </span>
  )
}

/** An eyebrow: mono, uppercase, with a short rule in the accent. */
function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground ${className}`}>
      <span className="inline-block h-[2px] w-4 rounded-full bg-primary" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function Pill({ tone, children }: { tone: 'you' | 'comp' | 'cat' | 'new' | 'plain'; children: ReactNode }) {
  const cls =
    tone === 'you' ? 'bg-accent text-accent-foreground'
    : tone === 'comp' ? 'bg-comp/15 text-foreground'
    : tone === 'new' ? 'bg-warning/20 text-foreground'
    : tone === 'plain' ? 'border border-border text-secondary-foreground'
    : 'bg-inner text-secondary-foreground'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] font-mono text-[11px] leading-none ${cls}`}>{children}</span>
}

function audiencePills(audiences: string, company: string) {
  return audiences.split(',').filter(Boolean).map((b) => {
    if (b === 'client') return <Pill key={b} tone="you">{company}&rsquo;s audience</Pill>
    if (b === 'industry-other') return <Pill key={b} tone="cat">the category</Pill>
    if (b.startsWith('competitor:')) return <Pill key={b} tone="comp">{b.slice('competitor:'.length)}&rsquo;s audience</Pill>
    return null
  })
}

function DocumentCover({ data, pages }: { data: DocumentSnapshotData; pages: number }) {
  // A BORROWED BLOCK IS A SECTION TOO (WP19). Counting only written page KINDS
  // read "0 sections · 6 pages" on a brief composed entirely from the section
  // map — the count is what the cover is for, and it was about half the
  // document.
  const sections = new Set(data.pages.map((p) => p.kind)).size + (data.sections?.length ?? 0)
  return (
    <section className="vb-slide">
      <div className="vb-slide-body">
        <div className="flex h-full flex-col justify-center gap-8 px-[6%]">
          <span className="inline-block h-[3px] w-14 rounded-full bg-primary" aria-hidden />
          <h1 className="max-w-[16ch] text-[58px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]">{data.title}</h1>
          <p className="font-mono text-[13px] text-muted-foreground">
            {sections} {sections === 1 ? 'section' : 'sections'} · {pages} {pages === 1 ? 'page' : 'pages'}
          </p>
          {/* The month on the cover, where a reader meets the document. */}
          {data.reading && <p className="font-mono text-[13px] text-secondary-foreground">{data.reading.stamp}</p>}
        </div>
      </div>
    </section>
  )
}

// ── overview ───────────────────────────────────────────────────────────────

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className={`${CARD} px-5 py-4`}>
      <p className="font-mono text-[38px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{value}</p>
      <p className="mt-2 text-[12.5px] leading-[1.35] text-muted-foreground">{label}</p>
    </div>
  )
}

function OverviewPage({ page, data }: { page: DocPage; data: DocumentSnapshotData }) {
  const f = data.figures
  const summary = page.blocks.find((b) => b.field === 'summary')
  // The numbers and the headlines are derived in
  // lib/reports/documents/overview.ts — the email reads the same functions, so
  // the paper and the email cannot drift. (The not-settled list stays local:
  // it is the page's own block, and the email does not carry it.)
  const findings = findingHeadlines(data)
  const notSureBlock = page.blocks.find((b) => b.field === 'not_sure')
  const notSure = notSureBlock?.items ?? []
  const tiles = overviewTiles(data)
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] gap-x-12">
      <div className="flex min-h-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>In short</Eyebrow>
          {summary?.text && <BlockSlot block={summary} textClass="max-w-[66ch] text-[17px] leading-[1.55] text-foreground"><Paragraphs text={summary.text} figures={f} className="max-w-[66ch] text-[17px] leading-[1.55] text-foreground" /></BlockSlot>}
        </div>
        {findings.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <Eyebrow>Findings in this brief</Eyebrow>
            <ol className="flex flex-col gap-2">
              {findings.map((h, i) => (
                <li key={i} className="flex items-baseline gap-4 text-[16px] leading-[1.4] text-foreground">
                  <span className="w-6 shrink-0 font-mono text-[13px] tabular-nums text-primary">{i + 1}</span>
                  <span className="font-medium"><Figured text={h} figures={f} /></span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex flex-col gap-3">{tiles.map((t, i) => <StatTile key={i} value={t.value} label={t.label} />)}</div>
        {notSure.length > 0 && (
          <div className="rounded-lg bg-inner px-5 py-4">
            <Eyebrow className="mb-2">Not settled this update</Eyebrow>
            <BlockSlot block={notSureBlock!} textClass="text-[13px] leading-[1.45] text-secondary-foreground">
              <ul className="flex flex-col gap-1.5">
                {notSure.slice(0, 3).map((x, i) => <li key={i} className="text-[13px] leading-[1.45] text-secondary-foreground">{x}</li>)}
              </ul>
            </BlockSlot>
          </div>
        )}
      </div>
    </div>
  )
}

// ── finding ────────────────────────────────────────────────────────────────

function ConfidenceDots({ sure }: { sure: string }) {
  const n = sure === 'solid' ? 3 : sure === 'reasonable' ? 2 : 1
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {[0, 1, 2].map((i) => <span key={i} className={`inline-block h-[9px] w-[9px] rounded-full ${i < n ? 'bg-primary' : 'bg-neutral-seg'}`} />)}
    </span>
  )
}

function FindingPage({ page, figures, company, lens }: { page: DocPage; figures: FigureTable; company: string; lens: DocLens }) {
  const b = (field: string) => page.blocks.find((x) => x.field === field)
  const headline = b('headline')
  const saw = b('saw')
  const means = b('means')
  const practiceBlock = b('practice')
  const practice = practiceBlock?.items ?? []
  const sureWord = page.meta?.sure ?? 'thin'
  const sureNote = (b('sure')?.text ?? '').replace(/^(Solid|Reasonable|Thin):[^.]*\.\s*(Treat it as a lead, not a rule\.\s*)?/, '')
  // Through `shownTrajectory` (D1): this page is drawn from a snapshot, and
  // one built before the gate carries "rising" / "seen 2 updates running" in
  // its meta. The gate is on the surface, not on the build.
  const history = shownTrajectory(page.meta?.history)
  const conversations = Number(page.meta?.conversations ?? 0)
  const strands = Number(page.meta?.strands ?? 0)
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex items-end justify-between gap-8">
        {headline && <BlockSlot block={headline} textClass="max-w-[30ch] text-[32px] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground"><h2 className="max-w-[30ch] text-[32px] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground [text-wrap:balance]"><Figured text={headline.text} figures={figures} /></h2></BlockSlot>}
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 pb-1">
          {audiencePills(page.meta?.audiences ?? '', company)}
          {history && <Pill tone={history.startsWith('new') ? 'new' : 'plain'}>{history}</Pill>}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[7fr_5fr] gap-x-12">
        <div className="flex min-h-0 flex-col gap-3">
          <Eyebrow>What the conversation shows</Eyebrow>
          {saw?.text && <BlockSlot block={saw} textClass={`max-w-[70ch] ${BODY}`}><Paragraphs text={saw.text} figures={figures} className={`max-w-[70ch] ${BODY}`} /></BlockSlot>}
          {saw?.quote?.text && (
            <div className="mt-1"><QuoteBlock quote={saw.quote} mode="print" /></div>
          )}
        </div>
        <div className={`${CARD} flex min-h-0 flex-col gap-4 px-6 py-5`}>
          <p className="font-mono text-[12px] text-muted-foreground">
            <span className="text-foreground">{fmtCount(conversations)}</span> conversations · <span className="text-foreground">{strands}</span> strands of the research
          </p>
          {means?.text && (
            <div className="flex flex-col gap-2">
              <Eyebrow>{lens.means}</Eyebrow>
              <BlockSlot block={means} textClass={BODY_SM}><Paragraphs text={means.text} figures={figures} className={BODY_SM} /></BlockSlot>
            </div>
          )}
          {practice.length > 0 && (
            <div className="flex flex-col gap-2">
              <Eyebrow>In practice</Eyebrow>
              <BlockSlot block={practiceBlock!} textClass={BODY_SM}>
                <ul className="flex flex-col gap-1.5">
                  {practice.map((x, i) => (
                    <li key={i} className={`flex gap-3 ${BODY_SM}`}>
                      <span className="mt-[9px] inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-primary" aria-hidden />
                      <span><Figured text={x} figures={figures} /></span>
                    </li>
                  ))}
                </ul>
              </BlockSlot>
            </div>
          )}
          <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Confidence <ConfidenceDots sure={sureWord} /> <span className="normal-case tracking-normal text-foreground">{sureWord}</span>
            </p>
            {sureNote && <p className="text-[12.5px] leading-[1.45] text-muted-foreground">{sureNote}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── competitor ─────────────────────────────────────────────────────────────

function ShareStrip({ data, name }: { data: DocumentSnapshotData; name: string }) {
  const f = data.figures
  const key = `${slugOf(name)}_share_pct`
  const you = f.client_share_pct ? parseFloat(f.client_share_pct.value) : null
  const them = f[key] ? parseFloat(f[key].value) : null
  if (you == null || them == null || Number.isNaN(you) || Number.isNaN(them)) return null
  const max = Math.max(you, them, 1)
  const row = (label: string, pct: number, cls: string) => (
    <div className="flex items-center gap-3">
      <span className="w-[92px] shrink-0 truncate text-[13px] text-foreground">{label}</span>
      <span className="h-[10px] flex-1"><span className={`block h-full rounded-[3px] ${cls}`} style={{ width: `${Math.max(2, (pct / max) * 100)}%` }} /></span>
      <span className="w-[52px] text-right font-mono text-[13px] tabular-nums text-foreground">{pct}%</span>
    </div>
  )
  return (
    <div className={`${CARD} w-[400px] shrink-0 px-5 py-4`}>
      <Eyebrow className="mb-2.5">Share of tracked conversation this update</Eyebrow>
      <div className="flex flex-col gap-2">
        {row(data.company, you, 'bg-you')}
        {row(name, them, 'bg-comp')}
      </div>
    </div>
  )
}

function CompetitorPage({ page, figures, data }: { page: DocPage; figures: FigureTable; data: DocumentSnapshotData }) {
  const b = (field: string) => page.blocks.find((x) => x.field === field)
  const name = page.meta?.name ?? page.title
  // Four columns since 2026-09-15, three on a snapshot frozen before the
  // "what others say" block existed: a column is drawn only for a block the
  // snapshot actually carries, so an older document prints exactly as it did.
  const cols = ([
    ['What they are pitching', 'pitch'],
    ['What others say about them', 'about'],
    ['What their users praise', 'praise'],
    ['Where their users hurt', 'hurt'],
  ] as const)
    .map(([label, field]) => [label, b(field)] as [string, DocBlock | undefined])
    .filter(([, block]) => !!block)
  const read = b('read')
  // The sentence is conditioned on the same thing the columns are. It names
  // the method, and nine frozen snapshots carry a competitor page with no
  // `about` block — one of them served live on a share link — so an
  // unconditional "other people's videos" would have them claiming a reading
  // they never did, beside three columns rather than four. A document says
  // what it read, not what today's pipeline reads.
  const aboutShown = Boolean(b('about'))
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex items-start justify-between gap-8">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">{name}</h2>
          <p className="text-[14px] text-muted-foreground">As their own videos{aboutShown ? ', other people’s videos' : ''} and their audience tell it this update{page.meta?.thin === 'true' ? ', on few videos, read with care' : ''}.</p>
        </div>
        <ShareStrip data={data} name={name} />
      </div>
      <div className={`grid min-h-0 flex-1 ${cols.length >= 4 ? 'grid-cols-4 gap-x-4' : 'grid-cols-3 gap-x-6'}`}>
        {cols.map(([label, block]) => (
          <div key={label} className={`${CARD} flex flex-col gap-2.5 px-5 py-4`}>
            <Eyebrow>{label}</Eyebrow>
            {block?.text && <BlockSlot block={block} textClass={BODY_SM}><Paragraphs text={block.text} figures={figures} className={BODY_SM} /></BlockSlot>}
          </div>
        ))}
      </div>
      {read?.text && (
        <div className="rounded-lg bg-inner px-6 py-4">
          <Eyebrow className="mb-1.5">When {name} comes up</Eyebrow>
          <BlockSlot block={read} textClass={`max-w-[100ch] ${BODY}`}><Paragraphs text={read.text} figures={figures} className={`max-w-[100ch] ${BODY}`} /></BlockSlot>
        </div>
      )}
    </div>
  )
}

/** A page's packed meta. JSON, so a company or a theme label carrying a
 *  separator cannot mis-split into NaN on paper; a snapshot that somehow does
 *  not parse degrades to the empty case rather than throwing inside a print
 *  render, which would fail a paid build. */
function parseMeta<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

// ── standing ───────────────────────────────────────────────────────────────
// The leadership brief's one page of position: the writer's read on the left,
// and on the right the shares as bars and what actually moved, both drawn by
// code from the frozen figures and delta. The verdicts are the pipeline's own
// (T0-8): a change the data cannot carry prints as "about where it was", not
// as a number.

function StandingBars({ data, parties }: { data: DocumentSnapshotData; parties: string[] }) {
  const f = data.figures
  const rows = parties
    .map((name, i) => {
      const key = i === 0 ? 'client_share_pct' : `${slugOf(name)}_share_pct`
      const pct = f[key] ? parseFloat(f[key].value) : NaN
      return Number.isNaN(pct) ? null : { name, pct, you: i === 0 }
    })
    .filter(Boolean) as { name: string; pct: number; you: boolean }[]
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.pct), 1)
  return (
    <div className={`${CARD} px-6 py-5`}>
      <Eyebrow className="mb-3">Share of tracked conversation this update</Eyebrow>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3">
            <span className="w-[120px] shrink-0 truncate text-[13.5px] text-foreground">{r.name}</span>
            <span className="h-[11px] flex-1"><span className={`block h-full rounded-[3px] ${r.you ? 'bg-you' : 'bg-comp'}`} style={{ width: `${Math.max(2, (r.pct / max) * 100)}%` }} /></span>
            <span className="w-[54px] text-right font-mono text-[13.5px] tabular-nums text-foreground">{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A share with the count it was measured on — "23.4% of 380". Null where the
 *  count is not on the delta at all, which a snapshot frozen before the field
 *  existed is: that is a fact about our own bookkeeping, and `UNCOUNTED` says
 *  it rather than printing the percentage anyway. */
const judgedLevel = (pct: number, n: number | null | undefined): string | null =>
  typeof pct === 'number' && Number.isFinite(pct) && typeof n === 'number' && Number.isFinite(n) && n > 0
    ? `${Math.round(pct * 10) / 10}% of ${fmtCount(n)}`
    : null

/** The same for a share side, which carries its numerator too — the videos in
 *  the client's own bucket out of every tracked video, the pair `SHARE_BAND`
 *  floors on. */
const shareLevel = (s: ShareSide | null | undefined): string | null =>
  s && typeof s.client === 'number' && Number.isFinite(s.client)
    && typeof s.totalVideos === 'number' && s.totalVideos > 0
    && typeof s.clientVideos === 'number' && Number.isFinite(s.clientVideos)
    ? `${Math.round(s.client * 10) / 10}% (${fmtCount(s.clientVideos)} of ${fmtCount(s.totalVideos)} videos)`
    : null

/** What a level says when the count behind it was never stored. It is not a
 *  fifth refusal word for a thin comparison — the badge beside it still says
 *  what the comparison was — it is the sentence for a figure we cannot
 *  evidence, and it prints no percentage at all. */
const UNCOUNTED = 'The counts behind these levels were not recorded'

/** What moved, in the delta's own verdicts. A metric the update could not
 *  judge says so rather than showing a number that means nothing.
 *
 *  THE LINE STATES THE LEVELS; THE BADGE STATES THE MOVEMENT (P0 item 7).
 *  These sentences used to write their own — "Moved up, 23.4% to 27.1%
 *  positive" — which is a direction word earned from ONE banded comparison,
 *  mock-gap §6 D5's exact error, hand-rolled on paper where no badge could
 *  contradict it. `MovementBadge` is what the rest of the product prints for
 *  this: the arrow is the sign, the band travels beside it, and a non-answer
 *  reads as a non-answer in the same words the app and the email use. So the
 *  sentence keeps the two levels, which are real and measured, and hands the
 *  claim about the difference to the one component allowed to make it.
 *
 *  `good` is the favourability axis: tone and share rising is good for the
 *  client, and volume is our own gather cadence rather than anything about
 *  them, so it is neutral.
 *
 *  EVERY LEVEL CARRIES THE COUNT IT WAS MEASURED ON (copy contract rule (b)).
 *  Both figures used to print bare — "23.4% to 27.1% positive" — in every
 *  state INCLUDING `too_little_data`, which is the one state that says those
 *  levels are thin, and where the sentence this replaced printed no number at
 *  all. Two percentages to one decimal, a badge that only qualifies the
 *  DIFFERENCE, and no n anywhere on the sheet is a score, and the
 *  denominators were sitting unused on the delta the whole time
 *  (`nowJudged` / `prevJudged`, `ShareSide.clientVideos` / `totalVideos` —
 *  the same counts `SHARE_BAND` floors on). `copy: 'level'` is what carries
 *  that into the markup, so rule (b) reads these two lines on paper the way
 *  it reads every level on screen. */
export function movementLines(data: DocumentSnapshotData): {
  label: string
  value: string
  /** The `data-copy` kind the line's value is rendered under. `level` is a
   *  calibrated share and rule (b) will demand its "of N"; the lines that are
   *  a plain count or a list of labels claim no level and mark nothing. */
  copy?: 'level'
  verdict?: DeltaVerdict | null
  count?: number | null
  good?: Good
}[] {
  const d = data.delta
  if (!d) return [{ label: 'Movement', value: 'No earlier update to compare with.' }]
  const out: { label: string; value: string; copy?: 'level'; verdict?: DeltaVerdict | null; count?: number | null; good?: Good }[] = []
  if (d.sentiment) {
    const prev = judgedLevel(d.sentiment.prev, d.sentiment.prevJudged)
    const now = judgedLevel(d.sentiment.now, d.sentiment.nowJudged)
    out.push({
      label: 'Tone',
      value: prev && now ? `${prev} judged to ${now} positive` : UNCOUNTED,
      ...(prev && now ? { copy: 'level' as const } : {}),
      verdict: d.sentiment.verdict,
      good: 'up',
    })
  }
  if (d.share) {
    const prev = shareLevel(d.share.prev)
    const now = shareLevel(d.share.now)
    out.push({
      label: 'Share',
      value: prev && now ? `${prev} to ${now}` : UNCOUNTED,
      ...(prev && now ? { copy: 'level' as const } : {}),
      verdict: d.share.verdict,
      good: 'up',
    })
  }
  if (d.newThemes) out.push({ label: 'New', value: d.newThemes.count ? `${fmtCount(d.newThemes.count)} new: ${d.newThemes.labels.slice(0, 3).join(', ')}` : 'Nothing confirmed new this update' })
  if (d.conversations) {
    out.push({
      label: 'Volume',
      value: `${fmtCount(d.conversations.now)} conversations, against ${fmtCount(d.conversations.prev)} last update`,
      count: d.conversations.now - d.conversations.prev,
      good: 'neutral',
    })
  }
  return out
}

/**
 * One row of "what moved": the levels, then the badge that judges the
 * difference between them.
 *
 * IT IS A COMPONENT SO THE MARKER IS TESTABLE. The row used to be written
 * inline in `StandingPage`, which is not exported, so the only check anywhere
 * near it ran the copy contract over a hand-built `<span>{value}</span>` — an
 * unmarked node, which produces no copy node at all, so the assertion passed
 * on "99%" and on the empty string alike. The value of a calibrated share now
 * renders under `data-copy="level"`, which is what makes rule (b) — a level
 * prints its "of N" — actually read these two figures, on the real markup the
 * page prints. The lines that are a plain count or a list of theme labels
 * claim no level and mark nothing, exactly as before.
 */
export function MovementLine({ line }: { line: ReturnType<typeof movementLines>[number] }) {
  return (
    <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13.5px] leading-[1.4] text-foreground">
      <span {...(line.copy ? { 'data-copy': line.copy } : {})}>{line.value}</span>
      {line.verdict ? <MovementBadge verdict={line.verdict} unit="pts" good={line.good} /> : null}
      {line.count != null ? <CountBadge delta={line.count} good={line.good} /> : null}
    </dd>
  )
}

/** What the conversation was about this update: the merged concerns with the
 *  conversations behind them and how long each has been running. The findings
 *  pick three; this is the field they were picked from. */
function ConcernField({ meta }: { meta: string }) {
  const rows = parseMeta<{ label: string; total: number; trajectory: string }[]>(meta, [])
    .filter((r) => r && typeof r.label === 'string' && Number.isFinite(r.total))
    // Same gate as the finding page's pill: the counts are this update's and
    // stay; the history word beside them is withdrawn, frozen or not (D1).
    .map((r) => ({ ...r, trajectory: shownTrajectory(r.trajectory) }))
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <div className="flex flex-col gap-2.5">
      <Eyebrow>What the conversation was about this update</Eyebrow>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-4">
            <span className="w-[46px] shrink-0 text-right font-mono text-[14px] tabular-nums text-foreground">{fmtCount(r.total)}</span>
            <span className="h-[8px] w-[92px] shrink-0 rounded-[3px] bg-neutral-seg"><span className="block h-full rounded-[3px] bg-primary" style={{ width: `${Math.max(6, (r.total / max) * 100)}%` }} /></span>
            <span className="flex-1 truncate text-[14.5px] text-foreground">{r.label}</span>
            {r.trajectory && <span className="shrink-0"><Pill tone={r.trajectory.startsWith('new') ? 'new' : 'plain'}>{r.trajectory}</Pill></span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StandingPage({ page, data }: { page: DocPage; data: DocumentSnapshotData }) {
  const block = page.blocks.find((b) => b.field === 'standing')
  const parties = parseMeta<string[]>(page.meta?.parties, []).filter((x) => typeof x === 'string' && x)
  const moved = movementLines(data)
  const READ = 'text-[17px] leading-[1.55] text-foreground'
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] gap-x-12">
      <div className="flex min-h-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>How it reads</Eyebrow>
          {block?.text && <BlockSlot block={block} textClass={`max-w-[62ch] ${READ}`}><Paragraphs text={block.text} figures={data.figures} className={`max-w-[62ch] ${READ}`} /></BlockSlot>}
        </div>
        <ConcernField meta={page.meta?.concerns ?? ''} />
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        <StandingBars data={data} parties={parties} />
        <div className={`${CARD} px-6 py-5`}>
          <Eyebrow className="mb-3">What moved since the previous update</Eyebrow>
          <dl className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-2.5">
            {moved.map((m) => (
              <Fragment key={m.label}>
                <dt className="pt-[2px] font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{m.label}</dt>
                <MovementLine line={m} />
              </Fragment>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

// ── what is claimed and what comes back ────────────────────────────────────
// The market brief's own page. One card per claim the company makes in its
// videos: the claim as it was made, the verdict the analysis reached, what
// the audience says back, and the researcher's read of the difference.

const VERDICT_WORD: Record<string, { word: string; tone: 'you' | 'comp' | 'new' | 'plain' }> = {
  echoes: { word: 'the audience says it too', tone: 'you' },
  contradicts: { word: 'the audience says otherwise', tone: 'new' },
  silent: { word: 'the audience does not take it up', tone: 'plain' },
}

function SayHearPage({ page, figures, company }: { page: DocPage; figures: FigureTable; company: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <p className="max-w-[92ch] text-[15px] leading-[1.5] text-secondary-foreground">
        {`What ${company} says in its own videos, set against what the conversation does with it. The verdict is the analysis’s; the reading is the researcher’s.`}
      </p>
      <ul className="grid min-h-0 grid-cols-2 items-start gap-6">
        {page.blocks.map((b) => {
          const verdict = VERDICT_WORD[b.items?.[0] ?? ''] ?? null
          const theySay = b.items?.[1] ?? ''
          return (
            <li key={b.id} className={`${CARD} flex min-h-0 flex-col gap-3 px-7 py-5`}>
              <div className="flex items-start justify-between gap-4">
                <p className="max-w-[40ch] font-serif text-[17px] italic leading-[1.4] text-foreground">&ldquo;{b.label}&rdquo;</p>
                {verdict && <span className="shrink-0"><Pill tone={verdict.tone}>{verdict.word}</Pill></span>}
              </div>
              {theySay && (
                <p className="border-l-2 border-border pl-3.5 text-[13.5px] leading-[1.45] text-secondary-foreground">{theySay}</p>
              )}
              {b.text && <BlockSlot block={b} textClass={BODY}><Paragraphs text={b.text} figures={figures} className={BODY} /></BlockSlot>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── what the audience asks ─────────────────────────────────────────────────
// The content brief's page: the questions the conversation puts and nobody
// settles, in the audience's own framing. Written as "the question: what is
// behind it", split the way the language page splits its own lines.

function AskedPage({ page }: { page: DocPage }) {
  const block = page.blocks.find((b) => b.field === 'asked')
  const items = block?.items ?? []
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <p className="max-w-[86ch] text-[16px] leading-[1.5] text-secondary-foreground">
        Questions the conversation puts and does not settle. Each is asked in the audience&rsquo;s own framing, not the company&rsquo;s; the note says what is behind it.
      </p>
      {block && (
        <BlockSlot block={block} textClass={BODY_SM}>
          <ol className="grid grid-cols-2 gap-x-8 gap-y-4">
            {items.map((x, i) => {
              const m = /^["“]?([^:"”]+)["”]?:\s*(.+)$/.exec(x)
              return (
                <li key={i} className="flex gap-4">
                  <span className="w-5 shrink-0 pt-[3px] font-mono text-[13px] tabular-nums text-primary">{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <p className="text-[16.5px] font-medium leading-[1.35] text-foreground">{m ? `${m[1].trim()}?`.replace(/\?\?$/, '?') : x}</p>
                    {m && <p className={BODY_SM}>{m[2].replace(/^./, (c) => c.toUpperCase())}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </BlockSlot>
      )}
    </div>
  )
}

// ── personas ───────────────────────────────────────────────────────────────

const PERSONA_LABELS = ['Who they are', 'What they want', 'What stops them', 'What moves them']

function PersonaCard({ block, figures, lens }: { block: DocBlock; figures: FigureTable; lens: DocLens }) {
  const [one, ...rest] = block.items ?? []
  return (
    <div className={`${CARD} flex min-h-0 flex-col gap-3 px-7 py-5`}>
      <div className="flex flex-col gap-1.5">
        <p className="text-[22px] font-semibold tracking-[-0.015em] text-foreground">{block.label}</p>
        {one && <p className="font-serif text-[15px] italic leading-[1.5] text-secondary-foreground">{one}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {rest.map((it, i) => (
          <div key={i} className="flex gap-4">
            <p className="w-[104px] shrink-0 pt-[3px] font-mono text-[11px] uppercase leading-[1.3] tracking-[0.08em] text-muted-foreground">{PERSONA_LABELS[i + 1]}</p>
            <p className="text-[13.5px] leading-[1.45] text-foreground">{it}</p>
          </div>
        ))}
        {block.text && (
          <div className="flex gap-4 border-t border-border pt-3">
            <p className="w-[104px] shrink-0 pt-[3px] font-mono text-[11px] uppercase tracking-[0.08em] text-primary">{lens.short}</p>
            <BlockSlot block={block} textClass="text-[13.5px] font-medium leading-[1.45] text-foreground"><p className="text-[13.5px] font-medium leading-[1.45] text-foreground"><Figured text={block.text} figures={figures} /></p></BlockSlot>
          </div>
        )}
      </div>
    </div>
  )
}

function PersonasPage({ page, figures, lens }: { page: DocPage; figures: FigureTable; lens: DocLens }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 items-start gap-x-8">
      {page.blocks.map((b) => <PersonaCard key={b.id} block={b} figures={figures} lens={lens} />)}
    </div>
  )
}

// ── language ───────────────────────────────────────────────────────────────

function LanguagePage({ page }: { page: DocPage }) {
  const careBlock = page.blocks.find((b) => b.field === 'care')
  const items = careBlock?.items ?? []
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <p className="max-w-[80ch] text-[16px] leading-[1.5] text-secondary-foreground">Words and claims the conversation pushes back on or contradicts. Each is a phrase a buyer will hear as a promise; the note says what the audience already knows about it.</p>
      <BlockSlot block={careBlock!} textClass={BODY_SM}>
      <ul className="grid grid-cols-2 gap-5">
        {items.map((x, i) => {
          const m = /^["“]?([^:"”]+)["”]?:\s*(.+)$/.exec(x)
          return (
            <li key={i} className={`${CARD} flex flex-col gap-1.5 px-6 py-4`}>
              <p className="flex items-center gap-2.5 text-[18px] font-semibold text-foreground">
                <span className="inline-block h-[10px] w-[10px] shrink-0 rounded-full bg-warning" aria-hidden />
                <span>{m ? m[1].trim() : x}</span>
              </p>
              {m && <p className={BODY_SM}>{m[2].replace(/^./, (c) => c.toUpperCase())}</p>}
            </li>
          )
        })}
      </ul>
      </BlockSlot>
    </div>
  )
}

// ── method ─────────────────────────────────────────────────────────────────

function MethodPage({ page, data }: { page: DocPage; data: DocumentSnapshotData }) {
  const items = page.blocks.find((b) => b.field === 'method')?.items ?? []
  const m = data.method
  const rows: [string, string][] = [
    ['Period', m.period],
    ['Conversations', fmtCount(m.conversations)],
    ['Videos', `${fmtCount(m.videos)} · ${fmtCount(m.clientVideos)} ${data.company} · ${fmtCount(m.competitorVideos)} competitor`],
    ['Sources', m.sources.map((s) => PLATFORM[s] ?? s).join(', ') || 'public video platforms'],
    ['Held back', `${fmtCount(m.heldBack)} phrases in other languages`],
    ['Findings', `${data.pages.filter((p) => p.kind === 'finding').length}${m.thin ? ' (thin update)' : ''}`],
  ]
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] gap-x-12">
      <div className="flex flex-col gap-4">
        <Eyebrow>How this brief was made</Eyebrow>
        {items.map((it, i) => <p key={i} className={`max-w-[66ch] ${BODY}`}>{it}</p>)}
      </div>
      <div className={`${CARD} self-start px-6 py-5`}>
        <Eyebrow className="mb-3">This brief in numbers</Eyebrow>
        <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2.5">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="pt-[3px] font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{k}</dt>
              <dd className="text-[14.5px] leading-[1.4] text-foreground">{v}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  )
}

// ── deck ───────────────────────────────────────────────────────────────────

/** The lens the document was written under. Older snapshots (before
 *  2026-09-02) carry none: they are all Sales briefs. */
const lensOf = (data: DocumentSnapshotData): DocLens => data.lens ?? { means: 'What it means for a sale', short: 'for a sale' }

function PageBody({ page, data }: { page: DocPage; data: DocumentSnapshotData }) {
  const figures = data.figures
  const lens = lensOf(data)
  switch (page.kind) {
    case 'in_short': return <OverviewPage page={page} data={data} />
    case 'finding': return <FindingPage page={page} figures={figures} company={data.company} lens={lens} />
    case 'competitor': return <CompetitorPage page={page} figures={figures} data={data} />
    case 'personas': return <PersonasPage page={page} figures={figures} lens={lens} />
    case 'standing': return <StandingPage page={page} data={data} />
    case 'say_hear': return <SayHearPage page={page} figures={figures} company={data.company} />
    case 'asked': return <AskedPage page={page} />
    case 'language': return <LanguagePage page={page} />
    case 'method': return <MethodPage page={page} data={data} />
    default: return null
  }
}

/**
 * A borrowed page block, on paper (Phase 1 WP19).
 *
 * THE BLOCK DRAWS ITSELF, in `'print'` mode, from the surface data the brief
 * froze — the same body of code the page and the email call, which is what
 * makes "the report cannot say something the page cannot" true of these
 * sections rather than merely intended. A section that could not be filled
 * prints its one line instead: the block's own empty state, or the
 * missing-input sentence naming the input and who closes it.
 */
function SectionBody({ section, data }: { section: DocBriefSection; data: DocumentSnapshotData }) {
  const surface = (data.surfaces ?? {})[section.surface]
  const block = blocksFor(section.surface as BriefSurface)?.find((b) => b.key === section.block)
  const body = section.empty != null || !block || surface == null
    // NO `data-copy` MARKER. These words are the product's own — composed in
    // code from a readiness row, not written by a model and not read back out
    // of a column — and the contract's kinds are all about a model's words.
    // Marking it `stored` asked the scanner for a `data-slot` that does not
    // exist (measured: two violations on Össur's marketing brief).
    ? <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">{section.empty ?? 'This section could not be read for this month.'}</p>
    : block.render(surface as never, 'print', blockContext(appBaseUrl(), EMAIL))
  return (
    <div className="flex flex-col gap-3">
      {section.framing && <p className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">{section.framing}</p>}
      {body}
    </div>
  )
}

export function DocumentDeck({ data, date = fmtDate(new Date()) }: { data: DocumentSnapshotData; date?: string }) {
  const slides = documentSlides(data)
  const pages = slides.length + 1
  // WP19: the stamp rides every sheet, the way the weekly deck's rule does —
  // a reader of a PDF has no masthead to scroll back to, and a brief whose
  // numbers are a month's has to name the month on the page they are read on.
  const stamp = data.reading?.stamp ?? data.period
  const chrome = (title: string) => ({ context: `${title} · ${stamp}`, footer: <DeckFooter company={data.company} date={date} /> })
  return (
    <>
      <DocumentCover data={data} pages={pages} />
      {slides.map((s, i) => {
        const section = sectionOfSlide(data, s.keys[0])
        if (section) {
          return (
            <Slide key={section.id} title={section.title} chrome={chrome(section.title)} page={i + 2} pages={pages} layout="single">
              <SectionBody section={section} data={data} />
            </Slide>
          )
        }
        const page = data.pages.find((p) => p.id === s.keys[0])
        if (!page) return null
        const title = page.kind === 'finding' ? `Finding ${page.meta?.n ?? ''}` : page.kind === 'competitor' ? 'Competitor' : page.title
        return (
          <Slide key={page.id} title={title} chrome={chrome(page.title)} page={i + 2} pages={pages} layout="single">
            <PageBody page={page} data={data} />
          </Slide>
        )
      })}
    </>
  )
}
