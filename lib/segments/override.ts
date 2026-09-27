import type { SupabaseClient } from '@supabase/supabase-js'

import { recordConfigChange, type ConfigActor } from '../config-log'
import { asChangeInput } from '../config-surfaces-mf1'
import { readerSegment, type Segment, type StoredSegment } from './rules'

// "This is not my market" (plan §2.10 D5, WP3.2): the missing inverse of
// gate_appeals (CQ F41, GS F10). A client says a video is not part of their
// market, and it is stored as a `video_segments` OVERRIDE row.
//
// A LABEL, NEVER A DELETION. The row marks the video off-topic (segment
// 'noise'); nothing is deleted, no month table is touched, and the video stays
// in every count (decision F). An override outranks every judge and rule row
// in the reader precedence (MF1 segments_for_videos; rules.ts readerSegment),
// and the newest override wins, so a later override (an undo, wave 2) simply
// supersedes this one. The table is append-only: nothing is ever updated.
//
// LOGGED. Each override writes one config_changes row on surface 'segment'
// with the person as its actor (recordConfigChange), so What we changed shows
// it in client words.
//
// THE TENANT COMES FROM THE SESSION, THE VIDEO FROM THE FORM, and the video is
// resolved against the tenant before anything is written: a video id from
// another workspace is refused as unknown, the way the appeal refuses a verdict
// it cannot find (app/dashboard/settings/record/actions.ts).
//
// VIDEO BY VIDEO. The entry points (a video, a quote's video, an account) are
// wave 2's; a quote resolves to its video there. An ACCOUNT is not yet a
// target: rows for its stored videos would leave its next videos unmarked, and
// that is a design question, not a loop.

/** `video_segments.rule_version` on an override row: the client's word, not a
 *  rule's version. The precedence reads overrides by method, whatever this
 *  says. */
export const SEGMENT_OVERRIDE_VERSION = 'override'

/** What "not my market" marks a video: off-topic. */
export const NOT_MY_MARKET_SEGMENT: Segment = 'noise'

/** Where the client said it; kept in the row's reason. */
export const OVERRIDE_SOURCES = ['video', 'quote'] as const
export type OverrideSource = (typeof OVERRIDE_SOURCES)[number]

export const notMyMarketReason = (from: OverrideSource): string => `not_my_market:${from}`

/** config_changes.field for an override. */
export const OVERRIDE_FIELD = 'override'

/** The change row's sentence: client words, no digit, no em dash, and nothing
 *  the code does not do (a label only; the video stays in every count). */
export const NOT_MY_MARKET_NOTE = 'You marked a video as not part of your market, so it is now marked off-topic.'

/** The action's replies. One place, so the control and the action cannot print
 *  two different sentences for one state. */
export const NOT_MY_MARKET_COPY = {
  done: 'Marked as not your market.',
  already: 'This one is already marked as not your market.',
  role: 'Only an owner or an admin can do this.',
  unread: 'We could not read which video that was. Refresh the page and try again.',
  unknown: 'We have no record of that video in this workspace.',
  notReady: 'We cannot take this yet: the part of the product that records it has not shipped. Tell us and we will look at the video ourselves.',
  failed: 'We could not take that just now. Try again, and tell us if it keeps happening.',
} as const

/** Is this error "video_segments is not there" (MF1 not applied)? The same
 *  narrow shape as isMissingCompetitors: this table's name, and a no-such-
 *  relation code or message. */
export function isMissingVideoSegments(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? String(error)
  if (!text.includes('video_segments')) return false
  if (code && ['PGRST205', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

export type OverrideOutcome = 'written' | 'already' | 'unknown_video' | 'not_ready' | 'failed'

export interface OverrideResult {
  outcome: OverrideOutcome
  /** The config_changes row landed. False when the row is written but its log
   *  row is not (recordConfigChange is non-fatal and says so in the log). */
  logged: boolean
  error?: string
}

/**
 * Write one "not my market" override for a video of this tenant, and log it.
 * Refuses a video that is not the tenant's, and writes nothing when the newest
 * reading of the video is already this override.
 */
export async function writeNotMyMarket(
  admin: SupabaseClient,
  a: { clientId: string; videoId: string; from: OverrideSource; actor: ConfigActor },
): Promise<OverrideResult> {
  const video = await admin.from('videos').select('id').eq('id', a.videoId).eq('client_id', a.clientId).limit(1)
  if (video.error) return { outcome: 'failed', logged: false, error: video.error.message }
  if ((video.data ?? []).length === 0) return { outcome: 'unknown_video', logged: false }

  // Every stored label of this video (a handful at most), read by the
  // precedence: the row that decides it now is what the log says it was.
  const stored = await admin.from('video_segments').select('segment, method, decided_at, rule_version')
    .eq('client_id', a.clientId).eq('video_id', a.videoId)
  if (stored.error) {
    return isMissingVideoSegments(stored.error)
      ? { outcome: 'not_ready', logged: false }
      : { outcome: 'failed', logged: false, error: stored.error.message }
  }
  const current = readerSegment((stored.data ?? []) as StoredSegment[])
  if (current?.method === 'override' && current.segment === NOT_MY_MARKET_SEGMENT) return { outcome: 'already', logged: false }

  const reason = notMyMarketReason(a.from)
  const { error } = await admin.from('video_segments').insert({
    client_id: a.clientId, video_id: a.videoId, rule_version: SEGMENT_OVERRIDE_VERSION, segment: NOT_MY_MARKET_SEGMENT,
    method: 'override', reason, actor_label: a.actor.label ?? a.actor.user_id ?? a.actor.kind,
  })
  if (error) {
    return isMissingVideoSegments(error)
      ? { outcome: 'not_ready', logged: false }
      : { outcome: 'failed', logged: false, error: error.message }
  }

  const logged = await recordConfigChange(admin, asChangeInput({
    clientId: a.clientId,
    surface: 'segment',
    field: OVERRIDE_FIELD,
    before: current ? { segment: current.segment, method: current.method, rule_version: current.rule_version ?? null } : null,
    after: { video_id: a.videoId, segment: NOT_MY_MARKET_SEGMENT, method: 'override', reason },
    actor: a.actor,
    rowsAffected: 1,
    note: NOT_MY_MARKET_NOTE,
  }))
  return { outcome: 'written', logged }
}
