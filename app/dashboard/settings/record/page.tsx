import { SettingsCard, SettingsFrame, SettingsRow, SettingsTable } from '@/components/settings-frame'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { changeLogBoundary } from '@/lib/config-log'
import { gateAccessFor } from '@/lib/gate-record'
import { fullDate, monthName } from '@/lib/format'
import { recordWindow } from '@/lib/pages/overview'
import { recordLines } from '@/lib/reading/record'
import { readChangeLog } from '@/lib/settings/change-log'
import { deliveryRecord, updatesInMonth } from '@/lib/settings/delivery'
import { loadRecordPage } from '@/lib/settings/record-load'
import { gateSummary, keptByPlatform, keptByTerm, sampleNote } from '@/lib/settings/reject-log'
import { createAdminClient } from '@/lib/supabase-admin'
import { AppealButton } from './appeal-button'

// Settings › The record (Phase 1 WP16, design ST5 · ST7 · ST8 and ST6's
// delivery half) — everything the product can say about how it read this
// workspace, in one place, so that no other page has to carry more than one
// sentence of method.
//
// Five blocks, in the mock's order: Delivery · The change log · The reject log
// · The scope statement · Coverage.
//
// OPEN TO EVERY MEMBER, EXCEPT THE EXCERPT. The delivery record, the change log
// and the coverage block are the tenant's own facts about their own workspace.
// The twenty discarded candidates carry 200 characters of a stranger's scraped
// caption, the account it was posted from and the gate's words about it, and M8
// withholds all three from `authenticated` by column grant — so the admin
// client is passed to the loader only after canManageTenant, and a member sees
// the rates without the text and is told that is what is happening.
//
// NOTHING DEGRADES INTO A ZERO. The change log's table and the gate's tenant
// policy each arrive in their own migration window, and until they do the
// blocks that read them say the record has not started rather than printing a
// confident nothing.

export default async function SettingsRecordPage() {
  const { supabase, clientId, role, userId, operator } = await getSessionContext()
  const canSeeExcerpt = canManageTenant(role)

  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  const { data: client } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  const tenant = (client?.company_name as string | undefined) ?? 'Your workspace'

  const inputs = await loadRecordPage({
    client: supabase,
    admin: canSeeExcerpt ? createAdminClient() : null,
    clientId,
    tenant,
    window: recordWindow(`${month}-01`, now.toISOString()),
    now: now.toISOString(),
    // Which client `supabase` is: the service role only for an operator viewing
    // this workspace from outside it. The coverage block below reads the gate's
    // record through it, and a tenant session's read of that table is emptied
    // by RLS rather than refused until M8 lands.
    gate: gateAccessFor(operator),
  })

  const delivery = deliveryRecord({ updates: inputs.updates, slotsRecorded: inputs.slotsRecorded })
  const thisMonth = updatesInMonth(inputs.updates, month)
  const log = readChangeLog({ rows: inputs.changes.rows, viewerUserId: userId, emails: inputs.emails })
  // The totals are exact (head counts); the rates are over the most recent
  // sample of judgements, and the card says so when the two differ.
  const totals = inputs.gate.totals
  const byTerm = keptByTerm(inputs.gate.verdicts).slice(0, 10)
  const byPlatform = keptByPlatform(inputs.gate.verdicts)
  const basis = sampleNote(inputs.gate.verdicts.length, totals.found)
  const lines = recordLines(inputs.coverage)

  return (
    <SettingsFrame
      active="record"
      title="Settings"
      context={tenant}
      contentTitle="The record"
      contentMeta={`${delivery.total} update${delivery.total === 1 ? '' : 's'}`}
    >
      <div className="flex flex-col gap-3">

        {/* ---- Delivery ---------------------------------------------------- */}
        <SettingsCard
          title="Delivery"
          description="Every update this workspace has had, on the clock the updates themselves ran on — never a month key for anything else."
        >
          <p className="text-[12.5px]">{delivery.line}</p>
          {delivery.total > 0 && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {delivery.recentSettled} of the last {delivery.recent} finished.
              {delivery.scheduledServed && ` ${delivery.scheduledServed.scheduled} served a scheduled slot, ${delivery.scheduledServed.byHand} were run by hand.`}
            </p>
          )}
          <div className="mt-3">
            <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
              {monthName(month)}
            </p>
            {thisMonth.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No update has run this month yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {thisMonth.map((u) => (
                  <li key={u.id} className="rounded-full bg-tile px-2 py-px font-mono text-[11px] text-secondary-foreground ring-1 ring-border">
                    {u.startedAt.slice(0, 10)} · {u.status}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {delivery.caveats.map((c) => (
            <p key={c} className="mt-2 text-[11.5px] text-muted-foreground">{c}</p>
          ))}
        </SettingsCard>

        {/* ---- The change log ---------------------------------------------- */}
        <SettingsCard
          title="The change log"
          description="Every change to what we track for you — yours and ours — with what each one broke."
        >
          {!inputs.changes.available ? (
            <p className="text-[12px] text-muted-foreground">
              Nothing in the product can record a configuration change yet. When that ships, every change from
              that day on is written down here as it happens.
            </p>
          ) : (
            <>
              <SettingsTable
                head={['Date', 'What changed', 'What it breaks', 'Made by']}
                empty="No change has been recorded yet."
              >
                {log.recorded.slice(0, 20).map((c) => (
                  <SettingsRow
                    key={c.id}
                    cells={[
                      <span key="d" className="font-mono text-[11.5px] text-muted-foreground">{c.date}</span>,
                      <span key="w" className="block text-left">
                        <span className="font-medium">{c.what}</span>
                        <span className="block text-[11.5px] text-muted-foreground">{c.said}</span>
                        {(c.before || c.after) && (
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {c.before ?? 'nothing'} → {c.after ?? 'nothing'}
                          </span>
                        )}
                      </span>,
                      <span key="b" className="text-[11.5px] text-muted-foreground">{c.breaks}</span>,
                      <span key="m" className="text-[11.5px]">{c.who}</span>,
                    ]}
                  />
                ))}
              </SettingsTable>
              <p className="mt-2 text-[11.5px] text-muted-foreground">{changeLogBoundary(log.firstLoggedAt)}</p>
              {log.prehistory.length > 0 && (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {log.prehistory.length} earlier entr{log.prehistory.length === 1 ? 'y was' : 'ies were'} worked
                  out afterwards from what each update searched, the oldest dated{' '}
                  {log.prehistory[log.prehistory.length - 1].date}. They are a label, not a record, and are not
                  counted above.
                </p>
              )}
            </>
          )}
        </SettingsCard>

        {/* ---- The reject log ---------------------------------------------- */}
        <SettingsCard
          title="The reject log"
          description="What we looked at and set aside, on which term — the one part of our method you can check yourself."
        >
          {!inputs.gate.available ? (
            <p className="text-[12px] text-muted-foreground">
              We do not yet show you what was set aside. The record exists; opening it to you is a change we have
              not shipped.
            </p>
          ) : (
            <>
              <p className="text-[12.5px]">{gateSummary(totals, delivery.since)}</p>
              {totals.unjudged > 0 && (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {totals.unjudged.toLocaleString('en-GB')} of them were never actually judged — the quick check
                  found no reason to drop them and nothing looked closer.
                </p>
              )}

              {byTerm.length > 0 && (
                <div className="mt-3">
                  <SettingsTable head={['Term', 'Looked at', 'Kept', 'Kept rate']}>
                    {byTerm.map((t) => (
                      <SettingsRow
                        key={t.key}
                        cells={[t.label, t.found.toLocaleString('en-GB'), t.kept.toLocaleString('en-GB'), `${t.keptPct.toFixed(1)}%`]}
                      />
                    ))}
                  </SettingsTable>
                </div>
              )}

              {byPlatform.length > 0 && (
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                  By platform: {byPlatform.map((p) => `${p.label} ${p.keptPct.toFixed(1)}%`).join(' · ')}.
                </p>
              )}

              {basis && <p className="mt-1 text-[11.5px] text-muted-foreground">{basis}</p>}

              {canSeeExcerpt ? (
                <div className="mt-4">
                  <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                    The last {inputs.gate.rows.length} we set aside
                  </p>
                  {inputs.gate.rows.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">Nothing has been set aside yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {inputs.gate.rows.map((r) => (
                        <li key={`${r.runId}-${r.platform}-${r.videoId}`} className="border-t border-border/70 pt-2 first:border-t-0 first:pt-0">
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {r.createdAt.slice(0, 10)} · {r.platform}
                            {r.accountName ? ` · ${r.accountName}` : ''}
                            {r.keyword ? ` · found on “${r.keyword}”` : ''}
                          </p>
                          <p className="mt-0.5 text-[12.5px]">{r.captionExcerpt ?? 'No caption was stored for this one.'}</p>
                          <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-[11.5px] text-muted-foreground">
                              {r.reason ?? (r.source === 'default' ? 'Nobody judged this one.' : 'No reason was recorded.')}
                            </p>
                            <AppealButton runId={r.runId} platform={r.platform} videoId={r.videoId} filed={r.appealed} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-[11.5px] text-muted-foreground">
                  The posts themselves are shown to owners and admins only. They are other people’s public posts,
                  and the fewer copies of them we hand around the better.
                </p>
              )}
            </>
          )}
        </SettingsCard>

        {/* ---- The scope statement ------------------------------------------ */}
        <SettingsCard
          title="What this covers, and what it does not"
          description="The scope statement. Written to be copied into a document that needs it — select it and paste."
        >
          <div className="whitespace-pre-wrap rounded-[4px] bg-tile px-3 py-2.5 font-mono text-[11.5px] leading-[1.6] text-secondary-foreground ring-1 ring-border">
            {scopeStatement(tenant, lines, now.toISOString())}
          </div>
        </SettingsCard>

        {/* ---- Coverage ------------------------------------------------------ */}
        <SettingsCard
          title={`Coverage · ${monthName(month)}`}
          description="What the reading of this month rests on. Each line is one fact with its basis; a fact nothing has recorded says so."
        >
          <ul className="flex flex-col gap-1.5">
            {lines.map((l) => (
              <li key={l} className="text-[12.5px] leading-[1.5] text-secondary-foreground">{l}</li>
            ))}
          </ul>
        </SettingsCard>

      </div>
    </SettingsFrame>
  )
}

/**
 * The scope statement, as text.
 *
 * "Exportable" here means a block a reader can select and paste, not a PDF:
 * the export route renders a REGISTERED PAGE KEY through headless Chrome, and
 * Settings has no page key and never will (`lib/nav.ts`). A button that
 * produced nothing would be worse than a block that can be copied.
 */
function scopeStatement(tenant: string, lines: readonly string[], readingAt: string): string {
  return [
    `${tenant} — what this reading covers, as at ${fullDate(readingAt)}.`,
    '',
    ...lines.map((l) => `· ${l}`),
    '',
    'Every figure is a share of what we read, not of everything said. We read public comment on the videos our search terms find, plus the accounts you and your rivals post from where those are configured. A month is dated by the day a comment was written, not by the day we read it.',
  ].join('\n')
}
