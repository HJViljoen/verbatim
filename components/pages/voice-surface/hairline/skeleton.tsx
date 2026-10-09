import { surface } from '@/lib/nav'
import './hairline.css'

// DESIGN TEST (Hairline look; see ./body.tsx): the variant's own loading
// skeleton, so a navigation inside the test does not flash the shipped page's
// skeleton (app/dashboard/voice/loading.tsx). It mirrors ./body.tsx: the quiet
// bar, the centred hero, the index beside a tile of rows. Plain bones, no
// numbers, no fonts (it renders before the page's module loads).
export function HairlineSkeleton() {
  return (
    <div data-look="hairline" className="hl" aria-busy="true">
      <span role="status" className="hl-sr">Loading {surface('voice').label}…</span>
      <div className="hl-topbar">
        <span className="hl-bone" style={{ width: 150, height: 14 }} />
      </div>
      <div className="hl-hero">
        <span className="hl-bone" style={{ width: 'min(100%, 380px)', height: 30 }} />
        <span className="hl-bone" style={{ width: 'min(80%, 240px)', height: 30, marginTop: 10 }} />
        <span className="hl-bone" style={{ width: 'min(100%, 420px)', height: 12, marginTop: 22 }} />
        <span className="hl-bone" style={{ width: 'min(90%, 360px)', height: 12, marginTop: 10 }} />
        <span className="hl-bone" style={{ width: 'min(100%, 300px)', height: 36, marginTop: 28, borderRadius: 9 }} />
      </div>
      <div className="hl-body">
        <div className="hl-shelves" aria-hidden />
        <div className="hl-main">
          <span className="hl-bone" style={{ width: 240, height: 14 }} />
          <div className="hl-tile hl-skel-tile">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="hl-skel-row">
                <span className="hl-bone" style={{ width: `${46 + ((i * 17) % 30)}%`, height: 12 }} />
                <span className="hl-bone" style={{ width: 32, height: 12 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
