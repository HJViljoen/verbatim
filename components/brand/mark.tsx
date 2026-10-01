// The Verbatim mark: the ditto mark, "repeated exactly as said". Two short
// parallel strokes leaning forward, drawn in currentColor so the surface picks
// the colour. In the app (palette A; Heinrich, 1 Oct) it is the brand yellow
// `text-brand` beside the name in ink (the sidebar, the signed-out frame), and
// ink only where it sits ON a yellow fill (the app icon, the weekly read's
// masthead). The marketing site keeps the Verbatim green on white, mint on the
// dark Room, white on a green tile, until the site is recoloured. Static copies
// for email and other non-React surfaces live in `public/brand/`.
//
// Decorative by default: the wordmark beside it already says "Verbatim", so a
// second reading of the name is noise. Pass `title` only where the mark stands
// alone and has to name itself.
export function VerbatimMark({
  size = 20,
  className,
  title,
}: {
  size?: number
  className?: string
  title?: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <line x1="27" y1="16" x2="17" y2="48" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
      <line x1="47" y1="16" x2="37" y2="48" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
    </svg>
  )
}
