// Button classes for the Your products page, from the audit design's look
// (components/v2/look.ts, itself import-free), so the client Tag control
// (tag-control.tsx) can use them without bundling the page loader, which
// reaches lib/gather and node: modules. Nothing else is imported here.

import { BTN_PRIMARY, BTN_SECONDARY } from '@/components/v2/look'

/** The secondary button: white, the control grey's edge, ink words. */
export const BTN = BTN_SECONDARY

/** The primary button: the brand yellow with ink words (decision 8). */
export const BTN_INK = BTN_PRIMARY
