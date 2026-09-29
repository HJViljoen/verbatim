import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Page not found' }

// Any marketing address no page claims. The proxy rewrites every apex path
// under /site, so without this an unknown one fell through to the root 404
// and lost the site's chrome; throwing here lands it on app/site/not-found.tsx,
// inside the site layout.
export default function UnknownSitePage(): never {
  notFound()
}
