import type { PageKey, PrintVariant, Slide } from '../renderables/types'
import type { MethodNoteData } from '../../components/print/method-note'
import type { RunDelta } from '../report-delta'
import type { DocumentSettings } from './documents/types'

/**
 * The Report Studio's model (Reports & Exports Stage 2, 2026-08-30).
 *
 * A report is an ORDERED LIST OF SECTIONS. A section names a page, the page's
 * own selection (its URL params, exactly as the operator had them), which of
 * the page's static tiles to include, whether to append the page's per-item
 * slides (`full`), and one line of the operator's framing. Nothing else:
 * layouts are the pages' own, ordering is at page level (Heinrich, 2026-08-29
 * — "page/item-level ordering only"), and a section can only name what the
 * renderable catalogue already produces. The moment a template needs a page
 * the pipeline does not make, that is a pipeline feature, not a template.
 *
 * Building a report freezes each section's tile-ready data into ONE snapshot
 * of kind 'report' (lib/reports/build.ts). Everything downstream — render,
 * artifacts, erasure, share links — treats it as any other snapshot.
 */

export type Audience = 'leadership' | 'marketing' | 'sales' | 'content' | 'general'

export const AUDIENCES: { key: Audience; label: string; reader: string }[] = [
  { key: 'leadership', label: 'Leadership', reader: 'the people who decide' },
  { key: 'marketing', label: 'Marketing', reader: 'the people who act on it' },
  { key: 'sales', label: 'Sales', reader: 'the people who talk to customers' },
  { key: 'content', label: 'Content', reader: 'the people who make things' },
  { key: 'general', label: 'General', reader: 'anyone in the company' },
]

export const isAudience = (v: unknown): v is Audience => typeof v === 'string' && AUDIENCES.some((a) => a.key === v)

/** Pages a NEW section may name. The agent page joins only through "add to
 *  report" from a thread (its params carry the thread id).
 *
 *  Phase 1 WP9: `dashboard` left this list and did not leave the registry.
 *  `SECTION_PAGES` is the Studio's picker — what an operator may ADD today —
 *  and Overview replaces the Dashboard, so nothing new should name it. But
 *  three stored `reports` rows already do, one of them the active weekly
 *  schedule, and a zod enum narrowed to this list would refuse the next edit
 *  to those rows. So validation reads `ALL_SECTION_PAGES` and the picker reads
 *  this one: a stored report stays editable, and no new one is offered a
 *  retired page. `week` is deliberately absent for Phase 1 — it is a page key
 *  and a module, and it is not composable into a report until it has been read
 *  for a few weeks. */
export const SECTION_PAGES: PageKey[] = ['overview', 'subjects', 'market', 'voice', 'competitive', 'content', 'profile', 'agent']

/** Pages a STORED section may still name — the retired keys whose modules are
 *  kept registered so already-built artefacts keep rendering every tile. */
export const LEGACY_SECTION_PAGES: PageKey[] = ['dashboard']

/** What validation accepts: what may be added, plus what is already stored. */
export const ALL_SECTION_PAGES: PageKey[] = [...SECTION_PAGES, ...LEGACY_SECTION_PAGES]

/**
 * May a NEW section name this page today? — the picker's own rule, written
 * once (Block D wave 2).
 *
 * `SECTION_PAGES` minus `agent`, which joins a report only through "add to
 * report" from a thread (its params carry the thread id) and so is not
 * something a reader picks off a list.
 *
 * IT LIVES HERE AND NOT IN `catalogue.ts` because two surfaces apply it and
 * one of them is a CLIENT component: `lib/reports/catalogue.ts` imports the
 * page registry, and pulling that into the editor's bundle takes every page
 * loader — and `node:async_hooks` — with it. This file imports a type and
 * nothing else.
 */
export const isPickablePage = (page: PageKey): boolean =>
  page !== 'agent' && SECTION_PAGES.includes(page)

export interface ReportSection {
  /** Client-minted, stable across edits (React keys, reorder, remove). */
  id: string
  page: PageKey
  /** The page's URL params, verbatim — `{ vs: 'Ottobock' }`, `{ theme: '…' }`. `{}` = the page's default. */
  params: Record<string, string>
  /** Static renderable keys (`competitive.faceoff`); undefined = every slide the page prints by default.
   *  Computed per-item keys (`voice.theme:3`) are never stored — they index loaded data. */
  keys?: string[]
  variant?: PrintVariant
  /** ≤ REPORT_FRAMING_MAX chars, the operator's own words. Rendered as a note on the section's first slide. */
  framing?: string
}

export const REPORT_FRAMING_MAX = 200
export const REPORT_TITLE_MAX = 120

export interface CoverSpec {
  register: Audience
  /** Overrides the generated title when set. */
  title?: string
  /** Who it is written for, in the operator's words (Stage 3): free text; overrides the register's reader in the cover prompt. */
  reader?: string
}

/** Two kinds of report (2026-08-31). `arranged` = the ordered list of page
 *  sections above. `document` = written by the agent in a role inside a fixed
 *  skeleton (lib/reports/documents); its `sections` are empty and its
 *  `settings` carry the few choices a document has. */
export type ReportKind = 'arranged' | 'document'
export const isReportKind = (v: unknown): v is ReportKind => v === 'arranged' || v === 'document'

export interface ReportRow {
  id: string
  client_id: string
  kind: ReportKind
  template_key: string | null
  title: string
  audience: Audience
  sections: ReportSection[]
  cover: CoverSpec
  /** Document reports only; `{}` on arranged rows. */
  settings: Partial<DocumentSettings>
  status: 'draft' | 'built'
  latest_snapshot_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** One asynchronous build of a document report (report_builds). `status` is
 *  also the phase: queued → researching → writing → checking → rendering →
 *  (delivering) → done | failed. Writes go through the service role; a
 *  tenant reads its own rows to poll. */
export type ReportBuildStatus = 'queued' | 'researching' | 'writing' | 'checking' | 'rendering' | 'delivering' | 'done' | 'failed'
export const BUILD_ACTIVE: ReportBuildStatus[] = ['queued', 'researching', 'writing', 'checking', 'rendering', 'delivering']

export interface ReportBuildRow {
  id: string
  client_id: string
  report_id: string | null
  schedule_id: string | null
  send_id: string | null
  run_id: string | null
  status: ReportBuildStatus
  needs_review: boolean
  error: string | null
  snapshot_id: string | null
  artifact_id: string | null
  cost_usd: number
  requested_by: string | null
  started_at: string
  finished_at: string | null
}

/** An operator's edit of one block of a built document (report_edits): an
 *  overlay applied at read, never a change to the snapshot. */
export interface ReportEditRow {
  id: string
  client_id: string
  snapshot_id: string
  block_id: string
  text: string
  edited_by: string | null
  edited_at: string
}

export interface ReportTemplate {
  key: string
  name: string
  audience: Audience
  /** One line for the picker: who it is for and what it holds. */
  description: string
  sections: Omit<ReportSection, 'id'>[]
  /** Retired (Phase 1 WP17): still RESOLVABLE, because stored schedules name
   *  it and must keep sending exactly what they sent — but never offered for a
   *  new report. `starterTemplates()` is the picker's list; `starterTemplate()`
   *  is the resolver and answers retired keys too. */
  retired?: boolean
  /** An ARTEFACT rather than an arrangement of page sections (Phase 1 WP17):
   *  the weekly report is composed from block keys, so it has no `sections` and
   *  must never be offered as a starting point for a report. It is here so that
   *  a schedule may NAME it — `starter_key` is what the send path branches on
   *  until M8's `artefact` column lands. */
  artefact?: boolean
}

/** One frozen section inside a report snapshot. `data` is the page loader's
 *  tile-ready output (quotes as refs once frozen); `method` is read off it at
 *  render for the slide footer. */
export interface SectionData {
  section: ReportSection
  /** The page module's snapshotTitle — "Competitive Intelligence · Össur · Sun 23 Aug". */
  title: string
  /** The slide header's right-hand context (printContext ?? title). */
  context: string
  data: unknown
}

/** A named figure the cover may cite — computed in code, never by a model. */
export interface Figure {
  label: string
  value: string
  /** How the placeholder reads: a count is followed by what it counts, a
   *  percentage stands where the % reads, a name where the name reads. */
  kind: 'count' | 'pct' | 'name'
}
export type FigureTable = Record<string, Figure>

/**
 * A figure keyed by a record's UUID — `o_2418f4d7_54a2_497e_8433_6cd89bc2322b_share`,
 * which is how a page block names a per-theme figure.
 *
 * WHY IT IS SINGLED OUT. `substituteFigures` (lib/reports/cover.ts) drops the
 * WHOLE SENTENCE whose figure key is missing, so a token is only safe to offer
 * a model if the model can retype it. Every token ever offered before was a
 * short human word; a 36-character hex string is one wrong character away from
 * silently deleting a sentence from a paid document, and nothing in the prompt
 * or in checkDocument guards a figure key.
 */
export const isOpaqueFigureKey = (key: string): boolean => /^[a-z]_[0-9a-f]{8}_[0-9a-f]{4}_/.test(key)

/** The cover as stored: prose with `[[figure_key]]` placeholders. The
 *  numbers are substituted at render from `figures` (lib/reports/cover.ts). */
export interface CoverText {
  title: string
  body: string
  register: Audience
  /** True when the model was unavailable or its prose was unusable and the cover was composed in code. */
  fallback: boolean
  generatedAt: string
  model: string | null
}

/** report_snapshots.data for kind 'report'. */
export interface ReportSnapshotData {
  version: 1
  reportId: string
  title: string
  audience: Audience
  company: string
  period: string
  cover: CoverText
  figures: FigureTable
  sections: SectionData[]
  /** What moved since the previous update — numbers and banded verdicts,
   *  frozen at build (Stage 3); null on a first update or when unknown. */
  delta?: RunDelta | null
}

export type DeckSlide =
  | { kind: 'cover'; n: number }
  | { kind: 'section'; n: number; sectionIndex: number; slide: Slide; first: boolean }

export function methodOf(data: unknown): MethodNoteData | null {
  const m = (data as { method?: MethodNoteData } | null)?.method
  return m && typeof m === 'object' && typeof m.company === 'string' ? m : null
}
