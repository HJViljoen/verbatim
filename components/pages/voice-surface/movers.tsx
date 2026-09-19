import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, BlockContext, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { TileColumns } from '@/components/shell/page-grid'
import { DirectionWord } from '@/components/pages/overview/subjects'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { Mover } from '@/lib/pages/overview'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { earnedDirection, moversCoda, voiceSurfaceHref } from '@/lib/pages/voice-surface'

// VO2 · What moved (design §3 VO2; ported to the artboard, Block D wave 2).
//
// ONE AXIS, AND THAT IS THE WHOLE POINT OF THE BLOCK. The old Voice tile
// grouped rows under "Gaining and fading" off a per-update score, and a row
// could sit under *gaining* showing a minus. Here a row's arm is decided by
// its VERDICT and by nothing else: `moved` with a positive change is growing,
// `moved` with a negative one is fading, `no_clear_change` is flat, and a
// reading with no comparison at all is neither — it appears as *new*, a flag
// on a level, because a theme's first month has no baseline to be banded
// against. *Gone quiet* is the registry's own dormancy rule, not a reading of
// this month.
//
// THE SAME COMPONENT AT THREE LENGTHS. Three rows on OV3, six here, ten with
// the list expanded — the design's own words. The length is data (`shown`),
// the row is this file, and the pure ranking is `splitMovers` / `flatMovers`,
// so a reviewer reads one rule rather than three.
//
// NO HEADING SAYS A DIRECTION WORD. "Growing" over a group of rows makes the
// claim before any row has earned it, and rule (c) of the copy contract
// refuses a direction word outside a node carrying a band — which caught this
// block twice while it was written: "upward", "downward" and "gone quiet" are
// all on the product's own list. So the arms are named for what was done to
// the number ("cleared their band · a larger share than last month") and every
// word that IS a direction — the row's verdict, its three-month word, "first
// heard this month", "gone quiet" — sits inside a node marked as the reading
// it came from. The artboard's own "Growing" / "Fading" headings are the one
// element of this block that is deliberately not ported, and this paragraph is
// the reason.
//
// THE ARTBOARD'S GEOMETRY *IS* PORTED, and it is the point of the block.
// Growing and fading are two readings of ONE axis, so they belong side by side
// with a rule between them — `TileColumns({ of: 2 })`, which is exactly the
// case that primitive rules. Stacked, as this block was, the fading arm began
// below the fold and a reader compared two lists by scrolling. Each row is the
// mock's two lines: the name with the change at the right of the first, the
// level with its counts and the previous month on the second, the earned
// direction word as a quiet pill at that line's right-hand end.
//
// AND THE PREVIOUS MONTH IS FINALLY PRINTED. `Mover.verdict.baseline` has
// carried the other side's k and n since WP3 and nothing rendered it: a row
// said "▲ 2.6 pts" with no way to see what it moved FROM. It prints with its
// own denominator ("Aug 6.8% of 1,200") rather than as the mock's bare "Aug
// 6.8%", because the two months have different denominators — that is the
// whole reason the change is banded — and a share with no population is the
// score this product does not show.

/** How many rows an arm keeps at a given length — every arm, including the two
 *  flag lists. `goneQuiet` is not a `Mover` (it is a registry row with a last
 *  month), which is the only reason it was ever unbounded. */
const arm = <T,>(rows: readonly T[], shown: number): T[] => rows.slice(0, shown)

/** "Aug 6.8% of 1,200" — the side this row moved FROM, with its own n. */
function baselineOf(mover: Mover): string | null {
  const b = mover.verdict.baseline
  const from = mover.verdict.basis?.from
  if (!b || b.n == null || b.n <= 0 || b.k == null || !from) return null
  return `${monthName(from).slice(0, 3)} ${fmtPct((b.k / b.n) * 100)} of ${fmtInt(b.n)}`
}

// A row of one arm. THERE IS NO LEVEL-ONLY VARIANT ANY MORE: a newcomer has no
// baseline to be banded against, and it is rendered by `Flag` in the mock's one
// tinted flags row rather than as a row of a banded arm. The `level` prop that
// drew it here lost its last caller in the port and stayed behind with a branch
// nothing could reach and a test asserting the absence of a string nothing
// printed.
function MoverRow({ mover, mode, ctx }: {
  mover: Mover
  mode: RenderMode
  ctx: BlockContext
}) {
  const href = `${ctx.appUrl}${voiceSurfaceHref((ctx.params ?? {}) as Record<string, string>, { theme: mover.id })}`
  // THE THEME'S OWN NAME IS THE MODEL'S WORDS (`pass_b_theme` policy 'none',
  // lib/prose/scrub.ts) — never direction-scrubbed at write time, so it is
  // marked here for the same reason a theme's description is.
  const name = mode === 'email'
    ? <span data-copy="subject" data-slot="pass_b_theme" style={{ fontWeight: 600 }}>{mover.label}</span>
    : <Link data-copy="subject" data-slot="pass_b_theme" href={href} className="min-w-0 flex-1 truncate text-[12.5px] underline-offset-2 hover:underline">{mover.label}</Link>
  const baseline = baselineOf(mover)
  const counts = (
    <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono text-[11px] tabular-nums text-muted-foreground'}>
      {mover.pct == null ? '—' : fmtPct(mover.pct)} · {fmtInt(mover.k)} of {fmtInt(mover.n)}{baseline ? ` · ${baseline}` : ''}
    </span>
  )

  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' }}>
        {name} {counts}{' '}
        <BlockMovement verdict={mover.verdict} unit="pts" mode={mode} /> <DirectionWord direction={earnedDirection(mover.direction)} mode={mode} />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-t border-border/70 py-1.5">
      <div className="flex items-baseline gap-2.5">
        {name}
        <span className="flex-none whitespace-nowrap"><BlockMovement verdict={mover.verdict} unit="pts" mode={mode} /></span>
      </div>
      <div className="flex items-center gap-2">
        {counts}
        <span className="ml-auto flex-none">
          {earnedDirection(mover.direction) ? (
            // The mock's grey pill, carrying the word the product actually
            // earned — three consecutive readings in one clustering regime —
            // and never the mock's ordinal "3rd month" (D5).
            //
            // `earnedDirection`, NOT TRUTHINESS. `directionWord` answers
            // 'flat' for "three readings exist and do not agree", which is the
            // absence of a direction; gated on `mover.direction ?` this pill
            // printed "flat, 3 months" beside a badge reading "no clear
            // change", and once `DirectionWord` filters it (main's M4) the
            // same gate would leave an empty grey pill standing here instead.
            <span className="inline-block rounded-full bg-inner px-2 py-0.5 text-[12px] font-medium"><DirectionWord direction={earnedDirection(mover.direction)} mode={mode} /></span>
          ) : null}
        </span>
      </div>
    </div>
  )
}

/** One arm of the axis, with its count. Absent arms are absent — an arm with a
 *  heading and no rows is furniture. */
function Arm({ label, rows, mode, ctx }: {
  label: string
  rows: readonly Mover[]
  mode: RenderMode
  ctx: BlockContext
}) {
  if (rows.length === 0) return null
  if (mode === 'email') {
    return (
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>
          {label} · {fmtInt(rows.length)} {rows.length === 1 ? 'theme' : 'themes'}
        </div>
        {rows.map((m) => <MoverRow key={m.id} mover={m} mode={mode} ctx={ctx} />)}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between gap-2 pb-1">
        {/* A HEADING, NOT A STYLED SPAN: the arms are the sections of this
            block and heading navigation could not reach them. */}
        <h3 className="m-0 min-w-0 text-[12px] font-semibold text-foreground">{label}</h3>
        {/* AND THE COUNT CARRIES ITS NOUN. A bare "2" at the far right of a
            sixty-character heading reads as a step number; the artboard pairs
            the numeral with a word. */}
        <span data-copy="figure" className="flex-none whitespace-nowrap font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {fmtInt(rows.length)} {rows.length === 1 ? 'theme' : 'themes'}
        </span>
      </div>
      {rows.map((m) => <MoverRow key={m.id} mover={m} mode={mode} ctx={ctx} />)}
    </div>
  )
}

/** The mock's flags row: one tinted block, two columns, a chip apiece. */
function Flag({ chip, tone, label, note, mode }: {
  chip: ReactNode
  tone: 'new' | 'quiet'
  label: string
  note: ReactNode
  mode: RenderMode
}) {
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' }}>
        {chip} <span data-copy="subject" data-slot="pass_b_theme">{label}</span> {note}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`flex-none rounded-full px-2 py-0.5 text-[12px] ${tone === 'new' ? 'bg-warning/20 font-semibold text-foreground' : 'bg-tile font-medium text-muted-foreground ring-1 ring-border'}`}>
          {chip}
        </span>
        <span data-copy="subject" data-slot="pass_b_theme" className="min-w-0 truncate text-[12.5px]">{label}</span>
      </div>
      <span className="min-w-0 font-mono text-[11px] tabular-nums text-muted-foreground">{note}</span>
    </div>
  )
}

export const voiceMovers: Block<VoiceSurfaceData> = {
  key: 'voice.moved',
  // THE TITLE NAMES NO AUDIENCE, because the block does not choose one. The
  // artboard was drawn in the category and its heading — "Movers · category
  // themes" — was ported as a constant onto a block whose whole scope is the
  // audience switch one tile above. Rendered with the client's own brand
  // selected it printed "Movers · category themes" directly above
  // "share of 212 videos in this audience · Sep 2026 vs Aug 2026": a label
  // contradicting the figure beside it, on every audience but one. The scope
  // travels on `meta`, where it is read off the data, and the heading says
  // what the block is.
  title: 'Movers',
  question: 'What is this audience saying more of, and less of, than last month?',

  render(data, mode = 'app', ctx) {
    const m = data.movers
    const email = mode === 'email'
    const empty = voiceMovers.emptyState(data)
    const banded = m.growing.length + m.fading.length
    const both = m.growing.length > 0 && m.fading.length > 0
    const coda = moversCoda({ growing: m.growing.length, fading: m.fading.length, shown: m.shown, any: banded > 0 })
    const of = data.audience.videos != null
      // NOT "share of 1,388 the category videos": an audience's prose label
      // carries its own article and inlining it into a count makes one. The
      // audience is named on its own selected pill one block above.
      ? `share of ${fmtInt(data.audience.videos)} videos in this audience · ${monthName(data.month)} vs ${monthName(prevOf(data.month))}`
      : undefined

    return (
      <BlockFrame
        title={voiceMovers.title}
        question={voiceMovers.question}
        mode={mode}
        meta={of}
        // THE CODA IS THE FOOTER'S LEFT HALF, beside a POPULATED list, which is
        // where the mock puts it and where the build never printed it: it fired
        // only as the whole block's empty state. It is true only while every
        // banded row is on the page, and `moversCoda` is what decides that.
        footer={coda}
        footerNote={email ? null : (
          <Link href={m.expandHref} className="hover:underline">
            {m.expanded ? 'Show fewer' : `Show ${fmtInt(10)} of each →`}
          </Link>
        )}
      >
        {empty ? (
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        ) : (
          <div className={email ? undefined : 'flex flex-col gap-2.5'}>
            {/* NOT "Growing" and "Fading" as headings — see the file header.
                The arm names what was done to the number; the row carries the
                word, inside the node that holds the band. */}
            {/* TWO COLUMNS ONLY WHERE THERE ARE TWO ARMS. With one of them
                empty — which is the state Össur's September is in — the grid
                drew an empty half and ruled a hairline down the middle of it,
                against nothing. An arm with no rows is absent, and the arm that
                is left keeps the column width it would have had. */}
            {email || !both ? (
              <div className={email ? undefined : 'xl:w-1/2 xl:pr-6'}>
                <Arm label="Cleared their band · a larger share than last month" rows={arm(m.growing, m.shown)} mode={mode} ctx={ctx} />
                <Arm label="Cleared their band · a smaller share than last month" rows={arm(m.fading, m.shown)} mode={mode} ctx={ctx} />
              </div>
            ) : (
              <TileColumns of={2}>
                <div className="min-w-0 xl:pr-6">
                  <Arm label="Cleared their band · a larger share than last month" rows={arm(m.growing, m.shown)} mode={mode} ctx={ctx} />
                </div>
                <div className="min-w-0 xl:pl-6">
                  <Arm label="Cleared their band · a smaller share than last month" rows={arm(m.fading, m.shown)} mode={mode} ctx={ctx} />
                </div>
              </TileColumns>
            )}
            {/* THE THIRD ARM KEEPS THE COLUMN WIDTH OF THE TWO ABOVE IT. It
                has no opposite — the artboard has no "inside the band" arm at
                all — so it is not a second column; run full width, its badges
                sit a foot away from the counts they belong to.

                AND THE COMPARISON HAS TO BE SEEN TO END. At the same width,
                directly under "a larger share than last month", with the
                two-column rule stopping just above it, a scan reads "Airline
                carry-on fit · no clear change" as a row of the larger-share
                arm — the one reading this block exists to keep apart from the
                other two. The rule runs the FULL width of the block, across
                both columns, so it is the boundary of the comparison and not a
                divider inside one column of it. */}
            {m.flat.length > 0 && !email ? <div className="border-t border-border/70" /> : null}
            <div className={email ? undefined : 'xl:w-1/2 xl:pr-6'}>
              <Arm label="Inside the band" rows={arm(m.flat, m.shown)} mode={mode} ctx={ctx} />
            </div>

            {/* ONE FLAGS ROW, the mock's, rather than two more arms: neither
                flag is a reading of this month's change, so neither belongs in
                the banded list above, and neither is long enough to be a list
                of its own. */}
            {m.newcomers.length > 0 || m.goneQuiet.length > 0 ? (
              <div className={email ? undefined : 'grid grid-cols-1 gap-x-6 gap-y-2 rounded bg-inner px-3 py-2.5 xl:grid-cols-2'}>
                {arm(m.newcomers, m.shown).map((n) => (
                  <Flag
                    key={n.id}
                    mode={mode}
                    tone="new"
                    // "New" is a direction word (lib/calibration.ts), framed —
                    // so the chip is a verdict node, exactly as the sentence it
                    // replaces was. What it flags is a LEVEL: a first month has
                    // no baseline, so no change is drawn beside it.
                    chip={<span data-copy="verdict">New</span>}
                    label={n.label}
                    note={<>
                      <span data-copy="figure">{n.pct == null ? '—' : fmtPct(n.pct)} · {fmtInt(n.k)} of {fmtInt(n.n)}</span>{' '}
                      <span data-copy="verdict">first heard {monthName(data.month)}</span>
                    </>}
                  />
                ))}
                {arm(m.goneQuiet, m.shown).map((g) => (
                  <Flag
                    key={g.id}
                    mode={mode}
                    tone="quiet"
                    // THE FLAG IS A READING AND IS MARKED AS ONE. "Gone quiet"
                    // is a direction word (lib/calibration.ts) and rule (c)
                    // lets it appear only inside a verdict node — which is
                    // right, because it IS earned: the registry's own dormancy
                    // rule, fired over updates that actually produced theme
                    // observations, not an absence this page noticed.
                    chip={<span data-copy="verdict">Gone quiet</span>}
                    label={g.label}
                    note={<span data-copy="verdict">{g.lastHeard ? `last heard ${monthName(g.lastHeard)}` : 'not heard this month'}</span>}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
        {/* The re-read caveat, said ONCE for the list and never once per row
            (the run-of-months rule, WP10). It is about the record, not about
            any one theme. */}
        {m.rereadNote ? (
          <p className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 6 } : undefined}>
            {m.rereadNote}
          </p>
        ) : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    // The two rows a reader looks at first, and nothing more: a block that
    // declared every row would spend the page's whole number budget on one
    // list. The rest are on the page and are readable; they are not figures a
    // model may cite about what moved.
    const lead = [...data.movers.growing, ...data.movers.fading]
      .sort((a, b) => Math.abs(b.verdict.changePts ?? 0) - Math.abs(a.verdict.changePts ?? 0))
      .slice(0, 2)
    for (const m of lead) {
      if (m.pct == null) continue
      const token = `moved_${m.id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_share`
      out[token] = { value: m.pct, unit: 'pct', label: `${m.label}, share of this audience's month` }
    }
    return out
  },

  verdicts(data): Verdict[] {
    const m = data.movers
    return [...m.growing, ...m.fading, ...m.flat, ...m.newcomers].map((x) => x.verdict)
  },

  emptyState(data) {
    const m = data.movers
    const any = m.growing.length + m.fading.length + m.flat.length + m.newcomers.length + m.goneQuiet.length
    return any === 0 ? m.note ?? 'Nothing moved clearly this month.' : null
  },
}

/** The month before this one, for the block's own meta line. */
function prevOf(month: string): string {
  const d = new Date(`${month}T00:00:00.000Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

// MOVER_LENGTHS and renderMoverRow were here and are gone: nothing outside a
// test read either. The three lengths live where they are used — MOVERS_HERE
// and MOVERS_EXPANDED in lib/pages/voice-surface.ts, and OV3's own three in
// lib/pages/overview.ts — and the row is this file's private component.
