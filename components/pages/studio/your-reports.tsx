import type { StudioRow } from '@/lib/pages/studio'
import { Card, CardTitle, PersonChip } from './ui'
import { RecipientsEditor } from './recipients-editor'

// "Your reports" (Page-Studio artboard): the weekly and the four monthly
// briefs, one row each. Who it is for, how often, who gets it, the latest
// issue, and Recipients for an owner or admin. The privacy line closes the
// card, once.

// The artboard's grid: Report 2.3fr · For 1fr · How often 1fr · Who gets it
// 1.7fr · Latest issue 1.25fr · the button 120px, 20px apart. Below the
// artboard's width the table scrolls inside the card and the page never does.
const COLS = 'grid grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1.25fr)_120px] gap-5'

export function YourReports({ rows, canEdit, privacy }: { rows: readonly StudioRow[]; canEdit: boolean; privacy: string }) {
  return (
    <Card className="gap-4 px-[30px] pt-[26px] pb-[22px]">
      <CardTitle>Your reports</CardTitle>
      <div className="-mx-1 overflow-x-auto px-1">
        <div role="table" aria-label="Your reports" className="flex min-w-[880px] flex-col">
          <div role="row" className={`${COLS} pb-2.5`}>
            {['Report', 'For', 'How often', 'Who gets it', 'Latest issue'].map((h) => (
              <div key={h} role="columnheader" className="text-[12px] font-semibold text-[#5F656B]">{h}</div>
            ))}
            <div role="columnheader" aria-label="Edit" />
          </div>
          {rows.map((r) => (
            <div key={r.artefact} role="row" className={`${COLS} items-center border-t border-[#E4E2DC] py-[18px]`}>
              <div role="cell" className="flex flex-col gap-1">
                <div className="text-[16px] font-bold">{r.name}</div>
                <div className="text-[13px] leading-[1.45] text-[#5F656B]">{r.what}</div>
              </div>
              <div role="cell" className="text-[14px]">{r.forWho}</div>
              <div role="cell" className="text-[14px]">{r.howOften}</div>
              <div role="cell" className="flex flex-wrap gap-1.5">
                {r.people.map((p) => <PersonChip key={p.email} name={p.name} initials={p.initials} />)}
              </div>
              <div role="cell" className="text-[14px]">{r.latest}</div>
              <div role="cell" className="flex justify-end">
                {canEdit ? <RecipientsEditor artefact={r.artefact} name={r.name} recipients={r.recipients} active={r.active || !r.scheduled} /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 pt-0.5 text-[13px] text-[#5F656B]">{privacy}</p>
    </Card>
  )
}
