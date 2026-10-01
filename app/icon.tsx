import { ImageResponse } from "next/og"
import { OgMark } from "@/components/brand/og-mark"

// The PNG favicon, for the browsers and clients that will not take icon.svg.
// The app icon (palette A; Heinrich, 1 Oct): the ink ditto on a yellow rounded
// tile, the same tile icon.svg and favicon.ico draw. On a tile rather than on
// transparent: a bare mark disappears into a tab strip of its own colour. The
// marketing site keeps its green set in its own segment (app/site/icon.tsx).
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
