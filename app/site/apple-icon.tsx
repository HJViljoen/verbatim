import { ImageResponse } from "next/og"
import { OgMark } from "@/components/brand/og-mark"

// The marketing site's home-screen icon (its own, since the app went yellow
// on 1 Oct; see ./icon.tsx). White mark on a full green tile, square: iOS
// applies its own mask, so rounding it here would round it twice.
export const runtime = "nodejs"
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#0E8A5F",
        }}
      >
        <OgMark size={140} color="#FFFFFF" />
      </div>
    ),
    size,
  )
}
