// What leads the week (depth v2; decision 1, and the lead's ruling of 13 Oct
// on T11b). ONE rule for every surface that opens on "this week": the weekly
// email's lead, and Market's top row. Pure: no I/O, no copy, no surface's
// shapes. The caller hands in what it has and prints what comes back.
//
// THE ORDER:
//   1. the update's first anomaly flag, in the order `weekFlagRows`
//      (lib/pages/week.ts) gives them. The caller passes the flags in that
//      order, and passes none from a check it could not read. A flag leads as
//      flagged, whatever its conversation's set-apart mark;
//   2. else, of the conversations first heard this week, the one with the
//      most videos this week;
//   3. else the conversation with the most videos this week.
// Nothing at all is null: the slot is not drawn.
//
// ONE COUNT, MARKET'S. Both 2 and 3 rank on `week`: the CATEGORY's videos in
// the run's frozen window (`window_theme_readings` on the category audience),
// the count Market ranks its week by. A new conversation is joined to its
// conversation's `week` here, by registry id, so whatever count the caller's
// "new" list carries (the weekly read's own is lenient-gated) never decides
// the order; one with no conversation in the list has no count and cannot
// lead.
//
// SET APART NEVER LEADS. A conversation half or more of whose videos are
// makers' own, or off-topic (Market's `segmentOf` mark), is skipped for 2 and
// 3, as Market skips it.
//
// NO DIRECTION WORD COMES WITH IT. A flag earned its word from its verdict;
// "new" is a reader flag; the third is a count, headed plainly ("Most talked
// about this week") and printed beside its month (decision 1). Ties fall to
// the registry id, so a replay agrees.

/** One conversation this week. The pinned shape (T3 and T11b): a caller may
 *  carry more fields, and gets its own object back. */
export interface LeadConversation {
  /** `theme_registry.id`. */
  registryId: string
  label: string
  /** The category's videos in the run's window: the count both rank on. */
  week: number
  /** Maker-led or off-topic: never leads. */
  setApart: boolean
}

/** A conversation first heard this week, by registry id: its count is its
 *  conversation's. */
export interface LeadNew {
  registryId: string
}

export type WeekLead<F, C extends LeadConversation> =
  | { kind: 'flag'; flag: F }
  | { kind: 'new' | 'biggest'; conversation: C }

/**
 * RULING U6 ON EVERY FLAG A WEEK MAY LEAD WITH (14 Oct). The anomaly check
 * flags every active subject whatever its check (it measures), but a subject
 * whose check has not passed prints no figure resting on its membership, and
 * a flag is nothing but such figures (its week's count, its months', its
 * chip). So a flag on a subject that is not READY is left out before the
 * lead is picked: the next flag leads, or the next rule. ONE predicate for
 * Market's live flags (`printableFlags`, lib/pages/v2/market.ts) and the
 * weekly issue's frozen ones (`printableWeekRead`,
 * lib/reports/weekly-read-build.ts). Pure.
 */
export function flagPrints(flag: { objectKind: string; objectId: string }, readySubjects: ReadonlySet<string>): boolean {
  return flag.objectKind !== 'subject' || readySubjects.has(String(flag.objectId))
}

/** The week's lead, or null. Pure. */
export function weekLead<F, C extends LeadConversation>(input: {
  flags: readonly F[]
  newThisWeek: readonly LeadNew[]
  conversations: readonly C[]
}): WeekLead<F, C> | null {
  if (input.flags.length > 0) return { kind: 'flag', flag: input.flags[0] }
  const ranked = input.conversations
    .filter((c) => !c.setApart && c.week > 0)
    .sort((a, b) => b.week - a.week || (a.registryId < b.registryId ? -1 : a.registryId > b.registryId ? 1 : 0))
  const fresh = new Set(input.newThisWeek.map((n) => n.registryId))
  const firstNew = ranked.find((c) => fresh.has(c.registryId))
  if (firstNew) return { kind: 'new', conversation: firstNew }
  return ranked[0] ? { kind: 'biggest', conversation: ranked[0] } : null
}
