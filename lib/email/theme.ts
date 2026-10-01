/**
 * The email's palette and type (Reports & Exports Stage 3, 2026-08-30;
 * palette A since 2026-10-01).
 *
 * Email clients read no stylesheet and no CSS variable, so the app tokens
 * (app/globals.css :root) are mirrored here as literal hex. Palette A, as the
 * weekly read (`components/email/weekly-read.tsx`) draws it: a paper ground
 * under a white card, ink text and an ink button with white text, the brand
 * yellow for fills (ink on it), pale yellow for soft panels, the text-safe
 * orange for small labels and links, dark gold for "you" and "good", grey for
 * rivals. Web-safe stacks behind Plex: most clients never load a web font, and
 * the fallback has to read as the same page.
 */

export const EMAIL = {
  /** The brand yellow: a fill, never text. Ink on it. */
  brand: '#FFD43B',
  /** The pale yellow: a soft panel or chip, ink on it. */
  brandTint: '#FFF4C7',
  /** "You" in a chart: the dark gold. */
  you: '#9A6B00',
  /** The primary button: ink, white text on it. */
  button: '#26292C',
  /** Orange text: small labels and links (5.2:1 on the card). */
  link: '#C2410C',
  /** The orange accent: a rule or a dot, never text. */
  accent: '#F2651D',
  canvas: '#F7F6F2',
  card: '#FFFFFF',
  inner: '#F7F6F2',
  ink: '#26292C',
  ink2: '#45494D',
  muted: '#5F656B',
  faint: '#9AA0A6',
  border: '#E4E2DC',
  hairline: '#E4E2DC',
  /** A bar's background. */
  track: '#ECEAE4',
  /** "Good": shares the gold with "you", as the app's --positive does. */
  up: '#9A6B00',
  down: '#DB3B2E',
  downTint: '#FBE3E1',
  /** A rival: the chart grey. */
  comp: '#8A9097',
  cat: '#9AA1A9',
  mixed: '#E6B03C',
  /** `mixed` at 20% over the card, FLATTENED — the artboards' attention tint
   *  (`rgba(230,176,60,.20)`), which a mail client laying out with Word will
   *  not composite. It completes the tint set beside `brandTint` and
   *  `downTint`, and it is the one a movement carries when the caller has said
   *  the direction is not a judgement (`BlockMovement`, good="neutral"). */
  mixedTint: '#FAEFD8',
  neutralSeg: '#CDD2D7',
} as const

export type EmailTheme = typeof EMAIL

export const FONT = {
  sans: "'IBM Plex Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  serif: "'IBM Plex Serif',Georgia,'Times New Roman',serif",
  mono: "'IBM Plex Mono',SFMono-Regular,Menlo,Consolas,monospace",
} as const

/** The tiles hand their charts token strings (`var(--you)`, a Tailwind class,
 *  a color-mix); the email needs the hex. Unknown → the muted grey, so a new
 *  token can never paint an email black. */
const TOKEN_HEX: Record<string, string> = {
  'var(--you)': EMAIL.you,
  'var(--primary)': EMAIL.button,
  'var(--positive)': EMAIL.up,
  'var(--brand)': EMAIL.brand,
  'var(--track)': EMAIL.track,
  'var(--comp)': EMAIL.comp,
  'var(--cat)': EMAIL.cat,
  'var(--mixed)': EMAIL.mixed,
  'var(--warning)': EMAIL.mixed,
  'var(--negative)': EMAIL.down,
  'var(--neutral-seg)': EMAIL.neutralSeg,
  'var(--muted-foreground)': EMAIL.muted,
  'var(--foreground)': EMAIL.ink,
  'color-mix(in srgb, var(--comp) 70%, var(--tile))': '#ADB1B6',
  'color-mix(in srgb, var(--comp) 48%, var(--tile))': '#C7CACD',
  'bg-positive': EMAIL.up,
  'bg-you': EMAIL.you,
  'bg-brand': EMAIL.brand,
  'bg-track': EMAIL.track,
  'bg-comp': EMAIL.comp,
  'bg-cat': EMAIL.cat,
  'bg-negative': EMAIL.down,
  'bg-mixed': EMAIL.mixed,
  'bg-warning': EMAIL.mixed,
  'bg-neutral-seg': EMAIL.neutralSeg,
  // The chart ramp as TOKENS, not only as the `bg-` classes below it. A caller
  // that hands a chart a `var(--chart-1)` (the platform palette,
  // components/profile-stats.tsx `platformColour`) resolved to the muted grey
  // in the email arm, which paints every segment of a proportion bar the same
  // colour — a legend of four dots that are one dot.
  'var(--chart-1)': EMAIL.ink,
  'var(--chart-2)': EMAIL.you,
  'var(--chart-3)': EMAIL.muted,
  'var(--chart-4)': EMAIL.cat,
  'var(--chart-5)': EMAIL.neutralSeg,
  'bg-chart-1': EMAIL.ink,
  'bg-chart-2': EMAIL.you,
  'bg-chart-3': EMAIL.muted,
  'bg-chart-4': EMAIL.cat,
  'bg-chart-5': EMAIL.neutralSeg,
}

export function tokenHex(color: string | null | undefined): string {
  if (!color) return EMAIL.muted
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color
  return TOKEN_HEX[color.trim()] ?? EMAIL.muted
}
