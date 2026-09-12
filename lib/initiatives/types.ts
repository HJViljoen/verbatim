import type { InitiativeVerdict } from './measure'
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

export interface InitiativeTileRow {
  id: string
  title: string
  direction: InitiativeDirection
  competitorName: string | null
  startedLabel: string
  /** Share per update since it was declared — the sparkline. */
  series: number[]
  /** The calibrated sentence ("Up 2.3 points since 12 Aug · 4 updates"). */
  line: string
  verdict: InitiativeVerdict
  /** Whether the movement went the way they said they wanted. Null on flat/too early. */
  theirWay: boolean | null
  latestShare: number | null
  sentimentDelta: number | null
}

export interface InitiativesData {
  rows: InitiativeTileRow[]
  /** Active initiatives in all — `rows` is capped for the tile. */
  total: number
}

/** Rows on the tile; the rest are counted in the meta line. */
export const INITIATIVE_ROWS_SHOWN = 4

/** What a reader gets when the data has no initiatives at all — including a
 *  snapshot frozen before this tile existed, which has no key for it. Exported
 *  so every renderer defaults to the same shape rather than its own literal. */
export const EMPTY_INITIATIVES: InitiativesData = { rows: [], total: 0 }

/**
 * The initiatives block of some dashboard data — live, or hydrated from a
 * snapshot frozen before this tile existed and therefore missing the key
 * entirely.
 *
 * Every renderer goes through this rather than reaching into the field. A
 * snapshot renders forever (AGENTS.md): the render route, the report deck, a
 * share link, the Studio editor and the "email as sent" re-render all call
 * `slides()` and the tile renderers with STORED data, so one `.total` on an
 * absent key 500s five surfaces at once.
 */
export const initiativesOf = (data: { initiatives?: InitiativesData }): InitiativesData =>
  data.initiatives ?? EMPTY_INITIATIVES

/** Whether this data has anything to show — the gate on the app grid, the
 *  print slide and the email section. */
export const isTrackingSomething = (data: { initiatives?: InitiativesData }): boolean =>
  initiativesOf(data).total > 0
