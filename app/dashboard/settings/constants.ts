// Shared between the settings form (client) and its server action. Kept in a
// plain module (no 'use server'/'use client') so both sides import one source
// of truth for the allowed values + numeric bounds.

// Every platform the pipeline can store data for — the validation vocabulary.
// Reddit is here so an operator can enable it on a tenant, but see below.
export const PLATFORMS = ['tiktok', 'youtube', 'instagram', 'reddit'] as const

// What onboarding OFFERS and ACCEPTS. Reddit is deliberately absent: it is a
// degradable, operator-enabled platform (Wave 3) with no kill switch of its own
// — the moment 'reddit' lands in a tenant's platforms, paid Apify searches and
// comment scrapes run. So it must be enabled by an operator on the tenant row,
// never self-served. Used by BOTH the form and its server-action validator: the
// form alone is not a control, since a hand-crafted POST bypasses it.
export const SELECTABLE_PLATFORMS = PLATFORMS.filter((p) => p !== 'reddit')

// A tenant chooses no cadence any more (27 Sep, Heinrich: "remove cadence from
// settings, and always have it weekly on sunday"). `PERIODS` (the weekly-or-
// monthly choice), `DAYS` and `ALL_PERIODS` went with the Cadence section and
// with scripts/set-cadence.ts's old vocabulary: every workspace is weekly, on
// Sunday, and 'paused' is the operator's lever (lib/update-rhythm.ts).

export type Platform = (typeof PLATFORMS)[number]

/**
 * The marker the rivals table posts beside its names: "this POST carried the
 * rival list, and what it carried is the whole of it".
 *
 * Now that the table IS the list, ZERO rivals is a state a reader reaches by
 * taking the last one off, and the section's own empty state presents it as
 * legal — so the save may not refuse it. But "zero names" and "this form had no
 * rivals section" arrive as the same absent field, and reading the second as
 * the first would let a cached page or a hand-made POST erase a tracked list
 * nobody touched. The marker tells them apart: present, the list is written as
 * posted; absent, `competitor_names` is not written at all.
 *
 * Here rather than in `actions.ts` because a 'use server' module may export
 * nothing but async functions.
 */
export const RIVALS_PRESENT = 'competitor_names_present'

/** The field the form posts once per pending edit, so the one save row can say
 *  what it wrote rather than what a third of it wrote. Read against
 *  `TRACKING_FIELDS` (lib/settings/connections.ts) and never echoed raw. */
export const SAVED_FIELDS = 'saved_fields'
