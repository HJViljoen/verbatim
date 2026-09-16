import { ImageResponse } from "next/og"
import { OgMark } from "@/components/brand/og-mark"

// The PNG favicon, for the browsers and clients that will not take icon.svg.
// Green on white rather than on transparent: a transparent mark disappears into
// a dark tab strip, and the mark is never any colour but the three it has.
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
          background: "#FFFFFF",
          borderRadius: 6,
        }}
      >
        <OgMark size={32} color="#0E8A5F" />
      </div>
    ),
    size,
  )
}
