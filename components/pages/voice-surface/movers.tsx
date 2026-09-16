import Link from 'next/link'
import type { Block, BlockContext, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { DirectionWord } from '@/components/pages/overview/subjects'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { Mover } from '@/lib/pages/overview'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { voiceSurfaceHref } from '@/lib/pages/voice-surface'

// VO2 · What moved (design §3 VO2).
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
// it came from.

/** How many rows an arm keeps at a given length. */
const arm = (rows: readonly Mover[], shown: number): Mover[] => rows.slice(0, shown)

function MoverRow({ mover, mode, ctx, level }: {
  mover: Mover
  mode: RenderMode
  ctx: BlockContext
  /** A level-only row (new): the share is printed, the change is not drawn. */
  level?: boolean
}) {
  const href = `${ctx.appUrl}${voiceSurfaceHref((ctx.params ?? {}) as Record<string, string>, { theme: mover.id })}`
  const name = mode === 'email'
    ? <span style={{ fontWeight: 600 }}>{mover.label}</span>
    : <Link href={href} className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">{mover.label}</Link>
  const body = (
    <>
      {name}
      <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono tabular-nums'}>
        {mover.pct == null ? '—' : fmtPct(mover.pct)} {fmtInt(mover.k)} of {fmtInt(mover.n)}
      </span>
      {level ? (
        <span data-copy="verdict" className={mode === 'email' ? undefined : 'text-[11px] text-muted-foreground'}>first heard this month</span>
      ) : (
        <>
          <BlockMovement verdict={mover.verdict} unit="pts" mode={mode} />
          <DirectionWord direction={mover.direction} mode={mode} />
        </>
      )}
    </>
  )
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' }}>{body}</div>
    : <div className="flex items-center gap-2 text-[12.5px]">{body}</div>
}

/** One arm of the axis, with its count. Absent arms are absent — an arm with a
 *  heading and no rows is furniture. */
function Arm({ label, rows, mode, ctx, level }: {
  label: string
  rows: readonly Mover[]
  mode: RenderMode
  ctx: BlockContext
  level?: boolean
}) {
  if (rows.length === 0) return null
  const head = `${label} · ${fmtInt(rows.length)}`
  if (mode === 'email') {
    return (
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{head}</div>
        {rows.map((m) => <MoverRow key={m.id} mover={m} mode={mode} ctx={ctx} level={level} />)}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{head}</span>
      {rows.map((m) => <MoverRow key={m.id} mover={m} mode={mode} ctx={ctx} level={level} />)}
    </div>
  )
}

export const voiceMovers: Block<VoiceSurfaceData> = {
  key: 'voice.moved',
  title: 'What moved',
  question: 'What is this audience saying more of, and less of, than last month?',

  render(data, mode = 'app', ctx) {
    const m = data.movers
    const email = mode === 'email'
    const empty = voiceMovers.emptyState(data)
    const footer = email
      ? null
      : (
        <Link href={m.expandHref} className="hover:underline">
          {m.expanded ? 'Show fewer' : `Show ${fmtInt(10)} of each →`}
        </Link>
      )

    return (
      <BlockFrame
        title={voiceMovers.title}
        question={voiceMovers.question}
        mode={mode}
        meta={data.audience.videos != null
          ? `${data.audience.label.toLowerCase()} · ${fmtInt(data.audience.videos)} videos · ${monthName(data.month)} against ${monthName(prevOf(data.month))}`
          : undefined}
        footer={footer}
      >
        {empty ? (
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        ) : (
          <div className={email ? undefined : 'flex flex-col gap-3'}>
            {/* NOT "Growing" and "Fading" as headings — see the file header.
                The arm names what was done to the number; the row carries the
                word, inside the node that holds the band. */}
            <Arm label="Cleared their band · a larger share than last month" rows={arm(m.growing, m.shown)} mode={mode} ctx={ctx} />
            <Arm label="Cleared their band · a smaller share than last month" rows={arm(m.fading, m.shown)} mode={mode} ctx={ctx} />
            <Arm label="Inside the band" rows={arm(m.flat, m.shown)} mode={mode} ctx={ctx} />
            <Arm label="First heard this month" rows={arm(m.newcomers, m.shown)} mode={mode} ctx={ctx} level />
            {m.goneQuiet.length > 0 ? (
              <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
                <span className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}>
                  No longer being said · {fmtInt(m.goneQuiet.length)}
                </span>
                {m.goneQuiet.map((g) => (
                  <span key={g.id} className={email ? undefined : 'text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
                    {g.label}{' '}
                    {/* THE FLAG IS A READING AND IS MARKED AS ONE. "Gone
                        quiet" is a direction word (lib/calibration.ts) and
                        rule (c) lets it appear only inside a verdict node —
                        which is right, because it IS earned: the registry's
                        own dormancy rule, fired over updates that actually
                        produced theme observations, not an absence this page
                        noticed. The heading above carries no direction word,
                        because a heading has no reading behind it. */}
                    <span data-copy="verdict" className={email ? undefined : 'text-[11px] text-muted-foreground'} style={email ? { color: EMAIL.muted } : undefined}>
                      gone quiet{g.lastHeard ? ` · last heard ${monthName(g.lastHeard)}` : ''}
                    </span>
                  </span>
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
