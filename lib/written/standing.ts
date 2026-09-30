import type { SupabaseClient } from '@supabase/supabase-js'

import { loadObjectReadings, MARKET_PAIR_KEY, type ObjectReading } from '../agent/movement'
import { fmtInt, longMonth } from '../format'
import { COMMENTS_READ_LANE } from '../pipeline/pass-a'
import { loadMemberInsightIdsBySubject } from '../pages/subjects'
import { pickThemedRunId, type ThemedRunRow } from '../pages/themed-run'
import { gateFor } from '../quote-context'
import { pickEligible, quoteGate, type GateOptions } from '../quote-gate'
import { DIRECTION_RUN_LABEL } from '../reading/bands'
import { loadAppPairOn } from '../reading/gather-flags'
import { levelText } from '../reading/level'
import { marketAudiences } from '../reading/market'
import { monthStartOf, nextMonth, prevMonth } from '../reading/month-key'
import { comparableOn, type PairOn } from '../reading/pairs'
import { readingHandle } from '../reading/read'
import { loadMarketRivalAudiences } from '../reading/reading-view'
import { isAnswer } from '../reading/verdicts'
import type { FigureTable } from '../reports/types'
import { INDUSTRY_AUDIENCE } from '../rivals'
import { selectAll } from '../supabase-admin'
import { subjectCalibration, type SubjectCalibration } from '../subjects/calibration-state'
import { loadActiveSubjects } from '../subjects/membership'
import { isMissingSubjects, type Subject } from '../subjects/types'
import { gateInputOf, loadDatedEvidence, refOf, type DatedEvidence } from './evidence'
import { invertMembers, isOwnAccount, POOL_NOTES, subjectForTheme } from './pool'
import type { QuoteRef, StandingFact, StandingRung, TokenSentence } from './types'

// Where the market stands (plan T2): each confirmed subject's level, its place
// among the subjects, and the highest rung of the ladder (decision D1) the
// data earns: the level now; a change on last month once the two months are
// read the same way; a direction once three are.
//
// THE READING IS `loadObjectReadings` (lib/agent/movement.ts), WRAPPED, NOT
// RE-DONE. It pools a subject over the market (the category plus the tracked
// brands' audiences, the client's own posts out: decision E), reads twelve
// months from where the market first cleared the floor, judges the month pair
// on the market view (decision D), draws the band (`monthChange`) and the
// direction word (`directionWord`, never on a thin month), and applies
// decision C: a failed subject reads nothing and a provisional one its level
// only. It is the Subjects page's figure for the same month (`subjectPoints`
// and the rail's `railMarketSide` pool the same stored rows the same way).
//
// WHAT THIS FILE ADDS. The rung, the rank, and the code sentence per rung; and
// the subject's month in material the writer may read: the themes inside it,
// Pass A's descriptions of its insights, and one quote the strict gate passes
// (the Subjects voices' gate: the subject's name and description as the claim,
// relevance required), from this week where there is one.
//
// THE CLIENT-FACING RULE ON A PROVISIONAL SUBJECT (§0a, "a figure we can't
// stand behind … doesn't print"): its fact carries the level, as the Studio's
// workings may read it, but `standingLine` writes no sentence for it. The
// subject still appears, with what people say about it.

/** The rank's words, "never a digit in prose". Past the twelfth nothing is
 *  said about rank. */
const RANK_WORDS = [
  'the biggest', 'the second biggest', 'the third biggest', 'the fourth biggest', 'the fifth biggest', 'the sixth biggest',
  'the seventh biggest', 'the eighth biggest', 'the ninth biggest', 'the tenth biggest', 'the eleventh biggest', 'the twelfth biggest',
] as const

/** At most this many theme labels name what is inside a subject. */
export const STANDING_CONTENTS = 5

// ---- The ladder -----------------------------------------------------------------

/**
 * The highest rung a subject's data earns. A provisional subject stops at the
 * level (decision C). A direction is `directionWord`'s growing or fading only
 * (flat is a reading with nothing to say, which the front page does not print
 * either). A change needs a verdict on a comparable pair that answered (moved,
 * or no clear change) and is not on a thin month: the thin month's caveat is
 * a sentence about our reading that the client does not see (§0a), so the
 * comparison is left out rather than printed without it.
 */
export function rungOf(f: Pick<StandingFact, 'calibration' | 'verdict' | 'direction'>): StandingRung {
  if (f.calibration !== 'ready') return 'level'
  if (f.direction === 'growing' || f.direction === 'fading') return 'direction'
  if (f.verdict && isAnswer(f.verdict.state) && !f.verdict.flags.includes('thin')) return 'changed'
  return 'level'
}

/** A subject's figure keys: `subj_<name>`, readable and stable across a read. */
export function standingKey(f: Pick<StandingFact, 'name' | 'subjectId'>): string {
  const slug = f.name.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `subj_${slug || f.subjectId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)}`
}

/**
 * The code sentence for one subject, per rung, with its figures as keys:
 *   level     "[[k]] of [[n]] videos in your market in September, the fourth biggest subject."
 *   changed   "… ; up on August, beyond the normal swing."  (or "down on", or "no clear change on August")
 *   direction "… ; growing, 3rd month."
 * The level prints as `levelText` prints it: a whole percent at 100 videos,
 * the count under, always "of N". A provisional subject has no sentence
 * (§0a). It is rendered in a verdict node, the only place a direction word may
 * stand.
 */
export function standingLine(f: StandingFact, month: string): TokenSentence {
  const empty: TokenSentence = { body: '', figures: {} }
  if (f.calibration !== 'ready') return empty
  const level = levelText(f.level.k, f.level.n)
  if (!level) return empty
  const m = monthStartOf(month)
  const name = longMonth(m)
  const key = standingKey(f)
  const figures: FigureTable = {
    [`${key}_level`]: level.kind === 'share'
      ? { label: `${f.name}'s share of your market's videos in ${name}`, value: level.text, kind: 'pct' }
      : { label: `videos in your market on ${f.name} in ${name}`, value: fmtInt(f.level.k), kind: 'count' },
    [`${key}_n`]: { label: `videos in your market in ${name}`, value: fmtInt(f.level.n), kind: 'count' },
  }
  const rank = f.rank >= 1 && f.rank <= RANK_WORDS.length ? `, ${RANK_WORDS[f.rank - 1]} subject` : ''
  let tail = ''
  if (f.rung === 'direction' && f.direction) {
    tail = `; ${f.direction}, ${DIRECTION_RUN_LABEL}`
  } else if (f.rung === 'changed' && f.verdict) {
    const prev = longMonth(prevMonth(m))
    tail = f.verdict.state === 'moved' && f.verdict.changePts != null && f.verdict.changePts !== 0
      ? `; ${f.verdict.changePts > 0 ? 'up' : 'down'} on ${prev}, beyond the normal swing`
      : `; no clear change on ${prev}`
  }
  return { body: `[[${key}_level]] of [[${key}_n]] videos in your market in ${name}${rank}${tail}.`, figures }
}

// ---- From the readings ----------------------------------------------------------------

/** What `loadObjectReadings` answered for one subject, and its state. */
export interface SubjectReading {
  subject: Pick<Subject, 'id' | 'name'>
  calibration: SubjectCalibration
  reading: ObjectReading
}

/**
 * The facts the readings earn, ranked, before the subject's material is read.
 * A failed subject (decision C) and a subject with no level in the month (not
 * read, or read before it was named) are left out: there is nothing true to
 * say of its size. `comparable` is the market pair judge on the month and the
 * one before: where it refuses, the verdict is null ("no comparable pair").
 * Ranked by the level, largest first, ties by name: the Subjects rail's order.
 * Pure.
 */
export function factsFromReadings(readings: readonly SubjectReading[], comparable: boolean): StandingFact[] {
  const facts: StandingFact[] = []
  for (const { subject, calibration, reading } of readings) {
    if (calibration === 'failed') continue
    const curr = reading.curr
    if (reading.state !== 'read' || !curr || curr.k == null || curr.n == null || curr.n <= 0) continue
    const verdict = calibration === 'ready' && comparable ? reading.verdict : null
    const direction = calibration === 'ready' ? reading.direction : null
    const fact: StandingFact = {
      subjectId: subject.id,
      name: subject.name,
      calibration,
      level: { k: curr.k, n: curr.n },
      rank: 0,
      trail: reading.trail.map((p) => ({ month: monthStartOf(p.month), k: p.k, n: p.n })),
      verdict,
      direction,
      rung: 'level',
      contents: [],
      notes: [],
      quoteRef: null,
    }
    fact.rung = rungOf(fact)
    facts.push(fact)
  }
  facts.sort((a, b) => b.level.k - a.level.k || a.name.localeCompare(b.name))
  facts.forEach((f, i) => { f.rank = i + 1 })
  return facts
}

// ---- The subject's month, in material ------------------------------------------------------

/** The Subjects voices' gate for one subject (lib/pages/subjects.ts): its name
 *  and description are the claim, and a quote must speak to it. */
export function subjectGate(clientId: string, s: Pick<Subject, 'name' | 'description'>): GateOptions {
  return gateFor(clientId, { claim: [s.name, s.description].filter(Boolean).join('. '), requireRelevance: true })
}

/** May this citation speak for a subject in the market? A market video (the
 *  category or a tracked brand's, never the client's own: decision E) on the
 *  read lane that no reader has marked a maker's. */
export function speaksForTheMarket(e: DatedEvidence, market: ReadonlySet<string>): boolean {
  return market.has(e.video.audience) && e.video.lane === COMMENTS_READ_LANE && e.context?.segment !== 'maker'
}

/**
 * One subject's month as the writer may read it: Pass A's descriptions of the
 * insights whose quotes the subject's gate passes (best-fitting first, one per
 * wording), and the one quote to print: the best that passes from this week
 * where there is one, else from the month; the category's before a brand's,
 * as the Subjects voices take them; never the video's own account. `evidence`
 * is the month's, and may hold other subjects' rows. Pure.
 */
export function subjectMaterial(input: {
  gate: GateOptions
  memberIds: ReadonlySet<string>
  evidence: readonly DatedEvidence[]
  market: ReadonlySet<string>
  window: { from: string; to: string }
}): { notes: string[]; quoteRef: QuoteRef | null; insights: Set<string> } {
  const own = input.evidence
    .filter((e) => input.memberIds.has(e.insightId) && speaksForTheMarket(e, input.market))
    .sort((a, b) => a.rank - b.rank || a.evidenceId.localeCompare(b.evidenceId))
  const best = new Map<string, { score: number; rank: number; description: string }>()
  for (const e of own) {
    const v = quoteGate(gateInputOf(e), input.gate)
    if (!v.ok) continue
    const held = best.get(e.insightId)
    if (!held || v.score > held.score || (v.score === held.score && e.rank < held.rank)) best.set(e.insightId, { score: v.score, rank: e.rank, description: e.description })
  }
  const seen = new Set<string>()
  const notes: string[] = []
  for (const [, b] of [...best.entries()].sort((x, y) => y[1].score - x[1].score || x[1].rank - y[1].rank || x[0].localeCompare(y[0]))) {
    const k = b.description.toLowerCase()
    if (!b.description || seen.has(k)) continue
    seen.add(k)
    notes.push(b.description)
    if (notes.length >= POOL_NOTES) break
  }
  const from = Date.parse(input.window.from)
  const to = Date.parse(input.window.to)
  const quotable = own.filter((e) => !isOwnAccount(e))
  const thisWeek = quotable.filter((e) => Date.parse(e.commentDate) >= from && Date.parse(e.commentDate) < to)
  const pick = (pool: readonly DatedEvidence[]): DatedEvidence | null => {
    const category = pool.filter((e) => e.video.audience === INDUSTRY_AUDIENCE)
    const brands = pool.filter((e) => e.video.audience !== INDUSTRY_AUDIENCE)
    return pickEligible(category, gateInputOf, 1, input.gate)[0] ?? pickEligible(brands, gateInputOf, 1, input.gate)[0] ?? null
  }
  const chosen = pick(thisWeek) ?? pick(quotable)
  return { notes, quoteRef: chosen ? refOf(chosen) : null, insights: new Set(own.map((e) => e.insightId)) }
}

/**
 * The themes inside a subject this month: the run's themes whose subject
 * (`subjectForTheme`, the week pool's rule) is this one and which hold at
 * least one of the subject's insights heard in the month, the most of them
 * first, ties by label. Labels only, at most `STANDING_CONTENTS`. Pure.
 */
export function contentsOf(
  subjectId: string,
  monthInsights: ReadonlySet<string>,
  themes: readonly { label: string; memberIds: readonly string[] }[],
  subjectsOf: ReadonlyMap<string, readonly string[]>,
  order: readonly string[],
): string[] {
  return themes
    .map((t) => ({ label: t.label, overlap: t.memberIds.filter((id) => monthInsights.has(id)).length, t }))
    .filter((x) => x.overlap > 0 && x.label.trim() !== '' && subjectForTheme(x.t.memberIds, subjectsOf, order) === subjectId)
    .sort((a, b) => b.overlap - a.overlap || a.label.localeCompare(b.label))
    .slice(0, STANDING_CONTENTS)
    .map((x) => x.label)
}

// ---- The reads -------------------------------------------------------------------------

/**
 * Where the market stands, for one month. READ-ONLY. `window` is the week the
 * quote prefers; `asOf` is the instant the reading is taken (the month pair's
 * judge and the direction word's "has the month ended" are both read at it).
 */
export async function loadStanding(
  admin: SupabaseClient,
  opts: { clientId: string; month: string; window: { from: string; to: string }; asOf: Date },
): Promise<StandingFact[]> {
  const { clientId, window } = opts
  const month = monthStartOf(opts.month)
  const asOf = opts.asOf.toISOString()

  let subjects: Subject[]
  try {
    subjects = await loadActiveSubjects(admin, clientId)
  } catch (error) {
    if (isMissingSubjects(error)) return []
    throw error
  }
  const calibrated = subjects.map((s) => ({ s, calibration: subjectCalibration(s) })).filter((x) => x.calibration !== 'failed')
  if (calibrated.length === 0) return []

  const [pair, rivals] = await Promise.all([
    loadAppPairOn(readingHandle(clientId, admin), asOf),
    loadMarketRivalAudiences(admin, clientId).then((r) => r ?? []),
  ])
  const readings = await loadObjectReadings(admin, {
    clientId,
    objects: calibrated.map(({ s, calibration }) => ({ kind: 'subject' as const, id: s.id, label: s.name, calibration })),
    month,
    pair,
    asOf,
    rivalAudiences: rivals,
  })
  const facts = factsFromReadings(
    calibrated.map(({ s, calibration }, i) => ({ subject: s, calibration, reading: readings[i] })),
    marketComparable(pair, month),
  )
  if (facts.length === 0) return facts

  // The month's material: every printed subject's member insights, their
  // comment evidence dated in the month, and the run's themes.
  const bySubject = await loadMemberInsightIdsBySubject(admin, clientId, subjects.map((s) => s.id))
  if (!bySubject) return facts
  const printed = new Set(facts.map((f) => f.subjectId))
  const [evidence, themes] = await Promise.all([
    loadDatedEvidence(admin, clientId, [...bySubject.entries()].filter(([id]) => printed.has(id)).flatMap(([, ids]) => ids), {
      from: `${month}T00:00:00.000Z`,
      to: `${nextMonth(month)}T00:00:00.000Z`,
    }),
    loadThemedRunThemes(admin, clientId, asOf),
  ])
  const market = new Set(marketAudiences(rivals))
  const subjectsOf = invertMembers(bySubject)
  const order = subjects.map((s) => s.id)
  const byId = new Map(subjects.map((s) => [s.id, s]))
  for (const f of facts) {
    const s = byId.get(f.subjectId)
    if (!s) continue
    const m = subjectMaterial({ gate: subjectGate(clientId, s), memberIds: new Set(bySubject.get(s.id) ?? []), evidence, market, window })
    f.notes = m.notes
    f.quoteRef = m.quoteRef
    f.contents = contentsOf(s.id, m.insights, themes, subjectsOf, order)
  }
  return facts
}

/** Is the reading month's pair with the month before read the same way, on
 *  the market view? The same judge `objectReading` draws the verdict under. */
export function marketComparable(pair: PairOn, month: string): boolean {
  const m = monthStartOf(month)
  return comparableOn(pair, MARKET_PAIR_KEY)(prevMonth(m), m)
}

/** The themes of the newest run that produced themes by `asOf` (the themed
 *  run's rule, `pickThemedRunId`), with their member insights. */
async function loadThemedRunThemes(admin: SupabaseClient, clientId: string, asOf: string): Promise<{ label: string; memberIds: string[] }[]> {
  const res = await admin.from('themes').select('run_id, created_at')
    .eq('client_id', clientId).not('run_id', 'is', null).lte('created_at', asOf)
    .order('created_at', { ascending: false }).limit(1)
  if (res.error) throw new Error(`standing themed run: ${res.error.message}`)
  const runId = pickThemedRunId((res.data ?? []) as ThemedRunRow[])
  if (!runId) return []
  const rows = await selectAll<{ theme_id: string; label: string | null; member_insight_ids: string[] | null }>(() =>
    admin.from('theme_observations').select('theme_id, label, member_insight_ids')
      .eq('client_id', clientId).eq('run_id', runId).order('theme_id', { ascending: true }),
  )
  return rows.map((r) => ({ label: (r.label ?? '').trim(), memberIds: (r.member_insight_ids ?? []).map(String) }))
}
