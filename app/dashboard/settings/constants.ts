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

// What a tenant may CHOOSE. 'paused' is a real production value (three tenants
// carry it) that this list deliberately excludes: pausing is an operator lever.
// Because the select could not represent it, the form rendered 'paused' as
// 'weekly' and the next save silently re-armed the scheduler on a tenant that
// was meant to be quiet — see the cadence section and the T0-7 guard in the
// action, which refuses to move a paused tenant rather than rewriting it.
export const PERIODS = ['weekly', 'monthly'] as const
/** Every value the pipeline understands, including operator-only ones. */
export const ALL_PERIODS = ['weekly', 'monthly', 'daily', 'paused'] as const
export const DAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const

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
