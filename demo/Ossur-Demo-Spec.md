# Ossur Demo — Specification for Approval

**Goal:** Walk Ossur through SocialLens as it will exist in v4.1 — pages, weekly report, and the content/hooks angle. All mock data, all aligned to the v4.1 schema and pass structure. Take-it-or-leave-it framing on price + timeline at the end.

**Source-of-truth alignment:** Every field, badge, score, and label below maps to a real v4.1 schema field per `Architecture/Data-Dictionary.md`. Source codes used: `A` Apify, `M` metrics, `PA` Pass A, `A2` clustering, `PC` Pass C, `PD` Pass D, `S` run_summary, `T` report templating.

**Mock data anchor — Ossur:** Iceland-based prosthetics. Competitor tracked: Ottobock. Regions: ZA, IN, BR. Platforms: TikTok + YouTube + Instagram. Real brand product names used in mocks (Pro-Flex, Power Knee, Cheetah running blade, Symbionic) for plausibility. Ottobock product names used the same way (C-Leg, Genium, Empower).

---

## 1. Pages In Scope

Five product pages plus the weekly report. Depth over breadth — polished beats comprehensive.

| # | Page | Why included |
|---|---|---|
| 1 | Dashboard | First impression. Anchors with concrete numbers. |
| 2 | Market Intelligence | The core value page. This is what justifies the price. |
| 3 | Voice of Customer | Tangible "we read your customers" proof. |
| 4 | Content Analysis | Houses the hooks/formats angle — likely the moment that lands hardest with their marketing team. |
| 5 | Reports | Browsable archive of past weekly emails (the "you don't even need to log in" promise). |

(Settings page cut per 2026-05-07 review. Configurability handled verbally if asked.)

**Out of scope (and why):**
- **Trends** — hidden from v1 sidebar entirely (decided 2026-04-30, requires v5 theme genealogy to be meaningful).
- **Competitive Intelligence as standalone page** — Ottobock comparison data folded into Market Intelligence and Voice of Customer instead. One less page to build, comparison still present.
- **AI Agent** — strategic differentiator but not built. Mention verbally as "coming," don't fake it.
- **Settings** — cut from demo. Configurability mentioned verbally if asked.

---

## 2. Page-by-Page Spec

### 2.1 Dashboard

**Purpose (per Data Dictionary §2):** At-a-glance command centre. First page after login.

**Mock data — KPI strip (top row):**

| KPI card | Mock value | Source field |
|---|---|---|
| Total videos analysed | 247 | `run_summary.total_videos` (M) |
| Total comments analysed | 8,431 | `run_summary.total_comments` (M) |
| Avg engagement rate | 6.8% | `run_summary.avg_engagement_rate` (M) |
| Top video views | 1.4M | `run_summary.top_video_views` (M) |
| Platforms covered | TT / YT / IG icons | `run_summary.platforms_covered` (M) |
| Run status | "Complete · Apr 28, 2026" | `pipeline_runs.status` + `completed_at` (SYS) |

**Sentiment overview (donut chart):**
- Positive 64%, Neutral 23%, Negative 13% → `run_summary.overall_sentiment_*` (PA aggregated)
- Caption: "Sentiment driven by personal-story content; negativity concentrated in cost/insurance threads." → `run_summary.sentiment_drivers` (PA aggregated)

**Share of voice (mini bar):**
- Ossur 38% / Ottobock 41% / Industry-other 21% → `run_summary.share_of_voice` (M)
- Caption: "Ottobock leads on YouTube; Ossur leads on TikTok and Instagram."

**Top 3 insights preview (list, links to Market Intelligence):** → `run_summary.top_insights` (PD). Plain titles only on the dashboard — type badges live on the Market Intelligence page.
1. "Insurance-denial content drives 3x engagement of product features"
2. "Strong unmet demand for affordable cosmetic covers — neither brand serves this"
3. "Pediatric content gap: Ottobock dominates, Ossur near-silent"

**Featured recommendation (hero card):** → `recommendations` top row, `priority='high'` (PD)
- Title: "Launch an insurance-navigation content series"
- Type badge: `content_idea`
- Reasoning: "Insurance-denial and pre-authorisation content generated 12.4% average engagement across 247 videos analysed — 3x the average for product-led posts. No tracked brand currently produces content in this space, so the topic is uncontested. Recommended lane: short explainer videos on denial reasons, appeal templates, and prosthetist letters of medical necessity. Goodwill-positive (helping users vs. selling), and the content compounds across regions because insurance friction is universal."
- Status pill: "New" (U-editable: new / acknowledged / acted_on / dismissed)
- Footer chip: based on Market Insight #1 (`industry_signal: insurance-denial content gets 3x engagement`)

**WoW deltas:** Hidden — only one run, P5 not built. Per Data Dictionary spec: "Hidden until 2nd run."

---

### 2.2 Market Intelligence (CORE VALUE PAGE)

**Purpose (per Data Dictionary §2):** Strategic insights and recommendations with reasoning + evidence. This is what justifies the price.

**Layout:** Two stacked sections — Market Insights (top), Recommendations (below). Each item is a card.

**Mock Market Insights** → `market_insights` table (PD):

**Card 1 — type badge: `industry_signal`**
- Title: "Insurance-denial content gets 3x the engagement of product features"
- Description: "Across 247 videos analysed, posts about insurance battles, denial reasons, and appeal processes generated an average engagement rate of 12.4% — vs. 4.1% for product-led content. Comments cluster around frustration with pre-authorisation and confusion about coverage. Neither Ossur nor Ottobock currently produce content in this space."
- Confidence: 9/10 · Opportunity: 9/10
- Supporting evidence (expandable): linked theme cards from Voice of Customer

**Card 2 — type badge: `unmet_need`**
- Title: "Strong unmet demand for affordable cosmetic covers"
- Description: "Cosmetic skin/cover content surfaces 47 times across the comment corpus, with strong purchase-intent language ('would buy if it didn't cost X', 'why aren't there more options'). Neither tracked brand has a content presence here."
- Confidence: 8/10 · Opportunity: 8/10

**Card 3 — type badge: `platform_pattern`**
- Title: "TikTok rewards emotion, YouTube rewards comparison"
- Description: "Personal-story and before-after hooks dominate top-performing TikTok content (avg 7.2% engagement). YouTube top performers are long-form product comparisons and educational content (avg 4.8% engagement, but 6x dwell time). Same audience, different intent per platform."
- Confidence: 9/10 · Opportunity: 7/10

**Card 4 — type badge: `cross_platform_synthesis`**
- Title: "Discovery → research → decision splits cleanly across platforms"
- Description: "Younger amputees (under 35) discover brands on TikTok, deepen research via YouTube comparison videos, and finalise the decision through their prosthetist. Comment language pattern: TikTok = 'I want this', YouTube = 'how does X compare to Y'."
- Confidence: 8/10 · Opportunity: 7/10

**Card 5 — type badge: `industry_signal`**
- Title: "Veterans community on TikTok is highly engaged but underserved"
- Description: "Veteran-creator content averages 9.1% engagement, well above category benchmark. Ossur appears in 4 such videos; Ottobock in 11. Comment sentiment is overwhelmingly positive on veteran-led content regardless of brand mentioned."
- Confidence: 7/10 · Opportunity: 8/10

**Mock Recommendations** → `recommendations` table (PD):

**Rec 1 — `content_idea` · priority: high** *(featured on Dashboard)*
- Title: "Launch an insurance-navigation content series"
- Reasoning: "Insurance-denial and pre-auth content generated 12.4% average engagement across the corpus — 3x product-led content. Uncontested category. Recommended lane: short explainer videos on denial reasons, appeal templates, prosthetist letters of medical necessity. Compounds across ZA / IN / BR because the friction is universal."
- Based on: Market Insight #1

**Rec 2 — `hook_strategy` · priority: high**
- Title: "Lead with personal-story hooks on TikTok"
- Reasoning: "Personal-story hooks averaged 4.2x engagement of product-led hooks across both Ossur and Ottobock content. Ossur's TikTok output is currently 38% product-led — an immediate optimisation lever."
- Based on: Market Insight #3 + Voice of Customer 'praise' theme

**Rec 3 — `urgent_topic` · priority: medium**
- Title: "Address sweating + skin-breakdown concerns directly"
- Reasoning: "Top pain points across the audience corpus, surfaced 78 times. No brand response exists. Practical liner-care content would fill an obvious gap."
- Based on: Voice of Customer top pain_point themes

**Rec 4 — `competitive_move` · priority: medium**
- Title: "Enter the pediatric content space Ottobock currently dominates"
- Reasoning: "Ottobock posts pediatric content 3.5x more frequently than Ossur. Comment audience for pediatric content includes parents researching options 12+ months out — long sales cycle but high-intent."
- Based on: Card 4

**Rec 5 — `audience_target` · priority: medium**
- Title: "Partner with veteran creators on TikTok"
- Reasoning: "Veteran-led content out-performs the category, sentiment is positive, and Ottobock has 2.7x the brand presence here. Underserved high-intent audience."
- Based on: Card 5

**Rec 6 — `platform_strategy` · priority: low**
- Title: "Invest in YouTube long-form Pro-Flex vs. competitor comparisons"
- Reasoning: "YouTube top performers are direct product comparisons. Ossur currently has none. Existing prosthetist-led education channels are a natural distribution partner."
- Based on: Card 3

---

### 2.3 Voice of Customer

**Purpose (per Data Dictionary §2):** What customers actually say, by intent. Drill from theme → quotes.

**Layout:** Tabs across the top for each `audience_insights.category` (PA enum). Cards below grouped under the active tab. Filter sidebar: platform / entity / emotion / sentiment.

**Tabs to populate (8 categories per v4.1 enum):** `pain_point`, `question`, `purchase_intent`, `feature_request`, `praise`, `objection`, `misinformation`, `demographic_signal`.

**Demo seed: 3 themes per tab, ~24 cards total. Below = priority cards on the default tab (`pain_point`):**

**Theme card 1 — pain_point**
- Theme: "Socket sweating in heat" (canonical label, derived in v4.1 from highest-strength insight in cluster)
- Description: "Recurring complaint across TikTok and Instagram comments — wearers describe daily socket sweating during ZA and BR summers, leading to skin issues and fit drift. No brand currently posts liner-care content."
- Entity badge: derived (most insights tagged `industry-other`, some `competitor: Ottobock`)
- Strength: 8/10 · Emotion: frustrated · Sentiment impact: negative
- Platform badges: TT, IG
- Evidence quotes (3, expandable, FK-grounded via `insight_evidence` → `comments`):
  - "this socket gets so hot in cape town summer i can't wear it past noon"
  - "anyone else's liner literally swimming by 2pm? gross"
  - "best advice my prosthetist gave me was 2 liners a day, game changer"

**Theme card 2 — pain_point**
- Theme: "Insurance pre-authorisation battles"
- Description: "High-emotion comment volume around denial letters, appeal processes, and pre-auth delays. Crosses regions and brands. Top driver of negative sentiment in the corpus."
- Strength: 9/10 · Emotion: angry · Sentiment impact: negative
- Evidence quotes: 3 verbatim mock comments

**Theme card 3 — pain_point**
- Theme: "Cost vs. perceived value gap"
- Description: "Cost-focused comments split between two camps: those who received a brand-name prosthetic via insurance and call it life-changing, and those paying out of pocket frustrated by the price-to-feature ratio."
- Strength: 8/10 · Emotion: disappointed · Sentiment impact: negative
- Evidence quotes: 3

**Other tabs — one feature card each, rest implied:**

| Tab | Featured theme | Emotion · Strength |
|---|---|---|
| question | "Can I swim with my prosthetic?" | curious · 7 |
| purchase_intent | "C-Leg vs Power Knee for active lifestyle" | hopeful · 8 |
| feature_request | "Waterproofing should be standard" | hopeful · 7 |
| praise | "First walk after Pro-Flex fit — life-changing" | joyful · 9 |
| objection | "Looks too obviously fake" | disappointed · 6 |
| misinformation | "Belief that running blades are illegal in everyday use" | confused · 5 |
| demographic_signal | "Younger amputees concentrated on TikTok, older on YouTube" | neutral · 7 |

**Drill-down behaviour (demo only walks through 1 example):** Clicking a theme expands evidence quotes. Each quote links to the `comments` row in the source video. Mock the modal with 3 quotes + their source video card.

---

### 2.4 Content Analysis (HOOKS / FORMATS HOME)

**Purpose (per Data Dictionary §2):** Full video catalog. Supporting page in v1 — but this is where the hook/format angle lives, so it gets featured treatment in the demo.

**Layout for demo:** Two sections.

**Top section — "Content Insights" summary cards (NEW structural addition for the demo):** This is the marketing-actionable framing of the underlying classification data. Built from `videos.classified_type`, `videos.hook_style`, `videos.hook_text`, `videos.topics` (all PA fields).

**Card A — Top performing hook styles (last 30 days)**

| Hook style (`videos.hook_style` enum) | Avg engagement | Volume | Top example |
|---|---|---|---|
| personal-story | 8.4% | 47 videos | "POV: first walk with my new leg" |
| before-after | 7.1% | 22 videos | "Day 1 vs Day 365 of having a prosthetic" |
| demonstration | 5.9% | 38 videos | "Watch me run for the first time in 5 years" |
| listicle | 4.2% | 19 videos | "Things people say when they see my prosthetic" |
| bold-claim | 3.8% | 11 videos | "Why prosthetics cost so much" |

**Card B — Top performing video formats (`videos.classified_type` enum)**

| Format | Avg engagement | Volume |
|---|---|---|
| testimonial / story | 7.8% | 51 videos |
| how-to | 6.2% | 34 videos |
| comparison | 5.6% | 18 videos |
| educational | 4.9% | 41 videos |
| promotional | 2.4% | 36 videos |

**Card C — What competitors are doing that you aren't (4 hook formats Ossur underweights):**
- Pediatric milestone content (kids fitting / first steps) — 14 competitor videos, 2 Ossur
- Knee adjustment / fitting walkthroughs — 9 competitor, 0 Ossur
- Prosthetist Q&A long-form — 7 competitor YouTube videos, 1 Ossur
- Adaptive sports event coverage — 6 competitor, 3 Ossur

**Card D — Recommended hooks to test this month (links to Recommendation 1 on Market Intelligence):**
1. "Things they don't tell you about [Ossur product]"
2. "Day 1 vs Day 365"
3. "POV: first time [activity] since amputation"

**Bottom section — Video catalog table:** Per Data Dictionary §2 schema. Columns: Platform · Account · Caption preview · Hook style · Hook text · Classified type · Topics · Sentiment · Views · Likes · Comments count · Engagement · Upload date · Comment quality score. Rows: 30 mock videos with realistic Ossur/Ottobock/industry creator accounts. Sortable. Click row → drill modal with comments (mocked, ~5 per video).

**Why this layout matters:** The "Content Insights" cards turn the Content Analysis page from a supporting reference table into a marketing-actionable view. If this lands well in the meeting, it's a signal to consider promoting Content Analysis up the build priority order — currently #5 — or moving the cards into Market Intelligence as a recommendation surface.

---

### 2.5 Reports

**Purpose (per Data Dictionary §2):** Browsable archive of past weekly emails.

**Layout:** Table with 4 mock past reports + an inline iframe preview when one is selected.

**Mock report list:** → `weekly_reports` table (T)

| Subject | Week range | Sent at | Sent to |
|---|---|---|---|
| Ossur weekly · 1.4M views, 8K comments, 5 strategic insights | Apr 22–28 | Apr 28 09:00 | marketing@ossur.com |
| Ossur weekly · sentiment up 4 pts, pediatric gap widening | Apr 15–21 | Apr 21 09:00 | marketing@ossur.com |
| Ossur weekly · top hook this week, Ottobock content surge | Apr 8–14 | Apr 14 09:00 | marketing@ossur.com |
| Ossur weekly · launch summary + first insights | Apr 1–7 | Apr 7 09:00 | marketing@ossur.com |

Click a row → renders the email HTML inline (see §3 for the report content).

---

### 2.6 Settings — CUT from demo

Removed per 2026-05-07 review. If they ask about configurability, answer verbally: clients control their own brand keywords, competitor names, industry keywords, platforms, and report cadence through a settings page.

---

## 3. Weekly Report Content

**Format:** HTML email, prosthetics-tailored, exportable to PDF for emailing after the meeting. Data Dictionary §2 page 7 + Architecture decision: "Email carries standalone value — must be valuable to a user who never logs in. 3–5 headline insights with evidence + featured recommendation + sentiment summary + dashboard CTA."

**Sections (in order):**

1. **Subject line:** "Ossur weekly · 1.4M views, 8K comments, 5 strategic insights"
2. **Header:** Logo + "Week of Apr 22–28, 2026" + Run ID footer
3. **Numbers strip:** total videos · total comments · avg engagement · top video views · WoW deltas (mocked as "first run, baseline established" since this is a single-run demo)
4. **Sentiment block:** donut + 1-line driver caption
5. **3 headline insights** (taken from `run_summary.top_insights` jsonb): each = title, 2-sentence description, type badge, "view evidence" link
6. **Featured recommendation:** the high-priority rec from Dashboard, with reasoning
7. **Hooks-of-the-week:** Top 3 hook styles by engagement this week + 1 line of context (the Content Analysis cards condensed for email)
8. **Competitive snapshot:** SOV bar (Ossur / Ottobock / industry-other) + 1 sentence
9. **CTA:** "View full dashboard" button → links to dashboard
10. **Footer:** unsubscribe + plan + run ID

**Why include hooks in the email:** It's the most action-able piece for a marketing team and reinforces the Content Analysis angle. The user who never logs in still gets it.

---

## 4. Mock Data Discipline

Rules I'll follow when building:
- All numbers plausible for prosthetics (engagement rates 3–9% range, video counts 200–300 per run, comment counts ~30 per video on TikTok / ~5 on YouTube).
- All product names real and correctly attributed (Ossur Pro-Flex / Power Knee / Cheetah; Ottobock C-Leg / Genium / Empower).
- All quote text plausible — written in the voice of real amputee/prosthetics commenters, not corporate-speak.
- Regions reflected in some quotes (Cape Town, Mumbai, São Paulo) — matches Ossur tracking config.
- No claims that imply video content was watched/transcribed. Every insight phrased as derived from comments + metadata. (Per the v4.1 positioning anchor: media-based, not video-powered.)
- "DEMO — ILLUSTRATIVE DATA" watermark visible on every page and on the report.

---

## 5. Implementation Approach

**Stack:** Next.js (App Router) + Tailwind + shadcn/ui — same as the real SocialLens stack per Profile preferences. Components built for the demo can later port directly into the production app.

**Data:** Hardcoded JSON files in `/lib/mock-data/` mirroring the v4.1 schema shape (run_summary, audience_insights, market_insights, recommendations, videos, comments, weekly_reports). Each shape matches Schema-Actual so swapping mock for real Supabase queries later is a one-file change per page.

**Styling:** SocialLens design system — blue palette (#1E40AF / #3B82F6 / #F59E0B), Fira Code/Sans, Data-Dense Dashboard style.

**No backend:** Static demo. No Supabase, no auth. Login screen is decorative — clicking "sign in" navigates to dashboard.

**Branding:** SocialLens-only. "Ossur" and "Ottobock" appear as **text labels** in the right places (sidebar client-switcher, SOV bars, competitor cards in Content Analysis Card C). No external brand logos. SocialLens logo on top-left of every page and on the report header.

**Output structure:**
```
ossur-demo/
├── app/
│   ├── (auth)/login/
│   ├── dashboard/
│   ├── market-intelligence/
│   ├── voice-of-customer/
│   ├── content-analysis/
│   ├── reports/
│   └── layout.tsx (sidebar nav)
├── components/ui/         (shadcn primitives)
├── components/sociallens/ (custom — KPI card, sentiment donut, theme card, hook table, etc.)
├── lib/mock-data/         (Ossur run, videos, insights, recommendations, reports)
└── public/                (SocialLens logo, watermark asset)
```

**Weekly report:** Separate route `/reports/week-of-apr-22` rendering the HTML inline + a "Download PDF" button (browser print-to-PDF, no extra deps).

---

## 6. Out of Scope (Explicit)

These do not appear in the demo:
- Trends page (hidden in v1 per 2026-04-30 decision)
- AI Agent (mention verbally only)
- Stripe / billing
- Onboarding wizard
- Real Apify pulls or live Supabase queries
- WoW deltas (single run = no comparison data)
- Pass B canonical labelling logic (deferred to v5; demo uses static labels)
- Any field flagged "deprecated" in Data Dictionary §2 page 5 (positive_pct, common_questions, etc. — not displayed)
- Login flow beyond a decorative click-through

---

## 7. Open Decisions — Resolved 2026-05-07

| # | Decision | Resolution |
|---|---|---|
| 1 | Page list | **Confirmed.** Dashboard, Market Intel, VoC, Content Analysis, Reports. |
| 2 | Card depth | **Confirmed comfortable.** 5 Market Insights / 6 Recs / ~24 VoC themes / 30 video rows. |
| 3 | Show Settings | **Cut from demo.** Configurability handled verbally if asked. |
| 4 | Competitor framing | **Softened.** "What competitors do that you don't" instead of singling out Ottobock by name in the call-out. Ottobock still appears in SOV and quoted findings — the Card C framing is just less adversarial. |
| 5 | Quote tone | **Trust me.** Quotes drafted at build time in the voice of real amputee/prosthetics commenters, with regional flavour. |
| 6 | Logos | **Text labels only.** SocialLens-branded throughout. "Ossur" / "Ottobock" as text. |
| 7 | URL | **Doesn't matter.** Will run locally; if hosted later, `ossur.sociallens.demo` or similar. |

Schema clarification logged 2026-05-07: dashboard sentiment donut still shows the 3-way split (`run_summary.overall_sentiment_positive/neutral/negative` is unchanged in v4.1). Per-video sentiment in Content Analysis is the single `videos.sentiment` field — the old `positive_pct/neutral_pct/negative_pct` columns on `videos` are zombie columns being dropped in v4.1 migration 7.

---

## 8. Approval

Spec is ready to build. Final approval moment — reply "build it" and I start, or flag any last edits.

Estimated effort: 1.5–2 days of focused work.
