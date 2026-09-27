import type { ReactNode } from 'react'

import { effectiveWords, queuedByWords, type QueueLine } from '@/lib/settings/queue'
import type { SetStep } from '@/lib/settings/search-set'
import { cn } from '@/lib/utils'

import { Card, CardLink } from './card'
import { SearchSetBody } from './search-set-toggle'

// Settings › What we read, "The search set" (market-first WP3.10; the approved
// Settings artboard's second card). Four things, top to bottom:
//   - the strip over the set: "Held still until January" and what is queued
//     for it (decision I), with the one control, "Queue a change", which opens
//     the editor in the set's place; a workspace that is not held still reads
//     "Changes land with the next update" and "Change the search set";
//   - the set, group by group: each search with the day we first searched it,
//     the communities we read as well as search, and "Not these", the other
//     meanings of the names we track, by the meaning each rules out;
//   - "How the set got here": the dated history, the held-still stretch and
//     the two dates ahead;
//   - a footer link to The record's dated list of what we changed.

export interface SetGroup {
  key: string
  label: string
  sub: string
  terms: readonly { term: string; day: string | null }[]
}

export function SearchSetCard({
  locked, queue, canEdit, groups, communities, exclusions, history, recordHref, editor,
}: {
  /** The searches are held still until January (decision I). */
  locked: boolean
  /** What is queued, where the queue can be read (MF3); `unavailable` before
   *  it, when a change is noted by hand. */
  queue: { state: 'available'; summary: string; lines: readonly QueueLine[] } | { state: 'unavailable' }
  canEdit: boolean
  groups: readonly SetGroup[]
  communities: readonly { name: string; day: string | null }[]
  exclusions: readonly { meaning: string | null; words: readonly string[] }[]
  history: { steps: readonly SetStep[]; heldAfter: number | null }
  recordHref: string
  /** The page's one form, drawn while the set is being changed. */
  editor: ReactNode
}) {
  const queued = queue.state === 'available' ? queue.lines : []
  const banner = locked ? (
    <div className="flex items-start gap-4">
      <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-tile ring-1 ring-border">
        <LockIcon size={18} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="m-0 text-[15px] font-semibold">Held still until January</h3>
        <span className="font-mono text-[13px] text-muted-foreground">
          {queue.state === 'available' ? queue.summary : 'tell us and we will note it for then'}
        </span>
        {queued.length > 0 ? (
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {queued.map((l) => (
              <li key={`${l.field}-${l.queuedAt}`} className="flex flex-col gap-0.5">
                <span className="text-[14px]"><span className="font-semibold">{l.label}:</span> {l.words}</span>
                <span className="font-mono text-[12px] text-muted-foreground">from {effectiveWords(l.month)} · {queuedByWords(l)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  ) : canEdit ? (
    <h3 className="m-0 text-[15px] font-semibold">Changes land with the next update</h3>
  ) : null
  // Where the queue cannot be read (before MF3) a held-still change is noted
  // by hand, so no editor opens: its save would only be refused.
  const button = !canEdit ? null : locked ? (queue.state === 'available' ? 'Queue a change' : null) : 'Change the search set'

  const read = (
    <div className="flex flex-col">
      <div className="hidden grid-cols-[216px_minmax(0,1fr)] items-end gap-x-8 border-b border-border pb-2.5 sm:grid">
        <span className="text-[13px] font-medium text-muted-foreground">Group</span>
        <span className="text-[13px] font-medium text-muted-foreground">Search, and the day we first searched it</span>
      </div>
      {groups.map((g) => (
        <GroupRow key={g.key} label={g.label} count={g.terms.length} sub={g.sub}>
          {g.terms.length === 0 ? <span className="py-2 text-[15px] text-muted-foreground">none yet</span> : g.terms.map((t) => <Chip key={t.term} term={t.term} day={t.day} />)}
        </GroupRow>
      ))}
      <GroupRow label="Communities" count={communities.length} sub="Reddit, read as well as searched">
        {communities.length === 0 ? <span className="py-2 text-[15px] text-muted-foreground">none yet</span> : communities.map((c) => <Chip key={c.name} term={`r/${c.name}`} day={c.day} />)}
      </GroupRow>
      <GroupRow label="Not these" count={exclusions.reduce((n, g) => n + g.words.length, 0)} sub="other meanings of the names we track" last>
        {exclusions.length === 0 ? (
          <span className="py-2 text-[15px] text-muted-foreground">none yet</span>
        ) : (
          <div className="flex w-full flex-col">
            {exclusions.map((g, i) => (
              <div key={g.meaning ?? `other-${i}`} className="grid min-h-9 grid-cols-1 items-center gap-x-6 py-1 sm:grid-cols-[216px_minmax(0,1fr)] sm:py-0">
                <span className="text-[13px] text-muted-foreground">{g.meaning ?? 'other words'}</span>
                <span className="flex flex-wrap items-center gap-x-2.5 text-[15px] text-secondary-foreground">
                  {g.words.map((w, j) => (
                    <span key={w} className="inline-flex items-center gap-x-2.5">
                      {j > 0 ? <span aria-hidden className="text-muted-foreground">·</span> : null}
                      <span>{w}</span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </GroupRow>
    </div>
  )

  return (
    <Card id="search-set" title="The search set" footer={<CardLink href={recordHref}>What we changed, and when</CardLink>}>
      <SearchSetBody banner={banner} button={button} read={read} editor={editor} />
      {history.steps.length > 0 ? (
        <div className="flex flex-col gap-4 border-t border-border/60 pt-6">
          <h3 className="m-0 text-[15px] font-semibold">How the set got here</h3>
          <Timeline steps={history.steps} heldAfter={history.heldAfter} />
        </div>
      ) : null}
    </Card>
  )
}

function GroupRow({ label, count, sub, last = false, children }: { label: string; count: number; sub: string; last?: boolean; children: ReactNode }) {
  return (
    <div className={cn('grid grid-cols-1 items-start gap-x-8 gap-y-3 py-4 sm:grid-cols-[216px_minmax(0,1fr)]', last ? 'pb-0' : 'border-b border-border/60')}>
      <div className="flex flex-col gap-0.5 sm:pt-[7px]">
        <span className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold">{label}</span>
          <span className="font-mono text-[13px] text-muted-foreground">{count}</span>
        </span>
        <span className="text-[13px] leading-[1.45] text-muted-foreground">{sub}</span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Chip({ term, day }: { term: string; day: string | null }) {
  return (
    <span className="inline-flex max-w-full min-h-9 flex-wrap items-center gap-x-2.5 rounded-lg bg-inner px-3 py-1 text-[15px]">
      <span className="whitespace-nowrap">{term}</span>
      {day ? <span className="whitespace-nowrap font-mono text-[13px] text-muted-foreground">{day}</span> : null}
    </span>
  )
}

function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

/**
 * The dated history as the preview draws it: a filled dot for each change
 * made, joined by a solid line; the held-still stretch dashed, with its lock;
 * a hollow dot for each date ahead. Stacked on a phone.
 */
function Timeline({ steps, heldAfter }: { steps: readonly SetStep[]; heldAfter: number | null }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-4 p-0 sm:flex-row sm:items-start sm:gap-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const next = steps[i + 1]
        const held = heldAfter === i && !last
        const solid = !last && s.state === 'past' && next?.state === 'past'
        return (
          <li key={`${s.when}-${i}`} className={cn('flex min-w-0 gap-3 sm:flex-col', last ? 'sm:w-[168px] sm:flex-none' : held ? 'sm:flex-[1.45]' : 'sm:flex-1')}>
            <div className="flex h-4 shrink-0 items-center">
              <span className={cn('relative z-[1] size-3 shrink-0 rounded-full', s.state === 'past' ? 'bg-ink-market' : 'bg-tile ring-2 ring-inset ring-secondary-foreground')} />
              {last ? null : held ? (
                <span className="mx-2 hidden flex-1 items-center gap-2 sm:flex">
                  <span className="flex-1 border-t-2 border-dashed border-neutral-seg" />
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[13px] text-secondary-foreground"><LockIcon />held still</span>
                  <span className="flex-1 border-t-2 border-dashed border-neutral-seg" />
                </span>
              ) : solid ? (
                <span className="mx-2 hidden h-0.5 flex-1 bg-ink-market sm:block" />
              ) : (
                <span className="mx-2 hidden flex-1 border-t-2 border-dashed border-neutral-seg sm:block" />
              )}
            </div>
            <div className="flex max-w-[240px] flex-col gap-1 sm:pr-4">
              <span className="font-mono text-[13px] font-semibold">{s.when}</span>
              <span className="text-[13px] leading-[1.45] text-secondary-foreground [text-wrap:pretty]">{s.words}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
