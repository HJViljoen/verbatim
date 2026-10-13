// Button classes for the Your products page. Plain strings with no imports, so
// the client Tag control (tag-control.tsx) can use them without bundling the
// page loader, which reaches lib/gather and node: modules.

/** The board's `.btn`: 38px, the inner ground, ink words. */
export const BTN =
  'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-inner px-3.5 text-[13.5px] font-semibold text-foreground no-underline transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60'

/** The board's `.btn.ink`: ink with white words. */
export const BTN_INK =
  'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3.5 text-[13.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60'
