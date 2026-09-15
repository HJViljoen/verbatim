// Readiness — what each block of the product needs from this workspace, what is
// there, who fixes it (Phase 0 WP10, design item 18, decision D9).
//
// The page is the build gate: no engineering day is spent on a block whose row
// is red for the workspace it is being built for. So every row has to be a
// MEASUREMENT, not an impression — which is why the shapes below are plain
// data and `compute` is pure over them. `load.ts` does the reading (service
// role: the gate record, the change log and the decision ledger are all
// RLS-restricted), `compute.ts` decides what each row says, and the page
// renders it.
//
// Three things this file insists on:
//  - a row that depends on a table an unapplied migration adds says "not
//    recorded yet" and names what would record it, rather than throwing. The
//    migrations here are applied by hand, so a deploy can land first;
//  - the status vocabulary is three words, and the third is `partial` — half a
//    block's inputs is not a pass and is not a failure either;
//  - no pipeline vocabulary reaches a label. An update is an update, a video is
//    a video, and nothing on this page says "run", "pass" or a tier number.

/** Does the block have what it needs? `partial` is the honest middle: the
 *  input exists but does not cover what the block will be asked to draw. */
export type ReadinessStatus = 'exists' | 'partial' | 'missing'

export const READINESS_STATUSES: readonly ReadinessStatus[] = ['exists', 'partial', 'missing'] as const

/** The pill's word. Deliberately plain: the page is read by one person making
 *  a build decision, and "In place / Partly / Missing" is what they are asking. */
export const STATUS_LABEL: Record<ReadinessStatus, string> = {
  exists: 'In place',
  partial: 'Partly',
  missing: 'Missing',
}

/** Who can actually close the gap. The distinction earns its place: the rival
 *  accounts row is the only red on Össur that costs no engineering time at all,
 *  and a page that does not say so buries it among the ones that do. */
export type OwnerRole = 'client' | 'ops' | 'engineering'

export const OWNER_LABEL: Record<OwnerRole, string> = {
  client: 'Client',
  ops: 'Verbatim ops',
  engineering: 'Verbatim engineering',
}

/** One block of the product, one input it needs. */
export interface ReadinessRow {
  /** Stable key — used by React and by the tests, never shown. */
  id: string
  /** The block of the product this input belongs to. */
  block: string
  /** The input itself, in the client's words. */
  input: string
  status: ReadinessStatus
  /** What is measured today, in one sentence. */
  detail: string
  owner: OwnerRole
  /** The act that changes the status. One sentence, always something someone
   *  can do — never "it will be built at some point". */
  unlocks: string
  /** The rows behind the sentence: per rival, per community, per audience. */
  notes: string[]
}

// ---- Inputs -----------------------------------------------------------------

/** One tracked rival: whether their own accounts are configured, and what has
 *  actually been captured and read from them. Configured and read are different
 *  states and the row must not conflate them — Sealand has 73 of a rival's own
 *  posts captured and 3 read. */
export interface RivalInput {
  name: string
  /** Platforms with a handle configured, in the order the page prints them. */
  handlePlatforms: string[]
  /** Their own posts stored for this workspace. */
  captured: number
  /** Of those, captured inside the recency window the page prints. */
  capturedRecently: number
  /** Of those, the ones an update has actually read. */
  analysed: number
}

/** The words each update searches, in the three buckets the product has. */
export interface TermsInput {
  brand: number
  competitor: number
  industry: number
  /** Senses of a name that are NOT this brand ("Cotopaxi the volcano"). */
  exclude: number
  /** `tracking_configs.updated_at` — A FLOOR, NOT A LAST-EDIT DATE. Four of
   *  the ten write paths skip the column on purpose (subreddit discovery and
   *  its probe among them), so the row can change without it moving: on Össur
   *  it reads 18 Aug against a community discovered 13 Sep. The row prints it
   *  as a floor and defers to the change log wherever one exists. */
  updatedAt: string | null
}

/** One watched Reddit community. `probed` is false for a community set by hand
 *  as well as for one nobody has sampled yet, so the two are separated by
 *  status rather than by this flag alone. */
export interface CommunityInput {
  name: string
  status: 'active' | 'candidate' | 'rejected'
  probed: boolean
  /** Posts stored from this community, all time. */
  postsStored: number
}

/** How much of the workspace's insight corpus the assistant can search. */
export interface EmbeddingInput {
  embedded: number
  total: number
  /** Null both when nothing has been written and when the column that would
   *  record it is not there yet — the row says "no date recorded" either way,
   *  because it cannot tell them apart and must not guess. */
  lastEmbeddedAt: string | null
}

/** One month of one audience, from the stored monthly reading. */
export interface MonthCountRow {
  month: string
  audience: string
  videos: number
  comments: number
}

/** The monthly reading, or null when it has not been seeded (its tables are
 *  added by a migration applied by hand). */
export interface MonthlyInput {
  months: MonthCountRow[]
  /** Audiences this workspace tracks, whether or not they have a month — a
   *  rival nobody has posted about is an answer, not an omission. */
  tracked: string[]
}

/** What each update could read of a video, and what it threw away. */
export interface ReadInput {
  /** Videos read, Reddit excluded — Reddit has no speech and no screen. */
  analysed: number
  speech: number
  translated: number
  onScreenText: number
  /** Videos read before the product recorded which of the three it managed. */
  unflagged: number
  /** The discard record. */
  gateRows: number
  gateKept: number
  /** When the discard record starts. Null = nothing recorded. */
  gateFirstAt: string | null
}

/** One update, as the delivery record holds it. `scheduledFor` and `stalled`
 *  are optional because the columns that carry them are added by a migration
 *  applied by hand; `slotsRecorded` on the inputs says which it is. */
export interface UpdateInput {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  scheduledFor?: string | null
  stalled?: boolean | null
}

export interface DeliveryInput {
  /** `tracking_configs.report_period`, including 'paused'. */
  period: string
  schedules: { name: string; active: boolean; recipients: number; lastSentAt: string | null }[]
}

export interface ChangeLogInput {
  /** False before the change log's migration is applied. */
  available: boolean
  /** Changes actually RECORDED — `source <> 'reconstructed'`. The boundary
   *  sentence this page prints everywhere says the record begins at the first
   *  logged row and everything before it is inference, so a reconstructed row
   *  counted here would make the page contradict its own sentence: after the
   *  backfill's 91 backdated rows a workspace with nothing logged would read
   *  "33 changes recorded · In place". */
  rows: number
  /** Backdated rows written by scripts/reconstruct-config-log.ts. Counted
   *  separately because a prehistory is worth naming and is not a record. */
  reconstructed: number
  /** The first RECORDED change — where the record begins. Null while only
   *  reconstructed rows exist. */
  firstLoggedAt: string | null
  /** The last RECORDED change, for the same reason. */
  lastChangeAt: string | null
}

export interface RecommendationInput {
  total: number
  /** Carry a link to the recommendation they follow from. */
  withLineage: number
  /** Decisions the client has recorded, or null when nothing can record one
   *  yet (the ledger's migration is not applied). */
  decisions: number | null
}

export interface RetentionInput {
  /** The day the oldest batch of YouTube comments was last read, `YYYY-MM-DD`,
   *  or null when this workspace holds none. */
  cohortDay: string | null
  cohortRows: number
  /** Comments one night's re-read can cover — ACROSS EVERY WORKSPACE, not
   *  this one: the nightly job selects the due set with no client filter and
   *  caps the distinct ids globally. The row says so rather than promising
   *  this workspace a night of its own. */
  nightlyCap: number
  /** Days after a comment was last read before it is read again. */
  dueAfterDays: number
}

/** Everything the thirteen rows are computed from. One object, so `compute`
 *  can be exercised on a workspace's shape without a database. */
/** What the weekly anomaly check has actually said. `available` is false until
 *  20260918096000 is applied — which is a different answer from "the rule has
 *  never fired", and the row says which. */
export interface AnomalyInput {
  available: boolean
  /** Flags raised, newest first, as `anomaly_flags` holds them. */
  flags: { weekStart: string; objectKind: string; label: string }[]
}

export interface ReadinessInputs {
  tenant: string
  /** The instant the page was drawn, ISO. Passed in rather than read, so the
   *  same inputs always produce the same rows. */
  now: string
  rivals: RivalInput[]
  terms: TermsInput
  communities: CommunityInput[]
  reddit: { postsStored: number; postsFromUnconfigured: number }
  embeddings: EmbeddingInput
  /** The subject set: null while the product has no such concept. */
  subjectSet: { defined: number | null }
  monthly: MonthlyInput | null
  /** The check's own record. */
  anomaly: AnomalyInput
  reads: ReadInput
  /** Every update this workspace has had, newest first. */
  updates: UpdateInput[]
  /** Whether the slot each update served is recorded at all. */
  slotsRecorded: boolean
  delivery: DeliveryInput
  changeLog: ChangeLogInput
  recommendations: RecommendationInput
  retention: RetentionInput
  /** Videos a month needs on each side before the product will compare it —
   *  `SHARE_BAND.minN`. Passed in so the page prints the floor it counted
   *  against rather than a number in a comment. */
  floor: number
  /** How many of the most recent updates the delivery row prints. */
  recentUpdates: number
}

/** The audience bucket strings, in the client's words. `competitor:<name>`
 *  carries the name exactly as configured, spaces and capitals included. */
export function audienceLabel(audience: string): string {
  if (audience === 'client') return 'Your own brand'
  if (audience === 'industry-other') return 'The category'
  return audience.startsWith('competitor:') ? audience.slice('competitor:'.length) : audience
}
