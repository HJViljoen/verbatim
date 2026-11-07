import { TERM } from '@/components/v2/look'

// The board's `.term`: a name on the ground, in sans (the audit design, 7 Nov,
// Settings-Products.dc.html; the kit's one `TERM` look, which What you track's
// terms share). A plain module (no 'use client'), so the server tab and the
// client controls share one string; a constant exported from a client module
// reaches a server component as a client reference, not as its value.
export const ALIAS_CHIP = TERM

/** The common-word tag inside a name: the board's `.term small`. */
export const CHECKED_TAG = 'text-[12.5px] font-semibold text-secondary-foreground'
