import { audienceLabel } from '../readiness/types'
import { monthName } from '../format'
import { subredditKey, subredditLabel } from '../gather/subreddits'
import type { SubredditEntry } from '../gather/types'
import type { ConfigChange } from '../config-log'
import { monthsOfRange } from './change-log'

// The save-state strip, and the two Reddit write paths (block D, D9).
//
// WHAT THE STRIP IS FOR. Settings is the one surface where a reader can break a
// series, and today it says so nowhere: both forms carry their own inline
// "Saved." and nothing aggregates them, so a client can change what is tracked
// and never learn that September's standings are now on a different basis from
// August's. The mock draws one strip across the top of both Settings pages —
// "Nothing waiting to be saved" / "Saved 14:02 · Broke: Freitag's months from
// June" — and this composes it.
//
// TWO HALVES, TWO TENSES, AND THEY MUST NOT BE MIXED. `pending` is what the
// reader has edited and not yet saved — the future tense, and it is the form's
// own state, which is why it arrives as an argument rather than being read.
// `breaks` is what the LAST SAVE actually broke, read off the logged change's
// `affects_audiences` / `affects_months`. A strip that predicted a break from
// the pending edit would be guessing: what a change breaks is worked out at
// write time by the writer that has both sides, and is written down then.
//
// M1 IS NOT APPLIED EVERYWHERE, and where it is not the "Broke" half is ABSENT
// rather than empty. `config_changes.affects_*` arrive with
// 20260918090000_competitors.sql; `isMissingAffects` (change-log.ts) already
// documents that the reader retries without them. `recorded` carries which
// state this is, because "this save broke nothing" and "we did not write down
// what this save broke" are different sentences and 91 of the 93 stored rows
// are the second.
//
// Pure. The caller reads the rows and supplies the form's own edits — and on
// Settings › The record the read is already done: `loadRecordPage` hands back
// `changes.rows` newest-first and `changes.affectsRecorded`, so the strip is
//
//   saveState({ pending, lastChange: inputs.changes.rows[0] ?? null,
//               affectsRecorded: inputs.changes.affectsRecorded })
//
// and nothing else. `affectsRecorded` is the flag the wide read sets and the
// M1-less fallback clears; `available` beside it is about the TABLE, and the
// two are different absences.

/** One field the reader has changed and not yet saved. */
export interface PendingEdit {
  /** The field in the reader's words — "Rivals", "Search terms". */
  field: string
  from: string
  to: string
}

export interface SaveBreak {
  /** In the reader's words, never the raw bucket string. */
  audiences: string[]
  /** "June", or "June to September". Null where the change recorded no months. */
  months: string | null
  line: string
}

export interface SaveState {
  /** Fields edited and not yet saved, with their before → after. */
  pending: PendingEdit[]
  /** What saving would break — needs config_changes.affects_* (M1). Empty
   *  where M1 is unapplied, and `recorded` says which. */
  breaks: SaveBreak[]
  recorded: boolean
  lastSavedAt: string | null
  /** "Nothing waiting to be saved" or "2 changes waiting · breaks Freitag's
   *  months from June". */
  line: string
}

/** The one logged change the strip reads: the newest row for this workspace. */
export type LastChange = Pick<ConfigChange, 'changed_at' | 'affects_audiences' | 'affects_months' | 'source'>

export interface SaveStateInput {
  /** The form's own state. Empty is the common case and the quiet one. */
  pending?: readonly PendingEdit[]
  /** The newest logged change, or null where nothing has ever been changed. */
  lastChange?: LastChange | null
  /** False where M1's two columns are not applied here — then the "Broke" half
   *  is not drawn at all, rather than drawn empty. */
  affectsRecorded?: boolean
}

export const NOTHING_PENDING = 'Nothing waiting to be saved'

/** "Freitag's months from June" — one break, in the reader's words. */
function breakLine(audiences: readonly string[], months: { from: string; to: string } | null): string {
  const who = audiences.length === 0
    ? null
    : audiences.length === 1
      ? audiences[0]
      : audiences.length === 2
        ? `${audiences[0]} and ${audiences[1]}`
        : `${audiences.length} audiences`
  if (!months) return who ? `${who}${who.endsWith('s') ? '’' : '’s'} reading` : 'a reading'
  const from = monthName(`${months.from}-01`)
  const to = monthName(`${months.to}-01`)
  const when = from === to ? `from ${from}` : `from ${from} to ${to}`
  return who ? `${who}${who.endsWith('s') ? '’' : '’s'} months ${when}` : `the months ${when}`
}

/**
 * The strip, from the form's own edits and the newest logged change.
 *
 * Pure.
 */
export function saveState(input: SaveStateInput = {}): SaveState {
  const pending = [...(input.pending ?? [])]
  const change = input.lastChange ?? null
  // A RECONSTRUCTED ROW IS NOT A SAVE. The reconstruction worked out after the
  // fact that a term was already in use; nobody pressed anything, and "Saved
  // 3 Sep" about a row we inferred would be a claim about an act that never
  // happened (change-log.ts states the same split).
  const lastSavedAt = change && change.source !== 'reconstructed' ? change.changed_at : null
  const recorded = input.affectsRecorded ?? false

  const breaks: SaveBreak[] = []
  if (recorded && change) {
    const audiences = (change.affects_audiences ?? []).filter(Boolean).map((a) => audienceLabel(a))
    const months = monthsOfRange(change.affects_months)
    if (audiences.length > 0 || months) {
      breaks.push({
        audiences,
        months: months ? (monthName(`${months.from}-01`) === monthName(`${months.to}-01`) ? monthName(`${months.from}-01`) : `${monthName(`${months.from}-01`)} to ${monthName(`${months.to}-01`)}`) : null,
        line: breakLine(audiences, months),
      })
    }
  }

  const parts: string[] = []
  parts.push(
    pending.length === 0
      ? NOTHING_PENDING
      : `${pending.length} change${pending.length === 1 ? '' : 's'} waiting`,
  )
  if (breaks.length > 0) parts.push(`the last save broke ${breaks.map((b) => b.line).join(' and ')}`)

  return { pending, breaks, recorded, lastSavedAt, line: parts.join(' · ') }
}

// ---- The two Reddit write paths ---------------------------------------------

/**
 * The most communities a client may WATCH at once.
 *
 * THIS IS A COST CEILING, NOT A PREFERENCE. Every active community is a paid
 * Apify search plus a comment scrape ON EVERY RUN, and the add arm is the one
 * path to that spend with nothing above it: the discovery path bounds itself
 * (`SUBREDDIT_TARGET_ACTIVE` 5, `SUBREDDIT_MAX_KNOWN` 20, three probes a run),
 * and `tracking_configs_cost_ceilings_check` bounds every OTHER list on the row
 * — industry_keywords, competitor_keywords, brand_keywords, competitor_names,
 * report_emails — but until now not this one. Without a cap an admin types two
 * hundred names into the add box (or POSTs `updateCommunity` two hundred times;
 * it takes a bare `FormData`) and the next gather runs two hundred paid
 * searches.
 *
 * Twelve, because it sits above anything a real client asks for and under
 * anything that could hurt: production's larger tenant watches three, and
 * discovery stops proposing at five. The number below it in the stack is the
 * DATABASE's, not this one — 20260919090000 bounds the column itself, for the
 * PATCH that never comes through this function.
 *
 * `SUBREDDIT_MAX_KNOWN` is deliberately NOT reused here. It ceilings how many
 * communities we will ever PAY TO PROBE, a tenant is already at it, and reading
 * it as "you may not name one more" would kill the control on the workspace
 * that has the most use for it.
 */
export const WATCHED_COMMUNITY_CAP = 12

/**
 * Stop watching a community, or add one.
 *
 * Pure validation and the change row it produces; the action calls
 * `updateWithActor` + `recordConfigChange` with what comes back, so the audit
 * trigger logs a person and the log names what the edit broke.
 *
 * THE NAME GOES THROUGH `subredditKey`, the same fold the ROI reader, the
 * readiness row and the communities table already use — a client pastes
 * 'r/Prosthetics', 'Prosthetics' or the whole URL and all three are one
 * community. A name the fold rejects (a user profile, a bare slash, 22
 * characters) is an error with a sentence, never a silently dropped write.
 */
export function subredditEdit(
  current: readonly string[],
  op: { kind: 'add' | 'stop'; name: string },
  /** The names the RECORD's before/after sides are drawn from, when that is a
   *  narrower list than the one membership is tested against (settings V2).
   *  `applySubredditEdit` widens `current` with `candidate` entries so a stop
   *  can turn a proposal down; a candidate has never been watched, so it may
   *  not appear in a config_changes row describing what we watch. Defaults to
   *  `current`, which is the case where the two lists are the same. */
  forLog: readonly string[] = current,
): { next: string[]; change: PendingEdit } | { error: string } {
  const key = subredditKey(op.name)
  if (!key) {
    return {
      error: (op.name ?? '').trim()
        ? `${(op.name ?? '').trim()} is not a community we can watch. A community looks like r/prosthetics.`
        : 'Name a community to watch, like r/prosthetics.',
    }
  }
  const folded = current.map((c) => subredditKey(c)).filter(Boolean)
  const logged = forLog.map((c) => subredditKey(c)).filter(Boolean)
  const has = folded.includes(key)

  if (op.kind === 'add') {
    if (has) return { error: `You are already watching ${subredditLabel(key)}.` }
    if (folded.length >= WATCHED_COMMUNITY_CAP) {
      return {
        error: `${WATCHED_COMMUNITY_CAP} watched communities is the limit: every one of them is searched and read on every update. Stop watching one first.`,
      }
    }
    // Appended, not sorted in: the list's order is the order communities were
    // taken on, and re-sorting it on every add would rewrite the whole column
    // and make every diff in the log unreadable.
    const next = [...folded, key]
    return { next, change: change(logged, key, 'add') }
  }

  if (!has) return { error: `You are not watching ${subredditLabel(key)}.` }
  const next = folded.filter((c) => c !== key)
  return { next, change: change(logged, key, 'stop') }
}

/**
 * The record's two sides, drawn from the WATCHED list alone (settings V2).
 *
 * `next` above is the membership list the caller goes on to apply, and for a
 * stop that list is widened with `candidate` entries so a proposal can be
 * turned down. The config_changes row is a different question — it says what
 * we watch — so it is built here from `logged` instead, and stopping a
 * candidate comes out with both sides EQUAL: nothing about what we watch
 * changed, and `actions.ts` already carries the decision in the row's note
 * ("... was proposed and turned down; it is not watched"). Before this, that
 * stop wrote `before: "r/prosthetics, r/bagsonbags, r/frugal" -> after:
 * "r/bagsonbags, r/frugal"`, naming a candidate as something we had been
 * watching — and contradicting the Communities list an ADD writes on the same
 * page, which has never included candidates.
 */
function change(logged: readonly string[], key: string, kind: 'add' | 'stop'): PendingEdit {
  const to = kind === 'add' ? [...logged, key] : logged.filter((c) => c !== key)
  return { field: 'Communities', from: listWords(logged), to: listWords(to) }
}

/** What a before/after side reads as in the log. The same rule `renderSide`
 *  keeps: a list is a list of names, and an empty one says "nothing" rather
 *  than printing as an empty string. */
export function listWords(names: readonly string[]): string {
  if (names.length === 0) return 'nothing'
  const labels = names.map(subredditLabel)
  return labels.length <= 8 ? labels.join(', ') : `${labels.slice(0, 8).join(', ')} and ${labels.length - 8} more`
}

/**
 * The edit, applied to what is actually stored.
 *
 * `tracking_configs.subreddits` is an array of `SubredditEntry` objects
 * carrying `discovered_at` and the paid relevance probe, not an array of names,
 * and STOPPING A COMMUNITY MUST NOT DELETE ONE. A deleted entry loses the probe
 * that was paid for and the date it was taken on, and the next discovery run
 * proposes it again as if it had never been judged; `activeSubreddits`
 * (lib/gather/subreddits.ts) reads `status === 'active'`, so demoting is what
 * "stop watching" means to the gather. Re-adding a community the client once
 * stopped promotes the entry it already has rather than writing a second one.
 *
 * AND A `rejected` COMMUNITY IS NOT RE-ADDED FROM HERE. `subredditEdit` is
 * handed the ACTIVE names, so a rejected entry is not "has", the add arm is
 * taken, `existing` is found and the entry was rewritten straight to 'active' —
 * overwriting the paid relevance probe's own verdict, on a row whose "sampled
 * 12 Sep: 3 of 40 on topic" line stays on screen beside the now-active state.
 * `setSubredditStatuses` (lib/gather/subreddits.ts) says in as many words that
 * a rejected community stays rejected because that verdict was paid for, and
 * that overriding it is "a human overriding it, BY NAME" — an operator, not a
 * browser. So this refuses, with the verdict in the sentence, and the way back
 * is a re-probe.
 *
 * AND THE DEMOTION IS `stopped`, NOT `rejected`. `rejected` is the relevance
 * probe's own verdict and Settings prints it to the client as "ruled out"
 * (`communityWords`) — so writing it here would tell a client that our probe
 * threw out a community THEY took off the list, on a row whose own probe line
 * may read "31 of 40 on topic". Both statuses keep the community out of the
 * gather and out of discovery's proposals; only one of them is a claim about
 * what we measured. `stopped_at` records when, because the entry is a record
 * and a record says when.
 */
export function applySubredditEdit(
  entries: readonly SubredditEntry[],
  op: { kind: 'add' | 'stop'; name: string },
  now: string,
): { next: SubredditEntry[]; change: PendingEdit; was: SubredditEntry['status'] | null } | { error: string } {
  const key = subredditKey(op.name)
  const existing = entries.find((e) => subredditKey(e.name) === key)
  // WHAT "stop" ACTS ON IS WHAT WE WATCH OR HAVE PROPOSED. A candidate is a
  // community discovery found and nobody chose; the table draws it with a "we
  // found it" state and offers the control, and saying no to a proposal is a
  // decision the client is entitled to make — it is the only thing that stops
  // the probe promoting it into a paid search later. Reading the watching list
  // as `status === 'active'` alone made that click return "You are not
  // watching r/onebag." over a row that plainly says we found it, failing in
  // the pure layer before any write.
  //
  // What "add" checks against is the ACTIVE list alone, because active is the
  // list adding joins.
  const watching = entries
    .filter((e) => (op.kind === 'stop' ? e.status === 'active' || e.status === 'candidate' : e.status === 'active'))
    .map((e) => e.name)

  if (op.kind === 'add' && existing?.status === 'rejected') {
    const probe = existing.probe
    return {
      error: probe
        ? `We sampled ${subredditLabel(existing.name)} on ${probe.at} and ${probe.kept} of ${probe.sampled} posts were about your market, so it was ruled out. Ask us to look again rather than turning it back on over that.`
        : `${subredditLabel(existing.name)} was ruled out by our relevance check. Ask us to look again rather than turning it back on over that.`,
    }
  }

  // The widened list is the MEMBERSHIP test; the record's sides come from the
  // active names alone (V2). A candidate has never been watched, so it may not
  // appear in a row describing what we watch.
  const active = entries.filter((e) => e.status === 'active').map((e) => e.name)
  const result = subredditEdit(watching, op, active)
  if ('error' in result) return result

  const next: SubredditEntry[] = op.kind === 'stop'
    ? entries.map((e) => (subredditKey(e.name) === key ? { ...e, status: 'stopped' as const, stopped_at: now } : e))
    : existing
      // Re-adding drops `stopped_at` with the status it belonged to: the entry
      // is watched again, and a stop date on a watched community is a fact
      // about a state it is no longer in.
      ? entries.map((e) => {
        if (subredditKey(e.name) !== key) return e
        const { stopped_at: _stopped, ...rest } = e
        return { ...rest, status: 'active' as const }
      })
      : [...entries, { name: key, status: 'active' as const, discovered_at: now }]

  // The state the entry was IN, so the caller can word its answer: "we stopped
  // watching it" and "we will not watch it" are different sentences, and only
  // one of them is true about a community nobody had started watching.
  return { next, change: result.change, was: existing?.status ?? null }
}
