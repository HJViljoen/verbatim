import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame, FigureCell, NoValue } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import { NOT_OBSERVED, NOT_RECORDED, standingText, type StandingShare } from '@/lib/reading/standings'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { isRivalAudience } from '@/lib/rivals'
import { OWN_POSTS_UNREADABLE, OWN_POSTS_UNREADABLE_OUTSIDE, RIVAL_FIGURES_MAX, type OverviewData, type RivalRow } from '@/lib/pages/overview'

// OV4 · Rivals (design §3 OV4).
//
// TWO SHARES SIDE BY SIDE, AND THAT IS THE BLOCK. Content share is how much of
// the panel's video they account for; attention share is how much of the
// panel's COMMENT they account for. Measured on Össur's August panel, Ottobock
// is 13.6% of the videos and 0.56% of the comments — the difference between
// "they post a lot" and "people talk about them", which a standings table with
// one denominator cannot say (lib/reading/attention.ts).
//
// NO RANK, NO TINT. The design forbids a rank headline and a colour tint on a
// rival's row; the row is a reading, not a league table.

/** A share cell: the percentage and the two counts under it, or the words.
 *
 *  THREE STATES AND NOT TWO. A brand the panel holds nothing for reads "not
 *  observed" — never 0%, which would say the brand was silent when what
 *  happened is that we looked and found nothing. A workspace whose panel
 *  reading has not been written at all reads "not recorded yet", because
 *  nobody looked: `recorded` is the block's own flag for that, and without it
 *  this cell asserted a measurement on every row of both live tenants while
 *  Competitive, off a table that IS applied, printed a rival at 9.4%. */
function Share({ share, recorded, mode }: { share: StandingShare | null; recorded: boolean; mode: RenderMode }): ReactNode {
  if (share == null || share.pct == null) {
    const words = recorded ? NOT_OBSERVED : NOT_RECORDED
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{words}</span>
      : <span className="text-[12px] text-muted-foreground">{words}</span>
  }
  // P0'S CELL (`main.rivals.col.attention` / `.col.content`): the share stacked
  // over the two counts it rests on, at the artboard's ramp. The mock prints
  // the percentage ALONE, which is the score this product does not show (D10),
  // so the "of N" stays and takes the artboard's second line rather than
  // sitting inline beside the figure.
  return <FigureCell mode={mode} value={standingText(share)} of={`${fmtInt(share.k)} of ${fmtInt(share.n)}`} />
}

/**
 * True where NOT ONE rival's own posts can be read — which is every workspace
 * today, because `video_claims` is service-role only until M8.
 *
 * WHY THE BLOCK ASKS THIS AT ALL (polish pass, 2026-09-24). The cell answered
 * the absence per row, so a tenant tracking nine rivals got the same 47-word
 * sentence nine times down one column — "— not tracked · their own posts are
 * not readable yet · Settings › Readiness", 340px wide, stacked — and the
 * column that carries the block's actual content sat to the right of it. The
 * artboard puts what a rival says on their own posts in that cell and puts the
 * reading's own apparatus in the footer note; a state that is true of every
 * row is apparatus.
 *
 * ROW BY ROW WHERE IT IS A ROW'S FACT. The moment one rival's claims become
 * readable, this is false and every cell says its own thing again — including
 * the ones that still cannot be read, because then the absence IS news about
 * that rival rather than about the product.
 */
function ownPostsAllUnreadable(rows: readonly RivalRow[]): boolean {
  const rivals = rows.filter((r) => isRivalAudience(r.audience))
  return rivals.length > 0 && rivals.every((r) => r.ownPosts == null)
}

/** What they said on their own posts — or the honest absence.
 *
 *  `video_claims` is service-role only until M8 adds a tenant policy (WP16), so
 *  no tenant can read a rival's own claims today. The design's own words for a
 *  side we cannot read are "— not tracked", and the sentence names who fixes
 *  it rather than implying the rival said nothing — once, under the table,
 *  where the absence is true of every row. */
function OwnPosts({ row, mode, folded }: { row: RivalRow; mode: RenderMode; folded: boolean }): ReactNode {
  // ONLY A RIVAL HAS "THEIR OWN POSTS". The standings carry your own brand's
  // row and the category's, and "on their own posts: — not tracked" against
  // either of them is an absence of nothing.
  if (!isRivalAudience(row.audience)) return null
  // The whole column is one sentence: it is said once, under the table.
  if (folded && row.ownPosts == null) return <NoValue mode={mode} label="not tracked" />
  // Print mode is a PDF and a public share page (WP19's briefs), where a
  // readiness owner is our internal label rather than a screen the reader can
  // open. The absence is still named.
  const text = row.ownPosts ?? (mode === 'print' ? OWN_POSTS_UNREADABLE_OUTSIDE : OWN_POSTS_UNREADABLE)
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{text}</span>
    : <span className="text-[12px] text-muted-foreground">{text}</span>
}

function Raised({ row, mode }: { row: RivalRow; mode: RenderMode }): ReactNode {
  if (!row.raisedMost) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>—</span>
      : <span className="text-[12px] text-muted-foreground">—</span>
  }
  // THE LABEL AND THE COUNT ARE TWO THINGS (design review High 9). They were
  // concatenated with a bare space, so a theme whose label is a question read
  // as one broken sentence: "Does the tarp smell 41 of 142". The artboard sets
  // the label as a quoted question with the count beside it; a theme label is
  // MODEL prose replayed here, so it is marked `subject` with the slot that
  // wrote it — which is also what makes the quotation marks honest.
  const body = <>
    <span data-copy="subject" data-slot="pass_b_theme">“{row.raisedMost.label}”</span>
    <span className={mode === 'email' ? undefined : 'mx-1 text-muted-foreground'}>·</span>
    <span data-copy="figure">{fmtInt(row.raisedMost.k)} of {fmtInt(row.raisedMost.n)}</span>
  </>
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink }}>{body}</span>
    : <span className="text-[12px]">{body}</span>
}

/**
 * "Sealand (you)" · "The category" · "Freitag" (`main.rivals.col.brand`).
 *
 * WHICH ROW IS YOURS IS THE FIRST THING A READER LOOKS FOR, and the table gave
 * them the brand name with nothing marking it — on a tenant whose own name sits
 * between two rivals in alphabetical order that is one row of six with no
 * marker at all. The artboard says "(you)" and the build has the field:
 * `StandingRow.role`, which `buildStandings` fills. The category's own row
 * keeps the label the standings gave it.
 *
 * NO TINT AND NO RANK, which is the block's own rule — the row is a reading,
 * not a league table — so the marker is a word rather than a colour.
 */
/** The dual-mention caveat, as one string for the footer note — the count
 *  appended only where there is one, never "0 did this month". */
export function caveatLine(r: OverviewData['rivals']): string {
  return r.dualMention != null && r.dualMention > 0
    ? `${r.caveat} ${fmtInt(r.dualMention)} did this month.`
    : r.caveat
}

export function brandLabel(row: RivalRow): string {
  return row.role === 'client' ? `${row.label} (you)` : row.label
}

/**
 * The rivals' own inks, in the artboard's order (Block D wave 3, M15).
 *
 * The first rival takes the full orange and the rest step toward the surface,
 * which is `lib/pages/dashboard.ts`'s own ramp and resolves to exactly the
 * hexes `Main.dc.html` paints its dots: #F0742B, #F59E6B, #F8BC99, #E6B03C,
 * #CDD2D7. Written as tokens and colour-mixes `tokenHex` already knows, so the
 * email arm can never resolve one to black.
 */
const RIVAL_INKS = [
  'var(--comp)',
  'color-mix(in srgb, var(--comp) 70%, var(--tile))',
  'color-mix(in srgb, var(--comp) 48%, var(--tile))',
  'var(--mixed)',
  'var(--neutral-seg)',
] as const

/**
 * Which ink a row's dot takes — by ROLE first, then by the row's place among
 * the rivals.
 *
 * NOT A TINT AND NOT A RANK, which is this block's own rule. It is the ENTITY
 * palette every chart on this product already uses to say whose line is whose
 * — `var(--you)` for your own brand, the orange ramp for rivals, `var(--cat)`
 * for the category — so a reader who has seen the subject chart, the attention
 * line or the standings recognises the row without reading it. Identity is
 * never colour ALONE (MASTER.md): the dot sits against the name, and the name
 * is what the row is read by.
 */
export function rowInk(rows: readonly RivalRow[], row: RivalRow): string {
  if (row.role === 'client') return 'var(--you)'
  if (row.role !== 'rival') return 'var(--cat)'
  const i = rows.filter((r) => r.role === 'rival').findIndex((r) => r.audience === row.audience)
  return RIVAL_INKS[Math.max(0, i) % RIVAL_INKS.length]
}

export const overviewRivals: Block<OverviewData> = {
  key: 'overview.rivals',
  title: 'Rivals',
  // NOT the sidebar's "are they gaining?" (lib/nav.ts). A block's question is
  // rendered inside the block, where rule (c) applies: a direction word in a
  // heading makes the claim before a band has been drawn. The page bar keeps
  // the sidebar's wording, which no block contract checks.
  question: 'Who else is in this, and what are they promising?',

  render(data, mode = 'app', ctx) {
    const r = data.rivals
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/competitive`
    const footer = email
      ? null
      : openLink(mode, href, 'Open Competitive →')

    const empty = overviewRivals.emptyState(data)
    // The own-posts column's absence, said once instead of once per row.
    const folded = ownPostsAllUnreadable(r.rows)
    const ownPostsNote = folded ? (mode === 'print' ? OWN_POSTS_UNREADABLE_OUTSIDE : OWN_POSTS_UNREADABLE) : null

    return (
      <BlockFrame
        title={overviewRivals.title}
        // THE PAGE PRINTS ONE QUESTION, IN THE PAGE BAR (Block D wave 3, M8).
        // Parsed from `Main.dc.html`: all six blocks go straight from
        // `</header>` into their content grid, and the artboard's only question
        // is "What is this month's reading?" in the bar — which
        // `SurfacePageBar` already prints (`lib/nav.ts`, `page-bar.tsx:65`).
        // Six sub-lines under six eyebrows cost about 156px and put a second
        // narrator over every tile. The block keeps its `question` field, which
        // is its contract with the reader and what the nav and the legend read;
        // what stops is drawing it a second time inside the block.
        mode={mode}
        // THE PANEL'S DENOMINATOR, NOT THE CORPUS'S. This line read "both
        // shares of what our search plan found", which is
        // CORPUS_DENOMINATOR_LINE's claim — the sentence WP14 wrote for CO2,
        // whose shares come off `month_denominators`. OV4's come off
        // `month_audience_stats.panel_videos` / `.attention_comments`, which
        // M5 defines as a FROZEN PANEL of accounts: upload-dated, Reddit
        // excluded by construction, re-based by a re-freeze. Different
        // population, different sentence.
        meta="both shares of a frozen panel of accounts · no rank is printed"
        footer={footer}
        // THE DUAL-MENTION CAVEAT INTO THE FOOTER NOTE
        // (`main.rivals.footer`). It is a statement about how the denominator
        // was built, which is metadata about the reading rather than one of its
        // findings — and as a body paragraph under the table it read as the
        // block's conclusion.
        // AND THE COLUMN-WIDE ABSENCE JOINS IT. Both halves are statements
        // about how the reading was built rather than findings, which is what
        // the footer note is for — and one of them was being printed once per
        // rival row until the polish pass folded it here.
        footerNote={ownPostsNote ? <>{caveatLine(r)} On their own posts, every rival row reads {ownPostsNote}.</> : caveatLine(r)}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {r.standingsNote ? <BlockEmpty mode={mode}>{r.standingsNote}</BlockEmpty> : null}
        {email ? (
          <div>
            {r.rows.map((row) => (
              <div key={row.audience} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
                <strong>{brandLabel(row)}</strong>{row.retiredAt ? <span style={{ color: EMAIL.muted }}> · tracked until {shortDate(row.retiredAt)}</span> : null}
                <div style={{ marginTop: 2 }}>
                  attention <Share share={row.attention} recorded={r.recorded} mode={mode} /> · content <Share share={row.content} recorded={r.recorded} mode={mode} /> <BlockMovement verdict={row.attentionVerdict} unit="pts" mode={mode} />
                </div>
                <div style={{ marginTop: 2 }}>raised most under their content: <Raised row={row} mode={mode} /></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {/* `scope="col"` ON EVERY ONE (design review Medium 14).
                        Six columns, five of them numeric: without it a screen
                        reader reads a row of figures and can name the column
                        none of them belongs to. */}
                    <th scope="col" className="py-1 pr-3 font-semibold">Brand</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Attention</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Content</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Attention change</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">On their own posts</th>
                    <th scope="col" className="py-1 font-semibold">Raised most under their content</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {r.rows.map((row) => (
                    // THE ROW THAT IS YOURS IS THE FIRST THING A READER LOOKS
                    // FOR (Block D wave 3, M15). "(you)" at the END of a label
                    // is the only thing that marked it, and on a tenant whose
                    // own name sorts between two rivals that is one row of six
                    // with nothing to catch the eye. The artboard sets the
                    // client's name at 600 on the inner ground — elevation,
                    // never tone (MASTER.md), and never a rank.
                    <tr key={row.audience} className={row.role === 'client' ? 'bg-inner' : undefined}>
                      <th scope="row" className={`py-1.5 pr-3 text-left text-[12.5px] ${row.role === 'client' ? 'font-semibold' : 'font-medium'}`}>
                        <span className="flex items-center gap-2">
                          {/* The entity's own ink, 6px, as the artboard draws
                              it. `aria-hidden`: the name beside it is what the
                              row is read by, and a dot that announced itself
                              would put a colour name in a screen reader's
                              mouth. */}
                          <span aria-hidden className="size-1.5 flex-none rounded-full" style={{ background: rowInk(r.rows, row) }} />
                          <span className="min-w-0">{brandLabel(row)}</span>
                        </span>
                        {row.retiredAt ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">tracked until {shortDate(row.retiredAt)}</span> : null}
                      </th>
                      <td className="py-1.5 pr-3"><Share share={row.attention} recorded={r.recorded} mode={mode} /></td>
                      <td className="py-1.5 pr-3"><Share share={row.content} recorded={r.recorded} mode={mode} /></td>
                      {/* THE COLUMN ANSWERS ON EVERY ROW (polish pass). No
                          creator panel is frozen on either live tenant, so
                          `attentionVerdict` is null on all eleven rows and the
                          header stood over a column of whitespace. */}
                      <td className="py-1.5 pr-3">
                        {row.attentionVerdict ? <BlockMovement verdict={row.attentionVerdict} unit="pts" mode={mode} /> : <NoValue mode={mode} label="no change is read for this brand" />}
                      </td>
                      <td className="py-1.5 pr-3"><OwnPosts row={row} mode={mode} folded={folded} /></td>
                      <td className="py-1.5"><Raised row={row} mode={mode} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    // THE LARGEST FEW, so the page's budget binds on a tenant and not only on
    // a fixture: nothing caps how many rivals a tenant may track, and every
    // one of them was spending a number. Every rival still has its row
    // (RIVAL_FIGURES_MAX).
    const declared = [...data.rivals.rows]
      .filter((r) => r.attention?.pct != null)
      .sort((a, b) => (b.attention?.pct ?? 0) - (a.attention?.pct ?? 0) || a.audience.localeCompare(b.audience))
      .slice(0, RIVAL_FIGURES_MAX)
    for (const row of declared) {
      out[`rival_${row.audience.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_attention`] = {
        value: row.attention?.pct as number,
        unit: 'pct',
        label: `${row.label}, share of the panel’s comments this month`,
      }
    }
    if (data.rivals.dualMention != null && data.rivals.dualMention > 0) {
      out.dual_mention_videos = { value: data.rivals.dualMention, unit: 'videos', label: 'videos of yours that also named a rival' }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return data.rivals.rows.flatMap((r) =>
      [r.attentionVerdict, r.contentVerdict].filter((v): v is Verdict => v != null),
    )
  },

  emptyState(data) {
    return data.rivals.rows.length === 0 ? 'No rival is tracked for this workspace yet.' : null
  },
}
