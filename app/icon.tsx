import { ImageResponse } from "next/og"
import { OgMark } from "@/components/brand/og-mark"

// The PNG favicon, for the browsers and clients that will not take icon.svg.
// The app icon (palette A, 2026-10-01): the ink ditto on a yellow rounded tile,
// the same tile icon.svg and favicon.ico draw. On a tile rather than on
// transparent: a bare ink mark disappears into a dark tab strip.
export const runtime = "nodejs"
export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#FFD43B",
          borderRadius: 6,
        }}
      >
        <OgMark size={32} color="#26292C" />
      </div>
    ),
    size,
  )
}
