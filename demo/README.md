# SocialLens — Demo & Reference Artifacts

This folder holds the **Össur demo** and its supporting docs. These are **static design/content references** — hand-built HTML with realistic mock data. They are **not** the live product (that's the Next.js app in the repo root) and are not wired to Supabase, Apify, or any real data.

## Why it's here

The demo was originally built in a Claude local-agent session and lived only in a temporary session-output folder:

```
~/Library/Application Support/Claude/local-agent-mode-sessions/98f6dac4-…/outputs/
```

That location is ephemeral and can be cleaned up. **Rescued into the repo on 2026-06-27** so it's git-backed and sits next to the app it's the blueprint for. Source built 7 May 2026.

## Contents

| Item | What it is |
|---|---|
| `ossur-demo/` | The interactive demo — 5 product pages + the weekly-report email, v4.1-schema-aligned mock data. See `ossur-demo/README.md` for the page-by-page walkthrough and run instructions. |
| `Ossur-Demo-Spec.md` | The spec the demo was built to — v4.1 schema alignment, page-by-page content definition. Reference if anyone questions data shape. |
| `Ossur-Meeting-Prep.md` | Meeting prep notes for the Össur walkthrough (talking points, demo order, objection handling). |

## How to run the demo

```bash
cd demo/ossur-demo
python3 -m http.server 8000
# open http://localhost:8000
```

Or just double-click `ossur-demo/index.html`. No build step — plain HTML + CSS + vanilla JS. Click "Sign in" to enter the dashboard.

## Relationship to the live app

The demo is the **design + content target**: what the product should look and read like. The live Next.js app (`app/dashboard/…`) is the real implementation catching up to it, running on real pipeline data. Where the two diverge, the demo shows the intended end state — but it is illustrative, not a contract. Every demo page carries a `Demo · Illustrative data` watermark.
