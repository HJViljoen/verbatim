import { ImageResponse } from "next/og"
import { OgMark } from "@/components/brand/og-mark"

// The home-screen icon. The ink mark on a full yellow tile, square: iOS
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
          background: "#FFD43B",
        }}
      >
        <OgMark size={140} color="#26292C" />
      </div>
    ),
    size,
  )
}
