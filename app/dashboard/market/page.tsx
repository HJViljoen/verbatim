import { SurfaceShell } from '@/components/shell/surface-shell'

// Market — "what should we do, and is it working?" The address Market
// Intelligence used to hold; that page is parked at /dashboard/market-intel
// until 30 Nov 2026 and still answers. WP14 fills this one, and takes the
// legacy `?rec=<id>` alias with it — four sent emails and every digest until
// WP17 carry that parameter.

export default function Page() {
  return <SurfaceShell nav="market" />
}
