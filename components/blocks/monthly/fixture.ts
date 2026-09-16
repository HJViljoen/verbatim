import type { MonthlyData, MoverRow, SubjectVoiceRow, VoicesSection } from '@/lib/pages/monthly'
import { sparkMonths, spanOf } from '@/lib/pages/monthly'
import { monthlySubject, seriesTrail } from '@/lib/reports/monthly'
import type { Mover } from '@/lib/pages/overview'
import { overviewFixture, refusedFixture } from '@/components/pages/overview/fixture'
import { voiceFixture } from '@/components/pages/voice-surface/fixture'

// The monthly report's fixtures (Phase 1 WP18).
//
// THREE STATES, ALL REAL. `monthlyFixture()` is the mock's own month — subjects
// confirmed, ten movers, an advice standing, six voices. `refusedMonthlyFixture()`
// is a month whose comparisons were refused and whose subjects are not
// recorded, which is a workspace that has just had a rival renamed or a
// re-clustering. `formingMonthlyFixture()` is SEALAND TODAY: no subjects, no
// movers, nothing to quote and no brief — the state the WP's "done when" is
// really about, because it is what a young workspace receives.
//
// Sections 2, 4, 5 and 8 come from Overview's fixtures and section 3 from
// Voice's, because those blocks ARE Overview's and Voice's and a second fixture
// for them would be a second reading.

const MONTHS = sparkMonths('2026-09-01')

function moverRow(m: Mover, values: (number | null)[]): MoverRow {
  return { ...m, spark: values, sparkMonths: MONTHS, trail: seriesTrail(MONTHS, values) }
}

const voiceRow = (over: Partial<SubjectVoiceRow> & { subjectId: string; subject: string }): SubjectVoiceRow => ({
  voice: null,
  note: null,
  href: `/dashboard/subjects?item=${over.subjectId}`,
  ...over,
})

function voicesFixture(): VoicesSection {
  return {
    rows: [
      voiceRow({
        subjectId: 's1',
        subject: 'Durability',
        voice: {
          quote: { ref: 'e:1', text: 'Three winters on the bike and the seams are still perfect. The zip, less so.' },
          cite: 'tiktok · 14 Sep · under a category video',
          href: 'https://www.tiktok.com/@maker/video/7312345678901234567',
          from: 'under a category video',
        },
      }),
      voiceRow({
        subjectId: 's2',
        subject: 'Recycled materials',
        voice: {
          quote: { ref: 'e:2', text: 'Die sak hou vir ewig, maar die prys is ’n grap', lang: 'af', english: 'The bag lasts forever, but the price is a joke' },
          cite: 'instagram · 7 Sep · under your post',
          href: null,
          from: 'under your post',
        },
      }),
      // A quote whose words no longer resolve: the reading it was evidence for
      // still happened, so the row stays and the block says what became of it.
      voiceRow({
        subjectId: 's3',
        subject: 'Waterproofing',
        voice: {
          quote: { ref: 'e:3', text: '' },
          cite: 'reddit · 9 Sep · r/onebag',
          href: null,
          from: 'in a category thread',
        },
      }),
      voiceRow({ subjectId: 's4', subject: 'Price', note: 'nothing was said about this one this month' }),
    ],
    note: null,
    href: '/dashboard/subjects',
  }
}

export function monthlyFixture(over: Partial<MonthlyData> = {}): MonthlyData {
  const overview = overviewFixture()
  const voice = voiceFixture()
  const growing = voice.movers.growing.map((m, i) =>
    moverRow(m, i === 0 ? [3.1, 4.0, 5.1, 6.8, 9.4, 9.4] : [null, 1.8, 2.4, 3.2, 5.1, 5.1]),
  )
  const fading = voice.movers.fading.map((m) => moverRow(m, [14.2, 13.0, 12.0, 9.6, 7.1, 7.1]))

  const data: MonthlyData = {
    brand: overview.brand,
    month: overview.month,
    monthStatus: overview.monthStatus,
    readingAt: overview.readingAt,
    notes: overview.notes,
    overview,
    movers: {
      growing,
      fading,
      newcomers: voice.movers.newcomers,
      goneQuiet: voice.movers.goneQuiet,
      audienceLabel: 'the category',
      span: spanOf(MONTHS),
      note: null,
      notes: [],
      rereadNote: voice.movers.rereadNote,
      href: '/dashboard/voice?movers=all',
    },
    voices: voicesFixture(),
    decide: {
      interpretation: overview.sentence.interpretation,
      figures: overview.sentence.figures,
      ledger: overview.sentence.ledger,
      nextReading: '2026-10-01T00:00:00.000Z',
      href: '/dashboard/market',
    },
    brief: {
      title: 'Marketing brief',
      href: '/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      public: true,
      locked: false,
      builtAt: '2026-09-12T08:25:00.000Z',
      stale: false,
    },
    confirming: 'Will it survive a wet commute — August has closed at 7.1%. The report of 1 Sep read 6.8%; the rest of the month has since been counted.',
    lead: overview.sentence.lead,
    subject: monthlySubject(overview.brand, overview.month, overview.sentence.lead),
  }
  return { ...data, ...over }
}

/** A month whose comparisons were refused — a rename, or a re-clustering. */
export function refusedMonthlyFixture(over: Partial<MonthlyData> = {}): MonthlyData {
  const overview = refusedFixture()
  return monthlyFixture({
    overview,
    lead: overview.sentence.lead,
    subject: monthlySubject(overview.brand, overview.month, overview.sentence.lead),
    confirming: null,
    ...over,
  })
}

/**
 * Sealand today: subjects not recorded, nothing moved, no advice, no brief and
 * nothing to confirm. Every section still prints, which is the design's own
 * gate — an artefact has the same shape every month.
 */
export function formingMonthlyFixture(over: Partial<MonthlyData> = {}): MonthlyData {
  const base = monthlyFixture()
  const overview = overviewFixture({
    subjects: {
      state: 'not_recorded',
      rows: [],
      candidates: [],
      rivalLabel: null,
      categoryLabel: 'The category',
      note: 'Your subjects are not recorded for this workspace yet.',
    },
    moves: {
      rows: [],
      unlock: base.overview.moves.unlock,
      masthead: base.overview.moves.masthead,
      empty: 'What you are doing about it is not recorded for this workspace yet.',
      recorded: false,
    },
  })
  overview.sentence = {
    ...overview.sentence,
    lead: null,
    anomaly: null,
    ledger: null,
    voices: [],
    voicesFrom: 0,
    verdicts: [],
    interpretation: {
      ...overview.sentence.interpretation,
      sentences: ['Nothing moved clearly this month. Here is where you stand.'],
      quotes: [],
    },
  }
  return monthlyFixture({
    overview,
    movers: {
      ...base.movers,
      growing: [],
      fading: [],
      newcomers: [],
      goneQuiet: [],
      note: 'Too little conversation this month to say what moved.',
      rereadNote: null,
    },
    voices: {
      rows: [],
      note: 'Your subjects are not recorded for this workspace yet.',
      href: '/dashboard/subjects',
    },
    decide: {
      ...base.decide,
      interpretation: overview.sentence.interpretation,
      figures: overview.sentence.figures,
      ledger: null,
    },
    brief: null,
    confirming: null,
    lead: null,
    subject: monthlySubject(overview.brand, overview.month, null),
    ...over,
  })
}
