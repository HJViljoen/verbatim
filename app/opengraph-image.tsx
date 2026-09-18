import { readFile } from "node:fs/promises"
import { ImageResponse } from "next/og"
import { OgMark } from "@/components/brand/og-mark"

// The card every link to Verbatim unfurls into: the Room, the lockup, the line
// the site opens with. Bricolage Grotesque is the marketing face (DESIGN.md,
// "Typography"); next/font cannot hand its bytes to Satori, so the two static
// weights are bundled under app/fonts and read here.
export const runtime = "nodejs"
export const alt = "Verbatim · consumer intelligence"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const ROOM = "#0F1F19"
const MINT = "#3DBF8C"

export default async function OpengraphImage() {
  const [regular, bold] = await Promise.all([
    readFile(new URL("./fonts/BricolageGrotesque-Regular.ttf", import.meta.url)),
    readFile(new URL("./fonts/BricolageGrotesque-Bold.ttf", import.meta.url)),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "0 80px",
          background: ROOM,
          fontFamily: "Bricolage Grotesque",
        }}
      >
        {/* The lockup, on one line: mark, wordmark, descriptor beside it and
            never under it. Sized so the row clears 1040px of usable width.
            Satori does not implement `align-items: baseline`, so the row hangs
            off the bottom of each box with line-height pinned to 1, which puts
            the strokes on the wordmark's baseline; the descriptor is lifted the
            10px its smaller descent leaves under it. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 30, marginLeft: -16 }}>
          <OgMark size={112} color={MINT} />
          <div style={{ fontSize: 108, lineHeight: 1, fontWeight: 700, letterSpacing: "-0.02em", color: "#FFFFFF", whiteSpace: "nowrap" }}>
            Verbatim
          </div>
          <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 10, fontWeight: 400, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>
            consumer intelligence
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 40, fontWeight: 400, color: "#FFFFFF" }}>
          They hear your name. We hear the market.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bricolage Grotesque", data: regular, weight: 400, style: "normal" },
        { name: "Bricolage Grotesque", data: bold, weight: 700, style: "normal" },
      ],
    },
  )
}
