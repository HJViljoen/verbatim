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
 * WHAT BELONGS IN `needs` AND WHAT DOES NOT: only an input WITHOUT WHICH THE
 * BLOCK HAS NOTHING AT ALL. `rival-accounts` is about whether we read each
 * rival's OWN accounts, and the standings block reads the category corpus
 * either way — declaring it there refused a section the block could draw,
 * measured against production on both tenants. A block that merely has less to
 * say still draws; that is what its own empty state is for.
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
    needs: ['months-of-history'],
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
    needs: ['months-of-history'],
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
    needs: ['months-of-history'],
  }),
  block({
    id: 'sl.questions', block: 'competitive.questions', surface: 'competitive',
    title: 'What buyers compare', framing: 'The comparisons buyers make out loud, and who they name.',
    needs: [],
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
    needs: [],
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
  /** Which of the three, so a brief can tell an instruction from a promise. */
  ownerRole: 'client' | 'ops' | 'engineering'
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
  ownerRole: 'client' | 'ops' | 'engineering'
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
      else out.set(need, { id: need, input: row.input, owner: row.owner, ownerRole: row.ownerRole, unlocks: row.unlocks, sections: [section.title] })
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
  // NOT "we have no {input}". Every readiness `input` is a noun phrase that
  // already opens with its own article ("the rival accounts we read"), so the
  // obvious wording reads "we have no the rival accounts we read". The verb
  // carries the sentence instead, and the input is quoted as the row it is.
  const head = `${m.sections.join(' and ')} could not be filled. We have not recorded ${m.input}.`
  // `unlocks` IS AN INSTRUCTION TO WHOEVER OWNS THE ROW, and only the CLIENT
  // can act on theirs. Every other row's act is our own operator copy and must
  // not be printed as if the reader could do it: `subject-set` reads "Phase 1
  // builds the subject set and the form that names them" — a project phase, in
  // a document a customer reads — and `months-of-history`, which is ops and is
  // a `needs` of most sections in all four maps, reads "Apply the monthly
  // reading and seed it once per workspace", which is the sentence a
  // new-tenant brief would print most often and the one a client can do least
  // about. The owner is still named, because RP1 asks for it; what changes is
  // that a gap only we can close is a PROMISE and never an instruction.
  const act = m.ownerRole === 'client'
    ? `${m.owner} closes this — ${trimStop(m.unlocks)}.`
    : m.ownerRole === 'ops'
      ? 'We are setting it up, and it appears here the moment it is there.'
      : 'We are building it, and it appears here the moment it is there.'
  return `${head} ${act} It is on Settings › Readiness.`
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
