import type { DocPageKind, DocumentRole } from './types'

/**
 * The four section maps (Phase 1 WP19, item 43, design RP1).
 *
 * WHY A MAP AND NOT A SKELETON. The four briefs have always had a skeleton —
 * an ordered list of PAGE KINDS a model fills in. What they have never had is
 * the reading: `MARKET_BRIEF`'s skeleton is `in_short · findings · say_hear ·
 * competitor · personas · language · method`, which has no subjects page, no
 * moves page, and does have a personas page the quarterly review explicitly
 * cuts. RP1 calls the Marketing brief "the monthly review: subjects, the
 * category, rivals, the moves, the method page". Those five are PAGE BLOCKS —
 * they exist, they are drawn on Overview and Subjects and Competitive every
 * day, and a brief that re-derives them would be a second measurement of the
 * same month.
 *
 * SO A BRIEF IS TWO KINDS OF ENTRY, IN ONE ORDER. A `page` entry is the
 * model's — the skeleton as it was, written and scrubbed and checked. A
 * `block` entry is the product's — a `Block<D>` rendered in `'print'` mode
 * from the surface's own loader output, exactly as the reader saw it. The
 * design's "each section is a page block or a filter over one" is this list,
 * and "deck pages that duplicate a block render the block in print mode" is
 * what the deck does with it.
 *
 * A SECTION ID IS A STORED CONTRACT. It names a slide inside a built brief and
 * an edit in `report_edits`; renaming one orphans every artefact that named it.
 */

/** The surfaces a brief may borrow a block from. Each one is a page loader
 *  plus a block array; nothing else in the product answers `figures()`. */
export type BriefSurface = 'overview' | 'subjects' | 'voice' | 'competitive' | 'market'

export const BRIEF_SURFACES: readonly BriefSurface[] = ['overview', 'subjects', 'voice', 'competitive', 'market']

/**
 * What a section needs before it can say anything, named by its readiness row
 * id (`lib/readiness/compute.ts`).
 *
 * THIS IS THE HALF THE COMPOSE WALK WAS MISSING. Today a page whose material is
 * absent DROPS OUT of the skeleton silently (`compose.ts`: "a page whose only
 * material is missing … drops out rather than printing an empty sheet"), so a
 * brief built on a workspace with no subjects prints four pages, says nothing
 * about why, and reads as a complete document. RP1's rule is the opposite: a
 * brief with a missing input prints what it can AND NAMES the input and who
 * closes it — which is the readiness row, which already carries the owner and
 * the act that changes it.
 */
export type ReadinessId =
  | 'rival-accounts' | 'tracked-terms' | 'communities' | 'searchable-findings'
  | 'subject-set' | 'months-of-history' | 'anomaly-baseline' | 'read-depth'
  | 'update-record' | 'delivery' | 'change-record' | 'decisions' | 'retention'

export interface BriefBlockSection {
  /** Stable, stored, never regenerated. */
  id: string
  /** The block key, `<surface>.<block>` — the same stored contract a report
   *  section's renderable key is. */
  block: string
  surface: BriefSurface
  /** The section's own name on paper. Not the block's title: a block is named
   *  for the page it sits on, and a brief is read end to end. */
  title: string
  /** One line of framing, the operator's voice, printed under the title. */
  framing: string
  /** The block's own selection, as URL params — "a filter over one". */
  filter?: Record<string, string>
  /** What has to be recorded for this section to hold anything. */
  needs: readonly ReadinessId[]
}

export type BriefEntry =
  | { kind: 'page'; page: DocPageKind }
  | { kind: 'block'; section: BriefBlockSection }

const block = (s: BriefBlockSection): BriefEntry => ({ kind: 'block', section: s })
const page = (p: DocPageKind): BriefEntry => ({ kind: 'page', page: p })

// ── Marketing — the monthly review ─────────────────────────────────────────
// RP1's own words: "subjects, the category, rivals, the moves, the method
// page". Five blocks and the written pages that argue from them.

export const MARKETING_MAP: readonly BriefEntry[] = [
  page('in_short'),
  block({
    id: 'mk.month', block: 'overview.sentence', surface: 'overview',
    title: 'The month', framing: 'Where the month stands, with the band it cleared and the count behind it.',
    needs: ['months-of-history'],
  }),
  block({
    id: 'mk.subjects', block: 'overview.subjects', surface: 'overview',
    title: 'Your subjects', framing: 'Each subject this month, against the month before and against the category.',
    needs: ['subject-set', 'months-of-history'],
  }),
  block({
    id: 'mk.category', block: 'overview.category', surface: 'overview',
    title: 'The category', framing: 'What the wider conversation was about this month.',
    needs: ['months-of-history'],
  }),
  block({
    id: 'mk.rivals', block: 'overview.rivals', surface: 'overview',
    title: 'Rivals', framing: 'Where each tracked rival sits in the same month.',
    needs: ['rival-accounts', 'months-of-history'],
  }),
  page('finding'),
  block({
    id: 'mk.moves', block: 'overview.moves', surface: 'overview',
    title: 'Your moves', framing: 'What you said you would do, and the reading it will show up in.',
    needs: ['decisions'],
  }),
  page('method'),
]

// ── Leadership — the management readout ────────────────────────────────────
// Short on purpose. Where the company stands, what moved, what was decided,
// and the method behind it. No personas, no language page.

export const LEADERSHIP_MAP: readonly BriefEntry[] = [
  page('in_short'),
  block({
    id: 'ld.month', block: 'overview.sentence', surface: 'overview',
    title: 'The month', framing: 'The month in one reading, with the band and the count behind it.',
    needs: ['months-of-history'],
  }),
  page('finding'),
  block({
    id: 'ld.standing', block: 'competitive.rivals', surface: 'competitive',
    title: 'Where you stand', framing: 'Your own share of the month beside every tracked rival.',
    needs: ['rival-accounts', 'months-of-history'],
  }),
  block({
    id: 'ld.subjects', block: 'overview.subjects', surface: 'overview',
    title: 'Your subjects', framing: 'The five to eight subjects this workspace is read against.',
    needs: ['subject-set', 'months-of-history'],
  }),
  block({
    id: 'ld.moves', block: 'overview.moves', surface: 'overview',
    title: 'What was decided', framing: 'Each recommendation and what was done about it.',
    needs: ['decisions'],
  }),
  page('method'),
]

// ── Sales — the customers' words, by subject and by rival ──────────────────

export const SALES_MAP: readonly BriefEntry[] = [
  page('in_short'),
  page('finding'),
  block({
    id: 'sl.voices', block: 'subjects.voices', surface: 'subjects',
    title: 'In their words, by subject', framing: 'What customers actually said about each subject this month.',
    needs: ['subject-set'],
  }),
  block({
    id: 'sl.unanswered', block: 'subjects.unanswered', surface: 'subjects',
    title: 'What they asked and nobody answered', framing: 'The questions the conversation puts and does not settle.',
    needs: ['subject-set'],
  }),
  block({
    id: 'sl.rivals', block: 'competitive.rivals', surface: 'competitive',
    title: 'By rival', framing: 'What is said about each rival, in the same month, with its denominator.',
    needs: ['rival-accounts', 'months-of-history'],
  }),
  block({
    id: 'sl.questions', block: 'competitive.questions', surface: 'competitive',
    title: 'What buyers compare', framing: 'The comparisons buyers make out loud, and who they name.',
    needs: ['rival-accounts'],
  }),
  page('language'),
  page('method'),
]

// ── Content — what to make next ────────────────────────────────────────────

export const CONTENT_MAP: readonly BriefEntry[] = [
  page('in_short'),
  page('finding'),
  block({
    id: 'ct.advice', block: 'market.advice', surface: 'market',
    title: 'What to make next', framing: 'What the conversation asked for, and what was decided about each one.',
    needs: ['decisions'],
  }),
  block({
    id: 'ct.ways', block: 'market.ways', surface: 'market',
    title: 'Ways in', framing: 'Where the category is already talking, and what it is talking about.',
    needs: ['months-of-history'],
  }),
  block({
    id: 'ct.voices', block: 'subjects.voices', surface: 'subjects',
    title: 'The words to borrow', framing: 'How customers say it, in their own words.',
    needs: ['subject-set'],
  }),
  page('asked'),
  page('method'),
]

/** The four maps, by the role that writes them. A custom brief keeps the
 *  skeleton it has always had — its whole point is the operator's own
 *  question, and borrowing another brief's blocks would answer a different
 *  one. */
export const BRIEF_MAPS: Record<DocumentRole, readonly BriefEntry[]> = {
  market_brief: MARKETING_MAP,
  leadership_brief: LEADERSHIP_MAP,
  sales_brief: SALES_MAP,
  content_brief: CONTENT_MAP,
}

export const briefMap = (role: DocumentRole): readonly BriefEntry[] => BRIEF_MAPS[role]

/** Every block section in a map, in order. */
export function sectionsOf(map: readonly BriefEntry[]): BriefBlockSection[] {
  return map.flatMap((e) => (e.kind === 'block' ? [e.section] : []))
}

/** The written page kinds a map still asks the model for. */
export function pageKindsOf(map: readonly BriefEntry[]): DocPageKind[] {
  const seen = new Set<DocPageKind>()
  for (const e of map) if (e.kind === 'page') seen.add(e.page)
  return [...seen]
}

/** Which surfaces a map has to load. Nothing loads a surface no section names:
 *  a page loader is seconds of reads, and the leadership brief must not pay
 *  for Market's because the content brief wants it. */
export function surfacesOf(map: readonly BriefEntry[]): BriefSurface[] {
  const seen = new Set<BriefSurface>()
  for (const s of sectionsOf(map)) seen.add(s.surface)
  return BRIEF_SURFACES.filter((s) => seen.has(s))
}

// ── the missing-input rule ─────────────────────────────────────────────────

/** One input a brief needed and did not have, with who closes it. */
export interface MissingInput {
  /** The readiness row. */
  id: ReadinessId
  /** The input, in the client's words — `ReadinessRow.input`. */
  input: string
  /** Who can close it — `OWNER_LABEL[row.owner]`. */
  owner: string
  /** The act that changes it — `ReadinessRow.unlocks`. */
  unlocks: string
  /** The sections that went without it, by title. */
  sections: string[]
}

/** A readiness row as this module needs it — the four fields, so a test needs
 *  no fixture of thirteen. */
export interface ReadinessLike {
  id: string
  input: string
  status: 'exists' | 'partial' | 'missing'
  owner: string
  unlocks: string
}

/**
 * What this brief could not say, and who closes it.
 *
 * `partial` IS NOT MISSING. The readiness vocabulary's middle state is "the
 * input exists but does not cover what the block will be asked to draw" — a
 * brief built on it prints a thinner section, not an empty one, and naming it
 * as absent would be a claim the record does not support. Only `missing`
 * appears here.
 */
export function missingInputs(
  map: readonly BriefEntry[],
  readiness: readonly ReadinessLike[],
): MissingInput[] {
  const byId = new Map(readiness.map((r) => [r.id, r]))
  const out = new Map<string, MissingInput>()
  for (const section of sectionsOf(map)) {
    for (const need of section.needs) {
      const row = byId.get(need)
      if (!row || row.status !== 'missing') continue
      const held = out.get(need)
      if (held) held.sections.push(section.title)
      else out.set(need, { id: need, input: row.input, owner: row.owner, unlocks: row.unlocks, sections: [section.title] })
    }
  }
  return [...out.values()]
}

/**
 * The sentence a brief prints in place of a section it could not fill.
 *
 * NAMES THE INPUT AND ITS OWNER, which is the whole of RP1's rule. Client
 * wording: a readiness row id is a key and never reaches a reader, and
 * "Readiness" is the screen it is named on.
 */
export function missingSentence(m: MissingInput): string {
  return `${m.sections.join(' and ')} could not be filled: we have no ${m.input}. ${m.owner} closes this — ${trimStop(m.unlocks)}. It is the ${m.input} row on Settings › Readiness.`
}

/** The line that opens the brief's own account of what it left out. */
export function missingSummary(missing: readonly MissingInput[]): string | null {
  if (missing.length === 0) return null
  const n = missing.length
  return n === 1
    ? 'One thing this brief needed is not recorded for this workspace yet, so one or more of its sections are shorter than usual.'
    : `${n} things this brief needed are not recorded for this workspace yet, so some of its sections are shorter than usual.`
}

const trimStop = (s: string): string => s.trim().replace(/[.!?]+$/, '')
