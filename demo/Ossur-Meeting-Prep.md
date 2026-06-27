# Ossur Meeting Prep — Tuesday May 12, 2026

> Your position: they reached out to you. The original deal was the one that didn't materialise. You're not chasing — you're offering one clean path forward, and walking away if it doesn't take. Hold that frame the whole time.

---

## The frame (internalise before you walk in)

Three sentences you're effectively pitching:

1. The product is real and 6–8 weeks from your weekly report landing in your team's inbox.
2. The terms are different now — design partner cohort, fixed itemised price, 3-month minimum, 14-day exit.
3. Either you're in by [date] or this seat goes to another partner. Both outcomes are fine.

If you can hold that frame, the meeting runs itself. You're not selling — you're confirming whether they want a seat at this table.

---

## Pre-meeting checklist (Monday night + Tuesday morning)

**Monday night (30 min):**
- [ ] Walk through the demo end-to-end out loud, twice. The second time, time yourself — should be 12–18 min, not 30.
- [ ] Print the weekly report PDF + the one-pager (template at the bottom of this doc).
- [ ] Draft the confirmation email in your drafts folder so you can send it during or right after the meeting.
- [ ] Decide your number: open at **R3,000/month**, walk-away at **R2,500 + 6-month commit**. Lock these in your head before the meeting.
- [ ] Eat. Hydrate. Sleep.

**Tuesday morning (15 min):**
- [ ] Demo open in 2 tabs (dashboard + weekly-report) so you can switch fast.
- [ ] Local server running on `localhost:8000` (avoids `file://` URLs in the address bar).
- [ ] Phone charged with the weekly report PDF on it as a backup if your laptop fails.
- [ ] Battery 100%, charger packed.
- [ ] Demo zoom level tested on whatever display you're using (laptop screen vs meeting room TV vs Zoom share).

---

## Opening — first 90 seconds

Don't dive into the demo. Set the frame first.

**Suggested opening (adapt to your voice):**

> "Thanks for jumping back on this. Quick context before I show you anything. The product has come a long way since we first spoke — the pipeline analyses comments and metadata across TikTok, YouTube, and Instagram, and produces strategic insights and a weekly report. I've built out a working preview of what the platform looks like with Össur as the tenant — five pages plus the email. Some of it is the actual schema we're building against, some is illustrative data while the analysis pipeline finishes shipping. I want to walk you through it, then talk timeline and the design partner arrangement. Sound good?"

**Why this works:**
- Acknowledges the gap without apologising
- Sets expectations: it's a working preview, not the final product
- Tells them the structure of the meeting upfront — demo first, terms after
- Asks for permission, which subtly puts them on the back foot of agreeing

**Don't:**
- Apologise for the original deal not happening
- Say "thanks for giving me another chance"
- Start with a long product backstory

---

## Demo walkthrough — page-by-page narration

Total target: ~15 min. Don't dwell. Land the message and move.

### Dashboard (3 min)
**Lead line:** "This is what your team sees Monday morning."

**Hit these beats:**
- KPI strip — "247 videos, 8.4K comments, 6.8% avg engagement. The product analyses everything, your team only sees what matters."
- Sentiment donut — "64% positive, driven by personal-story content. Negativity concentrated in cost and insurance threads. We'll come back to that."
- SOV bar — "Ottobock's a bit ahead in volume, you lead on TikTok and Instagram." Move on.
- **Featured recommendation card** — slow down here. "This is the one I want you to read." Read it out loud. "This is the kind of thing that goes at the top of every dashboard — most important, highest priority, with the reasoning right there."

### Market Intelligence (4 min)
**Lead line:** "This is the page that justifies the subscription."

**Hit these beats:**
- "Five strategic insights this week, six actions tied to them."
- Click into Insight #1 (insurance-denial). "This is what I mean by strategic — it's not 'people are talking about insurance', it's 'this category gets 3x engagement and no one owns it'. Confidence 9, opportunity 9."
- Skim Insights 2–5 fast.
- Recommendation #1 — "This is what comes from that insight. Specific lane, specific reasoning, specific compounding logic across regions."
- "Each one of these has a confidence score, an opportunity score, and the audience themes it's grounded in. Your team can accept, dismiss, or come back to it."

### Voice of Customer (2 min)
**Lead line:** "This is where 'how do we know' lives."

**Hit these beats:**
- "Eight categories — pain points, questions, purchase intent, feature requests, praise, objections, misinformation, demographic signals."
- Click pain_point tab. "Three pain points this week. Sweating, insurance battles, cost. Click any of them—" expand the evidence — "and you see the verbatim quotes, with the source comment ID. We don't paraphrase. The whole pipeline is built so every claim ties back to a real comment."
- Click one more tab quickly (questions or praise). Don't read every quote.

### Content Analysis (3 min) — your strongest moment
**Lead line:** "This is the page your marketing team will live in."

**Hit these beats:**
- "Top hook styles by engagement. Personal-story is winning by a lot — 8.4% versus 3.8% for bold-claim. Your TikTok output is 38% product-led right now."
- "Top formats. Story and how-to outperform promotional 3x."
- **"What competitors do that you don't"** card — "These are four content lanes you're underweighting versus the rest of the category. Pediatric is the biggest gap."
- **"Recommended hooks to test this month"** — "Three specific hooks based on what's working. This is what your team gets every week."
- Scroll down to the catalog briefly. "And underneath it, the full breakdown — every video the pipeline saw this week, sortable, exportable."

### Reports (2 min)
**Lead line:** "This is what arrives in your inbox even if no one logs in."

**Hit these beats:**
- "Past reports archived here." Skim the list.
- Open the inline preview. Scroll through the email.
- "Designed so the marketing team gets the headline insights, the recommendation, the hooks of the week, and a competitive snapshot — all in one Monday morning email. Five-minute read. PDF-friendly. Forwardable."

### Wrap (30 sec)
**Lead line:** "That's the product. Two more things — timeline and how the partnership works."

---

## The pricing + timeline conversation

This is the most likely failure point. Have these lines ready.

### Timeline — what to promise

Your real-world delivery (per your v4.1 plan): 6–8 weeks to first real Ossur data flowing through, plus another few weeks of polish. Promise the longer end. Underpromise, overdeliver.

**Suggested line:**

> "Realistic timeline: first weekly report with your real data lands in 6–8 weeks. The dashboard pages I just showed you go live within the same window. Full v4.1 — every feature in the spec — within 10–12 weeks. I'll commit to a weekly progress update every Monday so you see it landing."

**Don't say:**
- "It'll be ready in a few weeks" (vague is what killed last time)
- "I'm hoping to have it done by..." (passive, weak)
- Specific dates you can't meet

### Pricing — the script

The original deal was R1,500/month and never paid. The new rate is R3,000.

**Suggested line:**

> "On price — that's changed. The original was a costs-only pitch from before I really understood what running this would take. The design partner rate now is R3,000 a month. Itemised: Apify scraping is around R900, Claude API around R400, n8n hosting R370, infra R200, plus a small margin so I can keep building. Three-month minimum, 14-day exit either side. Same number for everyone in the cohort."

**Why this lands:**
- Itemised — feels honest, not a markup
- Same for everyone — removes "can we negotiate?"
- Margin acknowledged — they'd be suspicious if it was costs-only
- Term is short, exit is fast — low risk for them

### If they push back on price

**Their line: "The original was 1,500…"**
> "Right — that was before I knew what this actually costs to run. Apify alone is R900. The new rate is the real number. I'd rather be straight with you now than have the same problem we had last time."

**Their line: "Can we do less?"**
> "If R3,000 is the friction, the only flex I have is term. R2,500 with a 6-month commitment, locked in. Otherwise it's R3,000 with the 3-month exit. Both work for me."

**Their line: "We need to discuss internally."**
> "Of course. To be fair to you and to the other partners I'm talking to — can I get a yes or no by [Friday + 5 days]? That gives you the week. If it's a no, no hard feelings, the seat goes to the next person."

**Their line: "Can we start later?"**
> "I can hold the seat for two weeks. Anything longer and I need to move on. Once you confirm, the first invoice covers from the start date — not from when we agreed."

---

## Likely objections (have answers ready)

**"What if we don't see results?"**
> "You'll get a weekly report and dashboard updates from week 6 onwards. If by week 10 you don't think it's useful, the 14-day exit is there. Honest answer: design partners are getting in early to *shape* what works, not to receive a finished product. If that's not what Össur wants, this isn't the right fit and I'd rather know now."

**"How is this different from social listening tools we already use?"**
> "Social listening tools sample comments and tag sentiment. SocialLens reads every comment, groups them by intent — pain points, questions, purchase intent, objections — and ties insights to specific videos and verbatim quotes. The output is strategic, not descriptive. The recommendations on Market Intelligence aren't something Brandwatch produces."

**"Can you sign an NDA?"**
> "Yes — happy to. Standard mutual NDA, I can have something to you by tomorrow."

**"What about data ownership?"**
> "Anything you input — keywords, brand context, recipient lists — is yours. I never use it for any other client or training. Anything the platform produces from public data on TikTok / YouTube / Instagram is the analysis output you've paid for. Standard."

**"What happens if you stop building this?"**
> "Honest answer: that's the design partner risk. I'd give you 30 days notice, refund the unused month, and hand over your data export. The reason I'm taking partner money instead of investor money is so I have to stay alive — partner revenue is the survival mechanism."

**"Can we talk to your other clients?"**
> "Right now Össur is one of two design partner conversations I'm having — the other is a SA outdoor brand. Once both are signed, you can talk to each other if you want. I'd rather not promise references before they exist."

**"What if our team doesn't have time to give feedback?"**
> "Then this probably isn't the right time. Design partners get the locked-in rate because they actually shape the product — biweekly 30-min calls is the minimum. If your team can't commit to that, paying full launch price (~R6K) at GA is the cleaner option."

---

## The closing ask — make them choose

The single most important moment of the meeting. Don't let it end with "we'll think about it."

**Suggested close (adapt to your voice):**

> "Three things from here. One — I'll email you the weekly report PDF and a one-page summary of the partner terms today. Two — by Friday next week I need a yes or no. Three — if it's a yes, I'll send a one-email confirmation with start date, what's included, and term. You reply 'confirmed' and we're going. If it's a no, no hard feelings — I'll keep you posted on the public launch later in the year."

**Why this works:**
- Three clear next steps — they can hold all three
- A specific deadline — vagueness killed last time
- The "reply confirmed" mechanic — no lawyers, no friction, can't fade out
- "No hard feelings" — gives them permission to say no, which paradoxically makes yes easier

---

## Things to NOT do

- **Don't apologise** for the gap or the new pricing. Both are reasonable.
- **Don't undersell.** If they say "this is great" don't immediately say "well, there's still work to do." Take the compliment, move on.
- **Don't read every recommendation aloud.** They can read.
- **Don't promise what you can't ship.** "I'll think about it" beats "yes" if you'd be lying.
- **Don't negotiate against yourself.** If they go silent after the price, *let it be silent*. The first person to break a price silence loses.
- **Don't book the next meeting** unless they explicitly ask. The deadline does the work.
- **Don't show the spec doc.** It's internal. They want the demo, not the build plan.

---

## Tech setup — concrete

**If in person:**
- Clamshell-mode laptop on the meeting room display, or just open laptop facing them
- Run `python3 -m http.server 8000` from the `ossur-demo/` folder beforehand
- Open `http://localhost:8000` in Chrome (not Safari — better dev tools if you need to debug live)
- Browser zoom: 110–125% works well on most displays
- Cmd+Shift+F for full-screen mode in Chrome — kills the URL bar visual

**If remote:**
- Same setup, but screen-share the Chrome tab, not the desktop
- Test the screen-share with someone else before the meeting (text size, donut chart visibility)
- Have a backup phone-hotspot in case office wifi dies
- Don't cold-open the demo on screen-share — open the dashboard first, *then* hit "share screen" so the first thing they see is the dashboard, not your desktop

**Backup if the demo breaks live:**
- Phone has the weekly report PDF — pull that up, walk them through the email instead
- "Demo gremlins, doesn't matter — let me show you what arrives in your inbox" — then hand them their take-home artifact

---

## One-pager template (for take-home)

Print this on one A4. Hand them a physical copy if in person, attach the PDF if remote.

```
SOCIALLENS · DESIGN PARTNER TERMS — Össur

PRODUCT
  Media-based consumer intelligence for D2C brands.
  Analyses comments + metadata across TikTok, YouTube, Instagram.
  Output: weekly email report + interactive dashboard with five
  strategic pages: Dashboard, Market Intelligence, Voice of
  Customer, Content Analysis, Reports.

DESIGN PARTNER ARRANGEMENT
  Rate:           R3,000 / month, itemised
                  - Apify scraping       ~R900
                  - Claude API           ~R400
                  - n8n hosting          ~R370
                  - Infra + margin       ~R1,330

  Term:           3-month minimum, 14-day exit either party
  Locked-in rate at public launch: same R3,000 (vs. ~R6K GA price)
  Engagement:     biweekly 30-minute feedback call

TIMELINE
  Week 1–2:       Onboarding, keyword config, first scrape
  Week 4–6:       First real analysis run with your data
  Week 6–8:       First weekly report in your inbox
  Week 10–12:     Full v4.1 feature set live

CONFIRMATION
  Reply "confirmed" to the start-date email and we begin.
  No lawyer required. Decision needed by [DEADLINE DATE].

CONTACT
  Heinrich Viljoen — heinrichjviljoen@gmail.com
```

---

## After the meeting

Within 1 hour:
- Send the weekly report PDF
- Send the one-pager
- Send a 3-line summary email: what we discussed, what happens next, deadline

Within 24 hours:
- If yes → send the confirmation email immediately
- If "thinking" → ack, restate deadline, no follow-up needed
- If no → "appreciate the honesty, I'll keep you posted on the public launch"

**Don't follow up before the deadline.** Letting silence sit is part of the leverage.
