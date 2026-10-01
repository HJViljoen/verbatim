import { updateSearchTerms } from '@/app/dashboard/settings/actions'
import { Card, CardTitle, Chip } from '@/components/pages/studio/ui'
import { TERM_GROUPS, type TermKey, type TermLists } from '@/lib/pages/settings-words'
import { InlineAdd } from './inline-add'

// "Search terms" (Page-Settings artboard): the words that decide which videos
// belong to the market, in four groups. Each group adds a term through the
// terms action, which takes all four lists at once, so every add posts the
// other three as they stand. A group with no terms is drawn only for someone
// who can add one: for anyone else it would be an empty section.

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
    <Card className="gap-3 px-[30px] pt-[26px] pb-2">
      <CardTitle>Search terms</CardTitle>
      <p className="m-0 -mt-1.5 text-[14px] leading-normal text-[#5F656B]">The words that decide which videos belong to your market.</p>
      <div className="flex flex-col">
        {TERM_GROUPS.filter((g) => canEdit || terms[g.key].length > 0).map((g) => (
          <div key={g.key} className="flex flex-col gap-2.5 border-t border-[#E4E2DC] py-[18px]">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="m-0 text-[15px] font-bold">{g.name}</h3>
                <p className="m-0 text-[13px] text-[#5F656B]">{g.note}</p>
              </div>
              {canEdit ? (
                <InlineAdd
                  label={g.add}
                  field={g.key}
                  inputLabel={`${g.add} to ${g.name}`}
                  placeholder={g.key === 'exclude_terms' ? 'a word' : 'a term'}
                  action={updateSearchTerms}
                  hidden={<AllLists terms={terms} />}
                />
              ) : null}
            </div>
            {terms[g.key].length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {terms[g.key].map((t) => <Chip key={t}>{t}</Chip>)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
