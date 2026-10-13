// The board's `.alias`: a name on the ground, in the mono. A plain module (no
// 'use client'), so the server tab and the client controls share one string; a
// constant exported from a client module reaches a server component as a
// client reference, not as its value.
export const ALIAS_CHIP = 'mr-1.5 mb-1.5 inline-flex items-center rounded-[6px] bg-[#F7F6F2] px-2 py-1 font-mono text-[12.5px] leading-[1.3] text-[#26292C]'

/** The common-word tag inside a chip. */
export const CHECKED_TAG = 'ml-1.5 font-sans text-[11px] font-semibold text-[#5F656B]'
