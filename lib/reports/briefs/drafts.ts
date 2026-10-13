import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { BRIEF_ROLES, isMonthlyBriefData, type BriefRole, type MonthlyBriefData } from './types'

// A month's four briefs from a folder an earlier build saved, for the script's
// --from (scripts/monthly-briefs.ts): stored as they were written, with no
// research and no model call. September 2026's dry drafts (4 Oct,
// `scripts/brief-set-dry.ts`) are the case: Heinrich read them and they are
// the month's briefs; writing them again would cost money and give different
// words.
//
// THE FOLDER holds `<role>_brief.json` for all four roles, each either the dry
// harness's `{ brief, workings }` (only `brief` is read) or the bare brief the
// script's own --out writes, and optionally the harness's `_set.json`, whose
// `clientId`, `month` and `builtAt` are checked and read.
//
// NOTHING IS FILLED IN BUT WHAT CODE ALREADY KNOWS: a brief written before
// `noun` was stored gets the tenant's noun from the same table the build reads
// (`WHAT_THEY_SELL`, passed in). The bars a newer compose draws from `measure`
// and `base` are not reconstructed from the printed words: the deck prints
// those rows as their sentences instead.

/** Whose set the folder must be, and which month. */
export interface DraftExpect {
  clientId: string
  /** The client's company name as the `clients` row has it. */
  company: string
  /** `YYYY-MM-01`. */
  month: string
  /** What the tenant sells, the build's `noun`. */
  noun: string | null
}

export interface DraftSet {
  /** The four briefs, in the roles' order. */
  briefs: MonthlyBriefData[]
  /** When the drafts were built (`_set.json`): when their figures were read. */
  builtAt: string | null
}

/** A folder's files, parsed: each role's brief file, and `_set.json`. */
export interface DraftFiles {
  briefs: Partial<Record<BriefRole, unknown>>
  set?: unknown
}

/** One saved brief: the harness's `{ brief, workings }` or the bare brief.
 *  Null where it is neither. Pure. */
export function briefOfFile(raw: unknown): MonthlyBriefData | null {
  const d = raw && typeof raw === 'object' && 'brief' in raw ? (raw as { brief: unknown }).brief : raw
  if (!isMonthlyBriefData(d)) return null
  // The ledger keeps what the brief held; a stored snapshot's data has none.
  if (!Array.isArray((d as Partial<MonthlyBriefData>).held)) return null
  return d as MonthlyBriefData
}

/** The set the files hold, or every reason they cannot be stored as the
 *  expected client's month. Pure. */
export function draftSetOf(files: DraftFiles, expect: DraftExpect): { ok: true; set: DraftSet } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const briefs: MonthlyBriefData[] = []
  for (const role of BRIEF_ROLES) {
    const file = `${role}_brief.json`
    if (files.briefs[role] === undefined) { errors.push(`${file} is missing`); continue }
    const d = briefOfFile(files.briefs[role])
    if (!d) { errors.push(`${file} is not a monthly brief`); continue }
    if (d.role !== role) errors.push(`${file} is the ${d.role} brief`)
    if (d.month !== expect.month) errors.push(`${file} is for ${d.month}, not ${expect.month}`)
    if (d.company.normalize('NFC') !== expect.company.normalize('NFC')) errors.push(`${file} is ${d.company}'s, not ${expect.company}'s`)
    briefs.push(d.noun === undefined ? { ...d, noun: expect.noun } : d)
  }
  const set = files.set && typeof files.set === 'object' ? (files.set as { clientId?: unknown; month?: unknown; builtAt?: unknown }) : null
  if (set && typeof set.clientId === 'string' && set.clientId !== expect.clientId) errors.push(`_set.json is client ${set.clientId}, not ${expect.clientId}`)
  if (set && typeof set.month === 'string' && set.month !== expect.month) errors.push(`_set.json is for ${set.month}, not ${expect.month}`)
  if (errors.length) return { ok: false, errors }
  const builtAt = set && typeof set.builtAt === 'string' && !Number.isNaN(Date.parse(set.builtAt)) ? new Date(set.builtAt).toISOString() : null
  return { ok: true, set: { briefs, builtAt } }
}

/** Read a saved set's folder (a file that is not JSON is an error). */
export function readDraftFiles(dir: string): DraftFiles {
  const at = resolve(process.cwd(), dir)
  const read = (name: string): unknown => {
    const file = join(at, name)
    if (!existsSync(file)) return undefined
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as unknown
    } catch (e) {
      throw new Error(`${file} is not JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const briefs: DraftFiles['briefs'] = {}
  for (const role of BRIEF_ROLES) {
    const raw = read(`${role}_brief.json`)
    if (raw !== undefined) briefs[role] = raw
  }
  return { briefs, set: read('_set.json') }
}
