import { readFileSync } from 'fs'

import { SEALAND_CLIENT_ID } from '../lib/config'

// The subjects Daniela confirms on the 13 Oct call, as SQL paste lines
// (market-first plan WP3.1, decision G). NO READ: it reads one local JSON file
// and prints SQL; it never connects to a database, so it needs no env file and
// no --project, and nothing it prints has been checked against the rows. The
// paste itself is written so that running it twice changes nothing.
//
//   node --import tsx scripts/new-subjects.ts --from-file <confirmed.json> [--client <uuid>]
//
// THE FILE, the set the client confirmed, in the client's words:
//
//   {
//     "confirmedOn": "2026-10-13",
//     "subjects": [
//       { "name": "Travel fit & carry-on", "description": "How the bags fit airline cabins, one-bag travel and packing" },
//       { "name": "Looks & style" }
//     ]
//   }
//
// A subject WITH a description may be new: the paste activates a proposed row
// of that name and description, or inserts it as active when no live row of
// that name exists. A subject WITHOUT one confirms a live subject already
// there (one of today's eight the client chose to keep) and inserts nothing.
//
// WHAT THE PASTE DOES, in one transaction (a failure rolls all of it back):
//   1. per subject with a description: the proposed row of that name and
//      description becomes active (M4's status trigger logs it), then an insert
//      if no live row of that name exists (M14's insert trigger logs it,
//      20260924091000_subjects_insert_audit.sql: created_by stays null, so the
//      trigger fires and names the SQL editor as the actor);
//   2. per subject: one `config_changes` row, surface 'subjects', field
//      'confirmed', naming the subject's id and the call's date, written only
//      once per subject. It is what lets Settings print "you confirmed it"
//      truthfully (lib/settings/subject-origin.ts): M14's own note says no member
//      confirmed the row, and without this line a subject the client chose on
//      the call would read "picked for you, not yet confirmed" for ever;
//   3. the cap: more than NEW_SUBJECTS_CAP active subjects raises, and the
//      transaction rolls back. The editor enforces SUBJECTS_MAX; this paste
//      does not go through the editor, so it carries the cap itself;
//   4. every name in the file must be active by then, or it raises and rolls
//      back, naming them (a proposed row whose description is not the file's
//      is left alone, and a kept name with no live row has nothing to confirm);
//   5. a closing select that shows each confirmed name with its status.
//
// Heinrich pastes it into production's SQL editor by Sat 17 Oct, after the
// membership spend yes. Nothing is counted for a new subject until
// scripts/subject-membership.ts --apply --subjects <names> has judged it.

const NAME = 'new-subjects'

/** Decision G's cap (8 → 10). The paste lands before the editor's
 *  SUBJECTS_MAX moves to 10 (it rides deploy 4 or 5), so it names the new cap
 *  itself; lib/subjects/types.test.ts pins the two equal once it has moved. */
export const NEW_SUBJECTS_CAP = 10

/** subjects.name CHECK: 1 to 60 characters once trimmed. */
const NAME_MAX = 60
/** subjects.description CHECK: at most 400. */
const DESCRIPTION_MAX = 400
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const ORIGINS = ['own_claims', 'category_theme', 'client'] as const
type Origin = (typeof ORIGINS)[number]

export interface ConfirmedSubject {
  name: string
  /** Null: confirm a live subject already there; insert nothing. */
  description: string | null
  /** Where the name came from. The candidates for the call were raised by
   *  the market (plan §2.3), so 'category_theme' unless the file says so. */
  origin: Origin
}

export interface ConfirmedSet {
  confirmedOn: string
  subjects: ConfirmedSubject[]
}

/** The file, checked. Throws one sentence naming everything wrong with it, so a
 *  bad file prints no SQL at all. */
export function parseConfirmedSet(raw: unknown): ConfirmedSet {
  const problems: string[] = []
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const confirmedOn = typeof o.confirmedOn === 'string' ? o.confirmedOn : ''
  if (!ISO_DAY.test(confirmedOn) || Number.isNaN(Date.parse(`${confirmedOn}T00:00:00Z`))) {
    problems.push('confirmedOn must be the call\'s date as YYYY-MM-DD')
  }
  const list = Array.isArray(o.subjects) ? o.subjects : null
  if (!list || list.length === 0) problems.push('subjects must be a non-empty list')
  const subjects: ConfirmedSubject[] = []
  const seen = new Set<string>()
  for (const [i, item] of (list ?? []).entries()) {
    const s = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const name = typeof s.name === 'string' ? s.name.trim() : ''
    const where = `subjects[${i}]${name ? ` ("${name}")` : ''}`
    if (!name) { problems.push(`${where}: a name is required`); continue }
    if (name.length > NAME_MAX) problems.push(`${where}: the name is over ${NAME_MAX} characters`)
    // A name is client copy: no em dash (plan §4.0), and one line.
    if (/[—\n\r\t]/.test(name)) problems.push(`${where}: the name carries an em dash or a line break`)
    const key = name.toLowerCase()
    if (seen.has(key)) problems.push(`${where}: named twice`)
    seen.add(key)
    let description: string | null = null
    if (s.description != null) {
      if (typeof s.description !== 'string' || !s.description.trim()) problems.push(`${where}: a description, when given, is one sentence`)
      else {
        description = s.description.trim()
        if (description.length > DESCRIPTION_MAX) problems.push(`${where}: the description is over ${DESCRIPTION_MAX} characters`)
        if (/[—\n\r]/.test(description)) problems.push(`${where}: the description carries an em dash or a line break`)
      }
    }
    const origin = s.origin == null ? 'category_theme' : s.origin
    if (!(ORIGINS as readonly unknown[]).includes(origin)) problems.push(`${where}: origin must be one of ${ORIGINS.join(', ')}`)
    subjects.push({ name, description, origin: origin as Origin })
  }
  if (subjects.length > NEW_SUBJECTS_CAP) problems.push(`${subjects.length} subjects confirmed; the cap is ${NEW_SUBJECTS_CAP}`)
  if (problems.length > 0) throw new Error(`${NAME}: the file is refused, nothing printed:\n  ${problems.join('\n  ')}`)
  return { confirmedOn, subjects }
}

/** A SQL string literal. standard_conforming_strings is on (the Supabase
 *  default), so a doubled quote is the only escape. */
export function sqlText(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/** The note the confirmation row stores. Tenant-readable and stored for good,
 *  so it holds to plan §4.0: no digit, no em dash, no direction word. The date
 *  is in `after.confirmed_on` and in `changed_at`. */
export const CONFIRMED_NOTE = 'Confirmed with you.'

/** The actor label: the script, never a person's name (actor_label is
 *  tenant-readable). */
export const CONFIRMED_ACTOR = `scripts/${NAME}.ts`

/** The paste, one statement a line. */
export function activationSql(set: ConfirmedSet, clientId: string): string[] {
  if (!UUID.test(clientId)) throw new Error(`${NAME}: --client must be a uuid, got ${clientId}`)
  const c = `${sqlText(clientId)}::uuid`
  const same = (col: string, name: string) => `lower(trim(${col})) = lower(trim(${sqlText(name)}))`
  const out: string[] = [
    `-- ${NAME}: ${set.subjects.length} confirmed subject(s) for client ${clientId}, confirmed ${set.confirmedOn}. Paste the whole block once; a second paste changes nothing.`,
    'begin;',
  ]
  for (const s of set.subjects) {
    out.push(`-- ${s.name}${s.description ? '' : ' (kept: confirms the live subject of this name, inserts nothing)'}`)
    if (s.description) {
      out.push(
        `update public.subjects set status = 'active', updated_at = now() where client_id = ${c} and ${same('name', s.name)} ` +
        `and status = 'proposed' and description is not distinct from ${sqlText(s.description)};`,
      )
      out.push(
        `insert into public.subjects (client_id, name, description, origin, status) select ${c}, ${sqlText(s.name)}, ` +
        `${sqlText(s.description)}, ${sqlText(s.origin)}, 'active' where not exists (select 1 from public.subjects ` +
        `where client_id = ${c} and ${same('name', s.name)} and status <> 'retired');`,
      )
    }
    out.push(
      'insert into public.config_changes (client_id, surface, field, before, after, actor_kind, actor_label, source, note) ' +
      `select s.client_id, 'subjects', 'confirmed', null, jsonb_build_object('id', s.id, 'name', s.name, 'confirmed_on', ${sqlText(set.confirmedOn)}), ` +
      `'operator', ${sqlText(CONFIRMED_ACTOR)}, 'logged', ${sqlText(CONFIRMED_NOTE)} from public.subjects s ` +
      `where s.client_id = ${c} and s.status = 'active' and ${same('s.name', s.name)} and not exists (select 1 from public.config_changes x ` +
      `where x.client_id = s.client_id and x.surface = 'subjects' and x.field = 'confirmed' and x.after ->> 'id' = s.id::text);`,
    )
  }
  out.push(
    `do $$ begin if (select count(*) from public.subjects where client_id = ${c} and status = 'active') > ${NEW_SUBJECTS_CAP} ` +
    `then raise exception '${NAME}: more than ${NEW_SUBJECTS_CAP} active subjects; nothing written'; end if; end $$;`,
  )
  // EVERY NAMED SUBJECT IS ACTIVE, OR NOTHING IS WRITTEN. A proposed row of the
  // name whose description differs from the file's is neither activated nor
  // shadowed by an insert, and a kept name with no live row confirms nothing;
  // both used to COMMIT quietly and show only in the closing select. The file
  // is then corrected (the stored description, or the row retired) and pasted
  // again.
  const names = set.subjects.map((s) => `lower(trim(${sqlText(s.name)}))`).join(', ')
  out.push(
    `do $$ declare v_missing text; begin select string_agg(n, ', ') into v_missing from unnest(array[${names}]) as n ` +
    `where not exists (select 1 from public.subjects s where s.client_id = ${c} and s.status = 'active' and lower(trim(s.name)) = n); ` +
    `if v_missing is not null then raise exception '${NAME}: not active after the paste: %; nothing written', v_missing; end if; end $$;`,
  )
  out.push('commit;')
  out.push(
    `select s.name, s.status, s.origin, exists (select 1 from public.config_changes x where x.client_id = s.client_id and x.surface = 'subjects' ` +
    `and x.field = 'confirmed' and x.after ->> 'id' = s.id::text) as confirmed from public.subjects s where s.client_id = ${c} ` +
    `and s.status <> 'retired' and lower(trim(s.name)) in (${names}) order by s.name;`,
  )
  return out
}

function parseArgs(argv: readonly string[]): { file: string; clientId: string } {
  let file: string | null = null
  let clientId = SEALAND_CLIENT_ID
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from-file') file = argv[++i] ?? null
    else if (a === '--client') clientId = argv[++i] ?? ''
    else if (a === '--apply' || a === '--write') throw new Error(`${NAME}: ${a} is refused; this script writes nothing, it prints SQL to paste`)
    else throw new Error(`${NAME}: unknown argument ${a}`)
  }
  if (!file) throw new Error(`${NAME}: --from-file <confirmed.json> is required`)
  return { file, clientId }
}

function main() {
  const { file, clientId } = parseArgs(process.argv.slice(2))
  const set = parseConfirmedSet(JSON.parse(readFileSync(file, 'utf8')))
  for (const line of activationSql(set, clientId)) console.log(line)
}

if (process.argv[1]?.endsWith('new-subjects.ts')) {
  try {
    main()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
