/**
 * The seven artefacts, and who receives each (Phase 1 WP16, design ST6).
 *
 * Before M8 a schedule said WHEN and TO WHOM and never WHAT: the product had
 * one row per workspace called "Weekly digest", and the design's question —
 * "who receives the weekly report, the monthly reading, the quarterly review
 * and each brief" — had no data model at all. `report_schedules.artefact` is
 * that key, and this is the list it is checked against.
 *
 * The four briefs are named by their AUDIENCE, not by their template key
 * (`lib/reports/documents/types.ts` DocumentRole spells them `market_brief`
 * and friends). A recipient list is about who the document is for; a template
 * key is about which prompt writes it, and the two are separate facts that
 * happen to line up today.
 *
 * Pure: no I/O, no clock. The loader reads the rows; this says what they mean.
 */

export const ARTEFACTS = [
  'weekly', 'monthly', 'quarterly',
  'brief:sales', 'brief:leadership', 'brief:marketing', 'brief:content',
] as const

export type Artefact = (typeof ARTEFACTS)[number]

export const isArtefact = (v: unknown): v is Artefact =>
  ARTEFACTS.includes(v as Artefact)

/** What each artefact is called on screen, and what it is. Client wording:
 *  no template keys, no "starter", no cadence jargon. */
export const ARTEFACT_COPY: Record<Artefact, { label: string; what: string }> = {
  weekly: {
    label: 'The weekly report',
    what: 'What came in this week, and anything unusual in it.',
  },
  monthly: {
    label: 'The monthly reading',
    what: 'Where you stand this month and what it means, with the month named on every figure.',
  },
  quarterly: {
    label: 'The quarterly review',
    what: 'Three months read together: what moved, what we flagged, and what we could not settle.',
  },
  'brief:sales': {
    label: 'The sales brief',
    what: 'The objections, the complaints and the switching talk, in the customers’ own words.',
  },
  'brief:leadership': {
    label: 'The leadership brief',
    what: 'The management readout: the month in one page, with the method behind it.',
  },
  'brief:marketing': {
    label: 'The marketing brief',
    what: 'What the audience already believes, which claims land, and which come back.',
  },
  'brief:content': {
    label: 'The content brief',
    what: 'What to make next, drawn from what the conversation asked for.',
  },
}

export const artefactLabel = (a: Artefact): string => ARTEFACT_COPY[a].label

/** The label for a schedule whose artefact column is still null — a legacy
 *  starter row from before the seven existed. It is named by what it actually
 *  sends rather than guessed at, because guessing here would put a recipient
 *  list under the wrong document. */
export const UNNAMED_ARTEFACT_LABEL = 'A report from before this list existed'

export interface ScheduleLike {
  id: string
  name: string
  artefact: string | null
  cadence: string
  recipients: string[]
  active: boolean
  lastSentAt: string | null
}

/** One row of the recipient table: an artefact, and the schedule that sends it
 *  where there is one. Every artefact appears, including the ones nothing is
 *  set up for — "nobody receives this" is the answer ST6 exists to give, and a
 *  table that only lists what exists cannot give it. */
export interface RecipientRow {
  artefact: Artefact
  label: string
  what: string
  schedule: ScheduleLike | null
  recipients: string[]
  /** Paused at the workspace level: the schedule may be active and still send
   *  nothing, and a row that says "active" while updates are paused is a lie
   *  the client can check. */
  sending: boolean
  lastSentAt: string | null
}

/**
 * The seven rows, in reading order, against a workspace's schedules.
 *
 * `period` is `tracking_configs.report_period`. A paused workspace sends
 * nothing at all, whatever its schedules say — that is the T0-7 rule the
 * settings form already respects, stated here so the recipient table respects
 * it too.
 */
export function recipientRows(schedules: readonly ScheduleLike[], period: string): RecipientRow[] {
  const paused = period === 'paused'
  return ARTEFACTS.map((artefact) => {
    const schedule = schedules.find((s) => s.artefact === artefact) ?? null
    return {
      artefact,
      label: ARTEFACT_COPY[artefact].label,
      what: ARTEFACT_COPY[artefact].what,
      schedule,
      recipients: schedule?.recipients ?? [],
      sending: !paused && (schedule?.active ?? false) && (schedule?.recipients.length ?? 0) > 0,
      lastSentAt: schedule?.lastSentAt ?? null,
    }
  })
}

/** Schedules that name no artefact — shown under the seven rather than hidden,
 *  because a list that silently drops a row nothing else explains is how a
 *  recipient list goes stale without anyone noticing. */
export const unnamedSchedules = (schedules: readonly ScheduleLike[]): ScheduleLike[] =>
  schedules.filter((s) => !isArtefact(s.artefact))

/** The sentence under the table. Counts the artefacts that will actually go
 *  out, not the ones with a row. */
export function sendingSummary(rows: readonly RecipientRow[], period: string): string {
  if (period === 'paused') return 'Updates are paused for this workspace, so nothing is sent.'
  const sending = rows.filter((r) => r.sending)
  if (sending.length === 0) return 'Nothing is being sent yet — no artefact has a recipient.'
  const people = new Set(sending.flatMap((r) => r.recipients.map((e) => e.toLowerCase())))
  return `${sending.length} of ${rows.length} artefacts are being sent, to ${people.size} address${people.size === 1 ? '' : 'es'}.`
}
