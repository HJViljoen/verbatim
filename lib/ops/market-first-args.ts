// The flags every market-first script takes (plan §4.0 "Scripts", WP1.4).
//
//   - READ-ONLY BY DEFAULT. A script writes only with `--apply --project <ref>`.
//   - `--project` is always required and must be one of the two known refs,
//     chosen explicitly: staging `zfmxrrugaihxpubunleu` or production
//     `mkwjlckescdveosvrvaq`. The script refuses, before any read, when the
//     Supabase URL it was started with points anywhere else (`assertProject`),
//     so a paste that loads the wrong env file stops at the first line.
//   - It confirms by flags alone and NEVER prompts, so it works through `!`,
//     which has no tty.
//   - `--write` is refused by name: the Phase 1 scripts use it, and a paste that
//     mixes the two vocabularies must not be read as a dry run.
//
// PURE. Parsing and the refusal; the scripts do the reading.

export const MARKET_FIRST_PROJECTS = {
  zfmxrrugaihxpubunleu: 'staging',
  mkwjlckescdveosvrvaq: 'production',
} as const
export type ProjectRef = keyof typeof MARKET_FIRST_PROJECTS

export interface ScriptArgs {
  apply: boolean
  project: ProjectRef
  clientId: string
  /** Value flags, as given (`--out x` → out: 'x'). */
  values: Readonly<Record<string, string>>
  /** Boolean flags present (other than --apply). */
  flags: ReadonlySet<string>
}

export interface ScriptSpec {
  /** The script's name, for the messages. */
  name: string
  /** Value flags it accepts, without the dashes. */
  values?: readonly string[]
  /** Boolean flags it accepts, without the dashes. */
  flags?: readonly string[]
  /** The default client when --client is not given. */
  defaultClient: string
}

/** Parse argv. Throws a sentence on anything it does not know, so a typo is a
 *  refusal and never a silent dry run. */
export function parseScriptArgs(argv: readonly string[], spec: ScriptSpec): ScriptArgs {
  const values: Record<string, string> = {}
  const flags = new Set<string>()
  let apply = false
  let project: string | null = null
  let clientId = spec.defaultClient
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`${spec.name}: unexpected argument ${a}`)
    const name = a.slice(2)
    if (name === 'apply') apply = true
    else if (name === 'read-only') continue
    else if (name === 'write') throw new Error(`${spec.name}: --write is refused; this script writes only with --apply --project <ref>`)
    else if (name === 'project' || name === 'client' || spec.values?.includes(name)) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${spec.name}: --${name} needs a value`)
      if (name === 'project') project = v
      else if (name === 'client') clientId = v
      else values[name] = v
    } else if (spec.flags?.includes(name)) flags.add(name)
    else throw new Error(`${spec.name}: unknown flag --${name}`)
  }
  if (!project) {
    throw new Error(`${spec.name}: --project <ref> is required: zfmxrrugaihxpubunleu (staging) or mkwjlckescdveosvrvaq (production)`)
  }
  if (!(project in MARKET_FIRST_PROJECTS)) {
    throw new Error(`${spec.name}: --project ${project} is not allow-listed (${Object.keys(MARKET_FIRST_PROJECTS).join(', ')})`)
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clientId)) {
    throw new Error(`${spec.name}: --client must be a uuid, got ${clientId || '(empty)'}`)
  }
  return { apply, project: project as ProjectRef, clientId, values, flags }
}

/** The ref in a Supabase URL (`https://<ref>.supabase.co`), or null. */
export function projectRefOf(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const m = new URL(url).hostname.match(/^([a-z0-9]{20})\.supabase\.(co|in)$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Refuse, before any read, when the Supabase URL is not --project's. */
export function assertProject(args: Pick<ScriptArgs, 'project'>, supabaseUrl: string | undefined, name: string): void {
  const ref = projectRefOf(supabaseUrl)
  if (ref !== args.project) {
    throw new Error(`${name}: REFUSED: the Supabase URL points at ${ref ?? 'no Supabase project'}, not --project ${args.project}. Nothing read.`)
  }
}

/** The line a script prints first: what it will touch, and whether it writes. */
export function modeLine(args: ScriptArgs, name: string): string {
  const where = `${MARKET_FIRST_PROJECTS[args.project]} ${args.project}`
  return args.apply
    ? `${name}: APPLY on ${where}, client ${args.clientId}`
    : `${name}: read-only on ${where}, client ${args.clientId} (nothing is written; add --apply to write)`
}
