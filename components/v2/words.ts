import { MACHINE_TRANSLATION_STAMP } from '@/components/quote-block'

// SCREEN-ONLY WORDING (the audit design, 7 Nov). The screens join their parts
// with commas, never " · " (brief §3), but the strings that carry the dot are
// built in `lib/` and the weekly email and the monthly briefs import the same
// builders and must not move a byte. So no string in `lib/` changes: a screen
// re-words what it is handed here, and nothing in print, email or the briefs
// imports this file.

/** A cite a loader built ("TikTok · 9 Oct", "TikTok · 29 Sep · video by @x"),
 *  as a screen prints it: "TikTok, 9 Oct". For loader-built cites only. */
export function commaCite(source: string): string {
  return source.replace(/\s*\u00B7\s*/g, ', ').trim()
}

/** The line that names a quote's language and says where its English came
 *  from, as a screen prints it ("Thai, machine translation"; "Thai, no English
 *  rendering yet"), or null where there is nothing to say. The same words as
 *  `translationLabel` (components/quote-block.tsx), which print and email
 *  keep. */
export function translationLine(note: { language: string | null; english: string | null }): string | null {
  if (!note.language) return null
  return note.english ? `${note.language}, ${MACHINE_TRANSLATION_STAMP}` : `${note.language}, no English rendering yet`
}

/** A comma list of the parts that have words, the empty ones dropped. */
export function listWords(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0)
    .join(', ')
}

const MONTH_NAMES = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g

/** A week's dates as the boards print them, each month's name short ("5 to
 *  11 October" to "5 to 11 Oct", "26 October to 1 November" to "26 Oct to 1
 *  Nov"), for the dates a loader built in the long form the email keeps. */
export function shortDates(dates: string): string {
  return dates.replace(MONTH_NAMES, (m) => m.slice(0, 3))
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A day with its weekday, "Sunday 8 Nov" (UTC, so the server and the browser
 *  agree). An unreadable date gives back its own string. */
export function longDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
