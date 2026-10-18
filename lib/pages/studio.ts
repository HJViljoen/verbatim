/**
 * The Studio's client half (pages build, 1 Oct): "Your reports" and the past
 * issues, as the approved Page-Studio artboard draws them.
 *
 * FIVE REPORTS, ONE ROW EACH, WHETHER OR NOT ANYTHING SENDS THEM. The weekly
 * (everyone, after each weekly update) and the four monthly briefs. Each row says who it is
 * for, how often, who gets it (the schedule's recipients, named where they are
 * on the team) and the latest issue. The recipient list is the schedule's
 * `recipients`, keyed by artefact (`report_schedules.artefact`), which is what
 * Settings › Reports and recipients wrote before it moved here.
 *
 * Pure: no I/O, no clock of its own. The page reads the rows and passes `now`.
 */

import { artefactTitle, scheduleArtefact } from '@/lib/schedules/artefact'
import { UPDATE_DAY } from '@/lib/update-rhythm'

export type StudioArtefact = 'weekly_read' | 'brief:sales' | 'brief:marketing' | 'brief:content' | 'brief:leadership'

export interface StudioReportDef {
  artefact: StudioArtefact
  name: string
  /** The one line under the name. `{tenant}` is the workspace's name. */
  what: (tenant: string) => string
  forWho: string
  /** How often (the weekly's, `WEEKLY_HOW_OFTEN_PAUSED` on a paused
   *  workspace). */
  howOften: string
  kind: 'weekly' | 'monthly'
}

/** WHAT THE WEEKLY PRINTS (version 3, the H7 boards, 18 Oct): the week in one
 *  line and what it means, what stood out, what the market is talking about
 *  (the subjects, the groups, the products), and what to do next (the post
 *  ideas, the replies, the advice). No findings: the full read is one click
 *  away. */
export const WEEKLY_WHAT = 'The week in one line and what it means, what stood out, what your market is talking about, and what to do next.'

/** WHEN IT REALLY GOES: the issue is built when the workspace's update
 *  finishes and goes in the past issues at once (the email follows at once,
 *  or once it is reviewed). Every workspace updates weekly, on Sunday
 *  (lib/update-rhythm.ts, the one source for the rhythm's words; the stored
 *  day is never read for copy), so the weekly goes every Sunday; a paused
 *  workspace is promised no update, and says only "after each weekly update".
 *  Not a Monday, which is what this row said until version 3. */
export const WEEKLY_HOW_OFTEN = `Every ${UPDATE_DAY.charAt(0).toUpperCase()}${UPDATE_DAY.slice(1)}, after the update`
export const WEEKLY_HOW_OFTEN_PAUSED = 'After each weekly update'

/** The artboard's five rows, in its order. */
export const STUDIO_REPORTS: readonly StudioReportDef[] = [
  {
    artefact: 'weekly_read',
    name: 'The weekly',
    what: () => WEEKLY_WHAT,
    forWho: 'Everyone',
    howOften: WEEKLY_HOW_OFTEN,
    kind: 'weekly',
  },
  {
    artefact: 'brief:sales',
    name: 'Sales brief',
    what: () => 'Who is buying, what holds them back, and the words to use.',
    forWho: 'Sales',
    howOften: 'Monthly',
    kind: 'monthly',
  },
  {
    artefact: 'brief:marketing',
    name: 'Marketing brief',
    what: () => 'What you say against what your market hears, and how rivals are seen.',
    forWho: 'Marketing',
    howOften: 'Monthly',
    kind: 'monthly',
  },
  {
    artefact: 'brief:content',
    name: 'Content brief',
    what: () => "The questions people ask, and what works in your market's videos.",
    forWho: 'Content',
    howOften: 'Monthly',
    kind: 'monthly',
  },
  {
    artefact: 'brief:leadership',
    name: 'Leadership brief',
    what: () => 'Where your market stands, where you stand against rivals, and the risks.',
    forWho: 'Leadership, and anyone outside a team',
    howOften: 'Monthly',
    kind: 'monthly',
  },
]

/** The schedule facts a row needs. */
export interface StudioSchedule {
  id: string
  name: string
  artefact: string | null
  starter_key: string | null
  recipients: string[]
  active: boolean
}

/** An issue on the platform (`report_sends`): sent (emailed), or put on the
 *  platform without its email (`published_at`, lib/schedules/publish.ts). */
export interface StudioSend {
  id: string
  schedule_id: string | null
  schedule_name: string | null
  snapshot_id: string | null
  artifact_id: string | null
  subject: string | null
  /** When it was emailed; null for a build published without its email. */
  sent_at: string | null
  /** When it was put on the platform without its email; absent or null where
   *  it was not (a database before the publish migration has no column). */
  published_at?: string | null
}

/** When an issue reached the platform: its email, else its publishing. */
const issueAt = (s: Pick<StudioSend, 'sent_at' | 'published_at'>): string => s.sent_at ?? s.published_at ?? ''

/** A member of the workspace, for naming a recipient. */
export interface StudioMember {
  email: string
  full_name: string | null
}

export interface StudioPerson {
  name: string
  initials: string
  email: string
}

export interface StudioRow {
  artefact: StudioArtefact
  name: string
  what: string
  forWho: string
  howOften: string
  people: StudioPerson[]
  /** The addresses as stored, for the editor. */
  recipients: string[]
  /** Whether the schedule sends today (the editor keeps it as it is). */
  active: boolean
  /** Whether a schedule row exists for this report yet. */
  scheduled: boolean
  /** "Mon 5 Oct", "First issue Mon 5 Oct", "First issue early October", or
   *  null where nothing can be said. */
  latest: string | null
}

/** Studio's own time zone: the client's week starts on a South African Monday. */
export const STUDIO_TZ = 'Africa/Johannesburg'

const WEEKDAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dayParts = (now: Date): { weekday: number; day: number; month: number; year: number } => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: STUDIO_TZ, weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })
    .formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = WEEKDAY_ORDER.indexOf(get('weekday'))
  return { weekday, day: Number(get('day')), month: Number(get('month')), year: Number(get('year')) }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Mon 5 Oct": a day as the artboard prints it, in the Studio's zone, with
 *  three-letter months (ICU's en-GB says "Sept"). */
export function issueDay(iso: string | Date): string {
  const { weekday, day, month } = dayParts(typeof iso === 'string' ? new Date(iso) : iso)
  return `${WEEKDAY[weekday]} ${day} ${MON[month - 1]}`
}

/** The next Monday on or after `now`, in the Studio's zone. */
export function nextMonday(now: Date): Date {
  return nextWeekday(now, 1)
}

/** The next given weekday (0 Sunday) on or after `now`, in the Studio's zone. */
export function nextWeekday(now: Date, target: number): Date {
  const { weekday, day, month, year } = dayParts(now)
  const ahead = (target - weekday + 7) % 7
  // Noon UTC on that calendar day: safely inside the same date in the zone.
  return new Date(Date.UTC(year, month - 1, day + ahead, 12))
}

/** The next update day (`UPDATE_DAY`, Sunday) on or after `now`. */
export const nextUpdateDay = (now: Date): Date => nextWeekday(now, ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(UPDATE_DAY))

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The month a monthly brief's next first issue falls in: a brief is written
 *  early in the month after the one it reads, so in the first week of a month
 *  it is this month, and after it the next. */
export function firstBriefMonth(now: Date): string {
  const { day, month } = dayParts(now)
  return MONTHS[(day <= 7 ? month - 1 : month) % 12]
}

/** Initials as the artboard draws them: the first and last word's letters. */
export function initialsOf(name: string): string {
  const words = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  if (!words.length) return '?'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
  return `${first}${last}`.toUpperCase()
}

/** A recipient by name where they are on the team, else by address. */
export function personOf(email: string, members: readonly StudioMember[]): StudioPerson {
  const key = email.trim().toLowerCase()
  const m = members.find((x) => x.email.trim().toLowerCase() === key)
  const name = m?.full_name?.trim() || email.trim()
  return { name, initials: initialsOf(name), email: email.trim() }
}

/** Which of the five a schedule sends, if any. */
export function studioArtefactOf(s: Pick<StudioSchedule, 'artefact' | 'starter_key'>): StudioArtefact | null {
  const a = scheduleArtefact({ artefact: s.artefact, starter_key: s.starter_key })
  return STUDIO_REPORTS.some((r) => r.artefact === a) ? (a as StudioArtefact) : null
}

/** The five rows against a workspace's schedules, sends and members. */
/**
 * WHETHER THE FOUR MONTHLY BRIEFS ARE BUILT (Heinrich, 1 Oct: "hide the four
 * brief rows until the briefs are built"). False: the Studio shows the
 * weekly's row alone; the briefs' rows (still `studioRows`' answer, and still
 * tested) come back the day this turns true.
 */
export const BRIEFS_BUILT = false

/** The rows the Studio prints: the weekly alone until the briefs are built. */
export function shownStudioRows<R extends { artefact: string }>(rows: readonly R[], briefsBuilt: boolean = BRIEFS_BUILT): R[] {
  return rows.filter((r) => briefsBuilt || r.artefact === 'weekly_read')
}

export function studioRows(input: {
  tenant: string
  schedules: readonly StudioSchedule[]
  sends: readonly StudioSend[]
  members: readonly StudioMember[]
  now: Date
  /** The operator has paused the workspace's updates
   *  (`isPausedRhythm`): no update, so no day is promised. */
  paused?: boolean
}): StudioRow[] {
  return STUDIO_REPORTS.map((def) => {
    const schedule = input.schedules.find((s) => studioArtefactOf(s) === def.artefact) ?? null
    const ids = new Set(input.schedules.filter((s) => studioArtefactOf(s) === def.artefact).map((s) => s.id))
    // The latest ISSUE is the newest one in the past issues: on the platform,
    // emailed or put there without its email, dated as the list dates it
    // (`issueAt`). It was the latest email alone until 5 Oct, when every
    // weekly read began reaching the platform by itself, and the row then
    // contradicted the list ("First issue" beside two past issues).
    const newest = input.sends
      .filter((x) => x.schedule_id != null && ids.has(x.schedule_id) && issueAt(x) !== '')
      .sort((a, b) => issueAt(b).localeCompare(issueAt(a)))[0] ?? null
    const recipients = schedule?.recipients ?? []
    const sending = Boolean(schedule?.active) && recipients.length > 0
    const latest = newest
      ? issueDay(issueAt(newest))
      : def.kind === 'weekly'
        // The first issue is built when the next update finishes: Sunday's,
        // or, on a paused workspace, whenever the next one is.
        ? (sending ? (input.paused ? 'First issue after the next update' : `First issue ${issueDay(nextUpdateDay(input.now))}`) : null)
        : `First issue early ${firstBriefMonth(input.now)}`
    return {
      artefact: def.artefact,
      name: def.name,
      what: def.what(input.tenant),
      forWho: def.forWho,
      howOften: def.kind === 'weekly' && input.paused ? WEEKLY_HOW_OFTEN_PAUSED : def.howOften,
      people: recipients.map((e) => personOf(e, input.members)),
      recipients,
      active: Boolean(schedule?.active),
      scheduled: schedule != null,
      latest,
    }
  })
}

export interface PastIssue {
  id: string
  title: string
  report: string
  /** "Mon 5 Oct": the day it reached the platform (its email, else its
   *  publishing). Clients read the day alone, like any issue: that a build
   *  went on the platform without its email is the operator's to know (the
   *  workbench's history says it; §0a.1, no delivery mechanics). */
  sentOn: string
  /** When it reached the platform (its email, else its publishing). */
  sentAt: string
  snapshotId: string | null
  artifactId: string | null
}

/** Every issue on the platform, newest first, named by the report it belongs
 *  to: each one sent, and each one put on the platform without its email.
 *  Both print the day they reached the platform; the list never says how
 *  (the fresh review of release/oct2, item 1: "On the platform · not emailed"
 *  under a client's "Sent" was process talk, and the issue lost its date). */
export function pastIssues(sends: readonly StudioSend[], schedules: readonly StudioSchedule[]): PastIssue[] {
  return [...sends]
    .filter((s) => issueAt(s) !== '')
    .sort((a, b) => issueAt(b).localeCompare(issueAt(a)))
    .map((s) => {
      const schedule = s.schedule_id ? schedules.find((x) => x.id === s.schedule_id) ?? null : null
      const artefact = schedule ? studioArtefactOf(schedule) : null
      const def = artefact ? STUDIO_REPORTS.find((r) => r.artefact === artefact) ?? null : null
      const other = schedule ? scheduleArtefact(schedule) : null
      const report = def?.name ?? (other ? artefactTitle(other) : schedule?.name ?? s.schedule_name ?? 'Report')
      return {
        id: s.id,
        title: s.subject?.trim() || report,
        report,
        sentOn: issueDay(issueAt(s)),
        sentAt: issueAt(s),
        snapshotId: s.snapshot_id,
        artifactId: s.artifact_id,
      }
    })
}

/**
 * The operator-only Studio routes' guard (`/new`, `/edit`): null for the
 * platform operator (a `platform_admins` row, `session.operator`), else where
 * to send anyone else, which is the Studio itself. Replaces `studioRedirect`
 * there, whose answer turns null for everyone once the Studio is open to
 * clients.
 */
export function operatorOnlyRedirect(session: { operator?: unknown | null }): string | null {
  return session.operator != null ? null : '/dashboard/studio'
}
