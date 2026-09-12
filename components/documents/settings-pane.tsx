'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { updateDocumentSettings } from '@/app/dashboard/studio/actions'
import { DEFAULT_DOCUMENT_ROLE, DOCUMENT_BLOCK_KEYS, DOCUMENT_ROLES, SELLS_TO, type DocumentBlockKey, type DocumentRole, type DocumentSettings } from '@/lib/reports/documents/types'
import { DOCUMENT_BLOCKS, DOCUMENT_BLOCKS_MAX, documentTemplate } from '@/lib/reports/documents/templates'
import { REPORT_TITLE_MAX } from '@/lib/reports/types'
import { DOCUMENT_BRIEF_MAX } from '@/lib/config'
import type { DocumentSettingsPatch } from '@/lib/reports/validate'

// A written report's settings (S8, 2026-08-31): the few choices it has.
// Blur-save through the server action, one at a time, in order; the built
// document stands, the next build reads these. Language is the fixed word
// while English is the only one.
//
// A CUSTOM brief (WP7d, 2026-09-12) has three more: the operator's own
// instruction, the topic blocks it must include in the order they print, and
// which of the four roles writes it. They appear only on a custom brief; the
// four templates carry their own brief and their own skeleton.

const inputCls = 'h-8 w-full rounded-[4px] border border-input bg-tile px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
const labelCls = 'font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground'

export function SettingsPane({ reportId, title, reader, settings, tracked, readerHint, competitorsUsed, findingsMax, custom = false }: {
  reportId: string
  title: string
  reader: string
  settings: DocumentSettings
  tracked: string[]
  /** The placeholder in "Written for": this template's own reader. */
  readerHint: string
  /** False when the template neither prints a competitor page nor asks a
   *  question per competitor, so the picker would change nothing. */
  competitorsUsed: boolean
  /** The template's own ceiling: offering four on a brief that prints three
   *  is a control that does not do what it says. */
  findingsMax: 3 | 4
  /** A custom brief: it is written from the operator's own instruction and
   *  the blocks picked here, so those controls appear. */
  custom?: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const save = (patch: DocumentSettingsPatch) => {
    setStatus('Saving')
    chain.current = chain.current.then(async () => {
      const r = await updateDocumentSettings({ id: reportId, patch })
      setStatus(r.message)
      if (r.ok) router.refresh()
    })
  }
  // Held in state so two quick ticks both count (props lag the refresh).
  const [chosen, setChosen] = useState<Set<string>>(() => (settings.competitors === null ? new Set(tracked) : new Set(settings.competitors)))
  const toggle = (name: string, on: boolean) => {
    const next = new Set(chosen)
    if (on) next.add(name); else next.delete(name)
    setChosen(next)
    const all = tracked.every((t) => next.has(t))
    save({ competitors: all ? null : tracked.filter((t) => next.has(t)) })
  }
  // The blocks live in state too: a tick and a reorder are two saves, and the
  // props behind them lag the refresh.
  const [blocks, setBlocks] = useState<DocumentBlockKey[]>(() => settings.blocks ?? [])
  const saveBlocks = (next: DocumentBlockKey[]) => { setBlocks(next); save({ blocks: next }) }
  const moveBlock = (key: DocumentBlockKey, by: -1 | 1) => {
    const i = blocks.indexOf(key)
    const j = i + by
    if (i < 0 || j < 0 || j >= blocks.length) return
    const next = [...blocks]
    next.splice(i, 1)
    next.splice(j, 0, key)
    saveBlocks(next)
  }
  // Chosen first, in the order they print; the rest below, in their own order.
  const listed = [...blocks, ...DOCUMENT_BLOCK_KEYS.filter((k) => !blocks.includes(k))]
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Title</span>
        <input defaultValue={title} className={inputCls} maxLength={REPORT_TITLE_MAX} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== title) save({ title: v }) }} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Written for</span>
        <input defaultValue={reader} placeholder={readerHint} className={inputCls} maxLength={80} onBlur={(e) => { const v = e.target.value.trim(); if (v !== reader) save({ reader: v }) }} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Who you sell to</span>
        <select defaultValue={settings.sellsTo} className={inputCls} onChange={(e) => save({ sellsTo: e.target.value as DocumentSettings['sellsTo'] })}>
          {SELLS_TO.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="text-[11.5px] text-muted-foreground">{SELLS_TO.find((s) => s.key === settings.sellsTo)?.hint}</span>
      </label>
      {custom && (
        <>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Your brief</span>
            <textarea
              defaultValue={settings.brief ?? ''}
              rows={4}
              maxLength={DOCUMENT_BRIEF_MAX}
              placeholder="Review how the conversation about comfort and fit moved this month, for the marketing lead"
              className="w-full resize-y rounded-[4px] border border-input bg-tile px-2.5 py-1.5 text-[13px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (settings.brief ?? '')) save({ brief: v }) }}
            />
            <span className="text-[11.5px] text-muted-foreground">What you want this brief to answer, in your own words. It is the first thing the writer reads and the first thing the research asks.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Written in the role of</span>
            <select defaultValue={settings.role ?? DEFAULT_DOCUMENT_ROLE} className={inputCls} onChange={(e) => save({ role: e.target.value as DocumentRole })}>
              {DOCUMENT_ROLES.map((r) => <option key={r} value={r}>{documentTemplate(r)?.name ?? r}</option>)}
            </select>
            <span className="text-[11.5px] text-muted-foreground">Whose voice writes it, and what the consequence of a finding is called.</span>
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className={labelCls}>Topics this brief must cover</legend>
            {listed.map((key) => {
              const b = DOCUMENT_BLOCKS[key]
              const at = blocks.indexOf(key)
              return (
                <div key={key} className="flex items-start gap-2">
                  <input
                    type="checkbox" id={`block-${key}`} checked={at >= 0} className="mt-0.5 size-3.5 accent-primary disabled:opacity-40"
                    disabled={at < 0 && blocks.length >= DOCUMENT_BLOCKS_MAX}
                    onChange={(e) => saveBlocks(e.target.checked ? [...blocks, key] : blocks.filter((x) => x !== key))}
                  />
                  <label htmlFor={`block-${key}`} className="flex-1 cursor-pointer">
                    <span className="block">{b.title}</span>
                    <span className="block text-[11.5px] leading-snug text-muted-foreground">{b.description}</span>
                  </label>
                  {at >= 0 && (
                    <span className="flex shrink-0 items-center">
                      <button type="button" onClick={() => moveBlock(key, -1)} disabled={at === 0} aria-label={`Move ${b.title} up`} className="grid size-6 place-items-center rounded-[4px] text-muted-foreground hover:bg-inner hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" aria-hidden /></button>
                      <button type="button" onClick={() => moveBlock(key, 1)} disabled={at === blocks.length - 1} aria-label={`Move ${b.title} down`} className="grid size-6 place-items-center rounded-[4px] text-muted-foreground hover:bg-inner hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" aria-hidden /></button>
                    </span>
                  )}
                </div>
              )
            })}
            <span className="text-[11.5px] text-muted-foreground">
              {blocks.length
                ? `They print in this order, between the findings and the last page. Every topic you tick is researched in full, so one build covers up to ${DOCUMENT_BLOCKS_MAX} of them.`
                : `Without a topic this brief is the overview, the findings and the method page. Pick the topics it must cover, up to ${DOCUMENT_BLOCKS_MAX}.`}
            </span>
          </fieldset>
        </>
      )}
      {competitorsUsed && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className={labelCls}>Competitors to include</legend>
          {tracked.length ? tracked.map((name) => (
            <label key={name} className="flex items-center gap-2">
              <input type="checkbox" checked={chosen.has(name)} onChange={(e) => toggle(name, e.target.checked)} className="size-3.5 accent-primary" />
              <span>{name}</span>
            </label>
          )) : <span className="text-[11.5px] text-muted-foreground">No competitors tracked yet. Add them under Settings.</span>}
        </fieldset>
      )}
      {findingsMax > 3 ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Findings</span>
          <select defaultValue={String(Math.min(settings.findings, findingsMax))} className={inputCls} onChange={(e) => save({ findings: e.target.value === '3' ? 3 : 4 })}>
            <option value="4">Up to four</option>
            <option value="3">Up to three</option>
          </select>
        </label>
      ) : (
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Findings</span>
          <span>Up to three</span>
          <span className="text-[11.5px] text-muted-foreground">This brief is short by design.</span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className={labelCls}>Language</span>
        <span>English</span>
      </div>
      <p className="min-h-[1em] font-mono text-[10.5px] text-muted-foreground" aria-live="polite">{status}</p>
    </div>
  )
}
