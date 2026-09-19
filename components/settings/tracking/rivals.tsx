'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { RIVALS_PRESENT } from '@/app/dashboard/settings/constants'
import { RivalRename } from '@/app/dashboard/settings/rival-rename'
import { CONTROL, Dot, Figure, FIELD, GridRow, GridTable, ICON_TARGET, MonoNote, Section, SectionHead, SectionNotes } from '@/components/settings/chrome'
import { monthName, platformLabel, shortDate } from '@/lib/format'
import { HANDLE_FORMAT_CAVEAT } from '@/lib/provisioning'
import { isNewRival, rivalRefusalNote, rivalState, rivalsMeta, RIVAL_BREAK_RULE, RIVAL_REMOVED_PENDING, type RivalRow } from '@/lib/settings/rivals-view'
import { cn } from '@/lib/utils'

// `settings.rivals.*` — the rivals table at the artboard's five columns, and
// the add control the artboard puts under it.
//
// THE LIST IS FORM STATE, WHICH IS WHY ADDING AND REMOVING ARE HERE. A rival is
// one string in `tracking_configs.competitor_names`; the built page edited that
// list as a comma-separated box at the foot of the page, beside the cadence
// card, where nothing connected it to the table above. Here the table IS the
// list: a name goes in through the field under it, comes out through the × on
// its row, and the page's one save writes the whole list through
// `updateTrackingConfig` — which already derives the search terms, gives every
// name an identity (`ensureRivals`) and stamps an actor on the write.
//
// THE MOCK'S COLUMN IS "Own posts with a claim"; OURS IS "Own posts". A rival's
// claims are `video_claims` rows in their bucket and no tenant session may read
// them (M8). What they PUBLISHED is readable, is most of what that number was,
// and is dated by `videos.upload_date` — a third clock, so the head names the
// month and the note under the table names the clock (D9).
//
// "Tracked since" IS EARLIEST EVIDENCE. `competitors.first_seen_at` is the
// first day our own data shows we were reading the name, not the day anybody
// asked for it; the footnote says so, and until M1 is applied there is no
// identity at all and the cell says that instead of a date.

const COLS = '180px minmax(0,1fr) 112px 132px 150px'
// The rival and what we read of them are sentences; the two dates and figures
// after them are not. One array, so the head cannot drift from its column.
const ALIGN = ['left', 'left', 'right', 'right', 'right'] as const

export interface RivalsSectionProps {
  rows: readonly RivalRow[]
  /** The tracked list as the form holds it. */
  names: readonly string[]
  onAdd: (name: string) => string | null
  onRemove: (name: string) => void
  canEdit: boolean
  /** The month the own-posts column is headed by, as a month start. */
  month: string
}

export function RivalsSection({ rows, names, onAdd, onRemove, canEdit, month }: RivalsSectionProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const head = ['Rival', 'Accounts we read', 'Tracked since', `Own posts · ${monthName(month)}`, ''] as const
  const refusal = rivalRefusalNote(rows, month)

  function add() {
    const problem = onAdd(draft)
    setError(problem)
    if (problem === null) setDraft('')
  }

  // A name the reader has just typed has no row of its own yet: nothing is
  // captured, no identity exists, and saying "0 posts" about it would be a
  // measurement of a rival we have not looked at once.
  const known = new Set(rows.map((r) => r.name))
  const added = names.filter((n) => !known.has(n))


  return (
    <Section>
      <SectionHead title="Rivals" meta={rivalsMeta(rows, { names, added: added.length })} rule={RIVAL_BREAK_RULE} />

      {/* "This POST carried the rival list." Outside the table on purpose: the
          state that most needs it is the empty one, where there is no table and
          no hidden input, and an absent list must not read as an erased one. */}
      <input type="hidden" name={RIVALS_PRESENT} value="1" />

      {rows.length === 0 && added.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No rival is named. Naming one is how the category gets a shape.</p>
      ) : (
        <GridTable cols={COLS} min={860} head={head} align={ALIGN}>
          {rows.map((r) => {
            // Taken off here and not yet saved. The row STAYS — its months are
            // frozen under this name and a reader still has to see them — but
            // it stops presenting as tracked: no hidden input, the state cell
            // says what is waiting, and the control that acted on it offers the
            // way back. Before this, the only thing the x removed was itself.
            const dropped = !r.retiredAt && !names.includes(r.name)
            return (
            <GridRow
              key={r.identity?.id ?? r.name}
              cols={COLS}
              align={ALIGN}
              minHeight={52}
              className={dropped ? 'opacity-60' : undefined}
              cells={[
                <span key="n" className="flex items-center gap-2">
                  {!dropped && !r.retiredAt && canEdit && (
                    <button
                      type="button"
                      onClick={() => onRemove(r.name)}
                      aria-label={`Stop tracking ${r.name}`}
                      className={cn(ICON_TARGET, 'cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-inner hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  )}
                  <span className="min-w-0 truncate text-[12.5px] font-medium">{r.name}</span>
                  {isNewRival(r, month) && !dropped && (
                    <span className="shrink-0 rounded-full bg-warning/20 px-2 py-px text-[10.5px] font-semibold">New</span>
                  )}
                  {/* The tracked list is the form's; one hidden input per name
                      so a name carrying a comma survives the round trip. */}
                  {names.includes(r.name) && <input type="hidden" name="competitor_names" value={r.name} />}
                </span>,
                <span key="h" className="block">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-secondary-foreground">
                    <Dot tone={dropped || r.retiredAt ? 'none' : r.noAccounts ? 'watch' : r.read > 0 ? 'good' : 'watch'} />
                    {dropped ? RIVAL_REMOVED_PENDING : rivalState(r)}
                  </span>
                  {r.perPlatform.length > 0 && (
                    <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">
                      {r.perPlatform.map((p) => (
                        <span key={p.platform} className="mr-2 inline-block">
                          {/* No `@` on YouTube: it is read by CHANNEL ID and an
                              @name reads nothing at all, so printing one as a
                              handle teaches a client the wrong shape to paste. */}
                          {platformLabel(p.platform)} {p.handle ? (p.platform === 'youtube' ? p.handle : `@${p.handle}`) : '— not tracked'}
                          {p.captured > 0 ? ` · ${p.captured} captured, ${p.read} read` : ''}
                        </span>
                      ))}
                    </span>
                  )}
                </span>,
                <span key="t" className="block text-right font-mono text-[11.5px] text-muted-foreground">
                  {r.trackedSince ? shortDate(`${r.trackedSince.slice(0, 10)}T00:00:00.000Z`) : 'not recorded'}
                </span>,
                r.ownPosts
                  ? <Figure key="o" value={r.ownPosts.value.k.toLocaleString('en-GB')} muted={r.ownPosts.value.k === 0} />
                  // THE CELL IS SHORT AND THE REASON IS A FOOTNOTE. Every
                  // rival with no account configured carries the same sentence,
                  // and five copies of it down a 132px column is five rows of
                  // three-line text saying one thing. The dash says there is no
                  // census; the note under the table says why, once.
                  : <span key="o" className="block text-right text-[11.5px] text-muted-foreground">— not read</span>,
                dropped && canEdit
                  ? (
                    <span key="r" className="block text-right">
                      <button type="button" onClick={() => setError(onAdd(r.name))} className={CONTROL}>Put it back</button>
                    </span>
                  )
                  : r.identity && !r.retiredAt && canEdit
                    ? <RivalRename key="r" id={r.identity.id} name={r.name} />
                    : <span key="r" className="block text-right text-[11.5px] text-muted-foreground">{r.retiredAt ? 'no longer tracked' : RENAME_UNAVAILABLE}</span>,
              ]}
            />
            )
          })}
          {added.map((name) => (
            <GridRow
              key={`new-${name}`}
              cols={COLS}
              align={ALIGN}
              minHeight={52}
              cells={[
                <span key="n" className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRemove(name)}
                    aria-label={`Remove ${name}`}
                    className={cn(ICON_TARGET, 'cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-inner hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                  <span className="min-w-0 truncate text-[12.5px] font-medium">{name}</span>
                  <input type="hidden" name="competitor_names" value={name} />
                </span>,
                <span key="h" className="block text-[12.5px] text-muted-foreground">added here, not yet saved — nothing of theirs is read until it is</span>,
                <span key="t" className="block text-right font-mono text-[11.5px] text-muted-foreground">—</span>,
                <span key="o" className="block text-right text-[11.5px] text-muted-foreground">—</span>,
                <span key="r" />,
              ]}
            />
          ))}
        </GridTable>
      )}

      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            disabled={!canEdit}
            placeholder="Add a rival by name"
            aria-label="Add a rival by name"
            className={cn(FIELD, 'w-[280px] max-w-full')}
          />
          <button type="button" onClick={add} disabled={!canEdit || draft.trim() === ''} className={CONTROL}>Add a rival</button>
          {refusal && <MonoNote className="max-w-[420px]">{refusal}</MonoNote>}
        </div>
        {error && <span role="alert" className="text-[11.5px] text-negative">{error}</span>}
      </div>

      {/* Four sentences, one paragraph (design H2). Each is true and each is
          needed; four stacked blocks of grey mono closing a section built for
          density is not. */}
      <SectionNotes
        notes={[
          HANDLE_FORMAT_CAVEAT,
          TRACKED_SINCE_NOTE,
          rows.some((r) => r.ownPosts)
            ? `Own posts are dated by the day the post went up, which is a different clock from everything else on this page — ${rows.find((r) => r.ownPosts)?.ownPosts?.basis}.`
            : null,
          ...[...new Set(rows.map((r) => r.ownPostsWhy).filter((w): w is string => w != null))],
        ]}
      />
    </Section>
  )
}

/** What the action cell says where there is no identity to rename. Before M1
 *  every cell on the page is this one, and an empty cell would read as a
 *  missing control rather than an unshipped one. */
export const RENAME_UNAVAILABLE = 'renaming needs their identity, which has not shipped here yet'

export const TRACKED_SINCE_NOTE =
  '“Tracked since” is the earliest evidence in our own data that we were reading the name — not the day you asked for it, which nothing recorded until now.'
