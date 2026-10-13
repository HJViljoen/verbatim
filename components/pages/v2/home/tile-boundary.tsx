'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

// ONE TILE'S ERROR BOUNDARY (Design v2, T8; the fresh check). `settleTile`
// turns a failed READ into the tile's failure line, but a tile can still throw
// while it DRAWS (a shape the view did not expect), and a throw with no
// boundary under the page reaches app/dashboard/error.tsx, which takes the
// whole page. This holds it to its tile: the tile's own failed drawing
// (`fallback`, the view given `{ state: 'failed' }`) in its place, the rest of
// the page as it was. A client component because only a client component can
// be an error boundary; it draws nothing of its own.

export class TileBoundary extends Component<{ name: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[pages] home.${this.props.name} drawing: ${error.message}`, info.componentStack ?? '')
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
