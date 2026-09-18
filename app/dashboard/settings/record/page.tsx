import { SettingsFrame } from '@/components/settings-frame'
import { ChangeLogBlock } from '@/components/settings/record/change-log'
import { CoverageBlock } from '@/components/settings/record/coverage'
import { DeliveryBlock } from '@/components/settings/record/delivery'
import { RecordFooter, RecordSection } from '@/components/settings/record/frame'
import { RecordHeader, SaveStrip, ScopeStatement } from '@/components/settings/record/header'
import { RejectLogBlock } from '@/components/settings/record/rejects'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { changeLogBoundary } from '@/lib/config-log'
import { fmtInt, fullDate, longMonth, monthName, shortDate } from '@/lib/format'
import { readingsCounter, recordWindow } from '@/lib/pages/overview'
import { readingHandle } from '@/lib/reading/read'
import { howSoundLine, recordLines, recordRows } from '@/lib/reading/record'
import { CHANGE_LOG_ROWS, changeLogMeta, changeNote, readChangeLog, showingLine } from '@/lib/settings/change-log'
import { deliveryRecord, deliveryStats, gapFigure, updatesInMonth } from '@/lib/settings/delivery'
import { loadReadings } from '@/lib/settings/readings'
import { loadRailCounts, loadRecordPage } from '@/lib/settings/record-load'
import { gateSummary, keptByPlatform, keptByTerm, sampleNote } from '@/lib/settings/reject-log'
import { saveState } from '@/lib/settings/save-state'
import { createAdminClient } from '@/lib/supabase-admin'
import { AppealButton } from './appeal-button'

// Settings › The record (Phase 1 WP16, ported to the SettingsRecord artboard in
// block E wave 2) — everything the product can say about how it read this
// workspace, in one place, so that no other page has to carry more than one
// sentence of method.
//
// FIVE SECTIONS IN THE ARTBOARD'S ORDER, plus the scope statement and the
// footer rule: Delivery (with the monthly-readings strip) · The change log ·
// The reject log · Coverage · What this covers · the rule.
//
// THE ARTBOARD IS ONE DOCUMENT. The sections are hairline-divided on white with
// an uppercase eyebrow and a mono meta on one baseline, not five filled cards
// with explanatory micro-copy — see components/settings/record/frame.tsx for
// why this sub-page has its own vocabulary and every other one keeps
// SettingsCard.
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
  const month = nowIso.slice(0, 7)
  const { data: client } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle()
  const tenant = (client?.company_name as string | undefined) ?? 'Your workspace'
  const window = recordWindow(`${month}-01`, nowIso)
  const reading = readingHandle(clientId)

  const inputs = await loadRecordPage({
    client: supabase,
    admin: canSeeExcerpt ? createAdminClient() : null,
    clientId,
    tenant,
    window,
    now: nowIso,
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
  const log = readChangeLog({ rows: inputs.changes.rows, viewerUserId: userId, emails: inputs.emails })
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
    changeNote: inputs.changes.available ? changeNote(log, { from: window.from, to: window.to }) : null,
    belowFloor: floor
      ? { label: floor.label, who: floor.who, videos: floor.videos, floor: readings.floor, more: readings.belowFloor.length - 1 }
      : null,
  })

  const gap = gapFigure(delivery.longestGapDays)
  // "ON RECORD", NOT "DELIVERED" (code review finding 1): `delivery.total`
  // counts every run row, the failed one included. AND IT CARRIES ITS FIRST
  // DATE, which the brief asked for and the port dropped (design review
  // finding 8) — "since" here is the same earliest-evidence claim D14 makes of
  // the page bar, one line up.
  const headerMeta = [
    `${fmtInt(delivery.total)} update${delivery.total === 1 ? '' : 's'} on record`,
    delivery.since ? `since ${shortDate(delivery.since)}` : null,
    gap ? `longest gap ${gap.figure} ${gap.unit}` : null,
    delivery.lastOn ? `last on ${shortDate(delivery.lastOn)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <SettingsFrame
      active="record"
      title="Settings"
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
      <div className="flex flex-col">
        <RecordHeader meta={headerMeta}>
          What was delivered, what changed, what was thrown away, and how much was read. Written as the work
          happens; it is added to, never edited.
        </RecordHeader>

        <DeliveryBlock
          record={delivery}
          stats={stats}
          updates={thisMonth}
          month={monthName(`${month}-01`)}
          readings={readings}
        />

        <ChangeLogBlock
          log={log}
          rows={CHANGE_LOG_ROWS}
          meta={changeLogMeta(log, { since: delivery.since, now: nowIso })}
          boundary={changeLogBoundary(log.firstLoggedAt)}
          showing={showingLine(CHANGE_LOG_ROWS, log.recorded.length)}
          now={nowIso}
          unavailable={
            inputs.changes.available
              ? null
              : 'Nothing in the product can record a configuration change yet. When that ships, every change from that day on is written down here as it happens.'
          }
        />

        <RejectLogBlock
          rows={inputs.gate.rows}
          summary={inputs.gate.available ? gateSummary(totals, delivery.since) : ''}
          unavailable={
            inputs.gate.available
              ? null
              : 'We do not yet show you what was set aside. The record exists; opening it to you is a change we have not shipped.'
          }
          unjudged={
            totals.unjudged > 0
              ? `${fmtInt(totals.unjudged)} of them were never actually judged — the quick check found no reason to drop them and nothing looked closer.`
              : null
          }
          byTerm={keptByTerm(inputs.gate.verdicts).slice(0, 10)}
          byPlatform={keptByPlatform(inputs.gate.verdicts)}
          basis={sampleNote(inputs.gate.verdicts.length, totals.found)}
          withheld={
            canSeeExcerpt
              ? null
              : 'The posts themselves are shown to owners and admins only. They are other people’s public posts, and the fewer copies of them we hand around the better.'
          }
          control={(r) => <AppealButton runId={r.runId} platform={r.platform} videoId={r.videoId} filed={r.appealed} />}
        />

        <CoverageBlock
          title={`Coverage · ${longMonth(`${month}-01`)}`}
          meta={[
            inputs.coverage.frozenAt ? `newest month frozen ${shortDate(inputs.coverage.frozenAt)}` : 'still filling',
            `as at ${shortDate(inputs.coverage.readingAt)}`,
          ].join(' · ')}
          rows={rows}
          // The line every reading surface prints in its page bar and this page
          // — the page those surfaces link to — did not print at all.
          oneLine={`${readingsCounter(readings.readings)} · ${howSoundLine(inputs.coverage)}`}
        />

        <RecordSection title="What this covers, and what it does not" meta="select it and paste">
          <ScopeStatement
            text={scopeStatement(tenant, lines, nowIso)}
            why="Export renders a registered page, and Settings has no page module — so the record is exported as text you can select and paste rather than as a file a button would fail to produce."
          />
        </RecordSection>

        <RecordFooter rule="The record is written as the work happens. It is added to, never edited — a correction here is a new line, dated." />
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
    `${tenant} — what this reading covers, as at ${fullDate(readingAt)}.`,
    '',
    ...lines.map((l) => `· ${l}`),
    '',
    'Every figure is a share of what we read, not of everything said. We read public comment on the videos our search terms find, plus the accounts you and your rivals post from where those are configured. A month is dated by the day a comment was written, not by the day we read it.',
  ].join('\n')
}
