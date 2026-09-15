import type { NextConfig } from "next";

// The apex used to 307 here to the app. It now serves the marketing site,
// routed by host in proxy.ts. Config-level redirects run BEFORE the proxy, so
// this file must stay out of the way of that routing.
const nextConfig: NextConfig = {
  // Building inside a git worktree (Phase 1, 2026-09-15). `node_modules` in a
  // worktree is a symlink out of the project root, and Turbopack resolves
  // modules only inside the root it auto-detects from the nearest lockfile —
  // so the default `next build` panics there with "Symlink … invalid". Next's
  // own fix is `turbopack.root` set to a directory containing BOTH the
  // worktree and the real `node_modules`
  // (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md).
  // A hard-coded absolute path must never reach Vercel, so it is env-gated:
  // unset (which is every deploy) the key is absent and nothing changes.
  //   TURBOPACK_ROOT=/Users/heinrichviljoen/Documents/code npx next build
  // `npx next build --webpack` is the zero-config fallback; see README,
  // "Working in a worktree".
  ...(process.env.TURBOPACK_ROOT ? { turbopack: { root: process.env.TURBOPACK_ROOT } } : {}),
  // Reports & Exports (2026-08-29): the export route prints pages with
  // puppeteer-core + @sparticuz/chromium. Next 16 already leaves both packages
  // unbundled (they are on its built-in serverExternalPackages list); listed
  // here anyway so that stays true if the default list changes. The brotli
  // Chromium pack is read at runtime, which the file tracer cannot see, so it
  // is included by hand — for the two routes that launch a browser only.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/export': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    // Route globs are picomatch: the brackets of a dynamic segment must be escaped.
    '/api/artifacts/\\[id\\]': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    // Stage 2: building a report prints it too.
    '/api/reports/\\[id\\]/build': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    // Stage 3: a schedule prints its PDF and the email's PNGs; the ops hook can too.
    // react-dom/server is loaded at runtime for the email body (lib/email/render-html.ts).
    '/api/admin/documents/render': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/admin/schedules/run': ['./node_modules/@sparticuz/chromium/bin/**/*', './node_modules/react-dom/**/*'],
    // A scheduled document's delivery: it re-prints a stale PDF and renders the email body.
    '/api/admin/schedules/deliver': ['./node_modules/@sparticuz/chromium/bin/**/*', './node_modules/react-dom/**/*'],
    '/api/admin/send-report': ['./node_modules/@sparticuz/chromium/bin/**/*', './node_modules/react-dom/**/*'],
    '/api/schedules/\\[id\\]/send': ['./node_modules/@sparticuz/chromium/bin/**/*', './node_modules/react-dom/**/*'],
    '/api/schedules/\\[id\\]/preview': ['./node_modules/react-dom/**/*'],
  },
  // Share links (Stage 2): a public, read-only page nobody should index. The
  // page sets metadata.robots as well; this is the header form for crawlers
  // that read headers before HTML.
  async headers() {
    return [{ source: '/r/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }]
  },
  experimental: {
    // Client router cache. Every dashboard route is dynamic (cookies), and the
    // default for dynamic segments is 0s — so going Dashboard → Voice → back
    // to Dashboard re-rendered the whole page on the server each time, ~25
    // DB requests and all. The data behind these pages changes once per
    // update (weekly), not per click; a minute of staleness on a revisit is
    // invisible, and the revisit becomes instant. Loading boundaries are
    // cached for the `static` window, so the prefetched skeleton paints the
    // moment a link is clicked.
    staleTimes: { dynamic: 60, static: 300 },
  },
};

export default nextConfig;
