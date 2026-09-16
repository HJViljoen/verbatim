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

/**
 * The artefacts something can actually BUILD today, and the reason this list
 * exists at all.
 *
 * THE SEND PATH READS `artefact` FIRST — WP17 made it so, and this docblock
 * said the opposite until the Block B fix pass. `scheduleArtefact`
 * (lib/schedules/artefact.ts) takes the column before the starter key and
 * lib/schedules/run.ts branches on `sendsWeekly`. What has not changed is the
 * reason this list exists: a new artefact row still has to name a starter
 * because every schedule needs exactly one source, and
 * DEFAULT_SCHEDULE_STARTER is now 'weekly_report' — so a row created for the
 * monthly reading and left active would send THE WEEKLY REPORT, monthly, to
 * those addresses, under the monthly reading's name, and then stamp
 * last_sent_at so the page reported it as sent. That is the rule this WP states
 * about the cadence picker — "an option that produces a schedule the builder
 * cannot serve is a form that lies" (lib/schedules/types.ts) — applied to the
 * form that writes.
 *
 * So a recipient list for an artefact nothing builds is RECORDED and INERT: who
 * should receive the sales brief is worth writing down before the brief exists,
 * and the row stays switched off until its builder lands. WP17 gives `weekly`
 * its own document, WP19 the briefs and WP20 the quarterly review, and each
 * joins this list with the builder that serves it.
 *
 * `quarterly` JOINED IT IN WP20, with `snapshotQuarterly`
 * (lib/reports/quarterly-build.ts) behind it, the eight-page deck in
 * components/print/quarterly-deck.tsx and the `sendsQuarterly` branch in
 * lib/schedules/run.ts. A schedule created for it must carry
 * `QUARTERLY_STARTER_KEY` ('quarterly_review') OR the M8 `artefact` column, for
 * the reason the paragraph above gives: with neither, the default starter makes
 * it send the WEEKLY report under the quarterly review's name.
 */
export const BUILDABLE_ARTEFACTS: readonly Artefact[] = ['weekly', 'quarterly']

export const isBuildable = (a: Artefact): boolean => BUILDABLE_ARTEFACTS.includes(a)

/** What to tell someone naming recipients for an artefact nothing SENDS yet.
 *
 *  THE SENTENCE IS ABOUT THE SCHEDULE, NOT ABOUT THE DOCUMENT, and it used to
 *  say the other thing: "We do not produce the sales brief yet." Össur has a
 *  built report titled "Sales brief" (reports, template_key 'sales_brief',
 *  status 'built'), the Studio still offers sales_objections_competitors from
 *  starterTemplates(), and two Block B surfaces send a reader to it in the same
 *  week — This week's "Open the sales brief →" and the weekly email's "This is
 *  the Sales brief's short form — open the full brief →".
 *  BUILDABLE_ARTEFACTS is about what a SCHEDULE can send, which is the only
 *  thing this form decides.
 *
 *  Client wording: what happens to their list, not which work package. */
export const notBuiltYet = (a: Artefact): string =>
  `Nothing sends ${ARTEFACT_COPY[a].label.replace(/^The /, 'the ')} on a schedule yet. We will keep this list and start sending the day something does.`

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
  /** Whether anything can produce this artefact yet. A row that cannot be
   *  built is never `sending`, whatever its schedule says, because what would
   *  go out is another document under this one's name. */
  buildable: boolean
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
    const buildable = isBuildable(artefact)
    return {
      artefact,
      label: ARTEFACT_COPY[artefact].label,
      what: ARTEFACT_COPY[artefact].what,
      schedule,
      recipients: schedule?.recipients ?? [],
      sending: buildable && !paused && (schedule?.active ?? false) && (schedule?.recipients.length ?? 0) > 0,
      buildable,
      lastSentAt: schedule?.lastSentAt ?? null,
    }
  })
}

/** Schedules that name no artefact — shown under the seven rather than hidden,
 *  because a list that silently drops a row nothing else explains is how a
 *  recipient list goes stale without anyone noticing. */
export const unnamedSchedules = (schedules: readonly ScheduleLike[]): ScheduleLike[] =>
  schedules.filter((s) => !isArtefact(s.artefact))

/**
 * The sentence under the table. Counts the artefacts that will actually go out,
 * not the ones with a row.
 *
 * `unnamed` is not decoration. Both live tenants have a "Weekly digest" that
 * predates the seven, is active and has recipients — so "nothing is being sent"
 * is true of the SEVEN and false of the workspace, and a reader would have to
 * scroll past it to find out. The sentence names the older schedules instead.
 */
export function sendingSummary(
  rows: readonly RecipientRow[],
  period: string,
  unnamed: readonly ScheduleLike[] = [],
): string {
  if (period === 'paused') return 'Updates are paused for this workspace, so nothing is sent.'
  const stillSending = unnamed.filter((s) => s.active && s.recipients.length > 0)
  const older = stillSending.length === 0
    ? ''
    : ` ${stillSending.length} older schedule${stillSending.length === 1 ? ' is' : 's are'} still going out, below.`
  const sending = rows.filter((r) => r.sending)
  if (sending.length === 0) return `None of these has a recipient yet.${older}`
  const people = new Set(sending.flatMap((r) => r.recipients.map((e) => e.toLowerCase())))
  // "REPORTS", NOT "ARTEFACTS". This module's own docblock says "Client
  // wording: no template keys, no 'starter', no cadence jargon", and then
  // reached for the one word in the file that is in neither GLOSSARY nor the
  // thirteen. Unreachable while both tenants send none; reachable the moment a
  // weekly recipient is added.
  return `${sending.length} of ${rows.length} reports ${sending.length === 1 ? 'is' : 'are'} being sent, to ${people.size} address${people.size === 1 ? '' : 'es'}.${older}`
}
