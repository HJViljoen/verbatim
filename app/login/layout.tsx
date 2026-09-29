import type { Metadata } from 'next'

// The page is a client component and cannot export metadata, so its tab title
// lives here (the root layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: 'Sign in' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
