import { SettingsFrame } from '@/components/settings-frame'
import { ChangeLogBlock } from '@/components/settings/record/change-log'
import { TheRecord, WhatWeChangedLead, WhenCompared } from '@/components/settings/record/what-we-changed'
import { PagesCanSay, SearchesHeldStill } from '@/components/settings/record/additions'
import { loadQueue, QUEUE_COLUMNS, queueLines, type QueueColumn } from '@/lib/settings/queue'
import { tenantLocked } from '@/lib/tenant-locks'
import { changesFromLog } from '@/lib/reading/comparability'
import { otherRows } from '@/lib/settings/what-we-changed'
import { loadRecordReadingMonth, loadWhatWeChanged } from '@/lib/settings/what-we-changed-load'
import { monthStartOf } from '@/lib/reading/month-key'
import { CoverageBlock } from '@/components/settings/record/coverage'
import { DeliveryBlock } from '@/components/settings/record/delivery'
import { RecordSection } from '@/components/settings/record/frame'
import { SaveStrip, ScopeStatement } from '@/components/settings/record/header'
import { RejectLogBlock } from '@/components/settings/record/rejects'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { fullDate, longMonth, monthName, shortDate } from '@/lib/format'
import { recordWindow } from '@/lib/pages/overview'
import { readingHandle } from '@/lib/reading/read'
import { recordLines, recordRows } from '@/lib/reading/record'
import { changeNote, readChangeLog } from '@/lib/settings/change-log'
import { deliveryRecord, deliveryStats, updatesInMonth } from '@/lib/settings/delivery'
import { loadReadings } from '@/lib/settings/readings'
import { loadRailCounts, loadRecordPage } from '@/lib/settings/record-load'
import { gateSummary, keptByPlatform, keptByTerm, sampleHead } from '@/lib/settings/reject-log'
import { saveState } from '@/lib/settings/save-state'
import { createAdminClient } from '@/lib/supabase-admin'
import { oneLineBar } from '@/lib/shell/bar'
import { AppealButton } from './appeal-button'

// Settings › The record (Phase 1 WP16, ported to the SettingsRecord artboard in
// block E wave 2) — everything the product can say about how it read this
// workspace, in one place, so that no other page has to carry more than one
// sentence of method.
//
// THE SECTIONS, EACH A TILE (market-first WP1.6; the approved preview): What
// we changed · The record · When two months are compared (WP1.6) · Delivery
// (with the monthly-readings strip) · Other settings changes · The reject log ·
// Coverage · What this covers.
//
// THE 25 SEP RULINGS HOLD FOR THE WHOLE TAB (Heinrich's default, 26 Sep): a
// section's header is its title alone, its footer links only, and no
// explanatory or method line sits under its data. The Phase 1 page header
// (its delivery meta and "What was delivered, what changed…") and the footer
// rule ("The record is written as the work happens…") went with them; the tab
// opens on its first tile, as the preview does.
//
// OPEN TO EVERY MEMBER, EXCEPT THE EXCERPT. The delivery record, the change log
// and the coverage block are the tenant's own facts about their own workspace.
// The twenty discarded candidates carry 200 characters of a stranger's scraped
// caption, the account it was posted from and the gate's words about it, and M8
// withholds all three from `authenticated` by column grant — so the admin
// client is passed to the loader only after canManageTenant, and a member sees
// the rates without the text and is told that is what is happening.
//
// NOTHING DEGRADES INTO A ZERO. The change log's table, the gate's tenant
// policy and the month tables each arrive in their own migration window, and
// until they do the blocks that read them say the record has not started rather
// than printing a confident nothing. On both live tenants today three of the
// five sections are in that state, so it is the common arm and not the edge.

export default async function SettingsRecordPage() {
  const { supabase, clientId, role, userId } = await getSessionContext()
  const canSeeExcerpt = canManageTenant(role)

  const now = new Date()
  const nowIso = now.toISOString()
  const reading = readingHandle(clientId)

  // WHAT WE CHANGED (market-first WP1.6): the front page's "What we changed,
  // and when →" opens here. Started beside the record's own reads.
  const changedAhead = loadWhatWeChanged(supabase, reading, nowIso).catch((error: unknown) => {
    console.error(`[settings] what we changed: ${(error as { message?: string })?.message ?? String(error)}`)
    return null
  })
  // THE READING MONTH, NOT THE CALENDAR'S (decision A; deploy 2 review, and
  // WP1.2's open item). On 1 to 15 Oct the tab read October: "Oct 2026 · 0
  // updates", "Coverage · October … No update ran inside this window" and
  // "as at 2 Oct 2026", while What we changed at its top, and every reading
  // page, read September as at the 20 Sep update. Delivery's month, Coverage's
  // title and window, and the scope statement's "as at" now take the reading
  // month and its update, off the same memoised reads What we changed makes;
  // the calendar month and the clock only where nothing was delivered yet.
  const [clientRes, rm] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    loadRecordReadingMonth(supabase, reading, nowIso).catch(() => null),
  ])
  const client = clientRes.data
  const tenant = (client?.company_name as string | undefined) ?? 'Your workspace'
  const month = (rm ? monthStartOf(rm.month) : nowIso).slice(0, 7)
  const asAt = rm?.asAt ?? nowIso
  const window = recordWindow(`${month}-01`, nowIso)
  const inputs = await loadRecordPage({
    client: supabase,
    admin: canSeeExcerpt ? createAdminClient() : null,
    clientId,
    tenant,
    window,
    // "Reading as at" is the update the month is read as at, not the clock.
    now: asAt,
    // THE SAME READ THE RECORD DRAWER MAKES, so this page and the drawer behind
    // "the record →" on the five reading surfaces cannot tell one workspace two
    // different things about its own discard. The reading handle is the
    // service-role client with the tenant id taken from the session — what
    // every reading surface already holds — so the gate regime is 'service'.
    // The discarded candidates with their caption excerpt are unaffected: they
    // are still read on `admin`, still only after canManageTenant.
    reading: { client: reading.client, gate: 'service' },
  })

  const delivery = deliveryRecord({ updates: inputs.updates, slotsRecorded: inputs.slotsRecorded })
  // The denominator history and the rail's two counts. Both wait on the load
  // above — the readings strip is handed the updates it already read, so
  // `pipeline_runs` is not read twice — and neither is on anything's critical
  // path, so they go out together.
  const [readings, counts] = await Promise.all([
    loadReadings(reading.client, clientId, { updates: inputs.updates, month: `${month}-01`, now: nowIso }),
    loadRailCounts(supabase, clientId, delivery.total),
  ])

  const stats = deliveryStats(delivery, inputs.updates)
  const thisMonth = updatesInMonth(inputs.updates, month)
  const changed = await changedAhead
  // DEPLOY 5'S THREE SECTIONS (WP3.10). "Searches held still until January"
  // and the timeline are a locked tenant's: they describe the lock and the
  // clean months it keeps. Before MF3 the queue reads as not there.
  const locked = tenantLocked(clientId, 'tracking')
  const [queue, stored] = locked
    ? await Promise.all([
      loadQueue(supabase, clientId).catch((error: unknown) => {
        console.error(`[settings] tracking queue not read for ${clientId}: ${(error as { message?: string }).message ?? String(error)}`)
        return null
      }),
      supabase.from('tracking_configs').select(QUEUE_COLUMNS.join(', ')).eq('client_id', clientId).maybeSingle()
        .then((r) => (r.data ?? null) as Partial<Record<QueueColumn, unknown>> | null),
    ])
    : [null, null]
  // EACH CHANGE ONCE: the changes of ours print in the dated list above, so
  // the Phase 1 log below keeps every other row (a schedule, a subject, a
  // discovery strike) under its own title.
  const logRows = changed ? otherRows(inputs.changes.rows, changesFromLog(changed.changeRows)) : inputs.changes.rows
  const log = readChangeLog({ rows: logRows, viewerUserId: userId, emails: inputs.emails })
  const save = saveState({
    lastChange: inputs.changes.rows[0] ?? null,
    affectsRecorded: inputs.changes.affectsRecorded,
  })
  // The totals are exact (head counts); the rates are over the most recent
  // sample of judgements, and the block says so when the two differ.
  const totals = inputs.gate.totals
  const lines = recordLines(inputs.coverage)
  const floor = readings.belowFloor[0] ?? null
  const rows = recordRows(inputs.coverage, {
    trailingMedian: readings.trailingMedian,
    // The clause is handed the COUNT it will sit beside, because the two do
    // not filter the same rows: the count includes reconstructed entries and
    // the clause names recorded ones (code review finding 4).
    changeNote: inputs.changes.available
      ? changeNote(log, { from: window.from, to: window.to }, { counted: inputs.coverage.changes.inWindow })
      : null,
    belowFloor: floor
      // `more` is off the TOTAL, not off the truncated list (code review
      // finding 2): the grid's BELOW THE FLOOR basis repeats this number.
      ? { label: floor.label, who: floor.who, videos: floor.videos, floor: readings.floor, more: readings.belowFloorTotal - 1 }
      : null,
    // NOT "NEVER BY THE CORPUS" (deploy 2 review): "corpus" is on MASTER's
    // client-language ban list. The default lives in lib/reading/record.ts,
    // inside the pipeline's import closure, so the page passes its words.
    refusedElsewhere: 'Counted by the page that draws the comparisons.',
  })

  return (
    <SettingsFrame
      active="record"
      title="Settings"
      bar={oneLineBar(tenant, rm)}
      // D14: the first half is EARLIEST EVIDENCE, not a start date — the same
      // caveat Settings › Tracking already prints about its rival rows.
      context={[
        tenant,
        delivery.since ? `first update ${shortDate(delivery.since)}` : null,
        save.lastSavedAt ? `last saved ${shortDate(save.lastSavedAt)}` : null,
      ].filter(Boolean).join(' · ')}
      counts={counts}
      railFooter={<SaveStrip state={save} note={inputs.changes.rows[0]?.note ?? null} />}
    >
      {/* THE PREVIEW'S RHYTHM: each section a tile, 24px apart (market-first
          WP1.6, Heinrich's default of 26 Sep). */}
      <div className="flex flex-col gap-6">
        {changed ? (
          <>
            <WhatWeChangedLead block={changed.block} />
            {locked ? (
              <SearchesHeldStill
                state={queue?.state === 'available' ? 'available' : 'unavailable'}
                lines={queue?.state === 'available' ? queueLines(queue.rows, stored) : []}
              />
            ) : null}
            <TheRecord view={changed.record} />
            <WhenCompared rules={changed.rules} block={changed.block} asAt={changed.reading.asAt} />
            {locked ? <PagesCanSay now={nowIso} /> : null}
          </>
        ) : null}

        <DeliveryBlock
          record={delivery}
          stats={stats}
          updates={thisMonth}
          month={monthName(`${month}-01`)}
          readings={readings}
        />

        <ChangeLogBlock
          title={changed ? 'Other settings changes' : undefined}
          log={log}
          now={nowIso}
          unavailable={
            inputs.changes.available
              ? null
              // NOT "WHEN THAT SHIPS" (Block D wave 3, RC5): release
              // vocabulary on a client settings page written otherwise in
              // careful plain English. The claim itself stands —
              // `inputs.changes.available` is false only where `loadChanges`
              // probes a missing `config_changes` table.
              : 'Nothing here can record a configuration change yet. From the first day it can, every change is written down as it happens.'
          }
        />

        <RejectLogBlock
          rows={inputs.gate.rows}
          // The count and the day the record begins, and not the clause that
          // explains what that leaves out (a footnote, 25 Sep rulings): the
          // first update is not passed.
          summary={inputs.gate.available ? gateSummary(totals, null) : ''}
          unavailable={
            inputs.gate.available
              ? null
              // Same rule as the change log's sentence above (RC5): what is
              // true is that the record exists and is not open here yet, and
              // that is what it says.
              : 'We do not yet show you what was set aside. The record exists; it is not open to you here yet.'
          }
          // Said once, on the coverage row (copy de-clutter C99).
          unjudged={null}
          byTerm={keptByTerm(inputs.gate.verdicts).slice(0, 10)}
          byPlatform={keptByPlatform(inputs.gate.verdicts)}
          lookedAt={sampleHead(inputs.gate.verdicts.length, totals.found)}
          withheld={
            canSeeExcerpt
              ? null
              : 'The posts themselves are shown to owners and admins only.'
          }
          control={(r) => <AppealButton runId={r.runId} platform={r.platform} videoId={r.videoId} filed={r.appealed} />}
        />

        <CoverageBlock
          title={`Coverage · ${longMonth(`${month}-01`)}`}
          rows={rows}
        />

        <RecordSection title="What this covers, and what it does not">
          <ScopeStatement
            text={scopeStatement(tenant, lines, asAt)}
          />
        </RecordSection>
      </div>
    </SettingsFrame>
  )
}

/**
 * The scope statement, as text.
 *
 * "Exportable" here means a block a reader can select and paste, not a PDF: the
 * export route renders a REGISTERED PAGE KEY through headless Chrome, and
 * `components/pages/registry.ts` has no `settings` module — `pageModule
 * ('settings')` is null although `lib/nav.ts` names the key. Registering one
 * would mean building a renderable module whose tiles are a settings FORM,
 * where the export pipeline's tiles are readings; a button that produced
 * nothing would be worse than a block that can be copied. The decision is
 * stated on the page, in one sentence, rather than left as a silence.
 *
 * It is `recordLines` and not `recordRows`: pasted into a document, a record
 * wants sentences with their bases inside them, and the grid's labels are
 * furniture that does not survive a paste.
 */
function scopeStatement(tenant: string, lines: readonly string[], readingAt: string): string {
  return [
    `${tenant}: what this reading covers, as at ${fullDate(readingAt)}.`,
    '',
    ...lines.map((l) => `· ${l}`),
    '',
    'Every figure is a share of what we read, not of everything said. We read public comment on the videos our search terms find, plus the accounts you and your rivals post from where those are configured. A month is dated by the day a comment was written, not by the day we read it.',
  ].join('\n')
}
