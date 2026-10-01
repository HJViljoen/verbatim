import Link from 'next/link'
import type { Metadata } from 'next'
import { SiteNav } from './_components/site-nav'

// The marketing site's 404, on its own chrome (the layout adds the footer).
// The site's template is a pass-through, so the title is written in full.
//
// The site's own icons and share card are NAMED here (1 Oct). A 404's metadata
// does not pick up this segment's icon files: Next resolves them from the root,
// which is the app's yellow set now that the site keeps its green (measured on
// `next start`: /site/nope linked /icon.svg and the app's card). Every site
// 404 lands here, the catch-all's and an unknown use case's alike.
export const metadata: Metadata = {
  title: 'Page not found · Verbatim',
  icons: {
    icon: [
      { url: '/site/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/site/icon', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/site/apple-icon', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: { images: [{ url: '/site/opengraph-image', width: 1200, height: 630, alt: 'Verbatim · consumer intelligence' }] },
}

export default function SiteNotFound() {
  return (
    <>
      <SiteNav variant="light" />
      <header className="hiw-head nf" id="content" tabIndex={-1}>
        <div className="wrap">
          <h1>Nothing here. <span>The market’s still talking.</span></h1>
          <p>There’s no page at this address. The link may be mistyped, or the page may have moved.</p>
          <div className="nf-links">
            <Link className="btn btn-green" href="/">Go to the home page</Link>
            <Link className="btn btn-ghost" href="/how-it-works">How it works</Link>
          </div>
        </div>
      </header>
    </>
  )
}
