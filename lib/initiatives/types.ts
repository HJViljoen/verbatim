// Initiatives (WP7c, 2026-09-11) — the shapes the table, the actions and the
// measurement all agree on.
//
// An initiative is the one thing in this product the CLIENT authors. Everything
// else on a page is measured or written by us; this is their declaration of
// what they are trying to move, and the product's job is only to report whether
// the conversation followed. That asymmetry is why the copy never says "your
// goal is on track" — it says what the share did.

export const INITIATIVE_STATUSES = ['active', 'done', 'dropped'] as const
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number]

export const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, string> = {
  active: 'Tracking',
  done: 'Finished',
  dropped: 'Stopped',
}

export const INITIATIVE_DIRECTIONS = ['up', 'down'] as const
export type InitiativeDirection = (typeof INITIATIVE_DIRECTIONS)[number]

/** What the client said counts as progress. There is no "good" direction in
 *  the data: a growing pain-point theme is a loss and a growing capability
 *  theme is a win, and only the client knows which one they declared. */
export const INITIATIVE_DIRECTION_LABEL: Record<InitiativeDirection, string> = {
  up: 'More of this conversation',
  down: 'Less of this conversation',
}

/** Most themes an initiative may be measured on — enough to name a subject,
 *  few enough that the row still points at something. */
export const INITIATIVE_MAX_THEMES = 5

/** An `initiatives` row as every reader here wants it. */
export interface Initiative {
  id: string
  title: string
  goal: string | null
  registryIds: string[]
  competitorName: string | null
  direction: InitiativeDirection
  startedAt: string
  status: InitiativeStatus
  createdAt: string
}

/** The row as the DB hands it over (the client is untyped — AGENTS.md). */
export interface InitiativeDbRow {
  id: string
  title: string
  goal: string | null
  registry_ids: string[] | null
  competitor_name: string | null
  direction: string | null
  started_at: string
  status: string | null
  created_at: string
}

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  (values as readonly string[]).includes(String(value)) ? (value as T) : fallback

export function toInitiative(row: InitiativeDbRow): Initiative {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    registryIds: row.registry_ids ?? [],
    competitorName: row.competitor_name,
    direction: oneOf(INITIATIVE_DIRECTIONS, row.direction, 'up'),
    startedAt: row.started_at,
    status: oneOf(INITIATIVE_STATUSES, row.status, 'active'),
    createdAt: row.created_at,
  }
}
