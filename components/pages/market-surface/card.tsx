import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { MovementBadge } from '@/components/delta-badge'
import { TileBlock } from '@/components/shell/tile'
import { fmtInt, longMonth } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import { audiencePhrase } from '@/lib/reading/afterwards'
import type { CardCount, MoveCandidate } from '@/lib/reading/moves'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'
// The claim row's cut and its no-wording sentence are Overview's, imported
// rather than re-declared: the card is ONE `MoveCandidate` composed in
// Overview's loader and drawn by both surfaces, so the two pages must cut the
// same sentence in the same place and say the same thing when a claim has no
// transcribed words.
import { CARD_CLAIM_UNQUOTED, claimText } from '@/components/pages/overview/moves'

// MK3 · This month's card — the artboard's pre-filled card (Block D wave 2).
//
// THE CARD WAS BUILT IN WAVE 1 AND RENDERED NOWHERE. `MovesBlock.card` is a
// `MoveCandidate`, composed once in Overview's loader and handed to both
// surfaces (`loadMovesExtras`) so the two pages cannot count one month two
// ways. This is the first thing that draws it, and it draws it as its own tile
// because that is what the artboard does — five columns of the moves row, with
// the first move's chart beside it.
//
// WHAT IS NOT BUILT IS THE PRESS, AND THE CARD SAYS WHICH. The artboard's
// green "Yes, count this as a move" is the one control this block does not
// have: `MoveCandidate.proposal` is what the press WOULD declare, and where it
// is null the card says why in its own words (`unread` — "no posts of yours",
// or "moves are not recorded for this workspace yet", two different facts).
// Where it is NOT null the card is complete and the press is still missing, so
// the slot carries `MOVES_UNLOCK` — the block's own sentence, not a disabled
// button. A control nobody can press is worse than a sentence.
//
// EVERY COUNT CARRIES THE POPULATION IT IS A COUNT OF (D10, D15). The card's
// figures are shares of three different denominators and the artboard labels
// none of them: posts published is a plain count, the comment floor and the
// claims are shares of those posts, and the subject rows are shares of the
// posts we actually READ — which on Sealand's September was 5 of 17.
// `subjectsBasis` is the field that says so and it is printed, because a
// subject row denominated on every post published would be a statement about
// our gather cadence wearing the client's noun.
//
// THE TWO MOVEMENT ROWS ARE VERDICTS, NOT ARROWS. The artboard prints "19% →
// 22% ▲ 3 pts" on the category side beside "27% → 31% (26 of 84) too few to
// compare" on yours — a direction claim from a surface whose reader flag is
// false, sitting next to the honest form of the same comparison. Both sides are
// `Verdict`s here and both go through `MovementBadge`, which prints a magnitude
// only where the state is `moved` (D2) and the band beside it when it does.

/** How many claim rows the card draws. Sealand published nine in September,
 *  several of them 200-character sentences; the card is a tile, not a list. */
export const CARD_CLAIMS_SHOWN = 3

/** One counted row of the card: the label, and the figure with its "of N". */
function Count({ count, mode, hero = false }: { count: CardCount; mode: RenderMode; hero?: boolean }) {
  const { k, n } = count.value
  // A COUNT THAT IS NOT A SHARE PRINTS NO DENOMINATOR, deliberately: "posts
  // published" is counted out of itself, and "9 of 9" is a fraction of one
  // population with itself. `FigureCell` documents that omission as a
  // statement rather than an oversight.
  const share = k !== n
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, padding: '2px 0' }}>
        <span data-copy={share ? 'level' : 'figure'} style={{ fontFamily: FONT.mono, color: EMAIL.ink }}>
          {fmtInt(k)}{share ? ` of ${fmtInt(n)}` : ''}
        </span>{' '}
        {/* ONE OF THE TWO, AS THE APP ARM DOES. `label` and `basis` are the
            same words on the lead count — "17 posts published · posts
            published in September" — and the hero prints the basis because
            that is where the month is named. */}
        {hero ? count.basis : count.label}
      </div>
    )
  }
  if (hero) {
    return (
      <span className="flex min-w-0 items-baseline gap-2">
        <span data-copy="figure" className="font-mono text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{fmtInt(k)}</span>
        <span className="text-[12px] font-medium text-muted-foreground">{count.basis}</span>
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-[11.5px] text-muted-foreground">
      <span data-copy={share ? 'level' : 'figure'} className="font-mono text-[11px] tabular-nums text-secondary-foreground">
        {fmtInt(k)}{share ? ` of ${fmtInt(n)}` : ''}
      </span>
      <span>{count.label}</span>
    </span>
  )
}

/** One of the card's two movement rows — a banded comparison, with the band
 *  beside the word or neither. */
function Movement({ verdict, mode }: { verdict: Verdict; mode: RenderMode }) {
  const v = verdict
  const where = audiencePhrase(v.audience)
  // The numerators alone: the "of N" is the cell's own second line in the app
  // arm, and the email arm (no flex, Outlook lays out with Word) keeps them on
  // one line where they cannot break apart anyway.
  const now = fmtInt(v.value.k)
  const then = v.baseline ? fmtInt(v.baseline.k) : null
  if (mode === 'email') {
    return (
      <div data-copy="verdict" style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, padding: '2px 0' }}>
        {v.objectLabel} in {where}: <span data-copy="level" style={{ fontFamily: FONT.mono }}>{now} of {fmtInt(v.value.n)} videos</span>
        {then ? <> against <span data-copy="level" style={{ fontFamily: FONT.mono }}>{then} of {fmtInt(v.baseline!.n)}</span></> : null}
      </div>
    )
  }
  // THE LEVEL AND ITS "of N" ARE ONE CELL, WHICH IS WHAT `FigureCell` IS FOR.
  // Run as one sentence in a `justify-between` row, this printed "Durability in
  // your audience 26 of 84 videos against 23 / of 85" with the badge sitting in
  // the gap — a level whose denominator has wrapped to the next line, which is
  // the reading rule (b) exists to prevent. The label and the badge take the
  // first line; the two sides sit under them, each stacked and unbreakable.
  return (
    <span data-copy="verdict" className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[12px] text-secondary-foreground">{v.objectLabel} in {where}</span>
        <MovementBadge verdict={v} unit="pts" good="neutral" />
      </span>
      <span className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <FigureCell value={now} of={<>of {fmtInt(v.value.n)} videos</>} />
        {then ? (
          <>
            <span className="text-[11px] leading-[1.6] text-muted-foreground">against</span>
            <FigureCell value={then} of={<>of {fmtInt(v.baseline!.n)}</>} />
          </>
        ) : null}
      </span>
    </span>
  )
}

export const marketCard: Block<MarketSurfaceData> = {
  key: 'market.card',
  title: 'This month’s card',
  question: 'What did we publish, and what did we claim in it?',

  render(data, mode = 'app') {
    const card = data.moves.card
    const email = mode === 'email'
    const empty = marketCard.emptyState(data)
    if (!card) {
      return (
        <BlockFrame title={marketCard.title} question={marketCard.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    // THE BIGGEST BUCKET FIRST, EXCEPT THE ONE THAT IS NOT A HOOK. "not
    // classified" is the largest on most months and led the row, so the line
    // opened by saying what we could not read.
    const unread = (label: string) => /not classified|unclassified|unknown/i.test(label)
    const hooks = card.hooks
      .filter((h) => h.value.k > 0)
      .slice()
      .sort((a, b) => (unread(a.label) ? 1 : 0) - (unread(b.label) ? 1 : 0) || b.value.k - a.value.k)
    // THE ARTBOARD SHOWS TWO CLAIMS AND SEALAND PUBLISHED NINE, several of them
    // 200-character sentences. The card is a tile, not a list: the top few by
    // posts carried (`claimRows` is already sorted that way), and the rest are
    // counted in a line under them rather than dropped.
    const claims = card.claimRows.slice(0, CARD_CLAIMS_SHOWN)
    const moreClaims = card.claimRows.length - claims.length
    const posts = card.posts.value.n
    const movements = [card.movement.yours, card.movement.category].filter((v): v is Verdict => v != null)

    return (
      <BlockFrame
        title={marketCard.title}
        question={marketCard.question}
        mode={mode}
        meta="pre-filled from your posts"
        // THE PRESS, NAMED. See the header: the card is complete and the one
        // press that would turn it into a move is not built, so the slot the
        // artboard fills with a green button carries the sentence instead.
        footer={card.proposal ? data.moves.unlock : card.unread}
        footerNote={longMonth(card.month)}
      >
        <div className={email ? undefined : 'flex min-h-0 flex-1 flex-col justify-between gap-2.5'}>
          <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
            <Count count={card.posts} mode={mode} hero />
            <Count count={card.overFloor} mode={mode} />
          </div>

          {claims.length > 0 ? (
            email ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: EMAIL.ink2 }}>Claims you made</div>
                {claims.map((c, i) => (
                  <div key={c.quote?.ref ?? `claim-${i}`} style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, marginTop: 2 }}>
                    {/* THE CLIENT'S OWN WORDS, so a quote node: several real
                        claims carry a digit ("Made from 100% recycled sails")
                        and rule (a) may not police a quotation. The words are
                        `CardClaim.quote` — what was actually said, carried as
                        `k:<video_claims.id>` — never `video_claims.claim`,
                        which is the model's paraphrase and which E-main took
                        off this row in the same wave (code review C1/I6). A
                        row with no transcribed wording keeps its count and
                        says the wording is not on record. */}
                    {c.quote && c.quote.text.trim() ? (
                      <span data-copy="quote">“{claimText(c.quote.text)}”</span>
                    ) : (
                      <span style={{ color: EMAIL.muted }}>{CARD_CLAIM_UNQUOTED}</span>
                    )}{' '}
                    <span data-copy="level" style={{ fontFamily: FONT.mono, color: EMAIL.muted }}>{fmtInt(c.posts.k)} of {fmtInt(c.posts.n)} posts</span>
                  </div>
                ))}
                {moreClaims > 0 ? (
                  <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>
                    {fmtInt(moreClaims)} more {moreClaims === 1 ? 'claim was' : 'claims were'} made on these posts.
                  </div>
                ) : null}
              </div>
            ) : (
              <TileBlock className="flex min-w-0 flex-col gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">Claims you made</span>
                {claims.map((c, i) => (
                  <span key={c.quote?.ref ?? `claim-${i}`} className="flex items-baseline justify-between gap-3">
                    {/* TWO CLAIMS SHARING THEIR FIRST FORTY-FIVE CHARACTERS
                        PRINTED AS THE SAME ROW. `truncate` is one line and the
                        card is five columns wide, so Sealand's two longest
                        claims rendered identically with no way to see either in
                        full. Two lines, and the whole claim in the tooltip for
                        a mouse — the words are the CLIENT'S OWN, not a
                        measurement basis, so a tooltip is a convenience here
                        rather than the only route to a number. THREE lines and
                        not two: Sealand's two longest claims agree for their
                        first 150 characters and diverge only in the third
                        ("…gear that is good for people" against "…gear that
                        benefits people"), so at two lines they still printed
                        as one row twice. */}
                    {c.quote && c.quote.text.trim() ? (
                      <span data-copy="quote" title={c.quote.text} className="line-clamp-3 min-w-0 text-[12.5px]">“{claimText(c.quote.text)}”</span>
                    ) : (
                      <span className="line-clamp-3 min-w-0 text-[12.5px] text-secondary-foreground">{CARD_CLAIM_UNQUOTED}</span>
                    )}
                    <span data-copy="level" className="shrink-0 whitespace-nowrap font-mono text-[11.5px] tabular-nums text-secondary-foreground">
                      {fmtInt(c.posts.k)} of {fmtInt(c.posts.n)} posts
                    </span>
                  </span>
                ))}
                {moreClaims > 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    {fmtInt(moreClaims)} more {moreClaims === 1 ? 'claim was' : 'claims were'} made on these posts.
                  </span>
                ) : null}
              </TileBlock>
            )
          ) : null}

          {hooks.length > 0 ? (
            <div className={email ? undefined : 'flex items-baseline justify-between gap-3'}>
              <span className={email ? undefined : 'text-[12px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}>Hooks</span>
              {/* THE DENOMINATOR ONCE, AT THE HEAD OF THE LINE. Every hook on
                  this row is a share of the same month's posts, so it is stated
                  where a reader meets it rather than repeated four times. The
                  split is the product's own taxonomy (`hook_style`), never the
                  artboard's "on-screen text / spoken", which is how WE read a
                  video and not where its hook was. */}
              {email ? (
                <span data-copy="level" style={{ fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.ink2 }}>
                  of {fmtInt(posts)} posts: {hooks.map((h) => `${h.label} ${fmtInt(h.value.k)}`).join(' · ')}
                </span>
              ) : (
                // ONE LEVEL NODE, WRAPPING IN WHOLE BUCKETS. Run as a single
                // right-aligned string it broke wherever the line ran out —
                // "a / bold claim 1" — and led with the largest bucket, which
                // is "not classified": the one bucket that says nothing about
                // a hook. The denominator stays at the head of the line, which
                // is what makes the whole node a level; each bucket is its own
                // unbreakable span, and the unclassified one goes last.
                <span
                  data-copy="level"
                  className="flex min-w-0 flex-wrap justify-end gap-x-2 gap-y-0.5 text-right font-mono text-[11.5px] leading-[1.35] tabular-nums text-secondary-foreground"
                >
                  <span className="whitespace-nowrap">of {fmtInt(posts)} posts:</span>
                  {hooks.map((h, i) => (
                    <span key={h.label} className="whitespace-nowrap">
                      {i > 0 ? '· ' : ''}{h.label} {fmtInt(h.value.k)}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ) : null}

          <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
            <div className={email ? undefined : 'flex items-baseline justify-between gap-3'}>
              <span className={email ? undefined : 'text-[12px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}>Subjects matched</span>
              {card.subjects.length > 0 ? (
                <span className={email ? undefined : 'flex shrink-0 flex-wrap justify-end gap-1.5'}>
                  {card.subjects.map((s) => (
                    <span
                      key={s.subjectId}
                      data-copy="level"
                      className={email ? undefined : 'rounded-full bg-inner px-2 py-0.5 text-[11.5px] font-medium text-secondary-foreground'}
                      style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2, marginRight: 8 } : undefined}
                    >
                      {s.label} {fmtInt(s.matched.k)} of {fmtInt(s.matched.n)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className={email ? undefined : 'shrink-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
                  {card.subjectsUnread ? 'not read' : 'none'}
                </span>
              )}
            </div>
            <p
              className={email ? undefined : 'm-0 text-[11px] leading-[1.35] text-muted-foreground'}
              style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}
            >
              {/* WHICH POSTS THE SUBJECT ROWS ARE A SHARE OF (D15). It is not
                  the posts published — a subject match comes off analysis, and
                  most of a month's posts are not analysed on the day this is
                  read. */}
              Counted over {card.subjectsBasis}.{card.subjectsUnread ? ` ${card.subjectsUnread}` : ''}
            </p>
          </div>

          {movements.length > 0 ? (
            <div className={email ? undefined : 'flex min-w-0 flex-col gap-1 border-t border-border/70 pt-2'}>
              {movements.map((v) => <Movement key={`${v.objectKind}:${v.objectId}:${v.audience}`} verdict={v} mode={mode} />)}
            </div>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  // NO FIGURES. Every number on this card is a count of the client's OWN posts
  // and of the claims in them — a reading of what they published, not of the
  // conversation. The two movement rows carry their counts inside their own
  // verdicts, which is where a comparison's figures belong.
  figures(): FigureTable {
    return {}
  },

  // AND THOSE TWO ROWS ARE DECLARED. A block that puts a `MovementBadge` on
  // the page and declares no `verdicts()` hands a brief a page whose movement
  // claims its own reading cannot see (`blockAnswers` → `blockReading`).
  verdicts(data): Verdict[] {
    const card = data.moves.card
    if (!card) return []
    return [card.movement.yours, card.movement.category].filter((v): v is Verdict => v != null)
  },

  // TWO ABSENCES, TWO SENTENCES. A month with no card at all is not a card
  // whose press is missing, and `MoveCandidate.unread` already tells the second
  // from the third.
  emptyState(data) {
    return data.moves.card
      ? null
      : 'The card is filled in from your own posts, and none have been read for this month yet.'
  },
}

/** What the card would declare, for a caller that wants to know whether the
 *  press has anything to act on. Exported so the ways block and this block
 *  cannot disagree about whether the card is complete. */
export const cardIsDeclarable = (card: MoveCandidate | null): boolean => Boolean(card?.proposal)
