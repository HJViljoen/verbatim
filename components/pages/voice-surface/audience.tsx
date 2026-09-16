import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { fmtInt, fmtPct } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { AudienceOption, VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { audienceFigures } from '@/lib/pages/voice-surface'

// VO1 · Audience and kind (design §3 VO1).
//
// THE PAGE'S SCOPE, PRINTED AS ITS OWN BLOCK. Everything under this one obeys
// the audience, the kind and the platform chosen here, so the choice is a
// reading rather than a control: each option carries the count it would leave,
// and an audience too thin to read is shown WITH its count and marked, never
// hidden. Both tenants' own brands carry that mark today — Össur reads 19
// videos in September and Sealand 3 — and a switch that hid them would hide
// the most important fact about them.
//
// THE AUDIENCE IS A FILTER; THE PLATFORM AND THE KIND ARE NOT. The audience
// switch is a link because the selection lives in the URL, where it can be
// shared, opened in a second tab and frozen into an export's params (the
// horizon control's own rule, WP9). The platform pills were links too, and
// they narrowed `audience.videos` and nothing else — Sealand ?platform=tiktok
// printed "146 videos · 9,397 comments" above rows reading "48 of 437" — and
// the kind pills narrowed the ladder to the row a reader had just clicked. The
// same rule that makes the audience a link deletes those two: this product
// does not print controls that do not work. The platform mix is printed as
// what it is, a reading of the month.

/** One pill in the audience switch. The count is on the pill, not in a
 *  tooltip: an audience is chosen by how much of the month it holds. */
function AudiencePill({ option, mode }: { option: AudienceOption; mode: RenderMode }) {
  const count = option.observed
    ? <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono tabular-nums'}>{fmtInt(option.videos ?? 0)}</span>
    : <span className={mode === 'email' ? undefined : 'text-muted-foreground'}>not observed</span>
  const body = (
    <>
      {option.label} {count}
      {option.thin && option.observed ? (
        <span className={mode === 'email' ? undefined : 'text-[10.5px] text-muted-foreground'} style={mode === 'email' ? { color: EMAIL.muted } : undefined}>
          {' '}· too thin to compare
        </span>
      ) : null}
      {option.retiredAt ? (
        <span className={mode === 'email' ? undefined : 'text-[10.5px] text-muted-foreground'} style={mode === 'email' ? { color: EMAIL.muted } : undefined}>
          {' '}· was tracked, stopped {option.retiredAt.slice(0, 10)}
        </span>
      ) : null}
    </>
  )
  if (mode === 'email') {
    return (
      <span style={{ fontFamily: FONT.sans, fontSize: 12, color: option.selected ? EMAIL.ink : EMAIL.muted, marginRight: 10 }}>
        {body}
      </span>
    )
  }
  return (
    <Link
      href={option.href}
      aria-current={option.selected ? 'true' : undefined}
      className={`rounded-full border px-2.5 py-0.5 text-[12px] ${option.selected ? 'border-foreground/40 bg-secondary font-medium' : 'border-border/70 text-muted-foreground hover:border-foreground/30'}`}
    >
      {body}
    </Link>
  )
}

/** One line of the block, with its own heading — so a line that is absent is
 *  visibly absent rather than silently missing. */
function Line({ label, mode, children }: { label: string; mode: RenderMode; children: ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{label}</div>
        <div style={{ marginTop: 2 }}>{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export const voiceAudience: Block<VoiceSurfaceData> = {
  key: 'voice.audience',
  title: 'Whose audience, and what kind of thing',
  question: 'Whose conversation is this, and what are they doing in it?',

  render(data, mode = 'app', ctx) {
    const a = data.audience
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/competitive`

    const kinds = a.kinds.length > 0 ? (
      <div className={email ? undefined : 'flex flex-wrap items-center gap-x-5 gap-y-1.5'}>
        {a.kinds.map((k) => (
          <span key={k.kind} className={email ? undefined : 'flex items-center gap-1.5 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginRight: 10 } : undefined}>
            {k.label}{' '}
            <span data-copy="figure" className={email ? undefined : 'font-mono tabular-nums'}>
              {k.pct == null ? '—' : fmtPct(k.pct)} {fmtInt(k.videos)} of {fmtInt(k.denominator)}
            </span>
            <BlockMovement verdict={a.kindVerdicts[k.kind] ?? null} unit="pts" mode={mode} />
          </span>
        ))}
      </div>
    ) : (
      <BlockEmpty mode={mode}>{a.kindsNote ?? 'No kind carried a reading this month.'}</BlockEmpty>
    )

    return (
      <BlockFrame
        title={voiceAudience.title}
        question={voiceAudience.question}
        mode={mode}
        meta={a.videos != null ? `${fmtInt(a.videos)} videos · ${fmtInt(a.comments ?? 0)} comments` : undefined}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Competitive →</a>
          : <Link href={href} className="hover:underline">Compare the audiences on Competitive →</Link>}
      >
        <div className={email ? undefined : 'flex flex-col gap-3'}>
          <Line label="Audience" mode={mode}>
            <div className={email ? undefined : 'flex flex-wrap items-center gap-1.5'}>
              {a.options.map((o) => <AudiencePill key={o.audience} option={o} mode={mode} />)}
            </div>
          </Line>

          {a.platformMix.length > 0 ? (
            <Line label="Where it was said" mode={mode}>
              {/* A PLATFORM THE MONTH DID NOT CARRY IS ABSENT, not a 0% row.
                  Össur's own brand read no Reddit thread at all in September,
                  and "Reddit 0" would be a reading of a platform nobody
                  posted on. */}
              <div className={email ? undefined : 'flex flex-wrap items-center gap-x-4 gap-y-1'}>
                {a.platformMix.map((p) => (
                  <span key={p.platform} className={email ? undefined : 'text-[12px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, marginRight: 10 } : undefined}>
                    {p.label}{' '}
                    <span data-copy="figure" className={email ? undefined : 'font-mono tabular-nums'}>
                      {p.pct == null ? '—' : fmtPct(p.pct)} {fmtInt(p.videos)}
                    </span>
                  </span>
                ))}
              </div>
            </Line>
          ) : null}

          <Line label="Kind of thing said" mode={mode}>
            {kinds}
            {a.reddit && a.reddit.pct != null ? (
              <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
                Reddit carried <span data-copy="figure">{fmtInt(a.reddit.reddit)} of {fmtInt(a.reddit.videos)}</span> of the question-and-objection videos
                {a.reddit.exact ? '' : ' (a video carrying both is counted in each)'}.
              </p>
            ) : null}
          </Line>

          <Line label="Argued, not just said" mode={mode}>
            {a.replies ? (
              <p className={email ? undefined : 'm-0 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
                <span data-copy="figure">{a.replies.pct == null ? '—' : fmtPct(a.replies.pct)}</span> of this month’s comments were replies to another comment —{' '}
                {/* THE TRAILING CLAUSE IS SUPPRESSED WHEN IT REPEATS THE NUMBER BEFORE
                    IT. Rendered on production: "7.1% ... - 835 of 11,712, 835
                    of them on Reddit." A reader who does not compare the two
                    digits reads two populations, and the note under this line
                    already says every reply we can see is a Reddit reply. */}
                <span data-copy="figure">{fmtInt(a.replies.replies)} of {fmtInt(a.replies.comments)}</span>{a.replies.reddit != null && a.replies.reddit !== a.replies.replies ? (
                  <>, <span data-copy="figure">{fmtInt(a.replies.reddit)}</span> of them on Reddit</>
                ) : null}.
              </p>
            ) : (
              <BlockEmpty mode={mode}>{a.repliesNote ?? 'How much of this month was argued is not readable here.'}</BlockEmpty>
            )}
            {a.replies && a.repliesNote ? (
              <p className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
                {a.repliesNote}
              </p>
            ) : null}
          </Line>
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return audienceFigures(data.audience)
  },

  verdicts(data): Verdict[] {
    return Object.values(data.audience.kindVerdicts).filter((v): v is Verdict => v != null)
  },

  emptyState(data) {
    const a = data.audience
    if (a.videos == null && a.kinds.length === 0 && !a.replies) {
      return 'Nothing has been read into this month for any audience yet.'
    }
    return null
  },
}
