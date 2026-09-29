import {
  themes,
  faceOff,
  faceOffOwns,
  personas,
  type Theme,
  type FaceOffRow,
  type BriefLine,
  type Persona,
  type StreamQuote,
} from '../_data/sample'

// Shared product-surface markup, extracted from the home page (app/site/page.tsx)
// so the playbook articles (app/site/_components/playbook-visual.tsx) can reuse
// the exact same visuals pixel-for-pixel. Every component here is server-side,
// props-driven, and renders the same class names the home page always has —
// nothing here changes the home page's own output when `static*` props are left
// at their defaults (false).
//
// Some CSS rules only reveal these visuals once an ancestor carries `.is-on`
// (added by the client-only <Reveal> wrapper on scroll, home page only). The
// playbook pages don't animate on scroll (DESIGN.md, playbooks plan §4:
// "reading pages don't move"), so each component below takes an optional
// `staticReveal` prop that inlines the revealed end-state directly, bypassing
// the CSS gate without needing <Reveal> or any JS.

/** One streaming quote card. Same markup as the home page's local `Quote`. */
export function QuoteCard({ q, dup }: { q: StreamQuote; dup?: boolean }) {
  const body = q.mark
    ? (() => {
        const i = q.text.indexOf(q.mark)
        return (
          <>
            {q.text.slice(0, i)}
            <mark>{q.mark}</mark>
            {q.text.slice(i + q.mark.length)}
          </>
        )
      })()
    : q.text
  return (
    <div className={`q${dup ? ' dup' : ''}`} aria-hidden={dup ? 'true' : undefined}>
      <p className="voice">“{body}”</p>
      <p className="src">{q.src}</p>
    </div>
  )
}

const BRIEF_ICON: Record<BriefLine['kind'], string> = { in: '+', ask: '?', reply: '↩', new: '+', do: '' }

/** One `.brief .d` row. `do`-kind lines render their parts as plain text (no
 * underline), every other kind wraps the highlighted parts in `<u>` — matching
 * the home page's two separate render passes exactly. No row carries an arrow:
 * the product reports what came in, never that something went up or down. */
export function BriefRow({ line }: { line: BriefLine }) {
  return (
    <div className="d">
      <i className={line.kind === 'do' ? undefined : 'mark'}>{BRIEF_ICON[line.kind]}</i>
      <span>
        {line.kind === 'do'
          ? line.parts.map((p) => (typeof p === 'string' ? p : p.u))
          : line.parts.map((p, j) => (typeof p === 'string' ? p : <u key={j}>{p.u}</u>))}
      </span>
    </div>
  )
}

/** The desktop theme map (`.tmap`), sized by videos. Levels only: no theme
 *  carries a direction word. */
export function ThemeMapGrid({ items = themes, staticReveal = false }: { items?: Theme[]; staticReveal?: boolean }) {
  return (
    <div className="tmap">
      {items.map((t, i) => (
        <div
          key={t.label}
          className={`t${t.big ? ' big' : ''}${t.you ? ' you' : ''}`}
          style={{
            gridColumn: `span ${t.col}`,
            gridRow: `span ${t.row}`,
            ['--i' as string]: i,
            ...(staticReveal ? { opacity: 1, transform: 'none' } : {}),
          }}
        >
          <b>{t.label}</b>
          <small>
            <span>
              {t.videos}
              {i === 0 ? ' videos' : ''}
            </span>
          </small>
        </div>
      ))}
    </div>
  )
}

/** The face-off legend + rows (`.face .head`, `.face .row`), without the owns pair. */
export function FaceOffLegendRows({ rows = faceOff, staticReveal = false }: { rows?: FaceOffRow[]; staticReveal?: boolean }) {
  return (
    <>
      <div className="head">
        <span />
        <span className="legend">
          <span><i style={{ background: 'var(--green)' }} />You</span>
          <span><i style={{ background: 'var(--orange)' }} />A rival</span>
          <span><i style={{ background: '#C5CBD1' }} />The category</span>
        </span>
      </div>
      {rows.map((row, ri) => (
        <div className="row" key={row.label}>
          <span className="lbl">{row.label}</span>
          <div className="bars">
            {row.you && (
              <div className="bar you">
                <i style={{ ['--w' as string]: `${row.you.pct}%`, ['--i' as string]: ri * 3, ...(staticReveal ? { width: `${row.you.pct}%` } : {}) }} />
                <em>{row.you.text}</em>
              </div>
            )}
            <div className="bar them">
              <i style={{ ['--w' as string]: `${row.them.pct}%`, ['--i' as string]: ri * 3 + 1, ...(staticReveal ? { width: `${row.them.pct}%` } : {}) }} />
              <em>{row.them.text}</em>
            </div>
            {row.cat && (
              <div className="bar cat">
                <i style={{ ['--w' as string]: `${row.cat.pct}%`, ['--i' as string]: ri * 3 + 2, ...(staticReveal ? { width: `${row.cat.pct}%` } : {}) }} />
                <em>{row.cat.text}</em>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  )
}

/** Where the rival's talk stands out (`.face .owns`). Brands reads this for
 *  the brands you track, so there is no "yours" beside it unless a caller
 *  passes one. */
export function FaceOffOwnsBlock({ owns = faceOffOwns }: { owns?: typeof faceOffOwns }) {
  return (
    <div className="owns">
      <div className={owns.you ? 'own' : 'own wide'}>
        <b>{owns.them.title}</b>
        <span className="voice">“{owns.them.quote}”</span>
      </div>
      {owns.you && (
        <div className="own">
          <b>{owns.you.title}</b>
          <span className="voice">“{owns.you.quote}”</span>
        </div>
      )}
    </div>
  )
}

/** The full face-off panel body (legend + rows + owns), as the home page renders it. */
export function FaceOffPanel({ staticReveal = false }: { staticReveal?: boolean }) {
  return (
    <div className="face">
      <FaceOffLegendRows staticReveal={staticReveal} />
      <FaceOffOwnsBlock />
    </div>
  )
}

/** One `.persona` card, as Conversation's "Who is talking" draws a group:
 *  name, videos (the bar against the largest group, never a share of a
 *  month), the one line, where they talk, and one voice. */
export function PersonaCard({ persona, index = 0, staticReveal = false }: { persona: Persona; index?: number; staticReveal?: boolean }) {
  const max = Math.max(...personas.map((p) => p.videos))
  const w = `${Math.round((persona.videos / max) * 100)}%`
  return (
    <div className="persona">
      <div className="name">{persona.name}</div>
      <div className="share">
        <i style={{ ['--w' as string]: w, ['--i' as string]: index, ...(staticReveal ? { width: w } : {}) }} />
      </div>
      <div className="pct">{persona.videos.toLocaleString('en-GB')} videos, read to date</div>
      <p className="line">{persona.line}</p>
      <div className="mix">{persona.platforms}</div>
      <p className="said">“{persona.quote}”</p>
    </div>
  )
}
