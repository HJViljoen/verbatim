// The mark for ImageResponse. Satori draws layout boxes, not SVG strokes, so
// the two ditto strokes are rounded boxes leaned to the same angle as
// `public/brand/verbatim-mark.svg`: the stroke runs (27,16) → (17,48) in the
// 64 viewBox, which is 17.35° off vertical, 12 wide with round caps, so the box
// is 12 × 45.5 with a 6 radius. Every number below is that geometry times
// `size / 64`, which keeps the OG mark and the SVG the same shape.
export function OgMark({ size, color }: { size: number; color: string }) {
  const k = size / 64
  const stroke = {
    position: "absolute" as const,
    top: 9.24 * k,
    width: 12 * k,
    height: 45.53 * k,
    borderRadius: 6 * k,
    background: color,
    transform: "rotate(17.35deg)",
  }
  return (
    <div style={{ position: "relative", display: "flex", width: size, height: size }}>
      <div style={{ ...stroke, left: 16 * k }} />
      <div style={{ ...stroke, left: 36 * k }} />
    </div>
  )
}
