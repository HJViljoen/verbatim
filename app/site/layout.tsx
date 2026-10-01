import type { Metadata } from 'next'
import { Bricolage_Grotesque } from 'next/font/google'
import './site.css'
import { SiteFooter } from './_components/site-footer'

// Marketing chrome. Served on the apex domain (see proxy.ts) under the
// marketing identity (DESIGN.md, "The murmur"): Bricolage Grotesque for
// everything a person did not say, IBM Plex Serif italic for everything a
// person did. Bricolage loads here, not in the root layout, so the app bundle
// never carries it. Pages render their own nav (dark inside the home hero,
// light and sticky on inner pages); the layout owns the footer.

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],
  display: 'swap',
})

// Absolute, with a pass-through template: the root layout's "%s · Verbatim"
// is the app's, and the site's pages already write their own full titles.
export const metadata: Metadata = {
  title: { absolute: 'Verbatim · They hear your name. We hear the market.', template: '%s' },
  description:
    'Your name is 0.02% of the conversation. Verbatim reads the bigger market you sell into: what people buying and talking about products like yours say on TikTok, Instagram, YouTube and Reddit, and where your rivals stand.',
}

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `antialiased` lives here, not on <html>: the app renders text at the
    // browser's default smoothing, as the artboards do (integration, 1 Oct),
    // and the marketing site keeps the weight it has always had.
    <div className={`site-theme antialiased ${bricolage.variable}`}>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  )
}
