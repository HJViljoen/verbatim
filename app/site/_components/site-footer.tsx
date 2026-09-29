import Link from 'next/link'
import { VerbatimMark } from '@/components/brand/mark'
import { USE_CASES_PUBLIC } from '../_data/playbooks'
import { CONTACT_EMAIL } from '@/lib/legal'

const APP_URL = 'https://app.verbatimintel.com'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span className="wordmark">
          <VerbatimMark size={16} className="mark" />
          <b>Verbatim</b>
          <span>consumer intelligence</span>
        </span>
        <span className="links">
          <Link href="/how-it-works">How it works</Link>
          {USE_CASES_PUBLIC && <Link href="/use-cases">Use cases</Link>}
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href={`${APP_URL}/login`}>Sign in</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </span>
        <span>Cape Town. Runs weekly.</span>
      </div>
    </footer>
  )
}
