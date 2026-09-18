import { DOCUMENT_BRIEF_MAX, directionWordsFor } from '../../config'
import type { Gap } from '../../reading/gap'
import type { MonthStatus } from '../../reading/types'
import type { Verdict } from '../../reading/verdicts'
import type { Quote } from '../../renderables/types'
import type { RunDelta } from '../../report-delta'
import type { Audience, FigureTable } from '../types'

/**
 * Document reports (2026-08-31): a report WRITTEN by the Consumer Intelligence
 * Agent in a role, inside a fixed skeleton, from the update's data. The first
 * template is the Sales brief (vault: Projects/SaaS/Architecture/Sales-Brief).
 *
 * What is fixed and what moves: the SKELETON (which pages, in which order,
 * with which fields) is the template's and never the model's; the CONTENT of
 * each block is the model's, inside caps; every NUMBER is a `[[key]]` the code
 * substitutes at render; every QUOTE is a `Quote{ref}` frozen like any other
 * snapshot's. The evidence behind each block lives in the WORKINGS, a
 * separate column the render and share paths never select, so a printed page
 * carries the information and never the proof (Heinrich, 2026-08-30: the
 * reader trusts the operator; the operator trusts the evidence).
 */

// ── settings ──────────────────────────────────────────────────────────────

/** Who the reader sells to. It sets the register: a rep selling to clinics
 *  needs the professional's questions; a brand selling to shoppers does not. */
export type SellsTo = 'consumers' | 'retail' | 'professionals' | 'businesses'

export const SELLS_TO: { key: SellsTo; label: string; hint: string }[] = [
  { key: 'consumers', label: 'People buying for themselves', hint: 'shoppers, patients, members' },
  { key: 'retail', label: 'Retailers and distributors', hint: 'buyers who stock and resell' },
  { key: 'professionals', label: 'Professionals who recommend or fit', hint: 'clinicians, advisers, installers' },
  { key: 'businesses', label: 'Businesses', hint: 'procurement, operators, teams' },
]
export const isSellsTo = (v: unknown): v is SellsTo => SELLS_TO.some((s) => s.key === v)

/** A topic block a brief may include (WP7d, 2026-09-12). A block is not a
 *  tile and not part of a page: it is a research question set plus the
 *  skeleton pages that answer it, cut from the four templates (Heinrich,
 *  2026-08-30: "selectable topic blocks that must be included ... never parts
 *  of pages"). The keys are stored in reports.settings, so they never change
 *  spelling. What each one holds is in documents/templates.ts. */
export type DocumentBlockKey = 'competitive_analysis' | 'consumer_profiles' | 'content_performance' | 'market_movement'

export const DOCUMENT_BLOCK_KEYS: DocumentBlockKey[] = ['competitive_analysis', 'consumer_profiles', 'content_performance', 'market_movement']
export const isDocumentBlockKey = (v: unknown): v is DocumentBlockKey => DOCUMENT_BLOCK_KEYS.includes(v as DocumentBlockKey)

/** Which of the four written roles a custom brief is written in: a custom
 *  document invents no new voice, it points an existing one at the operator's
 *  own question. The value is that template's key. */
export type DocumentRole = 'sales_brief' | 'leadership_brief' | 'market_brief' | 'content_brief'

export const DOCUMENT_ROLES: DocumentRole[] = ['leadership_brief', 'sales_brief', 'market_brief', 'content_brief']
export const isDocumentRole = (v: unknown): v is DocumentRole => DOCUMENT_ROLES.includes(v as DocumentRole)
/** The role a custom brief takes when the operator picks none. */
export const DEFAULT_DOCUMENT_ROLE: DocumentRole = 'leadership_brief'

export interface DocumentSettings {
  sellsTo: SellsTo
  /** Tracked competitors to include; null = every tracked competitor. */
  competitors: string[] | null
  /** The language quotes must read as; the only one today. */
  language: 'en'
  /** Finding pages the writer may fill. */
  findings: 3 | 4
  /** Custom briefs (template_key 'custom'): the operator's own instruction,
   *  the top line of the writer's prompt. Absent on the four templates, whose
   *  brief is the template's own. */
  brief?: string
  /** Custom briefs: the topic blocks to include, in the order they print. */
  blocks?: DocumentBlockKey[]
  /** Custom briefs: whose voice writes it. */
  role?: DocumentRole
}

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = { sellsTo: 'consumers', competitors: null, language: 'en', findings: 4 }

export function documentSettings(raw: Partial<DocumentSettings> | null | undefined): DocumentSettings {
  const s = raw ?? {}
  // brief, blocks and role are ABSENT rather than empty when unset: the four
  // templates store none of them, and a stored `blocks: []` would read as a
  // deliberately empty custom brief.
  const brief = typeof s.brief === 'string' ? s.brief.trim().slice(0, DOCUMENT_BRIEF_MAX) : ''
  const blocks = Array.isArray(s.blocks) ? s.blocks.filter(isDocumentBlockKey).filter((b, i, a) => a.indexOf(b) === i) : []
  return {
    sellsTo: isSellsTo(s.sellsTo) ? s.sellsTo : DEFAULT_DOCUMENT_SETTINGS.sellsTo,
    competitors: Array.isArray(s.competitors) ? s.competitors.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 10) : null,
    language: 'en',
    findings: s.findings === 3 ? 3 : 4,
    ...(brief ? { brief } : {}),
    ...(blocks.length ? { blocks } : {}),
    ...(isDocumentRole(s.role) ? { role: s.role } : {}),
  }
}

// ── the document ──────────────────────────────────────────────────────────

export type DocPageKind = 'in_short' | 'finding' | 'competitor' | 'standing' | 'say_hear' | 'asked' | 'personas' | 'language' | 'method'

/** Every field a block may carry; the skeleton says which page has which. */
export type DocField =
  | 'summary'   // in_short: the executive summary
  | 'findings'  // in_short: the findings listed, one line each (items, code)
  | 'headline'  // finding: the argument, one line
  | 'saw'       // finding: what the conversation shows (paragraphs)
  | 'heard'     // finding: where it was heard (code: audiences, platforms, history, count)
  | 'means'     // finding: what it means for a sale
  | 'practice'  // finding: in practice, at most two lines (items)
  | 'sure'      // finding: confidence, in words
  | 'pitch'     // competitor: what they are pitching
  | 'about'     // competitor: what others say about them (creator and reviewer voice)
  | 'praise'    // competitor: what their users praise
  | 'hurt'      // competitor: where their users hurt
  | 'read'      // competitor: the read, when both names come up
  | 'standing'  // standing: the read on where the company sits in the conversation
  | 'gap'       // say_hear: one block per claim (label = the claim; items = [verdict word, what they say, the gap] by code; text = the read)
  | 'asked'     // asked: the questions the conversation puts and does not settle (items)
  | 'persona'   // personas: one block per persona (label = name; items = who, wants, stuck on, moves when; text = what it means for this reader)
  | 'care'      // language: words that draw pushback (items)
  | 'not_sure'  // the "not settled this update" list (items)
  | 'method'    // method: one paragraph per item (items, code)

export interface DocBlock {
  /** Stable within the snapshot: `f1.saw`, `c-ottobock.hurt`. Edits key on it. */
  id: string
  field: DocField
  /** A name the block carries on paper: a persona's, a competitor's. */
  label?: string
  /** Prose with `[[key]]` figure placeholders. Empty when `items` carry the block. */
  text: string
  /** One pull quote, where the field allows it. */
  quote?: Quote | null
  /** List blocks (findings, practice, care, not_sure, method, persona). */
  items?: string[]
}

export interface DocPage {
  id: string
  kind: DocPageKind
  /** The page name, top right on paper. */
  title: string
  blocks: DocBlock[]
  /** finding: `sure` word; competitor: the competitor's name; personas: names. */
  meta?: Record<string, string>
}

/**
 * A history word a document CARRIES, as it may be DRAWN today (D1).
 *
 * `trajectoryWord` (merge.ts) is the gate on what gets written: nothing built
 * from now on carries one. But a document is re-rendered from its frozen text
 * forever — the share link, the PDF, the Studio deck, the reports viewer all
 * read stored pages — so a snapshot built before the gate would keep printing
 * "rising" / "fading" / "seen N updates running" off the run-indexed series.
 * The Dashboard's tiles are gated at render for exactly this reason: a word we
 * have withdrawn must not come back because an artefact remembers it.
 *
 * Empty string, which is what every caller already reads as "no word": the
 * pill is not drawn, the workings suffix is not appended. Lives here rather
 * than beside `trajectoryWord` because the workings drawer is a client
 * component and `merge.ts` reaches the OpenAI client through `cosine`.
 */
export function shownTrajectory(word: string | null | undefined, directionWords = directionWordsFor('documents.trajectory')): string {
  return word && directionWords ? word : ''
}

/** What a finding's consequence is called on paper: "What it means for a
 *  sale" and its short form. The template's own (templates.ts Lens), frozen
 *  into the snapshot so the deck never has to look a template up. */
export interface DocLens {
  means: string
  short: string
}

/**
 * The month a brief is a reading of, frozen onto its snapshot (Phase 1 WP19).
 *
 * "Exports and reports freeze numbers, never words" — so the stamp, the
 * denominators and the platform mix are stored, and the quoted voices still
 * resolve at render. Absent on every brief built before this landed and on a
 * workspace whose month tables have never been seeded, which is why every
 * reader of it is optional-chained rather than defaulted: a missing reading is
 * a fact about the brief, not a zero.
 */
export interface DocumentReading {
  /** `YYYY-MM-01`. */
  month: string
  /** "September 2026". */
  monthLabel: string
  monthStatus: MonthStatus
  /** The instant the brief read, printed — never `created_at`. */
  readingAt: string
  /** The one line every page of the brief carries. */
  stamp: string
  denominators: { audience: string; label: string; videos: number; comments: number }[]
  platformMix: Record<string, number>
  /**
   * The two-audience gaps the blocks drew (D1), frozen (package E-marketing).
   *
   * `BriefReading.gaps` has carried these since wave 1 and `documentReading`
   * dropped them, so no artefact could print the one sentence the artboards
   * lead with. Frozen because a brief freezes NUMBERS: the gap is measured at
   * the reading instant, and re-deriving it at render would be a second
   * measurement of a month a reader may open in March.
   */
  gaps?: Gap[]
  /** The banded comparisons the blocks drew, frozen for the same reason. The
   *  stat tiles print one; nothing on the deck may invent another. */
  verdicts?: Verdict[]
  /** True where the window crosses a recorded clustering boundary — the label
   *  decision L requires travels with it. */
  crossesClustering: boolean
}

/** One input a brief needed and the workspace has not recorded, frozen so the
 *  artefact says the same thing a year later. */
export interface DocumentMissingInput {
  id: string
  input: string
  owner: string
  /** Which of the three owns it — so a later reader of the snapshot can tell a
   *  promise ("we are building it") from an instruction ("name them in
   *  Settings"). compose stores it; the type omitted it. */
  ownerRole?: 'client' | 'ops' | 'engineering'
  unlocks: string
  sections: string[]
}

/**
 * One borrowed page block, as the brief's deck prints it (Phase 1 WP19).
 *
 * "Deck pages that duplicate a block render the block in print mode" — so the
 * section stores what to draw and where its data is, and the block draws
 * itself. `empty` is the ONE line to print in its place: the block's own empty
 * state where the block simply has nothing, and the missing-input sentence
 * (naming the input and its ST1 owner) where the workspace has not recorded
 * what the section needs. A section that could not be filled prints that
 * sentence rather than dropping out of the brief in silence, which is what the
 * compose walk did before.
 */
export interface DocBriefSection {
  /** Stable, from the section map. Names a slide and an edit. */
  id: string
  /** `<surface>.<block>` — the block key, a stored contract. */
  block: string
  /** Which of `data.surfaces` holds this block's data. */
  surface: string
  title: string
  framing: string
  empty: string | null
  /** The sheet this section shares with its neighbours (E-marketing). Absent
   *  on every section that has a landscape sheet to itself, which is every
   *  section of every brief built before 2026-09-18. */
  sheet?: string
  /** Columns of twelve this section takes on a shared sheet. */
  span?: number
}

/** The brief's order: written pages and borrowed blocks, interleaved. */
export type DocLayoutEntry = { kind: 'page'; id: string } | { kind: 'section'; id: string }

/** What a slide key looks like when it names a borrowed block rather than a
 *  written page. Prefixed because both live in one `Slide.keys` vocabulary. */
export const SECTION_SLIDE_PREFIX = 'section:'

export interface DocumentMethod {
  conversations: number
  videos: number
  clientVideos: number
  competitorVideos: number
  period: string
  sources: string[]
  /** Quotes held back by the language gate. */
  heldBack: number
  /** The update was partial or below the conversation floor. */
  thin: boolean
  /**
   * Findings written and dropped BELOW the bar this build (`mkt.p7.numbers`).
   *
   * The artboard's row is "4 above the bar · 5 below the bar", and the deck
   * could only ever print the first half: the dropped ones live in the
   * workings, which the render and share paths never select. A count is not a
   * headline and carries no evidence, so it travels on the snapshot.
   */
  findingsBelow?: number
  /**
   * Findings that CLEARED the bar and were not printed, because the template's
   * cap stopped first (`findingsMax`, and three on a thin update).
   *
   * Its own field because it is its own sentence. `findingsBelow` used to be
   * `candidates - printed`, which folded the cap and the scrub into a claim
   * about the evidence: a brief capped at three with eight good findings said
   * "3 above the bar · 5 below it" about five findings that were above it.
   */
  findingsHeld?: number
  /**
   * "27% of what was said on camera was not in English" — `MethodLines.language`,
   * with the basis it must never be printed without.
   *
   * NOT THE ARTBOARD'S PER-LANGUAGE BREAKDOWN. "Afrikaans 14% · German 6% ·
   * other 7%" needs a per-language count and the product records one bit —
   * English or not — on `video_speech`. The share it does hold is printed, with
   * its stated basis (D15).
   */
  languages?: string | null
  /**
   * "23 updates since 6 Apr 2026 · longest gap 35 days · last on 27 Sep 2026 —
   * your 3rd monthly reading, the quarter view needs 6" (`mkt.p7.delivery`).
   *
   * RUN-DATED AND SAYING SO. It is the record OF the deliveries, which is the
   * one figure a run's own clock is the honest index for — and it is the one
   * line on the numbers card that is NOT a month reading, which is why it sits
   * under the hairline rather than as a row beside them.
   */
  delivery?: string | null
}

/** report_snapshots.data for a document build (kind stays 'report'). */
export interface DocumentSnapshotData {
  version: 1
  kind: 'document'
  template: string
  reportId: string
  title: string
  audience: Audience
  company: string
  period: string
  runId: string | null
  figures: FigureTable
  delta: RunDelta | null
  /** The month this brief is a reading of (WP19). Absent on a brief built
   *  before item 43 and on a workspace with no monthly reading. */
  reading?: DocumentReading | null
  /** What it could not fill, and who closes each one (WP19). */
  missing?: DocumentMissingInput[]
  /** The borrowed page blocks, in the section map's order (WP19). */
  sections?: DocBriefSection[]
  /**
   * FALSE where this brief's map folds its title onto the first sheet of
   * content instead of spending a landscape sheet on it (E-marketing).
   *
   * FROZEN, AND ABSENT MEANS "KEEP THE COVER". A stored artefact re-renders
   * from this field, never from today's map: pagination is the artefact's, so a
   * brief that printed a cover, was shared on a `/r/<token>` and is opened
   * again next March prints the same sheets with the same numbers in the same
   * footers. The fold reaching a brief built before it landed is exactly the
   * re-pagination `documentSlides` refuses for `sheet` and `span`.
   */
  cover?: boolean
  /** Each borrowed surface's loader output, frozen — the same data the page
   *  drew, so the brief and the page cannot come to say different things
   *  (WP19). Quotes inside it freeze and resolve like any other snapshot's. */
  surfaces?: Record<string, unknown>
  /** Written pages and borrowed blocks in one order (WP19). Absent on a brief
   *  built before the section maps, which paginates off `pages` as it did. */
  layout?: DocLayoutEntry[]
  pages: DocPage[]
  /** What this document was COMPOSED FROM (WP7d, 2026-09-12), frozen beside
   *  the template key so a later reader (the structural eval, a rebuild, a
   *  person) can put the same skeleton back together. Absent on the four
   *  fixed templates, whose skeleton is the template's own, and on any
   *  document built before this was frozen. */
  blocks?: DocumentBlockKey[]
  role?: DocumentRole
  /** The operator's own instruction, as they wrote it. Operator prose, never
   *  a comment's words. */
  brief?: string
  /** How this template names a finding's consequence, frozen with the
   *  document so the deck and the email read the snapshot rather than a
   *  template that may have been renamed since (templates.ts Lens). */
  lens?: DocLens
  method: DocumentMethod
  /** Questions the corpus could not answer this update, said plainly. */
  notSureYet: string[]
  generatedAt: string
  model: string
  promptVersion: string
}

export const isDocumentData = (d: unknown): d is DocumentSnapshotData =>
  !!d && typeof d === 'object' && (d as { kind?: unknown }).kind === 'document' && Array.isArray((d as { pages?: unknown }).pages)

// ── the workings (Studio only) ────────────────────────────────────────────

export interface WorkingsPoint {
  /** G3: the index the writer cited. */
  id: string
  /** The agent's own sentence (model prose, never a comment). */
  text: string
  insightIds: string[]
  conversationCount: number
  themeLabels: string[]
  /** Quote refs (e:/c:), resolved live for the evidence view; text empty at rest. */
  quotes: Quote[]
  /** Which research question produced it. */
  questionId: string
}

export interface BlockWorkings {
  blockId: string
  basedOn: string[]
  /** The finding was carried from the previous build under this headline. */
  continuedFrom?: string | null
  /** The self-check's verdict on this block's claim, when it ran. */
  check?: 'echoes' | 'silent' | null
}

export interface DocumentWorkings {
  version: 1
  questions: { id: string; text: string; purpose: string; outcome: 'answered' | 'partial' | 'silent'; conversationCount: number; costUsd: number }[]
  points: WorkingsPoint[]
  blocks: BlockWorkings[]
  concerns: { label: string; buckets: { bucket: string; label: string; evidenceCount: number }[]; total: number; trajectory: string }[]
  /** Findings the self-check dropped, with the contradicting read. */
  dropped: { headline: string; reason: string }[]
  /** Custom briefs: whether the operator's own brief was answered, and the
   *  words of it the document never took up. This is WHY a build that
   *  dropped nothing can still ask to be read before it is sent. */
  brief?: { answered: boolean; subjects: string[]; missed: string[] } | null
  heldBack: number
  costUsd: number
  timings: Record<string, number>
}
