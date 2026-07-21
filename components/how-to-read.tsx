import Link from 'next/link'
import { GLOSSARY, type GlossaryKey } from '@/lib/calibration'
import { DetailOverlay } from './detail-overlay'

// "How to read this page" — a quiet top-right trigger that opens the calibrated-
// language legend as a floating card (?detail=legend), no client JS. Replaces the
// old inline dropdown so the reading surface stays clean for frequent users.
// Drop into a page header row; pass the page's own path as basePath.
export function HowToRead({ items, open, basePath }: { items: GlossaryKey[]; open: boolean; basePath: string }) {
  return (
    <>
      <Link
        href={`${basePath}?detail=legend`}
        scroll={false}
        className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted"
      >
        How to read this page
      </Link>
      {open && (
        <DetailOverlay closeHref={basePath}>
          <div className="space-y-3 pr-6">
            <h2 className="text-base font-semibold">How to read this page</h2>
            <dl className="space-y-1.5 text-sm text-muted-foreground">
              {items.map((key) => (
                <div key={key} className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-foreground">{GLOSSARY[key][0]}</dt>
                  <dd>— {GLOSSARY[key][1]}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs opacity-80">
              Every label above is assigned by a fixed rule from counted data — never worded by the AI.
            </p>
          </div>
        </DetailOverlay>
      )}
    </>
  )
}
