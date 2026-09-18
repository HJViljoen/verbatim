import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { surface } from '@/lib/nav'
import { layoutFor, SUBJECT_BLOCKS } from './index'
import { subjectsList } from './list'
import { subjectsOwnPosts } from './own-posts'
import { subjectsSayHear } from './say-hear'
import { subjectsSubject } from './subject'
import { subjectsLine } from './line'
import { subjectsKinds } from './kinds'
import { subjectsVoices } from './voices'
import { subjectsUnanswered } from './unanswered'
import { freezeQuotes } from '@/lib/renderables/quotes-freeze'
import { gapBasisLine, gapLine, type Gap } from '@/lib/reading/gap'
import { candidatesFixture, refusedFixture, retiredRivalFixture, subjectsFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

/** The page's own subtitle, out of `lib/nav.ts` — main's file, and the string
 *  this page's detail pane used to repeat verbatim. */
const NAV_SUBTITLE = surface('subjects').question!

describe('the Subjects blocks, all of them', () => {
  it('render in all three modes on a reading, a refusal and a candidate set, and keep the copy contract', () => {
    for (const data of [subjectsFixture(), refusedFixture(), candidatesFixture()]) {
      for (const block of SUBJECT_BLOCKS) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(data, mode, ctx)))
        }
      }
    }
  })

  // EVERY BLOCK THAT IS ABOUT THE SUBJECT READING. `subjects.ownposts` is the
  // exception and it is the fixture's whole point: `videos` is tenant-readable
  // whatever M4 says, so a workspace with no subject reading still knows what
  // it published and the census is REAL on the refused fixture. A block that
  // invented an empty state there would be claiming an absence it does not
  // have. Its own absence — no post published in the month — is tested below.
  it('every block says something honest when it has nothing — a refusal is a reading too', () => {
    const data = refusedFixture()
    for (const block of SUBJECT_BLOCKS) {
      if (block.key === 'subjects.ownposts') continue
      const empty = block.emptyState(data)
      expect(empty, block.key).toBeTruthy()
      expect(renderText(block.render(data, 'app', ctx)), block.key).toContain(empty!)
    }
  })

  it('never prints a pipeline key at a reader', () => {
    const text = renderText(
      <>{SUBJECT_BLOCKS.map((b) => <span key={b.key}>{b.render(subjectsFixture(), 'app', ctx)}</span>)}</>,
    )
    for (const key of ['industry-other', 'competitor:', 'audience_insights', 'run_id', 'Pass A']) {
      expect(text).not.toContain(key)
    }
  })

  it('states no figure twice with two different values', () => {
    const data = subjectsFixture()
    expect(figureConflicts(SUBJECT_BLOCKS.map((b) => blockAnswers(b, data).figures))).toEqual([])
  })
})

describe('SU1 · the subjects list', () => {
  it('names every subject with its level and the day it was named', () => {
    const text = renderText(subjectsList.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Durability')
    // "26 of 84 · too few to compare" — the mock's own row, and the noun is
    // dropped on a 240px rail where the full form wrapped every row onto a
    // third line. The level still prints its "of N" (the copy contract's rule
    // (b)) and the pane one tile over prints "26 of 84 videos" in full.
    expect(text).toContain('26 of 84')
    expect(text).toContain('too few to compare')
    expect(text).toContain('named 19 Aug 2026')
  })

  it('groups a four-digit count like every other number on the page', () => {
    const data = subjectsFixture()
    const [first, ...rest] = data.list.rows
    const big = {
      ...data,
      list: { ...data.list, rows: [{ ...first, level: { k: 1042, n: 3877, pct: 26.9 } }, ...rest] },
    }
    const text = renderText(subjectsList.render(big, 'app', ctx))
    expect(text).toContain('1,042 of 3,877')
    expect(text).toContain('26.9%')
  })

  it('prints the supersede rule wherever the editing happens', () => {
    for (const mode of MODES) {
      expect(renderText(subjectsList.render(subjectsFixture(), mode, ctx)), mode)
        .toContain('Renaming or adding a subject starts a new line. The old line is kept.')
    }
  })

  it('says subjects are not recorded when M4 is not applied — never "no subjects"', () => {
    expect(subjectsList.emptyState(refusedFixture())).toBe('Your subjects are not recorded for this workspace yet.')
  })

  // AN ABSENT BUTTON IS NOT A SENTENCE. The tile drops "Add a subject →" in
  // this state because a write from here would fail; without the reason beside
  // it, "not recorded yet" reads as "you have not named any" on a tile that has
  // just deleted the control that would fix it.
  it('says WHY the add control is gone when the set cannot be read', () => {
    for (const mode of MODES) {
      const text = renderText(subjectsList.render(refusedFixture(), mode, ctx))
      expect(text, mode).toContain('We cannot read the set from this page yet')
      expect(render(subjectsList.render(refusedFixture(), mode, ctx)), mode).not.toContain('Add a subject')
    }
  })

  it('offers the proposed set rather than an empty list, and says nothing is counted', () => {
    const data = candidatesFixture()
    expect(subjectsList.emptyState(data)).toContain('Confirm the set')
    const text = renderText(subjectsList.render(data, 'app', ctx))
    expect(text).toContain('2 proposed · none confirmed, so nothing is counted yet.')
    // The Confirm control is ON the row — a candidate listed as prose under the
    // editor is the one control a client needs, out of reach.
    expect(text).toContain('Durability')
    expect(text).toContain('not counted yet')
    expect(text).toContain('Confirm')
  })

  // A PERMISSION FLAG MUST NOT BE OPEN BY DEFAULT. SU1 used to rely on
  // SubjectEditor's `canEdit` defaulting to true, so a caller that forgot the
  // prop offered the write rather than hiding the button. It is now data on the
  // block, taken from the session's role.
  it('draws no write control for a reader who may not change the set', () => {
    const data = candidatesFixture()
    data.list.canEdit = false
    const text = renderText(subjectsList.render(data, 'app', ctx))
    expect(text).toContain('Durability')
    expect(text).not.toContain('Confirm')
    expect(text).not.toContain('Rename')
    expect(text).not.toContain('Stop')
  })

  // THE ONE STATE THIS PRODUCT CANNOT UNDO GOT SMALLER AND CLOSER TO ITS
  // NEIGHBOUR. "Stop" was a ~28 x 13px word 4px from "Rename" — which opens a
  // sheet — firing on a single click with no focus treatment of its own. WCAG
  // 2.2's 24px target size fails twice over at that size.
  it('gives the rail’s controls a real target and a focus ring', () => {
    const markup = render(subjectsList.render(subjectsFixture(), 'app', ctx))
    const buttons = [...markup.matchAll(/<button[^>]*>(?:Rename|Stop)</g)].map((m) => m[0])
    expect(buttons.length).toBe(6) // three rows, two controls each
    for (const b of buttons) {
      expect(b).toContain('min-h-6')
      expect(b).toContain('focus-visible:ring')
    }
  })

  it('is email-safe', () => {
    const markup = render(subjectsList.render(subjectsFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('draws no editor controls outside the app — a button in a PDF is a picture of a button', () => {
    for (const mode of ['print', 'email'] as const) {
      const markup = render(subjectsList.render(subjectsFixture(), mode, ctx))
      expect(markup, mode).not.toContain('Add a subject')
      expect(markup, mode).not.toContain('<button')
    }
  })
})

describe('SU2 · the subject in full', () => {
  it('prints every side as a level with its count', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('31%')
    expect(text).toContain('26 of 84 videos')
    expect(text).toContain('43.7%')
    expect(text).toContain('62 of 142 videos')
    expect(text).toContain('24.5%')
    expect(text).toContain('340 of 1,388 videos')
  })

  it('refuses your own side’s change and answers the category’s, and says which in one sentence', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('too few to compare') // P0 item 6 / §6 D11 — the badge's one word
    expect(text).toContain('carried too few videos this month to compare')
  })

  it('prints a direction word only inside a verdict node', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('growing, 3 months')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('offers Track this and Ask about this in the app, and neither on paper', () => {
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('Track this')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('Ask about this')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'print', ctx))).not.toContain('Ask about this')
  })

  it('lets a client declare a new move after dropping one, and not while one is running', () => {
    const data = subjectsFixture()
    const withMove = (status: 'active' | 'dropped') => ({
      ...data,
      selected: { ...data.selected!, move: { id: 'm1', title: 'Answer the zip question', declaredAt: '2026-08-20', status } },
    })
    const running = renderText(subjectsSubject.render(withMove('active'), 'app', ctx))
    expect(running).toContain('Tracking')
    expect(running).not.toContain('Track this')

    // Dropped: the old line can be picked up again OR a differently worded one
    // declared. Before, "Track it again" with the old title was the only
    // affordance on the subject, for ever.
    const dropped = renderText(subjectsSubject.render(withMove('dropped'), 'app', ctx))
    expect(dropped).toContain('Track it again')
    expect(dropped).toContain('Track this')
  })

  it('sends the subject to Ask, as a question the page can answer', () => {
    // /dashboard/agent?subject=<id> was read by nothing: the Agent page took
    // no search params, so the client landed on a blank composer.
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/agent?ask=How%20are%20we%20seen%20on%20Durability%3F')
  })

  it('links the videos behind YOUR figure, with the count', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/videos?subject=s1')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('the 26 videos behind your figure')
  })

  // The three columns carry different numbers of lines, so centring them lifted
  // the category's eyebrow ~12px above the row the other two establish. The
  // artboard's three eyebrows share one baseline.
  it('starts all three side columns at the same height', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).not.toContain('flex-col justify-center')
    expect(markup).toContain('flex-col justify-start')
  })

  it('declares a share and a count per side, and no verdict a side did not earn', () => {
    const { figures, verdicts } = blockAnswers(subjectsSubject, subjectsFixture())
    expect(Object.keys(figures)).toHaveLength(6)
    expect(verdicts).toHaveLength(3)
    expect(verdicts.filter((v) => v.state === 'moved')).toHaveLength(1)
  })

  it('says "no reading yet" where the audience was read and this subject was not in it', () => {
    // monthly_subject_readings emits a row only where videos > 0, so this is
    // the state of every freshly confirmed subject's first month — and the
    // denominator row beside it proves the audience IS tracked.
    const data = subjectsFixture()
    const [own, ...rest] = data.selected!.sides
    const unread = {
      ...data,
      selected: {
        ...data.selected!,
        sides: [{ ...own, k: null, pct: null, observed: false, silence: 'no_reading' as const }, ...rest],
      },
    }
    const text = renderText(subjectsSubject.render(unread, 'app', ctx))
    expect(text).toContain('— no reading yet')
    expect(text).not.toContain('— not tracked')
  })

  it('says the subject is provisional while its precision is unmeasured', () => {
    const data = subjectsFixture()
    const provisional = { ...data, selected: { ...data.selected!, calibration: 'calibrating' as const } }
    expect(renderText(subjectsSubject.render(provisional, 'app', ctx)))
      .toContain('still checking how often we get this subject right')
  })
})

describe('SU2 · the monthly line', () => {
  it('draws one line per side on the page’s own axis', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('<svg')
    expect(markup).toContain('Durability')
  })

  it('falls back to a table of the months in an email, never a dropped chart', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('<svg')
  })

  it('says what is not recorded rather than drawing an empty axis', () => {
    expect(subjectsLine.emptyState(refusedFixture())).toBe('Your subjects are not recorded for this workspace yet.')
  })
})

describe('SU2 · the kind mix', () => {
  it('names the denominator it used — the audience’s videos, not the subject’s', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('every video in the audience')
    expect(text).toContain('of 1,388 videos')
    expect(text).toContain('of 84 videos')
  })

  it('reads the kinds in the client’s words, never the pipeline’s enum', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Asking how it works')
    expect(text).toContain('Saying it worked')
    expect(text).toContain('Pushing back')
    // No enum value reaches a reader. ("question" itself survives inside the
    // Reddit sentence, which is English — "the question-and-objection videos"
    // — and is the one place the word is the reader's rather than Pass A's.)
    expect(text).not.toMatch(/\b(pain_point|purchase_intent|demographic_signal|switching_signal|feature_request|buying_trigger|misinformation)\b/)
  })

  // THE REDDIT READ MOVED TO THE FOOTER NOTE, where the mock puts it: a basis
  // in the mono face, not a body paragraph that reads as one of the block's
  // findings. The overlap caveat stays in the body, beside the shares it is
  // about.
  it('names Reddit’s share of the question-and-objection videos, as a basis', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Reddit · 236 of 736 question videos')
    expect(text).toContain('counted in each')
  })

  // THREE AUDIENCES IN ONE COLUMN, ON ONE TRACK. Each group was scaled to its
  // own leader, so a tenant at 60% and a rival at 25% drew two identical
  // full-width bars in a layout whose whole point is reading downward. The
  // widths are now one scale; the "of N" per row is what keeps the three
  // DENOMINATORS apart.
  it('scales every audience’s bars against one maximum, not against its own', () => {
    const data = subjectsFixture()
    const skewed = {
      ...data,
      selected: {
        ...data.selected!,
        sides: data.selected!.sides.map((side) =>
          side.kind === 'you'
            ? { ...side, kinds: side.kinds.map((k) => ({ ...k, pct: (k.pct ?? 0) / 4 })) }
            : side,
        ),
      },
    }
    const markup = render(subjectsKinds.render(skewed, 'app', ctx))
    const widths = [...markup.matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]))
    // Your own audience renders first, three kinds of it. Quartered against
    // the others it cannot still own a full-width bar — which is exactly what
    // it did while each group was scaled to its own leader.
    const yours = Math.max(...widths.slice(0, 3))
    expect(yours).toBeLessThan(40)
    expect(Math.max(...widths)).toBeGreaterThan(99)
  })

  // `kindChange` has existed since WP3 and this block called it for the first
  // time in wave 2 — mock-gap's "cheapest real gap on the page". Each verdict
  // is banded and carries its own k and n, so each is honest to print; they do
  // not sum and nothing adds them.
  it('prints a banded verdict per kind on the category, and names the month it is against', () => {
    const data = subjectsFixture()
    const text = renderText(subjectsKinds.render(data, 'app', ctx))
    expect(text).toContain('Category — no brand, since Aug:')
    expect(text).toContain('band')
    const verdicts = blockAnswers(subjectsKinds, data).verdicts
    expect(verdicts.length).toBeGreaterThan(0)
    // THE MONTH IS THE VERDICTS' OWN. It was re-derived off `pane.series[0]`,
    // a different derivation from the one that built the bands beside it.
    for (const v of verdicts) expect(v.basis?.from).toBe('2026-08-01')
    // AND ONLY THE STRIP THE BLOCK DRAWS. `verdicts()` returned every side's,
    // including two audiences whose movement this block never prints.
    const everySide = data.selected!.sides.flatMap((x) => Object.values(x.kindVerdicts)).filter(Boolean)
    expect(verdicts.length).toBeLessThan(everySide.length)
  })

  // Every rail row prints a banded badge, so the block has to declare them.
  it('declares the rail’s badges as the verdicts they are', () => {
    const data = subjectsFixture()
    expect(blockAnswers(subjectsList, data).verdicts.length).toBe(data.list.rows.length)
  })

  it('says the kind mix is not recorded when M5 has not landed', () => {
    const data = subjectsFixture()
    const bare = {
      ...data,
      selected: { ...data.selected!, sides: data.selected!.sides.map((s) => ({ ...s, kinds: [], reddit: null })) },
    }
    expect(subjectsKinds.emptyState(bare)).toContain('not recorded month by month')
  })
})

describe('SU2 · the kind mix, on its own month', () => {
  it('names the month, because it is one month among twelve months of furniture', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Sep · every video in the audience')
  })
})

describe('SU2 · the voices', () => {
  it('shows the original and the English beneath it, labelled', () => {
    const text = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Nach 14 Monaten ist der Reißverschluss hin')
    expect(text).toContain('After 14 months the zip is done')
  })

  it('says how many it drew, out of how many there were', () => {
    expect(renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))).toContain('6 of 41')
  })

  it('sends the reader to the comment where there is a link, and prints the words where there is not', () => {
    const markup = render(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('https://www.tiktok.com/@maker/video/7312345678901234567')
    expect(renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))).toContain('22 Sep · under a Freitag video')
  })

  // BOTH REFS PER VOICE, the paired frame included. `subjects` is a registered
  // `PageModule`, so /api/export → createSnapshot → freezeQuotes runs over this
  // data: a ref declared here reaches `report_snapshots.evidence_ids`, the
  // column an erasure searches, and words that are NOT behind a ref freeze into
  // `data` as words.
  it('declares its refs so a snapshot can freeze ids and resolve words at render', () => {
    expect(blockAnswers(subjectsVoices, subjectsFixture()).quotes)
      .toEqual(['e:1', 'e:6', 'e:9', 'e:8', 'e:2', 'e:3', 'e:7'])
  })

  it('freezes the paired on-screen frame as a ref, never as words', () => {
    const { data: frozen, refs } = freezeQuotes(subjectsFixture())
    expect(refs).toContain('e:9')
    expect(JSON.stringify(frozen)).not.toContain('1 bag. 3 years. 0 regrets')
  })

  it('says a frame whose evidence row is gone is counted, not quotable', () => {
    const data = subjectsFixture()
    const voice = data.selected!.voices.find((v) => v.onScreen)!
    const erased = {
      ...data,
      selected: { ...data.selected!, voices: [{ ...voice, onScreen: { ref: 'e:9', text: '' } }] },
    }
    expect(renderText(subjectsVoices.render(erased, 'app', ctx))).toContain('this frame has since been removed')
  })

  it('says a quote whose words are gone is counted, not quotable', () => {
    const data = subjectsFixture()
    const erased = {
      ...data,
      selected: { ...data.selected!, voices: [{ ...data.selected!.voices[0], quote: { ref: 'e:1', text: '' } }] },
    }
    expect(renderText(subjectsVoices.render(erased, 'app', ctx))).toContain('counted, not quotable')
  })
})

describe('SU3 · questions your posts did not answer', () => {
  it('says the count, the population it counted in and your own posts — and prints no share', () => {
    const text = renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('came up in 130 of the videos we have read')
    expect(text).toContain('none of your 9 posts in the last 12 months touched it')
    // THE GATE'S OWN NUMBER IS THE ROWS' DENOMINATOR NOW, which is where a
    // reader needs it: 130 of the 214 videos that asked anything about this
    // subject. Both ends of that fraction come off one read on one clock —
    // unlike the mock's "130 of 1,388", whose denominator is comment-dated.
    expect(text).toContain('130 of 214 videos')
    expect(text).toContain('9 posts of yours')
    expect(text).toContain('counts, not shares')
    expect(text).not.toContain('%')
  })

  it('says which half of your posts it matched on, because the other half is unreadable', () => {
    // `video_claims` carries RLS and no tenant SELECT policy until M8, so the
    // claims half of the haystack came back empty with no error on every page
    // a client opens — and an empty half reads as "you never answered this".
    // The OV4 precedent: name the side that cannot be read.
    const text = renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('what your posts are about')
    expect(text).toContain('not readable yet')
  })

  it('names Reddit’s 40-comment cap where the questions lean on it', () => {
    expect(renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx)))
      .toContain('we read up to 40 comments on each')
  })

  it('refuses to rank a gap under the gate, and says how many videos there were', () => {
    const data = subjectsFixture()
    const short = {
      ...data,
      selected: {
        ...data.selected!,
        unanswered: {
          ...data.selected!.unanswered,
          rows: [],
          questionVideos: 4,
          refusal: '4 videos asked something about this subject — we do not rank a gap under 10.',
        },
      },
    }
    expect(subjectsUnanswered.emptyState(short)).toContain('we do not rank a gap under 10')
  })

  // A BLOCK MARKS THE MODEL'S VALUE, NOT THE ROW IT SITS IN. The lead was one
  // `data-copy="figure"` node around a sentence containing a Pass B theme
  // label — a model's words declared to be one of code's figures.
  it('marks the clustering’s label as the model’s, and the count as code’s', () => {
    const markup = render(subjectsUnanswered.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('data-copy="subject" data-slot="pass_b_theme"')
    expect(markup).toContain('Questions grouped as')
    // And it still passes every rule, unmarked sentence included.
    assertCopyContract(markup)
  })

  it('declares one figure per row it printed', () => {
    const figures = blockAnswers(subjectsUnanswered, subjectsFixture()).figures
    expect(Object.keys(figures)).toHaveLength(2)
    expect(Object.values(figures).every((f) => f.unit === 'videos')).toBe(true)
  })

  it('carries no verdict at all — its two halves are dated two ways', () => {
    expect(blockAnswers(subjectsUnanswered, subjectsFixture()).verdicts).toEqual([])
  })
})

// ---- the two rail tiles the mock draws and the build had never had ----------

describe('SU4 · your own posts', () => {
  it('counts what you published, says what cleared the floor, and NAMES THE CLOCK', () => {
    const text = renderText(subjectsOwnPosts.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('9 posts published')
    expect(text).toContain('3 of 9 cleared the 5-comment floor')
    // D9. Every other figure on this page is comment-dated; a census of what
    // you published is dated by `videos.upload_date`, and an upload-dated count
    // under a comment-dated month heading is the mixing UNANSWERED_BASIS exists
    // to name one tile down.
    expect(text).toContain('dated by the day you posted')
    expect(text).toContain('posts published in September')
  })

  it('draws the hooks as independent shares, each with its own "of N" — never a partition', () => {
    const text = renderText(subjectsOwnPosts.render(subjectsFixture(), 'app', ctx))
    // Five of nine posts carry a hook at all, so the rows do not sum to the
    // census (D4). Each says what it is a share of instead.
    expect(text).toContain('Demonstration')
    expect(text).toContain('of 9')
    expect(text).not.toContain('Other hooks')
  })

  it('names the subjects your posts matched, with the count of posts', () => {
    const text = renderText(subjectsOwnPosts.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Subjects matched')
    expect(text).toContain('Durability')
    expect(text).toContain('3 of 9')
  })

  it('survives M4 — `videos` is readable whatever the month tables say', () => {
    expect(subjectsOwnPosts.emptyState(refusedFixture())).toBeNull()
    expect(renderText(subjectsOwnPosts.render(refusedFixture(), 'app', ctx))).toContain('9 posts published')
  })

  it('says the census is empty rather than printing a zero', () => {
    const data = subjectsFixture()
    const none = { ...data, ownPosts: null }
    expect(subjectsOwnPosts.emptyState(none)).toContain('not recorded')
  })

  it('is email-safe', () => {
    const markup = render(subjectsOwnPosts.render(subjectsFixture(), 'email', ctx))
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })
})

describe('SU5 · say vs hear', () => {
  it('prints each claim, what the audience did with it, and the whole ledger’s tally', () => {
    const text = renderText(subjectsSayHear.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Built to last a decade')
    expect(text).toContain('Echoed')
    expect(text).toContain('said in 2 of 9 posts')
    // BOUND, NOT REBUILT: `claimCounts` over the same run_summary rows Market
    // reads. Two tiles counting one ledger twice is how two pages disagree.
    expect(text).toContain('13 claims · 3 echoed · 2 pushed back · 8 silent')
  })

  it('dates itself by the update, never by the month heading above it', () => {
    // D9. The ledger is Pass D-a's resolution on ONE completed update; the
    // month at the top of this page means comment-dated. The mock stamps this
    // tile "Sep".
    const text = renderText(subjectsSayHear.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('latest update')
    expect(text).not.toContain('Sep ·')
  })

  it('answers its OWN question when the ledger is unreadable, not the census’s', () => {
    const data = refusedFixture()
    const text = renderText(subjectsSayHear.render(data, 'app', ctx))
    // The own-posts sentence belongs to the tile above; this one is about the
    // ledger it could not read.
    expect(text).not.toContain('These are the posts you published')
    expect(text).toContain('there is no ledger to report')
  })

  it('names the half it cannot read rather than drawing it as nothing', () => {
    expect(subjectsSayHear.emptyState(refusedFixture())).toContain('not readable')
  })

  it('quotes no figure token — a claim is not a video, a comment, a point or a percentage', () => {
    expect(blockAnswers(subjectsSayHear, subjectsFixture()).figures).toEqual({})
  })
})

// ---- what wave 2 changed about the blocks that already existed ---------------

describe('the mock’s own shape, where the data allows it', () => {
  it('leads the pane with the banded gap and never with "narrowed"', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    // D1: both levels with both denominators, and the refusal the band earned.
    expect(text).toContain('Durability — You 31% of 84 · Freitag 43.7% of 142 · too few to compare')
    expect(text).not.toContain('narrowed')
  })

  it('qualifies each side and says what its figure is a share of', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('You — Sealand')
    expect(text).toContain('Freitag — rival')
    expect(text).toContain('Category — no brand')
    expect(text).toContain('of your videos')
    expect(text).toContain('of their videos')
    expect(text).toContain('of category videos')
  })

  // D5 / D11. `directionWord` answers `flat` when three readings exist and do
  // not agree — the ABSENCE of a direction — and "flat" is not a word this
  // product has (MOVEMENT_WORDS carries none). The build printed "flat, 3
  // months" beside Freitag's "no clear change": two non-answers, one of them
  // dressed as a finding.
  it('prints no "flat" anywhere, and still prints a direction the category earned', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).not.toContain('flat')
    expect(markup).toContain('growing, 3 months')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('states the category’s last three levels as levels, dated, and claims no direction from them', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Jul 17% → Aug 19% → Sep 24.5% in the category')
  })

  it('names the axis the chart spans, and what the shading over it means', () => {
    const text = renderText(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('monthly · Apr → Sep 2026')
  })

  it('keys the chart by audience AND kind, and paints a second rival its own ink', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('Sealand — you')
    expect(markup).toContain('Freitag — rival')
    expect(markup).toContain('Category — no brand')
    // The end label keeps the SHORT name and its denominator — the one part of
    // an end label that may not be lost to the gutter's clip.
    expect(markup).toContain('of 142')
  })

  // THE STATE THE PAYING TENANT IS IN. Sealand carries 84 videos against a
  // 100-video floor, so the client's own series never reaches the plot on any
  // subject — six hollow rings on the 0% rule under a key promising a line.
  it('says in the key that your own ink draws no line, and which months', () => {
    const text = renderText(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('no line: every month is below the floor')
    expect(text).toContain('below the floor (every month)')
  })

  it('draws the gap bracket only where the band earned a magnitude (D1)', () => {
    // On the mock's own month the gap is `too_little_data`, so there is no
    // bracket — the same answer the pane's lead gives one tile above.
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(markup).not.toContain('apart')
  })

  it('names the subject in the voices title and states the language basis, not the mock’s', () => {
    const text = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Voices on durability')
    // D15. What is recorded is the language of what was said ON CAMERA,
    // all-time; "27% of this month's videos" would restate a different
    // denominator.
    expect(text).toContain('said on camera was not in English')
  })

  // THE PLATFORM IS DRAWN ONCE. The cite led with `m.platform` — the raw stored
  // value, a proper noun lower-cased — while the glyph in front of it already
  // said the same thing. An email has no glyph, so there it is a WORD, cased.
  it('prints the platform as a glyph on screen and as a cased word in an email', () => {
    const screen = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(screen).not.toContain('tiktok')
    expect(screen).toContain('14 Sep · under a category video')
    const email = renderText(subjectsVoices.render(subjectsFixture(), 'email', ctx))
    expect(email).toContain('TikTok · 14 Sep')
    expect(email).not.toContain('tiktok ·')
  })

  it('flags a creator speaking on camera, and pairs the frame’s own words with it', () => {
    const text = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Said on camera')
    expect(text).toContain('On-screen text on the same video')
    expect(text).toContain('1 bag. 3 years. 0 regrets')
  })
})

// THE PAGE SAYS A THING ONCE. Two paragraphs were rendered twice within one
// screenful: the page's own subtitle (`lib/nav.ts`) as this block's question
// line, and `axisNote` at the foot of the hero and again as the chart's
// caption ~60px below it.
describe('the page says each of its sentences once', () => {
  it('does not repeat the page’s own subtitle as the pane’s question', () => {
    expect(subjectsSubject.question).not.toBe(NAV_SUBTITLE)
    for (const data of [subjectsFixture(), refusedFixture()]) {
      expect(renderText(subjectsSubject.render(data, 'app', ctx))).not.toContain(NAV_SUBTITLE)
    }
  })

  it('prints the axis note on the hero and not again under the chart', () => {
    const data = subjectsFixture()
    const note = data.selected!.axisNote!
    expect(renderText(subjectsSubject.render(data, 'app', ctx))).toContain(note)
    expect(renderText(subjectsLine.render(data, 'app', ctx))).not.toContain(note)
  })
})

describe('the page’s own layout', () => {
  it('draws all six blocks when a subject is selected', () => {
    expect(layoutFor(subjectsFixture()).map((b) => b.block.key)).toEqual(SUBJECT_BLOCKS.map((b) => b.key))
  })

  it('drops the four blocks that are about a subject when there is no subject', () => {
    // Six tiles printing the same sentence down two screens of empty space is
    // honest and unreadable. The page decides what to drop; that division is
    // the block contract's own ("a report drops a slide").
    // The two rail tiles that are about the WORKSPACE stay: what you published
    // and what you claimed are true whether or not a subject is selected, and
    // on the refused fixture they are the only reading on the page.
    for (const data of [refusedFixture(), candidatesFixture()]) {
      expect(layoutFor(data).map((b) => b.block.key))
        .toEqual(['subjects.list', 'subjects.subject', 'subjects.ownposts', 'subjects.sayhear'])
    }
  })

  // TWO SOURCES OF TRUTH FOR ONE GEOMETRY. The app arm read `LAYOUT` directly
  // and ignored `layoutFor`'s columns, so the no-selection arm — the one
  // production is in — kept the selected reading's rail-and-column frame with
  // one 216px tile in it. The spans have to add up to whole rows.
  it('fills whole rows with the four tiles it keeps when nothing is selected', () => {
    const cols = layoutFor(refusedFixture()).map((l) => l.col)
    expect(cols.reduce((a, b) => a + b, 0) % 12).toBe(0)
  })

  it('says something of its own where the rail has already said the set is unreadable', () => {
    const data = refusedFixture()
    expect(subjectsSubject.emptyState(data)).not.toBe(data.list.notRecorded)
    const both = renderText(<>{subjectsList.render(data, 'app', ctx)}{subjectsSubject.render(data, 'app', ctx)}</>)
    expect(both.split('Your subjects are not recorded for this workspace yet.').length - 1).toBe(1)
  })

  it('never asks the grid for a span it does not have', () => {
    for (const data of [subjectsFixture(), refusedFixture()]) {
      for (const { col, row } of layoutFor(data)) {
        expect(col).toBeGreaterThanOrEqual(1)
        expect(col).toBeLessThanOrEqual(12)
        expect(row).toBeGreaterThanOrEqual(1)
        expect(row).toBeLessThanOrEqual(6)
      }
    }
  })
})

// A brief borrows SU3 and SU-voices (SALES_MAP, CONTENT_MAP), and a brief is
// read as a PDF and on a public share page. "Verbatim engineering" is a
// readiness owner: right where a reader can open Settings › Readiness, an
// internal label where they cannot. "Open the content brief →" resolves, for
// such a reader, to a login wall.
describe('the Subjects blocks, read from outside the workspace', () => {
  it('name the half they could not read without naming our own owner', () => {
    const data = subjectsFixture()
    const print = renderText(subjectsUnanswered.render(data, 'print', ctx))
    const app = renderText(subjectsUnanswered.render(data, 'app', ctx))
    expect(app).toContain('What your posts claim is not readable yet')
    expect(app).toContain('Verbatim engineering')
    expect(print).toContain('What your posts claim is not readable yet')
    expect(print).not.toContain('Verbatim engineering')
  })

  // THE SAME RULE ON THE TWO NEW RAIL TILES. `refusedFixture` is production's
  // state today, so this is the sentence a PDF and a `/r/<token>` page of the
  // page as it stands would actually carry.
  it('strip the readiness owner from the two rail tiles too', () => {
    const data = refusedFixture()
    for (const block of [subjectsOwnPosts, subjectsSayHear]) {
      const app = renderText(block.render(data, 'app', ctx))
      const paper = renderText(block.render(data, 'print', ctx))
      expect(app, block.key).toContain('Verbatim engineering')
      expect(paper, block.key).toContain('not readable on this page yet')
      expect(paper, block.key).not.toContain('Verbatim engineering')
    }
  })

  it('draw no in-app affordance on paper', () => {
    const data = subjectsFixture()
    expect(render(subjectsUnanswered.render(data, 'print', ctx))).not.toContain('Open the content brief')
    expect(render(subjectsVoices.render(data, 'print', ctx))).not.toContain('Hear these voices in Voice')
    expect(render(subjectsVoices.render(data, 'app', ctx))).toContain('Hear these voices in Voice')
    // The chart's and the kind mix's footers were hand-rolled `email ? a :
    // Link` pairs, so PRINT got the app's control. This page exports now, so
    // print is a PDF and a `/r/<token>` page.
    expect(render(subjectsLine.render(data, 'print', ctx))).not.toContain('Compare another subject')
    expect(render(subjectsKinds.render(data, 'print', ctx))).not.toContain('Open Voice')
    expect(render(subjectsSubject.render(data, 'print', ctx))).not.toContain('videos behind your figure')
  })

  // A LINK IN AN EXPORT IS ABSOLUTE OR IT IS NOT A LINK. The page module used
  // to bind `blockContext('')` for every mode, so an email and a share page
  // printed `/dashboard/...` — relative to wherever the reader happened to be.
  it('send an email reader to an absolute address, in email-safe markup', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'email', ctx))
    expect(markup).toContain('https://app.verbatimintel.com/dashboard/videos?subject=s1')
    expect(markup).not.toContain('class=')
  })
})

// ---- D1 · the pane's gap, and its fourth state --------------------------------

describe('SU2 · the two-audience gap the pane carries', () => {
  it('reads the mock’s own month as too few to compare, with both levels intact', () => {
    const gap = subjectsFixture().selected!.gap as Gap
    expect(gap.state).toBe('too_little_data')
    expect(gapLine(gap)).toBe('You 31% of 84 · Freitag 43.7% of 142 · too few to compare')
  })

  it('refuses the difference outright once the rival is retired — the tracked set moved', () => {
    const gap = retiredRivalFixture().selected!.gap as Gap
    expect(gap.state).toBe('refused')
    expect(gap.refusedReason).toBe('tracking_change')
    expect(gap.gapPts).toBeNull()
    // The levels survive; only the difference is withheld, on this month and
    // on the earlier one.
    expect(gapLine(gap)).toBe('You 31% of 84 · Freitag 43.7% of 142 · comparison refused')
    expect(gapBasisLine(gap)).toBe('comparison refused in August')
  })

  it('renders every block on the retired-rival reading and keeps the copy contract', () => {
    for (const block of SUBJECT_BLOCKS) {
      for (const mode of MODES) {
        assertCopyContract(render(block.render(retiredRivalFixture(), mode, ctx)))
      }
    }
  })
})
