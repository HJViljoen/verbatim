import { ImageResponse } from "next/og"
import { OgMark } from "@/components/brand/og-mark"

// THE MARKETING SITE'S OWN ICONS (route-segment metadata files, 1 Oct). The
// app moved to the yellow brand; the site keeps the Verbatim green until it is
// recoloured, so this segment carries the green set the root had and Next
// serves it to every page under app/site in place of the app's (a segment's
// own icon, apple-icon and opengraph-image replace its parent's). The root
// favicon.ico cannot be per segment; proxy.ts hands the apex the site's.
//
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
