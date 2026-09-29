import Link from 'next/link'
import type { Metadata } from 'next'
import { SiteNav } from './_components/site-nav'

// The marketing site's 404, on its own chrome (the layout adds the footer).
// The site's template is a pass-through, so the title is written in full.
export const metadata: Metadata = { title: 'Page not found · Verbatim' }

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
