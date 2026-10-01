import { ANALYSIS_MODEL } from '../config'
import { SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW } from '../subjects/types'

// Your statements (pages build, package MOVES): the claims a client makes about
// itself, and how its market treats each one. Shared types and constants; the
// measurement is `./measure.ts`, the page's read `lib/pages/moves-statements.ts`.
//
// THE MEASUREMENT IS THE SUBJECT MACHINERY, POINTED AT A SENTENCE. A statement
// is first glossed into three lines in the register an insight is written in
// (people backing the idea, doubting it, asking about it), and the gloss is
// embedded in the insight vector space: a claim as the client words it ("a
// small act of defiance against waste") sits far from how talk about it is
// recorded, measured on Sealand 1 Oct at a top similarity of 0.54 and eight
// insights at the subjects' 0.40 floor, where the gloss lifts on-topic talk to
// 0.62-0.69 and leaves off-topic talk at or under 0.37 (the subject phrase's
// gloss, `subjectEmbedInput`, for the same reason). Then every live insight at or above the
// subjects' low threshold is banded (`statement_band()`), the ones at or above
// the high threshold are members on the vector alone, and the ones between are
// judged by the model in batches, exactly as `lib/subjects/membership.ts` does
// for a subject. A member insight counts for a month through its evidence
// COMMENTS dated in that month (the comment dates the period, AGENTS.md), on
// the video they were written under. The market base is the month's market
// videos (`market_month_videos`: read in full, not the client's own, with a
// comment dated in the month), which is the base every other page states.
//
// THEN ONE STANCE CALL: the member insights the reading rests on, each labelled
// backs / doubts / asks / neutral, with one sentence on what people say. Counted
// by DISTINCT VIDEO, so "Of the 125 videos, 74 back it up" means 74 videos.

export const TABLE_STATEMENTS = 'client_statements'
export const TABLE_STATEMENT_READINGS = 'client_statement_readings'
export const RPC_STATEMENT_BAND = 'statement_band'

/** The judge's thresholds are the subjects' own: the same vector space, the
 *  same model, the same reading of "close enough to ask about". */
export const STATEMENT_MATCH_LOW = SUBJECT_MATCH_LOW
export const STATEMENT_MATCH_HIGH = SUBJECT_MATCH_HIGH
export const STATEMENT_JUDGE_BATCH = 20
export const STATEMENT_MODEL = ANALYSIS_MODEL
export const STATEMENT_JUDGE_PROMPT_VERSION = 'statement_judge_v1'
export const STATEMENT_STANCE_PROMPT_VERSION = 'statement_stance_v1'
export const STATEMENT_GLOSS_PROMPT_VERSION = 'statement_gloss_v1'

/** What a stored reading was measured under. A change to the judge, the
 *  thresholds or the stance prompt is a new version, and the page reads a
 *  reading of any version (each is a whole measurement in itself). */
export const READING_VERSION =
  `statement_reading_v1:${STATEMENT_MODEL}:${STATEMENT_GLOSS_PROMPT_VERSION}:${STATEMENT_JUDGE_PROMPT_VERSION}:${STATEMENT_STANCE_PROMPT_VERSION}:${STATEMENT_MATCH_LOW}-${STATEMENT_MATCH_HIGH}`

/** The most live statements a workspace keeps. Each one is measured on add and
 *  again every week, so the cap is also the spend's. */
export const STATEMENTS_MAX = 12
export const STATEMENT_MIN_CHARS = 3
export const STATEMENT_MAX_CHARS = 200

/** At most this many member insights go into one stance call; a larger set is
 *  labelled in several calls of this size, so every member is labelled and no
 *  count rests on a sample. */
export const STANCE_BATCH = 150

/** How long one statement's measurement may run before it gives up and keeps
 *  the previous reading. */
export const STATEMENT_DEADLINE_MS = 120_000

export const STANCES = ['backs', 'doubts', 'asks', 'neutral'] as const
export type Stance = (typeof STANCES)[number]

/** Who a stretch of talk is about (the brief's rule 6): the client, a tracked
 *  rival, or the rest of the category. The one type (lib/brands/attribution.ts). */
export type { About } from '../brands/labels'
import type { About, MarketLabels } from '../brands/labels'

export interface StatementRow {
  id: string
  client_id: string
  text: string
  created_by: string | null
  created_at: string
  retired_at: string | null
}

/**
 * One statement's month, as stored in `client_statement_readings.data`.
 *
 * Counts only, and one scrubbed sentence: no comment's words are stored here
 * (AGENTS.md: exports and records freeze numbers, never words).
 */
export interface StatementReading {
  version: string
  /** The month measured, `YYYY-MM-01`. */
  month: string
  /** The month had ended when it was measured: "in September", not "in
   *  September so far". */
  complete: boolean
  /** The month's market videos that carry talk about it, of the month's
   *  market videos: "125 of 852". */
  market: { videos: number; base: number }
  /** The client's own posts that carry talk about it in the month. */
  own: { videos: number }
  /**
   * How people treat it, by distinct video, over the market's videos when the
   * market talks about it and over the client's own posts when only they do
   * (the design's "Of the 5 videos under your posts"). Null when nobody talks
   * about it anywhere.
   */
  stance: { of: 'market' | 'own'; base: number; backs: number; doubts: number; asks: number } | null
  /** One sentence on what people say about it, scrubbed. Null when nobody
   *  talks about it, or the sentence did not survive the scrub. */
  says: string | null
  /** Whose talk it is, one brand per video, over the stance's videos: the
   *  split always adds up to `stance.base`. */
  who: { about: About; videos: number }[]
  /** Member insights the reading rests on (operator bookkeeping). */
  members: number
  /** The gloss the band was read from (operator bookkeeping, never printed). */
  gloss?: string
}

/** A statement and its reading, as the page draws it. */
export interface StatementView {
  id: string
  text: string
  /** Null until it has been measured for the page's month: the row then
   *  shows the words and nothing else (no "measuring…"). */
  reading: StatementReading | null
}

export interface StatementsBlockData {
  /** The month the page's readings are of, `YYYY-MM-01`, or null when no
   *  statement has been measured yet. */
  month: string | null
  complete: boolean
  /** The month's market videos, for the block's base line. Null when no
   *  reading exists. */
  base: number | null
  statements: StatementView[]
  /** The person can add, edit and remove statements (owners and admins). */
  canEdit: boolean
  /** The client's own name, for the block's lead and the brand line. */
  brand: string
  /** The market's words for this tenant ("Other bags in your market" /
   *  "other bags"): `marketLabels`, the one wording. */
  market: MarketLabels
}

export function isMissingStatements(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42883') return true
  const message = error.message ?? ''
  return /client_statement|statement_band/.test(message) && /does not exist|schema cache|Could not find/.test(message)
}
