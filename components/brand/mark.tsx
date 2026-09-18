// The Verbatim mark: the ditto mark, "repeated exactly as said". Two short
// parallel strokes leaning forward, drawn in currentColor so the surface picks
// the colour — green `--primary` (#0E8A5F) on white, mint #3DBF8C on the dark
// Room, white on a green tile, and never anything else. Static copies for
// email and other non-React surfaces live in `public/brand/`.
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
