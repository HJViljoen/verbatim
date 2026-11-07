import { updateSearchTerms } from '@/app/dashboard/settings/actions'
import { Card, CardTitle } from '@/components/pages/studio/ui'
import { EMPTY, TERM } from '@/components/v2/look'
import { TERM_GROUPS, type TermKey, type TermLists } from '@/lib/pages/settings-words'
import { cn } from '@/lib/utils'
import { InlineAdd } from './inline-add'

// "Search terms" (Page-Settings artboard): the words that decide which videos
// belong to the market, in four groups. Each group adds a term through the
// terms action, which takes all four lists at once, so every add posts the
// other three as they stand. A group with no terms is drawn only for someone
// who can add one: for anyone else it would be an empty section.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings.dc.html): every term is the one
// `.term` look, whatever group it is in (no colour by whose words it is), and
// an editor's empty group says "None yet." in the dashed box. The third
// group reads "Names for the brands you track" with the board's note, said
// here on the screen: `TERM_GROUPS`' words are pinned by
// lib/pages/settings.test.ts, which is not this build's to change.
const SCREEN_WORDS: Partial<Record<TermKey, { name: string; note: string }>> = {
  competitor_keywords: {
    name: 'Names for the brands you track',
    note: 'How people name the brands you track. The brands themselves, with their accounts, are under Brands you track.',
  },
}

/** All four lists as hidden fields: the action rewrites the set it is sent. */
function AllLists({ terms }: { terms: TermLists }) {
  return (
    <>
      {(Object.keys(terms) as TermKey[]).flatMap((k) =>
        terms[k].map((t, i) => <input key={`${k}-${i}`} type="hidden" name={k} value={t} />))}
    </>
  )
}

export function SearchTerms({ terms, canEdit }: { terms: TermLists; canEdit: boolean }) {
  return (
    <Card className="p-[26px] max-sm:p-[18px]">
      <CardTitle>Search terms</CardTitle>
      <p className="m-0 mt-1.5 text-[15px] leading-[1.55] text-secondary-foreground">The words that decide which videos belong to your market.</p>
      {TERM_GROUPS.filter((g) => canEdit || terms[g.key].length > 0).map((g) => {
        const name = SCREEN_WORDS[g.key]?.name ?? g.name
        const note = SCREEN_WORDS[g.key]?.note ?? g.note
        return (
          <div key={g.key} className="mt-5 border-t border-track pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="m-0 text-[16px] font-semibold">{name}</h3>
                <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{note}</p>
              </div>
              {canEdit ? (
                <InlineAdd
                  label={g.add}
                  field={g.key}
                  inputLabel={`${g.add} to ${name}`}
                  placeholder={g.key === 'exclude_terms' ? 'a word' : 'a term'}
                  action={updateSearchTerms}
                  hidden={<AllLists terms={terms} />}
                />
              ) : null}
            </div>
            {terms[g.key].length > 0 ? (
              <ul className="m-0 mt-3 flex list-none flex-wrap items-center gap-2 p-0">
                {terms[g.key].map((t) => <li key={t} className={TERM}>{t}</li>)}
              </ul>
            ) : (
              <p className={cn(EMPTY, 'm-0 mt-3 px-4 py-3')}>None yet.</p>
            )}
          </div>
        )
      })}
    </Card>
  )
}
