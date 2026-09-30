import { CONTACT_EMAIL } from '../legal'
import { fmtInt, fullDate } from '../format'
import { summarise, type ReadinessSummary } from '../readiness/compute'
import type { ReadinessInputs, ReadinessRow } from '../readiness/types'
import { QUEUE_FLOOR } from './queue'
import { surface } from '../nav'

/**
 * Readiness, in Settings, for the person whose workspace it is (Phase 1 WP16,
 * design ST1, decision V).
 *
 * `/dashboard/ops/readiness` keeps all thirteen rows and the operator dialect.
 * This is the same `computeReadiness` output, filtered and re-worded — ONE
 * computation, two readers, because two copies of thirteen rules is how the
 * two pages start disagreeing about the same workspace.
 *
 * THE FILTER IS A RULE, NOT A LIST OF IDS. A row is withheld when its status is
 * `missing` AND its owner is not the client: "the product cannot do this yet"
 * is our roadmap, and a roadmap line dressed as a measurement is a promise made
 * on a page whose whole premise is that every row is measured
 * (`lib/readiness/types.ts`). The moment such a row has something to measure it
 * appears on its own, which is what an id list could not do — four of the five
 * rows this hides today (months of history, the anomaly baseline, the change
 * record, the decision ledger) stop being missing as soon as their tables are
 * seeded, and the fifth (the subject set) appears the day subjects exist.
 *
 * Measured against production the rule yields EIGHT rows on both tenants — the
 * eight the research named — with no id written down anywhere.
 *
 * THE UNLOCK SENTENCE IS RE-WORDED, NOT THE MEASUREMENT. "Apply the change
 * log", "Run the one-off backfill" and "Seed it once per workspace" are our
 * words about our work. `notes` is client-safe on every row, and so is `detail`
 * on every row but one — so `unlocks` is replaced, and only where the owner is
 * not the client. A row the CLIENT owns keeps its sentence exactly, because
 * that sentence is the thing they can act on and rewriting it would blunt the
 * only two actionable rows on the page.
 *
 * THE ONE ROW `detail` IS NOT CLIENT-SAFE ON is retention, which read "768
 * comments fall due to be read again on 17 Sep 2026 — one night's re-read
 * budget is 5,000 comments, shared across every workspace." That is right on
 * /dashboard/ops/readiness and it tells a paying client their re-reads queue
 * behind other customers'. A row that has something only we may hear puts the
 * client's half in `clientDetail`, and this is where it is preferred.
 *
 * Pure.
 */

export const OWNER_WORDS = {
  client: 'Yours to change',
  ops: 'We do this',
  engineering: 'We are building this',
} as const

/** What we will do about a row we own, said as a commitment rather than as a
 *  task. Keyed by row id, because the sentence is about that specific input;
 *  an unlisted row keeps its own `unlocks`, which is the safe direction —
 *  worst case a client reads a sentence written for us, best case they read
 *  nothing false. */
const CLIENT_UNLOCKS: Readonly<Record<string, string>> = {
  'tracked-terms': 'Your terms are set and you can edit them here. We do not yet write down every change to them; that record starts shortly.',
  communities: 'We choose which communities to watch and check them each update. Tell us one to add or drop and we will.',
  'searchable-findings': 'We are working through the findings that cannot yet be searched by a question.',
  'read-depth': 'Nothing to configure: the shares rise as more of what we gather can be listened to and read.',
  'update-record': 'Nothing to do: this is the record of your updates as they ran.',
  retention: 'Nothing to do. Comments are read again on a schedule, and this is where that schedule stands.',
  'months-of-history': 'We write your months down as each update runs; this fills in on its own.',
  'anomaly-baseline': 'The weekly check needs three complete months behind it before it can say anything is unusual.',
  'change-record': 'We are starting to write down every change to your configuration, ours and yours.',
  decisions: 'Once you can mark a recommendation as taken or declined, this becomes the record of what you decided.',
}

/**
 * WHO SWITCHES DELIVERY ON, AND HOW TO REACH HIM (finish-list item 18). The
 * row read "Yours to change" beside "Add the people who should get it … and
 * turn it on", while sending is Heinrich's during the trial (lib/tenant-locks.ts)
 * and the weekly email is paused at his request. The row stays shown; its
 * owner and its sentence say who does it.
 *
 * ONLY WHERE SENDING IS HIS. The owner and sentence below are true of a tenant
 * whose sending is locked to Heinrich (`tenantLocked(clientId, 'sends')`, the
 * same tenant lock that gives the quarterly card its April 2027 date). A
 * tenant without it (Össur) turns its own delivery on in Settings, and keeps
 * the row's own owner and sentence.
 */
export const DELIVERY_OWNER = 'Set up with Heinrich'
export const DELIVERY_UNLOCKS = `Heinrich switches the update on with you, once your reports are set up. To say who should get it, write to ${CONTACT_EMAIL}.`

/** The one line over the whole table: the rows that say "Tell us" or "Give us"
 *  go to Heinrich, and this is how to reach him. Not "anything here": the
 *  Recommendations row is the client's own to do, on Your moves. */
export const READINESS_CONTACT = `Where a row asks you to tell us or give us something, write to Heinrich at ${CONTACT_EMAIL}.`

export interface ClientReadinessRow extends ReadinessRow {
  /** The owner in the client's words. */
  ownerWords: string
  /** A date this row is expected to change, where one genuinely exists. Null
   *  everywhere else — a "by when" invented to fill a column is a promise
   *  nobody made. */
  by: string | null
}

export interface ClientReadinessView {
  rows: ClientReadinessRow[]
  /** Computed over the ROWS SHOWN, so the badge never counts a row nobody can
   *  see. The operator page's summary is over all thirteen and the two are
   *  different numbers about the same workspace — deliberately, and each is
   *  right about its own page. */
  summary: ReadinessSummary
  /** How many rows are held back, so the page can say so instead of implying
   *  the list is everything. */
  withheld: number
}

/**
 * What the client view knows beyond the rows (sw-2 item 6): the facts a row
 * needs to be true for a client, read by the page beside `loadReadiness`.
 * Every field optional; a row whose fact is absent keeps its own words.
 */
export interface ReadinessFacts {
  /** The inputs the rows were computed from (the counts the words need). */
  inputs?: ReadinessInputs
  /** Searches are held still until January (`tenantLocked(clientId, 'tracking')`). */
  searchesHeld?: boolean
  /** The latest change to what we search (terms, platforms, communities,
   *  rivals, accounts): the Tracking row's date. The row printed "last change
   *  recorded 27 Sep 2026", the day we changed how we mark makers' videos. */
  searchChangedAt?: string | null
  /** Your moves' own advice count (`adviceTally`): pieces of advice (one per
   *  identity, not per copy) and those acted on. Null where it was not read. */
  advice?: { pieces: number; acted: number } | null
}

/** The owner word for a search row while searches are held still. */
export const HELD_OWNER = 'Held until January'

/** What a held search row says about asking for a change (the record's and
 *  How to read's rule, lib/settings/queue.ts `QUEUE_FLOOR`). */
export const HELD_CHANGE = `A change you ask for waits for the 1st of a month, no earlier than ${fullDate(`${QUEUE_FLOOR}T00:00:00.000Z`)}.`

/** The label in front of each row's last line, for a client: "Unlocks" named
 *  our roadmap ("UNLOCKS Nothing to do"). */
export const CLIENT_NEXT_LABEL = 'Next'

const plural = (n: number, word: string, many = `${word}s`): string => `${fmtInt(n)} ${n === 1 ? word : many}`

/**
 * EACH ROW TRUE AND PLAIN FOR A CLIENT (sw-2 item 6). The walkthrough read the
 * page against the rest of the product: "100% searchable" beside "We are
 * working through the findings that cannot yet be searched"; "Yours to
 * change" on the searches held still until January; "Give us each rival's
 * account name" with all seven given; "84 of 84 recommendations carry a link
 * to the one before" beside Your moves' "acted on 0 of 79"; "33 changes
 * recorded · 60 reconstructed" beside the record's own list; "switched off"
 * where Team says "paused"; "on schedule"/"by hand", which the record keeps
 * for us. Each rewrite is keyed by row id and reads only the row, its inputs
 * and the facts; nothing in the computation changes.
 */
function clientRow(r: ReadinessRow, facts: ReadinessFacts): Partial<ClientReadinessRow> {
  const i = facts.inputs
  const held = facts.searchesHeld === true
  switch (r.id) {
    case 'rival-accounts': {
      if (!i || i.rivals.length === 0) return {}
      const configured = i.rivals.filter((x) => x.handlePlatforms.length > 0).length
      if (configured < i.rivals.length) return held ? { ownerWords: HELD_OWNER, unlocks: `${r.unlocks} ${HELD_CHANGE}` } : {}
      const captured = i.rivals.reduce((n, x) => n + x.captured, 0)
      const read = i.rivals.reduce((n, x) => n + x.analysed, 0)
      return {
        detail: `All ${plural(i.rivals.length, 'rival')} you track have their accounts set · ${plural(captured, 'post')} of their own collected, ${fmtInt(read)} read so far.`,
        notes: r.notes.map((n) => n.replace(/ captured,/, ' collected,')),
        ownerWords: held ? HELD_OWNER : OWNER_WORDS.client,
        unlocks: held
          ? `Nothing to give us: every rival’s accounts are set, and each update reads their new posts. To add or drop one, ask for a change. ${HELD_CHANGE}`
          : 'Nothing to give us: every rival’s accounts are set, and each update reads their new posts. Tell us if one changes.',
      }
    }
    case 'tracked-terms': {
      const t = i?.terms
      const when = facts.searchChangedAt ? ` · last changed ${fullDate(facts.searchChangedAt)}` : ''
      return {
        ...(t ? { detail: `${plural(t.brand, 'brand term')}, ${plural(t.competitor, 'rival term')}, ${plural(t.industry, 'category term')}${t.exclude > 0 ? ` and ${plural(t.exclude, 'exclusion')}` : ''}${when}.` } : {}),
        // The change record's boundary is said once, on its own row.
        notes: [],
        ...(held
          ? {
            ownerWords: HELD_OWNER,
            unlocks: `Your searches are held still until January, so October and November can be compared. ${HELD_CHANGE}`,
          }
          : {}),
      }
    }
    case 'communities': {
      const active = i?.communities.filter((c) => c.status === 'active') ?? []
      const suggested = i?.communities.filter((c) => c.status === 'candidate' && !c.probed).length ?? 0
      const left = i?.communities.filter((c) => c.status === 'rejected').length ?? 0
      const stored = i?.reddit.postsStored ?? 0
      const wide = stored > 0 ? Math.round(((i?.reddit.postsFromUnconfigured ?? 0) / stored) * 100) : null
      return {
        ...(i
          ? {
            detail: `${plural(active.length, 'community', 'communities')} watched${suggested > 0 ? `, ${fmtInt(suggested)} suggested and not yet checked` : ''}, ${fmtInt(left)} checked and left out` +
              (wide != null ? ` · ${wide}% of the Reddit posts we hold came from searching all of Reddit, not from these communities.` : '.'),
          }
          : {}),
        notes: r.notes.map((n) => n.replace(' · watched by hand, never sampled', ' · added by hand')),
        unlocks: held
          ? 'We choose which communities to watch, and check each one first. Tell us one to add or drop; while your searches are held still, it waits until January.'
          : CLIENT_UNLOCKS.communities,
      }
    }
    case 'searchable-findings': {
      const e = i?.embeddings
      if (!e || e.total === 0 || e.embedded < e.total) return {}
      return {
        detail: `All ${fmtInt(e.total)} findings can be searched by a question on Ask${e.lastEmbeddedAt ? ` · the latest added ${fullDate(e.lastEmbeddedAt)}` : ''}.`,
        unlocks: 'Nothing to do: each update makes its new findings searchable.',
      }
    }
    case 'months-of-history':
      return {
        detail: r.detail
          .replace(/^(\d[\d,]*) (months?) clear (\d+) videos in (.+?); (\d+) of (\d+) audiences clear any\.$/, '$1 $2 with $3 videos or more in $4; $5 of $6 audiences have one.')
          .replace(/^No month yet carries (\d+) videos/, 'No month yet holds $1 videos'),
        notes: r.notes.map((n) => n
          .replace(/^(.+): 0 of 0 months clear \d+ videos \(0 clear \d+ comments\) · no month at all/, '$1: no month read yet')
          .replace(/^(.+): (\d+) of (\d+) months clear (\d+) videos \((\d+) clear (\d+) comments\)/, '$1: $2 of $3 months with $4 videos or more ($5 with $6 comments or more)')),
      }
    case 'anomaly-baseline':
      return {
        detail: r.detail.replace(/^No audience has a baseline yet; the fullest is (\d+) of (\d+) months\.$/, 'No audience has the $2 complete months behind it yet; the fullest has $1 of $2.'),
        // Only the audiences: "Flags raised: none in the 2 updates compared so
        // far" read as a check that had run, beside "no baseline yet".
        notes: r.notes
          .filter((n) => !n.startsWith('Flags raised'))
          .map((n) => n.replace(/: baseline forming: (\d+) of (\d+) months$/, ': $1 of the $2 months it needs')),
      }
    case 'read-depth':
      return { input: 'what each update managed to read of a video', ownerWords: OWNER_WORDS.ops }
    case 'update-record':
      // Which update served a scheduled slot and which was run by hand is ours
      // to know (finish-list item 17; the record leaves it out too).
      return { notes: r.notes.map((n) => n.replace(/ · (on schedule|by hand)$/, '')).filter((n) => !n.startsWith('Which scheduled slot')) }
    case 'delivery':
      // "Paused", Team's word for the same schedule (sw-2 item 2).
      return {
        detail: r.detail
          .replace(/ on it but is switched off, so nothing is sent\.$/, ' on it and is paused, so nothing is sent.')
          .replace(/ on them but are switched off, so nothing is sent\.$/, ' on them and are paused, so nothing is sent.'),
        notes: r.notes.map((n) => n.replace(/: off, /, ': paused, ')),
      }
    case 'change-record': {
      const c = i?.changeLog
      if (!c || !c.available || c.rows === 0 || !c.firstLoggedAt) return {}
      return {
        detail: `Every change is written down as it is made, since ${fullDate(c.firstLoggedAt)}${c.lastChangeAt ? `, the latest on ${fullDate(c.lastChangeAt)}` : ''}. Changes before then were worked out afterwards from what each update searched.`,
        notes: [],
        unlocks: 'Nothing to do: each change, ours and yours, is listed in Settings › The record.',
      }
    }
    case 'decisions': {
      const a = facts.advice
      if (!a) return { detail: r.detail.replace(/ · \d[\d,]* of \d[\d,]* carry a link to the one before \([^)]*\)\.$/, '.') }
      return {
        detail: a.pieces === 0
          ? 'Nothing has been recommended yet.'
          : `${plural(a.pieces, 'piece')} of advice so far; you have acted on ${fmtInt(a.acted)} of them.`,
        unlocks: 'On Your moves, mark each piece of advice done, working on it, or not now, and the next update carries your answer forward instead of asking again.',
      }
    }
    case 'retention':
      return {
        notes: r.notes.map((n) => (n.startsWith('Deleting a comment') ? 'A comment the platform has removed is deleted here too; a month already written down keeps the count it had.' : n)),
      }
    default:
      return {}
  }
}

export function clientReadiness(
  rows: readonly ReadinessRow[],
  opts: {
    by?: Readonly<Record<string, string | null>>
    /** The tenant's sending is Heinrich's (`tenantLocked(clientId, 'sends')`):
     *  the Delivery row says he sets it up. Off, the row keeps its own words. */
    sendingLocked?: boolean
    /** sw-2 item 6: what the rows need to be true for a client. */
    facts?: ReadinessFacts
  } = {},
): ClientReadinessView {
  const heinrichSends = opts.sendingLocked === true
  const facts = opts.facts ?? {}
  const shown = rows.filter((r) => !(r.status === 'missing' && r.owner !== 'client'))
  const view = shown.map((r): ClientReadinessRow => {
    const by = opts.by?.[r.id] ?? null
    const base: ClientReadinessRow = {
      ...r,
      // The page by its name in the menu: "Competitive" is Brands now.
      block: r.block === 'Competitive' ? surface('competitive').label : r.block,
      detail: r.clientDetail ?? r.detail,
      // The set-aside and read-before-the-flags history is the record's
      // (Settings › The record › Coverage says it word for word); Readiness is
      // about what is missing (copy de-clutter C9).
      notes: r.id === 'read-depth' ? [] : r.notes,
      unlocks: r.id === 'delivery' && heinrichSends ? DELIVERY_UNLOCKS : r.owner === 'client' ? r.unlocks : (CLIENT_UNLOCKS[r.id] ?? r.unlocks),
      ownerWords: r.id === 'delivery' && heinrichSends ? DELIVERY_OWNER : OWNER_WORDS[r.owner],
      by: by ? fullDate(by) : null,
    }
    return { ...base, ...clientRow(base, facts) }
  })
  return { rows: view, summary: summarise(view), withheld: rows.length - shown.length }
}

/**
 * What the reading pages do not do yet, in one list (copy de-clutter ruling G,
 * 2026-09-24). These used to be "not built yet" tiles on Market and
 * Competitive, printed on every visit; this is their one home. No dates: a
 * date nobody promised is not one to print.
 */
export const NOT_BUILT: readonly { page: string; what: string }[] = [
  // THE PAGES BY THEIR NAMES IN THE MENU, AND ONLY WHAT IS STILL NOT BUILT
  // (sw-2 item 6): "Market" and "Competitive" are Your moves and Brands now;
  // plans ARE re-read against every update (Your moves › Upload a plan), and
  // This week prints how much of each subject came in with the update.
  { page: surface('market').label, what: 'Confirming this month’s card as a move in one press.' },
  { page: surface('market').label, what: 'Registering a claim, and keeping a claim’s identity across updates.' },
  { page: surface('market').label, what: 'A claim’s verdict per month, held across two updates before it is printed.' },
  { page: surface('subjects').label, what: 'Reading what your own posts claim, beside the subjects they match.' },
  { page: surface('week').label, what: 'Which way a switching signal ran, toward you or away.' },
  { page: surface('competitive').label, what: 'Rivals’ own claims beside what their audience says. This is a decision we have not taken yet, not a gap in your workspace.' },
  { page: surface('competitive').label, what: 'Cross-brand findings marked “seen in N of the last 6 months”, which needs a finding identity that survives an update.' },
  { page: surface('competitive').label, what: 'Grouping rivals’ questions, and matching them to your subjects.' },
]
