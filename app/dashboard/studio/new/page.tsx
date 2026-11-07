import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { operatorOnlyRedirect } from '@/lib/pages/studio'
import { PageFrame } from '@/components/shell/page-grid'
import { LevelBar } from '@/components/shell/level-bar'
import { Card } from '@/components/pages/studio/ui'
import { BTN_SECONDARY } from '@/components/v2/look'
import { GoLink, SectionHead } from '@/components/v2/ui'
import { cn } from '@/lib/utils'
import { CUSTOM_KEY, DOCUMENT_STARTERS } from '@/lib/reports/documents/templates'
import { AUDIENCES } from '@/lib/reports/types'
import { createReport } from '@/app/dashboard/studio/actions'
import type { Metadata } from 'next'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: 'New report · Studio' }

// New report (Heinrich, 2026-08-30): pick a template to start from, or go
// custom and arrange it yourself. A template only arranges existing pages
// and suggests who it is written for; both are yours to change in the editor.
// Written reports (2026-08-31): the agent writes the document from the
// update in a role, inside a fixed skeleton; you set who it is for and edit
// the words before they go out. The custom brief (WP7d, 2026-09-12) stands
// beside the four: your own instruction plus the topic blocks it must
// include, written by the same agent in one of the same roles.
//
// SINCE THE AUDIT DESIGN (7 Nov, Studio-New.dc.html): the crumb "Studio / New
// report" over the title, "Back to the Studio" a link; "Templates" a section
// head with its note; each template a tile with its name, a two-fact list
// (For, Kinds of page) and "Use this template" the white button. The form
// and what each button posts are unchanged.

export const dynamic = 'force-dynamic'

const audienceLabel = (k: string) => AUDIENCES.find((a) => a.key === k)?.label ?? k

export default async function NewReportPage() {
  // Templates, the catalogue and custom reports are the operator's (pages
  // build, 1 Oct): anyone else is sent back to the Studio.
  const away = operatorOnlyRedirect(await getSessionContext())
  if (away) redirect(away)
  return (
    <PageFrame>
      <LevelBar
        crumbs={[{ label: 'Studio', href: '/dashboard/studio' }, { label: 'New report', href: null }]}
        level="report"
        title="New report"
        controls={<GoLink href="/dashboard/studio">Back to the Studio</GoLink>}
      />
      <form action={createReport} className="flex flex-col gap-[22px]">
        <SectionHead title="Templates" note="Written by Verbatim, from the update" />
        <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2">
          {DOCUMENT_STARTERS.filter((t) => t.key !== CUSTOM_KEY).map((t) => (
            <li key={t.key} className="flex">
              <Card className="w-full gap-3.5 p-[26px] max-sm:p-[18px]">
                <h3 className="m-0 text-[19px] font-semibold leading-[1.3]">{t.name}</h3>
                <dl className="m-0 grid grid-cols-2 gap-4 text-[14.5px]">
                  <div><dt className="text-[13px] text-muted-foreground">For</dt><dd className="m-0 mt-1">{audienceLabel(t.audience)}</dd></div>
                  <div><dt className="text-[13px] text-muted-foreground">Kinds of page</dt><dd className="m-0 mt-1 tabular-nums"><span data-copy="figure">{t.skeleton.length}</span></dd></div>
                </dl>
                <p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground">{t.description}</p>
                <div className="flex-1" />
                <button type="submit" name="document" value={t.key} className={cn(BTN_SECONDARY, 'self-start max-sm:h-11')}>
                  Use this template
                </button>
              </Card>
            </li>
          ))}
        </ul>
      </form>
    </PageFrame>
  )
}
