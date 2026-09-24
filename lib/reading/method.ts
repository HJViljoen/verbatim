import { fmtInt, fmtPct, fullDate } from '../format'

import { REDDIT_COMMENT_DEPTH_CAP } from '../config'
import { totalPlatformMix, totalVideos, type RecordInputs } from './record'
import type { PlatformMix } from './types'

// The method footnote, composed ONCE (Phase 1 block D, D9).
//
// WHY THIS FILE EXISTS. Every one of the facts below was already computed and
// already printed — and printed in two places out of eleven. `coverageLine`
// (lib/pages/week.ts) composes prepared-by + the platform mix for This week
// alone; `PRIVACY_LINE` has exactly two producers, This week and the monthly
// email; the Reddit cap has never been printed on any reading surface at all
// (`REDDIT_COMMENT_DEPTH_CAP` had no non-pipeline reader); and the read-depth
// and language shares reach a client only through the record drawer. The mock
// draws a method footnote on Subjects, Voice, Competitive, Reports and on three
// of the four briefs. Eight surfaces composing the same five facts eight times
// is how "27% not in English" comes to mean two different things on two pages.
//
// A FIGURE'S BASIS TRAVELS WITH IT (mock-gap §6 D15). Two of these five figures
// are NOT about the window the page is a reading of:
//
//   · read depth is `all_time_non_reddit` BY CONSTRUCTION (`ReadDepthRecord`) —
//     `analyzed_with_*` is a fact about a video and a video belongs to a month
//     through its comments, so there is no such thing as "speech read on 71% of
//     this month". The sentence says so, in the same words `recordLines` uses,
//     and `basis` is the field that carries it;
//   · the language share is about what was said ON CAMERA, not about the
//     comments a reader sees — `LanguageRecord.basis` is `video_speech` until a
//     comment-level language exists. The mock's "27% of this month's videos are
//     not in English" is two errors in one clause: the period and the subject.
//
// Coverage IS the window's, and it is the only one of the five that is, so it
// is the only line that says "in this window".
//
// NOT A RENDERER. This composes strings; which surface prints which of them,
// and in what type, is wave 2's. `lines` is the whole footnote in print order,
// for a caller that just wants the paragraph.

/**
 * Commenters are never identified.
 *
 * DUPLICATED FROM `lib/pages/week.ts` ON PURPOSE, FOR ONE MERGE. This module
 * belongs under `lib/reading` and This week's copy of the constant is inside a
 * page loader that imports Supabase at module scope — importing it here would
 * pull a loader into every document build that wants a footnote. The two are
 * pinned equal by `method.test.ts`, which imports both and asserts they are the
 * same string; when block D's wave merges, week's copy becomes a re-export of
 * this one and the test keeps passing either way.
 */
export const PRIVACY_LINE =
  'Commenters are never identified; quotes carry platform and date only.'

/**
 * The Reddit clause, as a constant, because two surfaces print it.
 *
 * BOTH CLAUSES ARE CHECKED AGAINST THE CODE. The cap is
 * `REDDIT_COMMENT_DEPTH_CAP`, spent in lib/gather/platforms/reddit.ts. The
 * engagement clause is the mock's, and it is true for a reason the mock does
 * not give: `lib/gather/platforms/reddit.ts` writes `engagement_rate: null` on
 * every Reddit post because there are no views to blend, so a Reddit post is in
 * no engagement average anywhere. Saying "excluded from engagement rows"
 * without that reason would read as a policy we could change.
 *
 * Settings › Tracking prints it under the watched-communities table
 * (`settings.reddit.footer`), where a client reading a Reddit post count is the
 * reader who most needs it; the method footnote prints it as one of its lines.
 * One sentence, two places — never two sentences.
 */
export const REDDIT_CAP_LINE =
  `Reddit comments are capped at ${REDDIT_COMMENT_DEPTH_CAP} per thread, and a Reddit post has no views, so it carries no engagement rate and is in no engagement row.`

export interface MethodLines {
  /** "Prepared by Verbatim · 18 Sep 2026" */
  preparedBy: string
  /** "2,359 videos analysed · TikTok 38% · YouTube 29% · Instagram 21% · Reddit 12%" */
  coverage: string
  /** The basis that must travel with the read-depth and language figures. */
  basis: string
  /** "27% of what was said ON CAMERA was not in English" — the stated basis. */
  language: string | null
  /** "Reddit comments are capped at 40 per thread and excluded from engagement rows." */
  redditCap: string
  /** "Commenters are never identified; quotes carry platform and date only." */
  privacy: string
  /** Every line, in print order — what a footnote prints. */
  lines: string[]
}

const share = (k: number, n: number): string => (n > 0 ? fmtPct((k / n) * 100, 0) : '—')

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  reddit: 'Reddit',
}

/**
 * "TikTok 38% · YouTube 29% · Instagram 21% · Reddit 12%" — the mock's mix.
 *
 * NOT `platformMixLine` (lib/reading/record.ts), which prints the same mix as
 * COUNTS ("TikTok 163 · YouTube 212"). Both are wanted: the record drawer
 * states what was read, the footnote states the shape of it. They are two
 * renderings of one number and neither is a second computation — this one
 * divides by the pooled total the same counts sum to.
 *
 * THE DENOMINATOR IS THE MIX'S OWN TOTAL, not the video count printed beside
 * it. They are the same number wherever every video carries a platform, and
 * where they are not — a video stored with no platform — dividing by the video
 * count would make the shares sum to less than 100% with nothing saying why.
 *
 * Largest first, every platform named, ties broken by name so the line is
 * stable render to render.
 */
export function platformShareLine(mix: PlatformMix): string {
  const entries = Object.entries(mix).filter(([, n]) => n > 0)
  const total = entries.reduce((s, [, n]) => s + n, 0)
  if (total === 0) return ''
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([platform, n]) => `${PLATFORM_LABEL[platform] ?? platform} ${share(n, total)}`)
    .join(' · ')
}

export interface MethodOptions {
  /** Overridable for a snapshot that re-renders as at its own reading date
   *  rather than as at now. Defaults to `inputs.readingAt`. */
  readingAt?: string
  /** Who the artefact was prepared for. Absent, the line names Verbatim alone —
   *  a footnote that says "Prepared for  with Verbatim" is worse than one that
   *  does not name the workspace. */
  brand?: string | null
}

/**
 * The one method footnote, from the record the surface already loaded.
 *
 * Every caller has a `RecordInputs` in hand — the five reading surfaces build
 * one for the "how sound is this" band, the quarterly deck builds one for its
 * method page and `lib/reports/documents/load-reading.ts` builds one for every
 * brief — so this costs no read anywhere.
 *
 * Pure.
 */
export function methodLines(inputs: RecordInputs, opts: MethodOptions = {}): MethodLines {
  const readingAt = opts.readingAt ?? inputs.readingAt
  const brand = opts.brand?.trim() || null

  // EVERY ITEM TERMINATES, because `lines` is JOINED WITH A BARE SPACE by its
  // consumers (`overview/record.tsx` renders `{method.join(' ')}`, and so does
  // every other surface that prints the footnote as one paragraph). These two
  // items did not, and the record column read
  // "…with Verbatim · 18 Sep 2026 2,359 videos read in this window · … Reddit
  // 12% Of everything we have ever read…" — two collisions in thirty words, and
  // at 9.5px mono "18 Sep 2026 2,359" is one garbled number. `recordLines`
  // terminates its items, which is why the left column was always clean. A
  // consumer that prints ONE item on its own line (`footerNote={preparedBy}`)
  // gets a full stop, which is what a footnote reads as anyway.
  const preparedBy = `${brand ? `Prepared for ${brand} with Verbatim` : 'Prepared by Verbatim'} · ${fullDate(readingAt)}.`

  // COVERAGE IS THE WINDOW'S, and says so. It is the one figure here that is,
  // and a footnote whose five lines are on three clocks with only one of them
  // labelled is the defect this module was written to end.
  let coverage: string
  if (inputs.coverage == null) {
    coverage = 'How much was read month by month is not recorded for this workspace yet.'
  } else if (inputs.coverage.length === 0) {
    coverage = 'Nothing was read in this window.'
  } else {
    const videos = totalVideos(inputs.coverage)
    const mix = platformShareLine(totalPlatformMix(inputs.coverage))
    coverage = `${fmtInt(videos)} video${videos === 1 ? '' : 's'} read in this window${mix ? ` · ${mix}` : ''}.`
  }

  const r = inputs.readDepth
  const basis = r.analysed > 0
    // THE SAME SENTENCE `recordLines` PRINTS, deliberately word for word. The
    // record drawer and the footnote are read on one page by one reader; two
    // wordings of one share is how a reader comes to believe they are two
    // measures.
    ? `Of everything we have ever read for you, not just this window, speech was read on ${share(r.speech, r.analysed)} of ${fmtInt(r.analysed)} videos, translated on ${share(r.translated, r.analysed)}, and on-screen text read on ${share(r.onScreenText, r.analysed)} — Reddit excluded, which has neither audio nor a cover frame.`
    : 'How much of each video we managed to read is not recorded yet.'

  const lang = inputs.language
  const known = lang.english + lang.notEnglish
  const language = lang.analysed === 0 || known === 0
    ? null
    // "ON CAMERA" IS THE BASIS, not an emphasis. `LanguageRecord.basis` is
    // `video_speech`: this share is about what was SAID in videos and says
    // nothing about the language a comment was written in. The mock prints it
    // as a fact about this month's videos and it is neither this month's nor
    // about the comments.
    : `${share(lang.notEnglish, known)} of what was said on camera was not in English — ${fmtInt(lang.notEnglish)} of ${fmtInt(known)} videos whose language we know${lang.unknown > 0 ? `, and ${fmtInt(lang.unknown)} with no language recorded at all` : ''}.`

  const redditCap = REDDIT_CAP_LINE

  const lines = [preparedBy, coverage, basis, language, redditCap, PRIVACY_LINE].filter(
    (l): l is string => typeof l === 'string' && l.length > 0,
  )

  return { preparedBy, coverage, basis, language, redditCap, privacy: PRIVACY_LINE, lines }
}
