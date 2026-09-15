import { proportionDelta, SHARE_BAND, type BandOptions } from '../report-bands'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, isRivalAudience, rivalKey, rivalNameOf } from '../rivals'
import type { AttentionRow } from './attention'
import { monthStartOf, nextMonth } from './monthly'
import type { PlatformMix } from './types'
import { bandVerdict, type Verdict, type VerdictFlag } from './verdicts'

// Banded standings, on two denominators (design item 11, CO2).
//
// WHAT THE PRODUCT HAS TODAY, SO THE SIZE OF THIS IS CLEAR. lib/pages/competitive
// .ts:365-370 builds `{name, pct, videos, delta}` where `pct` is
// `run_summary.share_of_voice[bucket].pct_videos` — ONE denominator, the share
// of tracked videos — and `delta` is a raw subtraction of two such percentages
// with no n and no band anywhere. The render then suppresses the delta entirely
// (`shareDeltaShown('all updates')` is false while the run-indexed direction
// words are gated). So item 11 is not "add a second denominator to the
// standings": it is build banded standings, and give them two denominators.
//
// THE TWO DENOMINATORS, AND WHY BOTH. The CONTENT share is each brand's share
// of the panel's videos in the month — how much they posted. The ATTENTION
// share is their share of the panel's comments — how much was said back.
// Measured on Össur's August 2026 panel, Ottobock holds 13.6% of the content
// and 0.6% of the attention. One number without the other is the wrong story
// either way round.
//
// WHERE THE BAND TAKES ITS n, AND WHY IT IS NOT THE COMMENT COUNT. Both shares
// go through `proportionDelta` with `SHARE_BAND`, and on BOTH the n is the
// month's panel VIDEO count. On the content share that is the natural
// denominator. On the attention share the printed proportion is comments over
// comments, but the band is drawn on videos on purpose: comments are not
// independent draws — a thread's replies are one conversation, and one post
// going viral moves thousands of them at once — so a band computed on 2,145
// comments would be about eight times narrower than the evidence deserves when
// those comments sit on 145 posts. `Verdict.value` still carries the comment
// k and n, so the number a reader sees is the number they can check; the
// video count the band was drawn on rides beside it as `bandN`.
//
// RIVALS COME FROM `competitors`, NEVER FROM `period_share_of_voice`. A rival
// that posted nothing this month has no key in that map at all, and a standings
// table built from the map's keys silently drops it — which is exactly how
// Patagonia and Topo Designs vanished from Sealand's whole corpus between the
// 2026-09-09 and 2026-09-10 runs with no record anywhere. A tracked rival with
// no row is a row that says NOT OBSERVED, and that is never the same as 0%.
//
// ── The run_summary.period_* layer, catalogued and left in place ──────────────
// The design retires the per-run "this update" layer in favour of this monthly
// reading. It is not a cutover: measured on this branch (2026-09-18), the
// period_* columns are read in NINE modules and two component trees, and each
// one belongs to a surface that re-bases in its own work package (WP11 the
// Overview, WP14 Market and Competitive, WP17 the weekly report).
//
//   lib/pages/competitive.ts:44,180,238,239,244   the standings + face-off source
//   lib/competitive-tiles.ts:286,288,289          shareSeries' per-point layer
//   lib/competitive-tiles.ts:26-28                shareDeltaShown, the render gate
//   lib/pages/dashboard.ts:42-48,188,314-323,352-354,444
//                                                 the strip, the ring, the funnel
//   lib/dashboard-tiles.ts:150-155,200-212        HistoryRow + movement()
//   lib/report-delta.ts:40-53,135-136,240,258-260,288-290
//                                                 the weekly email's delta block
//   lib/reports/documents/signals.ts:183,231,245-246   document signal figures
//   lib/email/subject.ts:6, components/email/delta-block.tsx:27
//                                                 the sent subject and its block
//   lib/config.ts:1361                            the fallback window's period arm
//   components/pages/competitive/index.tsx:80-137,214 and components/email/tiles.tsx
//                                                 the rendered layer word
//
// Nothing here reads any of them. Each retires as its surface re-bases, and
// until then the two layers answer two different questions: period_* is
// (this run's run_id) AND (upload_date >= the window's start), an upload-dated
// run-membership slice, while this reading is comment-dated over every analysed
// video regardless of run. They can never agree and neither is wrong — which is
// the sharper reason to retire the first one than "its window rolls from
// today", a criticism that has been stale since the window was frozen at
// open-run (lib/pipeline/window.ts).

/** What a standings row is about. */
export type StandingRole = 'client' | 'rival' | 'category'

export interface StandingShare {
  k: number
  n: number
  /** Null when there is no denominator at all — never 0%. */
  pct: number | null
}

export interface StandingRow {
  audience: string
  /** What a reader is shown. Never a key. */
  label: string
  role: StandingRole
  /** False when the panel holds nothing for this brand this month. The row is
   *  still drawn — a tracked rival that went quiet is a finding — and every
   *  figure on it is null rather than 0. */
  observed: boolean
  /** Share of the month's panel videos. */
  content: StandingShare | null
  /** Share of the month's panel comments. */
  attention: StandingShare | null
  /** Did either share move against the month before? Null when there is no
   *  previous month to compare with. */
  contentVerdict: Verdict | null
  attentionVerdict: Verdict | null
  /** The video count both bands were drawn on — see the head of this file. */
  bandN: number
  platformMix: PlatformMix
  /** For the client's row only: videos of theirs that also name a tracked
   *  rival. 0 by construction on every other audience, because the precedence
   *  rule files a video naming both under the client alone. */
  dualMention: number | null
  /** The panel this row was read over. Two rows may only be compared where
   *  these are equal. */
  panelId: string | null
}

const round1 = (n: number): number => Math.round(n * 10) / 10

const shareOf = (k: number, n: number): StandingShare => ({ k, n, pct: n > 0 ? round1((k / n) * 100) : null })

export interface StandingsInput {
  month: string
  /** This month's rows, one per audience, off `month_audience_stats`. */
  rows: readonly AttentionRow[]
  /** Last month's, for the comparison. Omitted, no verdict is drawn. */
  prevRows?: readonly AttentionRow[]
  prevMonth?: string | null
  /** The tenant's rivals, from `competitors` — including retired ones the
   *  caller still wants drawn. Order is the order they are shown in. */
  rivals: readonly { name: string }[]
  /** What the client's own row is called. */
  clientLabel: string
  /** What the category row is called; omitted, it is not drawn. */
  categoryLabel?: string | null
  /** `month_denominators.dual_mention` for the client audience this month. */
  dualMention?: number | null
  panelId?: string | null
  prevPanelId?: string | null
  floor?: BandOptions
  flags?: VerdictFlag[]
}

/**
 * The standings: one row per brand, two shares each, both banded.
 *
 * A verdict is drawn only when both months were read over the SAME panel. A
 * re-freeze changes which accounts the shares are shares of, so the two sides
 * are two measurements — the same reason a rename refuses a comparison, and it
 * is recorded the same way, as `refused` with the counts still printed.
 */
export function buildStandings(input: StandingsInput): StandingRow[] {
  const floor = input.floor ?? SHARE_BAND
  const byAudience = new Map(input.rows.map((r) => [r.audience, r]))
  const prevByAudience = new Map((input.prevRows ?? []).map((r) => [r.audience, r]))

  const videos = input.rows.reduce((s, r) => s + r.panel_videos, 0)
  const comments = input.rows.reduce((s, r) => s + r.attention_comments, 0)
  const prevVideos = (input.prevRows ?? []).reduce((s, r) => s + r.panel_videos, 0)
  const prevComments = (input.prevRows ?? []).reduce((s, r) => s + r.attention_comments, 0)

  const wanted: { audience: string; label: string; role: StandingRole }[] = [
    { audience: CLIENT_AUDIENCE, label: input.clientLabel, role: 'client' },
    ...input.rivals.map((r) => ({ audience: rivalKey(r.name), label: r.name, role: 'rival' as const })),
    ...(input.categoryLabel ? [{ audience: INDUSTRY_AUDIENCE, label: input.categoryLabel, role: 'category' as const }] : []),
  ]
  // An audience the panel saw that nobody asked for — a rival dropped from the
  // tracked list whose videos are still in the corpus, most often. It is drawn
  // after the wanted ones rather than dropped: the number exists and hiding it
  // would make the shares on this table not add up to what the panel holds.
  for (const row of input.rows) {
    if (wanted.some((w) => w.audience === row.audience)) continue
    wanted.push({
      audience: row.audience,
      label: rivalNameOf(row.audience) ?? row.audience,
      role: isRivalAudience(row.audience) ? 'rival' : 'category',
    })
  }

  const window = { kind: 'month' as const, from: monthStartOf(input.month), to: nextMonth(input.month) }
  const basis = input.prevMonth
    ? { from: monthStartOf(input.prevMonth), to: nextMonth(input.prevMonth) }
    : undefined
  const samePanel = input.panelId != null && input.prevPanelId != null && input.panelId === input.prevPanelId
  const panelRefused = input.prevRows != null && input.panelId != null && input.prevPanelId != null && !samePanel

  return wanted.map(({ audience, label, role }) => {
    const row = byAudience.get(audience)
    const prev = prevByAudience.get(audience)
    const observed = row != null
    const content = observed ? shareOf(row.panel_videos, videos) : null
    const attention = observed ? shareOf(row.attention_comments, comments) : null

    const canCompare = observed && prev != null && basis != null && (input.prevRows?.length ?? 0) > 0
    const flags = input.flags ?? []

    const contentVerdict = canCompare
      ? bandVerdict({
          objectKind: role === 'rival' ? 'rival' : 'audience',
          objectId: audience,
          objectLabel: label,
          audience,
          window,
          basis,
          value: { k: row.panel_videos, n: videos },
          baseline: { k: prev.panel_videos, n: prevVideos },
          floor,
          flags,
          ...(panelRefused ? { refused: 'tracking_change' as const } : {}),
        })
      : null

    // The attention verdict is built by hand rather than through `bandVerdict`,
    // because its proportion and its band take their n from two different
    // counts — the comments for the share a reader is shown, the videos for the
    // band. See the head of this file.
    let attentionVerdict: Verdict | null = null
    if (canCompare) {
      const base: Verdict = {
        objectKind: role === 'rival' ? 'rival' : 'audience',
        objectId: audience,
        objectLabel: label,
        audience,
        window,
        basis,
        value: { k: row.attention_comments, n: comments },
        baseline: { k: prev.attention_comments, n: prevComments },
        changePts: null,
        bandPts: null,
        state: 'too_little_data',
        flags,
      }
      if (panelRefused) {
        attentionVerdict = { ...base, state: 'refused', refusedReason: 'tracking_change' }
      } else {
        const delta = proportionDelta(
          {
            nowPct: comments > 0 ? (row.attention_comments / comments) * 100 : 0,
            prevPct: prevComments > 0 ? (prev.attention_comments / prevComments) * 100 : 0,
            nowN: videos,
            prevN: prevVideos,
            nowK: row.panel_videos,
            prevK: prev.panel_videos,
          },
          floor,
        )
        attentionVerdict = { ...base, changePts: delta.change, bandPts: delta.band, state: delta.state }
      }
    }

    return {
      audience,
      label,
      role,
      observed,
      content,
      attention,
      contentVerdict,
      attentionVerdict,
      bandN: videos,
      platformMix: row?.panel_platform_mix ?? {},
      dualMention: role === 'client' ? (input.dualMention ?? null) : null,
      panelId: input.panelId ?? null,
    }
  })
}

/** The sentence a not-observed row prints instead of a number. One place, so a
 *  zero never leaks onto a standings table. */
export const NOT_OBSERVED = 'not observed'

/** What a standings cell shows: the figure, or the words. Calibrated copy —
 *  "not observed" says we looked and found nothing, which is what happened; "0%"
 *  would say the brand was silent, which we do not know. */
export function standingText(share: StandingShare | null): string {
  if (share == null || share.pct == null) return NOT_OBSERVED
  return `${share.pct}%`
}
