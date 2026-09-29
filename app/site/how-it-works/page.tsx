import { SiteNav } from '../_components/site-nav'
import { LeadForm } from '../lead-form'
import { EXAMPLE_NOTE } from '../_data/sample'
import { SURFACES } from '@/lib/nav'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'How Verbatim works',
  description:
    'Gather, analyse, deliver. Where Verbatim listens, how thousands of comments become a model of the market you sell into, and what you see in the app.',
}

// The specifics the home page leaves out, in three parts. Every mechanism on
// this page was checked against the pipeline as it runs (2026-09-06); the
// sample market is the same illustrative backpack category as the home page,
// and the page says so (EXAMPLE_NOTE).
//
// RE-CHECKED AGAINST THE PRODUCT, 29 Sep (finish-list item 25): the app's
// pages are the nine the sidebar draws, read from lib/nav.ts so this list
// cannot drift from it again; counts are in videos; nothing gains, fades or
// emerges (levels now, comparisons once months compare); no weekly email is
// promised and the Studio is not shown, because reports are on hold and being
// redesigned, one for each department. And (the check pass, same day): no
// news block, since news is gathered but shown on none of the nine pages; no
// "short read", which lives only on a parked page; a group is counted over
// everything read to date, never as a share of a month; what is done under a
// brand is read for rivals only; own accounts are daily for followers alone.
const SETTINGS_LINE = 'What we read for you, where your market’s videos come from, and your team.'
export default function HowItWorks() {
  return (
    <>
      <SiteNav variant="light" current="how-it-works" />
      <header className="hiw-head" id="content" tabIndex={-1}>
        <div className="wrap">
          <h1>They hear your name. <span>We hear the market.</span></h1>
          <p>Listening tools start from a keyword you register. Verbatim starts from the bigger market you sell into: the comment threads, the Reddit threads and what’s said to camera around your kind of product, whether or not anyone types your name, and where your rivals stand in it. Here is what happens, in three parts.</p>
          <p className="example-note">{EXAMPLE_NOTE}</p>
          <div className="index">
            <a href="#gather"><span className="n">1</span><span><b>Gather</b><span>Where it listens, what it keeps, what it throws out.</span></span></a>
            <a href="#analyse"><span className="n">2</span><span><b>Analyse</b><span>How thousands of comments become a model of your market.</span></span></a>
            <a href="#deliver"><span className="n">3</span><span><b>Deliver</b><span>What you see in the app, and what your team reads.</span></span></a>
          </div>
        </div>
      </header>

      {/* 1 GATHER */}
      <section className="part g1" id="gather" aria-labelledby="g-h">
        <div className="wrap">
          <div className="part-head">
            <div className="big">1</div>
            <div>
              <h2 id="g-h">Gather. Where it listens.</h2>
              <p>Every week Verbatim goes out to four platforms and comes back with what people said around your category: the videos, the threads underneath them, and what was said out loud.</p>
            </div>
          </div>

          <div className="platforms">
            <div className="pf"><b>TikTok</b><ul><li>Videos found by search, and the comment thread under each</li><li>The platform’s caption track when there is one, transcribed otherwise</li></ul></div>
            <div className="pf"><b>Instagram</b><ul><li>Reels found by search, and the comments under each</li><li>The audio transcribed, so a spoken review counts</li></ul></div>
            <div className="pf"><b>YouTube</b><ul><li>Videos found by search, and the comment thread under each</li><li>The caption track, read alongside the comments</li></ul></div>
            <div className="pf"><b>Reddit</b><ul><li>Posts and comments in the communities where your category is discussed</li><li>Communities found per category, not hand-picked</li></ul></div>
          </div>
          <div className="also">
            <div><b>Your own accounts</b>Your public TikTok, Instagram and YouTube profiles: followers checked daily, and your recent posts and your audience’s replies with every weekly update.</div>
          </div>

          <div className="hiw-sub">
            <div>
              <h3>Three lists seed every search.</h3>
              <p className="body">Your brand, your competitors, and the category. Every video that comes back is sorted by who it’s actually about, and a video that names a lookalike brand is checked before it’s counted as yours.</p>
              <p className="fine">Competitor and category terms are search terms only. Attribution comes from the names, confirmed one video at a time.</p>
            </div>
            <div className="seed">
              <div className="lists">
                <div className="list"><b>Your brand</b><div className="chips"><span>Northline</span><span>Northline Packs</span></div></div>
                <div className="list"><b>Competitors</b><div className="chips"><span>Ridgeway</span><span>Trailform</span><span>Cairnline</span></div></div>
                <div className="list"><b>Category</b><div className="chips"><span>hiking backpack</span><span>40L pack</span><span>thru-hike gear</span></div></div>
              </div>
              <div className="arrow" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
              <div className="buckets">
                <div className="bucket"><i style={{ background: 'var(--green)' }} /><div><b>You</b><span>Videos about your brand, and your own posts.</span></div></div>
                <div className="bucket"><i style={{ background: 'var(--orange)' }} /><div><b>Each competitor</b><span>Videos about them, named and confirmed.</span></div></div>
                <div className="bucket"><i style={{ background: '#C5CBD1' }} /><div><b>The rest of the category</b><span>Everything else. Usually most of it, and where the market talks without naming anyone.</span></div></div>
              </div>
            </div>
          </div>

          <div className="hiw-sub full">
            <div className="intro">
              <h3>Finding the communities.</h3>
              <p className="body">For Reddit, likely communities are proposed, then probed with a sample of real posts. One only goes live if it keeps talking about your category, and it drops out again when it goes quiet.</p>
            </div>
            <div className="gate communities">
              <div className="gate-row"><div><span style={{ fontWeight: 500 }}>r/ultralight</span><div className="why">12 recent posts probed, 9 about the category.</div><div className="ratio"><i style={{ width: '75%' }} /></div></div><span className="verdict keep">Active</span></div>
              <div className="gate-row"><div><span style={{ fontWeight: 500 }}>r/CampingGear</span><div className="why">12 recent posts probed, 5 about the category.</div><div className="ratio"><i style={{ width: '42%' }} /></div></div><span className="verdict keep">Active</span></div>
              <div className="gate-row"><div><span style={{ fontWeight: 500 }}>r/hiking</span><div className="why">12 recent posts probed, 2 about the category.</div><div className="ratio"><i style={{ width: '17%', background: 'var(--hair)' }} /></div></div><span className="verdict drop">Not used</span></div>
            </div>
          </div>

          <div className="hiw-sub flip">
            <div>
              <h3>Everything goes through the filter.</h3>
              <p className="body">Before a comment is analysed it passes three checks: is the video about your category, is the brand it names really the one it seems to be, and is the comment a real person actually saying something. Off-topic videos go, lookalike brands go, spam is set aside. Short comments stay. “too small” is an opinion.</p>
              <p className="fine">Anyone who asks to be removed is taken out within seven days and never gathered again.</p>
            </div>
            <div className="gate">
              <div className="gate-row"><div><span className="voice">“asked three shops and nobody could explain the sizing”</span><div className="why">On topic, from a real person, under a category video.</div></div><span className="verdict keep">Read</span></div>
              <div className="gate-row"><div><span className="voice">“too small”</span><div className="why">Short, but it’s a verdict on fit. Kept.</div></div><span className="verdict keep">Read</span></div>
              <div className="gate-row"><div><span className="voice">“🔥🔥🔥”</span><div className="why">No words. Flagged, never analysed.</div></div><span className="verdict flag">Flagged</span></div>
              <div className="gate-row"><div><span className="voice">“check my profile for the best deals”</span><div className="why">Link bait. Flagged.</div></div><span className="verdict flag">Flagged</span></div>
              <div className="gate-row"><div><span style={{ fontWeight: 500 }}>A video about a different “Northline”</span><div className="why">Lookalike brand name. Counted as the rest of the category, never as yours.</div></div><span className="verdict flag">Not yours</span></div>
            </div>
          </div>

        </div>
      </section>

      {/* 2 ANALYSE */}
      <section className="part" id="analyse" aria-labelledby="a-h">
        <div className="wrap">
          <div className="part-head">
            <div className="big">2</div>
            <div>
              <h2 id="a-h">Analyse. How it reads.</h2>
              <p>The analysis runs in passes, each one building on the last, and every pass keeps the quotes it stands on. Four stages turn thousands of comments into a model of your market you can act on.</p>
            </div>
          </div>

          <div className="steps">
            <div className="st">
              <div className="n">1</div>
              <div>
                <h4>Read each video with its thread.</h4>
                <p>What kind of video it is, how the audience received it, and everything people volunteer in the comments: pain points, questions, buying intent, objections, praise, the moment someone switched. The transcript is read too, so a spoken claim counts.</p>
                <p className="never"><b>Each insight keeps its exact quote.</b> A quote that doesn’t match the source word for word is dropped, and the insight goes with it.</p>
              </div>
              <div className="demo">
                <div className="row"><div><span className="voice">“asked three shops and nobody could explain the sizing”</span><div className="k">Matches the source comment.</div></div><span className="chip g">Kept · question</span></div>
                <div className="row"><div><span className="voice">“nobody at the shops could explain sizing”</span><div className="k">Paraphrased. Not what the person wrote.</div></div><span className="chip r">Dropped</span></div>
                <div className="row"><div><span className="voice">“the hip belt is the reason I’d never go back”</span><div className="k">Matches. Praise, with a switching signal.</div></div><span className="chip g">Kept · praise</span></div>
              </div>
            </div>

            <div className="st stack">
              <div className="n">2</div>
              <div>
                <h4>Find the themes, and keep them.</h4>
                <p>Insights are grouped by meaning within each bucket: yours, each competitor’s, the rest of the category. A theme gets its own place on the page once it’s in 10 or more of the month’s videos; below that it’s listed by its count alone.</p>
                <p className="never"><b>Themes keep their identity month to month,</b> so this month’s count can be set against a later one. Until there are months that compare fairly, a theme says how big it is and nothing about which way it’s heading.</p>
              </div>
              <div className="demo">
                <div className="themes">
                  <div><b>Fit and sizing</b><span>412 of 1,240 videos</span></div>
                  <div><b>Hip belt comfort</b><span>288 of 1,240 videos</span></div>
                  <div><b>Price vs the cheaper one</b><span>197 of 1,240 videos</span></div>
                  <div><b>Zips and noise</b><span>143 of 1,240 videos</span></div>
                  <div><b>Airline carry-on</b><span>37 of 1,240 videos</span></div>
                  <div><b>Strap width</b><span className="early">7 videos, a count only</span></div>
                </div>
              </div>
            </div>

            <div className="st">
              <div className="n">3</div>
              <div>
                <h4>Compare you to the field.</h4>
                <p>With the themes in place, the buckets are read against each other: how many videos each brand comes up in, and for each rival you track, what people do under its videos, the questions asked there, and where its talk stands out from the category.</p>
                <p className="never"><b>Mood is read video by video,</b> and shown as a share of videos, never as a score.</p>
              </div>
              <div className="demo">
                <div className="cmp">
                  <span>Videos in the month</span><div><div className="bar you"><i style={{ width: '3%' }} /></div></div>
                  <span /><div><div className="bar them"><i style={{ width: '8%' }} /></div></div>
                  <span /><div><div className="bar cat"><i style={{ width: '87%' }} /></div></div>
                  <span>Where theirs stands out</span><span>Durability on trail</span>
                  <span>Asked under theirs</span><span>Torso length, and whether the frame creaks by day three.</span>
                </div>
              </div>
            </div>

            <div className="st stack">
              <div className="n">4</div>
              <div>
                <h4>Analyse the market.</h4>
                <p>From all of it: the kinds of person in the conversation, the market insights, and ranked recommendations grounded in the quotes retrieved for them. A separate check compares what you say in your own videos with what the audience hears back.</p>
                <p className="never"><b>Everything is said in calibrated words.</b> A count of videos, with what it’s out of, and on each conclusion a plain label: strong evidence or early signal. No scores, no magnitudes the data can’t back.</p>
              </div>
              <div className="demo">
                <div className="kv"><span className="k">Profile</span><span><b>The long-trip planner</b> · 508 videos, read to date</span></div>
                <div className="kv"><span className="k">In their words</span><span>“which one for a 10 day trip? genuinely torn between the two”</span></div>
                <div className="kv"><span className="k">You say</span><span>“Built for ten-day trips.”</span></div>
                <div className="kv"><span className="k">They hear</span><span><span className="chip a">Pushed back</span> Owners call it right for a weekend and too small for ten days.</span></div>
                <div className="row"><span>Sizing confusion</span><span className="chip g">Strong evidence</span></div>
                <div className="row"><span>Strap width</span><span className="chip">Early signal</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 DELIVER */}
      <section className="part d3" id="deliver" aria-labelledby="d-h">
        <div className="wrap">
          <div className="part-head">
            <div className="big">3</div>
            <div>
              <h2 id="d-h">Deliver. What you see.</h2>
              <p>The model lives in the app, one page for each question you bring to it. Whatever someone else in the company needs goes to them as a report.</p>
            </div>
          </div>

          <div className="hiw-sub full">
            <div className="intro">
              <h3>The app.</h3>
              <p className="body">Every page is one view of the same model, and its counts open to the videos and comments behind them.</p>
            </div>
            <div className="pages">
              {SURFACES.map((s) => (
                <div className="pg" key={s.key}><b>{s.label}</b><span>{s.question ?? SETTINGS_LINE}</span></div>
              ))}
            </div>
          </div>

          <div className="hiw-sub">
            <div>
              <h3>This week.</h3>
              <p className="body">Each weekly update reads the new videos and comments into your market, and This week says what that update brought: what came in, what was heard for the first time, what stood between buyers and a yes, and the comments worth a reply.</p>
              <p className="fine">A week is read as part of its month, never as a movement on its own.</p>
            </div>
            <div className="mail">
              <div className="mh"><b>This week</b><span>Example market · one update</span></div>
              <div className="mb">
                <div className="d"><i className="up">+</i><span>312 videos and 4,950 comments came in, into a September that now holds 1,240 videos.</span></div>
                <div className="d"><i className="up">?</i><span>Fit and sizing questions came up under 63 videos. None of your posts answered one.</span></div>
                <div className="d"><i className="up">↩</i><span>14 comments are worth a reply, 6 of them from people ready to buy.</span></div>
                <div className="d"><i className="up">+</i><span>Heard for the first time: airline carry-on limits, in 37 videos, most of them from one Reddit thread.</span></div>
                <div className="foot">Open any line for the comments behind it</div>
              </div>
            </div>
          </div>

          <div className="hiw-sub full dark">
            <div className="intro">
              <h3>Reports for your team.</h3>
              <p className="body">The same market, written for the people who act on it, so the ones who never open the app still hear what the market said. Every number in a report is the number in the app, and every quote traces to the comment it came from.</p>
            </div>
            <div>
              <div className="reports">
                <div className="rp"><b>Leadership</b><span>where the market stands</span></div>
                <div className="rp"><b>Marketing</b><span>every subject and rival</span></div>
                <div className="rp"><b>Sales</b><span>objections, and who you lose to</span></div>
                <div className="rp"><b>Content</b><span>what to make next</span></div>
                <div className="rp"><b>Product</b><span>complaints and wishes</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="honest" aria-labelledby="honest-h">
        <div className="wrap">
          <h2 id="honest-h" className="lead">Two different tools.</h2>
          <div className="diff">
            <div className="col-l">
              <b>A listening tool</b>
              <ul>
                <li>Starts from your name.</li>
                <li>Reads what’s said when you’re mentioned.</li>
                <li>Tells you when you come up.</li>
                <li>Returns a dashboard for you to make sense of.</li>
              </ul>
            </div>
            <div className="col-v">
              <b>Verbatim</b>
              <ul>
                <li>Starts from the market you sell into.</li>
                <li>Reads the threads underneath, where people say what they really think.</li>
                <li>Tells you what the market you sell into wants, and where your rivals stand in it.</li>
                <li>Returns a market already read: what it talks about, the brands in it, what to do, and an analyst you can question.</li>
              </ul>
            </div>
          </div>
          <p className="body diff-line">If you need to know the moment you’re mentioned, choose a listening tool. If you need to understand your market, choose Verbatim.</p>
        </div>
      </section>

      <section className="hiw-close" id="early-access" aria-labelledby="close-h">
        <div className="wrap">
          <h2 id="close-h">Stop listening for your name.</h2>
          <p>Verbatim runs every week on a real brand’s market today. A few more brands join this quarter.</p>
          <LeadForm />
        </div>
      </section>

    </>
  )
}
