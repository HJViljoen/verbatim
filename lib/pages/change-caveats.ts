import { rangeCoversMonth } from '../config-affects'
import type { ConfigChange } from '../config-log'
import type { MonthLabel, MonthPoint, MonthSeries } from '../reading/series'
import { ourChangeCaveat } from '../settings/what-we-changed'

// A note-less change of ours, said on a chart's month in its own title
// (Heinrich, 27 Sep: no client-visible notes on our own changes).
//
// WHY THE PAGE LAYER. `buildSeries` (lib/reading/series.ts) labels each month
// a change's `affects_months` covers with the change's note, or, where the
// note is null, with one line for every change: "What this workspace tracks
// changed, and it moved this month." Our gate fix, attribution v3, segment
// and capped-update rows are now stored with note NULL, so September's points
// took that line from the gate fix: a claim that something moved, which
// nothing measured, and the direction-word shape §4.0 keeps off a reading.
// series.ts is in the pipeline's import closure (scripts/pipeline-closure.sh)
// and is not edited before the 4 Oct run (plan §7.4, §7.11), so the pages
// that hand a series' points to a reader re-word it here, from the same change
// log the series was built from (`loadChanges`, memoised: no second read).
//
// WHERE THE LINE CAN REACH A READER. Only through a `tracking_change` point
// label. On deploy 2 two loaders put points in front of one: Subjects
// (`SubjectPane.series` and `.chartSeries`, which the line chart turns into a
// dated rule whose hover and band title are the label, `calendarRulesFor`)
// and Voice (`ThemeBlock.points`, drawn without their labels). Subjects
// captions here. Deploy 3 (merged 27 Sep) keeps Subjects' two and adds the
// subject's pooled market line (`SubjectPane.marketLine`), whose points
// `marketLineOf` builds with no label, so it has nothing to caption (a test
// in change-caveats.test.ts holds that); its Conversation page draws no
// month points at all, so Voice's caption went with deploy 2's theme pane.
// A series' NOTES never carry the label (`buildSeries` puts it on points
// only), and the notes are what the weekly and every other page print of a
// series' caveats.

/** The reading layer's sentence for a month a note-less change covers
 *  (`buildSeries`, lib/reading/series.ts), which a test holds to series.ts's
 *  own words. It stays for a note-less change that is not ours: a client's
 *  own edit, logged by the trigger. */
export const NOTELESS_CHANGE_LINE = 'What this workspace tracks changed, and it moved this month.'

/** The change-log columns the caption reads. */
export type CaptionRow = Pick<ConfigChange, 'surface' | 'field' | 'note' | 'changed_at' | 'affects_months'>

const isNotelessLine = (l: MonthLabel): boolean => l.kind === 'tracking_change' && l.text === NOTELESS_CHANGE_LINE

function captionPoint(point: MonthPoint, changes: readonly CaptionRow[]): MonthPoint {
  if (!point.labels.some(isNotelessLine)) return point
  // The changes `buildSeries` gave the line to: every note-less row whose
  // band covers this month (`change.note ?? line`), in the log's order.
  const noteless = changes.filter((c) => c.note == null && rangeCoversMonth(c.affects_months, point.month))
  const said = [...new Set(noteless.map((c) => ourChangeCaveat(c) ?? NOTELESS_CHANGE_LINE))]
  // A change log that does not explain the line (not the one the series was
  // built from) changes nothing: the words are never guessed.
  if (said.length === 0) return point
  // A row with a note keeps it, where `buildSeries` put it; only the line is
  // replaced, in its own place, and one sentence is said once.
  const kept = new Set(point.labels.filter((l) => l.kind === 'tracking_change' && !isNotelessLine(l)).map((l) => l.text))
  const labels = point.labels.flatMap((l): MonthLabel[] =>
    isNotelessLine(l) ? said.filter((text) => !kept.has(text)).map((text) => ({ kind: 'tracking_change', text })) : [l],
  )
  return { ...point, labels }
}

/**
 * A series whose note-less changes of ours say their titles, never the
 * reading layer's "it moved this month". PURE, and it copies rather than
 * mutates: a `MonthSeriesSet` is memoised per request and handed to every
 * caller as the same object. A series with nothing to re-word comes back as
 * the object it was.
 */
export function captionOurChanges(series: MonthSeries, changes: readonly CaptionRow[]): MonthSeries {
  let changed = false
  const points = series.points.map((p) => {
    const next = captionPoint(p, changes)
    if (next !== p) changed = true
    return next
  })
  return changed ? { ...series, points } : series
}
