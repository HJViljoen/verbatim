import { DOCUMENT_BRIEF_MAX } from '../../config'
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

/** What a finding's consequence is called on paper: "What it means for a
 *  sale" and its short form. The template's own (templates.ts Lens), frozen
 *  into the snapshot so the deck never has to look a template up. */
export interface DocLens {
  means: string
  short: string
}

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
  pages: DocPage[]
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
  heldBack: number
  costUsd: number
  timings: Record<string, number>
}
