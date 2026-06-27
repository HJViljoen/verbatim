# Össur Demo — SocialLens

Self-contained interactive demo for the Össur meeting. Five product pages plus the weekly report email, all v4.1 schema-aligned, all populated with realistic prosthetics-tailored mock data.

## How to run

**Easiest:** double-click `index.html` — opens in your default browser. Click "Sign in" to enter the dashboard.

**Cleaner (recommended for the meeting):** serve over localhost so the URL bar shows `http://localhost:8000/dashboard.html` rather than `file://...`. Run from the `ossur-demo/` folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in Chrome / Safari.

No `npm install`, no build step. Everything is plain HTML + CSS + vanilla JS, plus Google Fonts (loaded via CDN — needs internet, but you can swap to system fonts if presenting offline).

## What's in the demo

| Page | File | What it shows |
|---|---|---|
| Login | `index.html` | Decorative — clicking "Sign in" goes to dashboard |
| Dashboard | `dashboard.html` | KPI strip, sentiment donut, SOV bar, featured recommendation hero, top 3 insights |
| Market Intelligence | `market-intelligence.html` | 5 strategic insights + 6 recommendations with type badges and confidence/opportunity scores |
| Voice of Customer | `voice-of-customer.html` | 8 category tabs, theme cards with verbatim mock quotes, filter sidebar |
| Content Analysis | `content-analysis.html` | Top hook styles, top formats, competitor gap, recommended hooks, 30-row video catalog |
| Reports | `reports.html` | Weekly report archive list + inline preview iframe |
| Weekly Report | `weekly-report.html` | The actual email — printable to PDF (button top right) |

## Demo walkthrough order (suggested)

1. **Login** — quick anchor that this is a real product
2. **Dashboard** — open with the numbers strip, talk through sentiment, land on the featured recommendation as the moment that signals "actionable, not just descriptive"
3. **Market Intelligence** — the core value page. Walk through one insight + one recommendation showing the confidence/opportunity scoring
4. **Voice of Customer** — click 1-2 tabs (pain_point, question), expand a theme to show verbatim quotes. This is the "we're reading your customers" proof
5. **Content Analysis** — the hook/format angle. The "Recommended hooks to test" card and "What competitors do that you don't" are the high-impact moments for marketing teams
6. **Reports** — open the weekly report email inline. Mention they receive this even if no one logs in
7. **Weekly Report (full view)** — click "Open in new tab" and walk through the email itself. End the demo here — it's a take-home artifact

## After the meeting

- Email recipients get the **weekly report PDF** (open `weekly-report.html`, click "Print to PDF")
- Don't share a hosted URL until/unless they commit
- Spec doc `Ossur-Demo-Spec.md` (in the parent folder) is your reference if anyone asks for v4.1 alignment proof

## Mock data is in `data.js`

If you want to tweak any numbers or quotes before the meeting, edit `data.js` directly — every field is labelled and references the v4.1 schema field it corresponds to. No build step; refresh the browser.

## Files

```
ossur-demo/
├── index.html              login page
├── dashboard.html
├── market-intelligence.html
├── voice-of-customer.html
├── content-analysis.html
├── reports.html
├── weekly-report.html      standalone email — print to PDF
├── styles.css              shared SocialLens design system
├── data.js                 mock data, v4.1 schema-shaped
├── app.js                  shared sidebar + chart helpers
└── README.md               this file
```

## Watermark

Every page has a `Demo · Illustrative data` pill in the bottom-right corner. The weekly report watermark hides on print so the PDF is clean.
