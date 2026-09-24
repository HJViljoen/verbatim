import type { CSSProperties } from 'react'
import { CrowdFigure, type FigureKey } from '@/components/crowd-figure'

// Ask's crowd (restored 2026-09-24). The ring of people that stood around the
// old non-scrolling stage (`components/agent-stage.tsx`, deleted by the E-ask
// port in 6e737398) — brought back as a BACKDROP to the tile layout, not as the
// stage. MASTER rule 6: the crowd left the app shell, and "the Agent landing
// may keep it"; this is that keep, scoped to Ask's own shell (`AskShell`) and
// nowhere else.
//
// WHERE IT SITS. `position: fixed` over the content pane — right of the
// sidebar, full height — at `z-index: -1` inside <main>'s stacking context, so
// every tile (opaque white, ambient shadow) paints over it and the crowd only
// shows in the gutters and around the page's edges. Fixed rather than absolute
// because <main> is the scroll container: an absolute layer would scroll away
// with the tiles, or add its own height to the scroll. Fixed contributes
// nothing to layout or to the scroll range. `.ask-crowd` in globals.css holds
// the geometry and the sidebar offset.
//
// THE FIELD. Concentric rings whose DENSITY falls as they go out — thick near
// the centre, stragglers in the corners (bc8ef56d, ef078b12 argue the numbers):
//
//   ring   radius   figures   per unit arc
//   0      0.85     20        23.5
//   1      1.20     18        15.0
//   2      1.60     15         9.4
//   3      2.05     12         5.9
//   4      2.55      9         3.5
//   5      3.10      6         1.9
//
// Flattened (rx/ry ~1.58) because a ring of people standing around you IS an
// ellipse on a flat page. Positions come from a fixed sin-based hash, never
// Math.random, so the server and the client agree and hydration does not tear.

/** Deterministic jitter in (-1, 1) — identical on both sides of hydration. */
function wobble(i: number, salt: number): number {
  return (Math.sin(i * 12.9898 + salt) * 43758.5453) % 1
}

const VARIANTS: FigureKey[] = ['a', 'b', 'c', 'e']

/** Base ellipse, in rem, before the responsive --ring multiplier. */
const RX = 15
const RY = 9.5

const RINGS = [
  { r: 0.85, n: 20, alpha: 0.175 },
  { r: 1.2, n: 18, alpha: 0.15 },
  { r: 1.6, n: 15, alpha: 0.12 },
  { r: 2.05, n: 12, alpha: 0.092 },
  { r: 2.55, n: 9, alpha: 0.068 },
  { r: 3.1, n: 6, alpha: 0.048 },
]

interface Placed {
  x: number
  y: number
  scale: number
  opacity: number
  variant: FigureKey
  lean: number
  delay: number
}

let seq = 0
const RING: Placed[] = RINGS.flatMap((ring, ri) =>
  Array.from({ length: ring.n }, (_, i) => {
    const k = seq++
    // Each ring is rotated off its neighbour so the figures do not line up into
    // spokes, and jittered so the rings do not read as concentric bands.
    const offset = ri * 0.37
    const angle = ((i + offset + wobble(k, 3.1) * 0.35) / ring.n) * Math.PI * 2 - Math.PI / 2
    const rx = RX * ring.r * (1 + wobble(k, 1.7) * 0.09)
    const ry = RY * ring.r * (1 + wobble(k, 5.3) * 0.09)
    const x = Math.cos(angle) * rx
    const y = Math.sin(angle) * ry
    // -1 at the back of the ring, +1 at the front.
    const near = (y / ry + 1) / 2
    return {
      x,
      y,
      // Front of the ring is nearer, so larger; outer rings are further into
      // the haze, so smaller again — that turns concentric ellipses into distance.
      scale: (0.5 + 0.34 * near) * (1 - ri * 0.055),
      opacity: ring.alpha * (0.72 + 0.5 * near),
      variant: VARIANTS[k % VARIANTS.length],
      lean: wobble(k, 9.1) * 3.5,
      // Rippling outward: the inner ring makes room first, the stragglers last.
      delay: 0.04 + ri * 0.05 + near * 0.12,
    }
  }),
)

/**
 * The ambient crowd behind Ask. Never interactive, never read aloud.
 *
 * `enter` plays the ripple-outward entrance (motion-safe only — the static
 * state IS the arrived ring, so reduced motion gets the finished crowd). Only
 * the index's loading skeleton passes it: the skeleton is what paints first on
 * arrival, and the page that replaces it draws the same ring already arrived,
 * at the same fixed coordinates, so the crowd opens once and does not snap
 * back to the centre when the tiles land. Threads never replay it.
 */
export function AskCrowd({ enter = false }: { enter?: boolean }) {
  return (
    <div className="ask-crowd" data-enter={enter ? '' : undefined} aria-hidden>
      {RING.map((f, i) => (
        <div
          key={i}
          className="ask-crowd-figure"
          style={
            {
              '--rx': `${f.x.toFixed(2)}rem`,
              '--ry': `${f.y.toFixed(2)}rem`,
              '--s': f.scale.toFixed(3),
              '--o': f.opacity.toFixed(3),
              animationDelay: `${f.delay.toFixed(2)}s`,
            } as CSSProperties
          }
        >
          <CrowdFigure personaKey={`ring-${i}`} variant={f.variant} lean={f.lean} className="h-28 w-auto text-primary" />
        </div>
      ))}
    </div>
  )
}
