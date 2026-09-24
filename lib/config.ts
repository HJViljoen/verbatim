// Pipeline configuration constants. Centralised so the model and thresholds
// are a one-line change — see Analysis-Passes invariants 8–9 and Step A2.

/**
 * OpenAI model for Pass A (per-video extraction — the bulk of call volume).
 * v4.1 chose gpt-4.1-mini (2026-04); still current (no shutdown announced as
 * of 2026-07-03, though the 4.1 family is sunsetting — nano dies 2026-10-23).
 * Extraction doesn't need a reasoning model, and the verbatim-quote validation
 * catches hallucination; re-evaluate alongside the next prompt change.
 */
export const ANALYSIS_MODEL = 'gpt-4.1-mini'

/**
 * OpenAI model for the synthesis passes (B labels, C competitive, D-a insights
 * + CI summary, D-b recommendations) — 4 calls/run that ARE the product the
 * client reads. Upgraded 2026-07-03 from gpt-4.1-mini to gpt-5.4 (reasoning
 * model) to attack the generic-recommendations problem; adds well under $1/run.
 * Downgrade path if quality doesn't earn the cost: 'gpt-5.4-mini'.
 */
export const SYNTHESIS_MODEL = 'gpt-5.4'

/**
 * Reasoning effort for SYNTHESIS_MODEL calls (gpt-5.x rejects `temperature`;
 * this replaces it). 'medium' = quality-first for the strategic output; drop to
 * 'low' if cost/latency ever matters more than depth.
 */
export const SYNTHESIS_REASONING_EFFORT = 'medium' as const

/**
 * Minimum distinct source videos for a theme to survive Step A2 aggregation.
 * Configurable because the floor collides with thin corpora — a demo/thin-data
 * run may drop this to 1 and badge single-source themes rather than ship empty.
 */
export const EVIDENCE_FLOOR = 2

/**
 * Mega-cluster tripwire (Step A2): a single theme spanning more than
 * max(MIN, SHARE x the run's distinct insight-bearing videos) is flagged as
 * suspected clustering chaining. Calibrated 2026-08-09 on the two known cases:
 * the Sealand run-1 chaining blob (119 videos, well over 25% of any plausible
 * denominator of that era) must warn; Ossur run 2's legitimate 64-video theme
 * (64 of 385 distinct insight videos = 17%) must not. MIN keeps small corpora
 * on the original absolute rule.
 */
export const MEGA_CLUSTER_MIN = 40
export const MEGA_CLUSTER_SHARE = 0.25

/**
 * Video-as-signal weight (WP7a, 2026-09-12). A creator who filmed an opinion
 * counts as one and a half comment-videos when a theme is ranked: the video is
 * a deliberate, costly act of opinion, which is exactly what the Pass A prompt
 * already tells the extraction model — and what nothing downstream read until
 * now (`insight_evidence.source` existed, no ranking function queried it).
 *
 * 1.5 and not 2: creator corpora skew to tutorials, unboxings and feature
 * walk-throughs, so an on-camera line is over-represented on product talk. At 2
 * every theme tilts toward creator subject matter; at 1.5 an on-camera video
 * breaks ties and lifts a theme past a marginally larger comment-only one
 * without overturning volume.
 *
 * SCOPE, so nobody hunts for a bug that isn't there: this only ever moves
 * `industry-other` themes. Pass A never cites source='video' on a client or
 * competitor video — their transcripts are brand messaging and become
 * `video_claims`, never audience evidence (pass-a.ts, "NEVER insight
 * evidence") — so `videoEvidenceCount` is structurally 0 in the `client` and
 * `competitor:*` buckets and no client-audience card can show "said on
 * camera". That is the brand-voice/customer-voice split working as designed.
 *
 * Two honest limits. On-camera evidence exists only where a transcript does,
 * and much of the corpus has none, so the signal is partly a proxy for "we had
 * a transcript" — a platform and language artefact. And the flag is coarse:
 * one transcript citation among five comment citations marks the whole video
 * on camera, which is the common case, because Pass A is told to fold
 * transcript signal into a matching comment insight.
 */
export const VIDEO_EVIDENCE_WEIGHT = 1.5

/**
 * Quote-picker bonus for a verbatim spoken on camera (WP7a). `quoteScore` and
 * the theme bonus are whole numbers (English hits capped at 5, +2 for card
 * length, +3 per on-topic word, theme overlap x2), so 0.15 is a tie-break and
 * nothing more: two equally good quotes go to the one someone said out loud,
 * and any comment that scores even one point better still wins.
 */
export const VIDEO_QUOTE_BONUS = 0.15

/** Sampling temperature for analysis calls. 0 for reproducible iteration. */
export const ANALYSIS_TEMPERATURE = 0

// --- Video transcripts (Step 1 capture 2026-07-23, Step 2 analysis 2026-08-08) --
// Gather stores the raw item + resolves one transcript per kept video (caption
// when present, else Whisper). Pass A reads them behind the same flag (v4:
// classification grounding on every bucket; industry-other transcripts as
// evidence; client/competitor claims). See _Claude/Projects/SaaS/Architecture/Video-Transcripts.

/** Master switch. Off by default — when unset, gather is byte-identical to
 *  before (no raw capture, no transcription). Set TRANSCRIPTS_ENABLED=1 to bank
 *  transcripts on real runs. Read at call-time so it works in serverless. */
export function transcriptsEnabled(): boolean {
  const v = process.env.TRANSCRIPTS_ENABLED
  return v === '1' || v === 'true'
}

/** Reddit subreddit auto-discovery (Wave 3). OFF unless explicitly enabled, so
 *  merging the branch cannot change any run's behaviour or spend until it is
 *  switched on deliberately in Vercel. Note this gates DISCOVERY (the GPT
 *  proposal + paid probes), not the adapter — a tenant with active subreddits
 *  already in config is unaffected by this flag. */
export function redditDiscoveryEnabled(): boolean {
  const v = process.env.REDDIT_DISCOVERY_ENABLED
  return v === '1' || v === 'true'
}

/** OpenAI transcription model for videos without a usable caption track. */
export const TRANSCRIBE_MODEL = 'whisper-1'

/** Below this many LETTERS a resolved transcript is treated as no-speech —
 *  music-only reels (Whisper renders those as "♪♪", captions as "[Music]"; the
 *  2026-07-23 lift experiment saw such videos add nothing). Speech-gate. */
export const MIN_TRANSCRIPT_CHARS = 15

/**
 * Model for the content gate — the second gate, after the letter-count one.
 * Measured on the 2026-08-08 backfill: of 43 transcripts that PASSED the
 * letter-count gate, only 67% were speech; 16% were song lyrics ("Have a holly
 * jolly Christmas") and 16% noise ("Transcribed by https://otter.ai"). Lyrics
 * have plenty of letters, so only a semantic check catches them. ~$0.04 per
 * 600-video run.
 */
export const CONTENT_GATE_MODEL = 'gpt-4.1-mini'

/** Runaway BACKSTOP, not a budget (Heinrich 2026-08-08: transcribe everything
 *  analysed — whole-run Whisper ≈ $2.50–3.50 at run-1 scale). A real run's
 *  biggest platform was ~460 candidates.
 *
 *  1000 → 5000 (2026-09-09): the gather this guards got several times larger
 *  in one pass — Instagram searches two surfaces instead of one, every
 *  in-window own post is stored instead of twelve, and three competitors'
 *  accounts joined. At 1000 it would have stopped being a backstop and started
 *  being a silent cut. It is still ~10x any real run. */
export const TRANSCRIBE_CAP = 5000

/** Videos per transcribe Inngest step. Download-dominated (~10s/video after
 *  the IG audio-first fix) — 8 ≈ 80s/step, wide margin under the 300s cap. */
export const TRANSCRIBE_BATCH = 8

/** Transcribe steps dispatched per parallel wave (Pass A wave pattern). */
export const TRANSCRIBE_PARALLEL = 4

/** Whisper is priced per audio MINUTE, not per token — MODEL_PRICING can't
 *  represent it and estimateCost('whisper-1', …) returns 0. */
export const WHISPER_PER_MINUTE = 0.006

/** Estimated per-item price of the YouTube transcript actor (see APIFY_ACTORS.
 *  youtube). Not billed by us — logged into the transcribe row's `response`
 *  as `apify_est_usd` so a run's caption spend is visible next to its Whisper
 *  spend. Apify spend is otherwise unrecorded in the DB for every platform. */
export const YT_TRANSCRIPT_PER_ITEM_USD = 0.001

/** Skip Whisper for media larger than this (bytes) — the API's own file cap.
 *  It binds ONLY on the OpenAI path: OpenAI's transcription endpoints are
 *  upload-only and reject anything bigger, while AssemblyAI takes either a URL
 *  it fetches itself or an upload with no practical size limit, so a 110MB reel
 *  that Whisper could never read transcribes fine there. */
export const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024

/** AssemblyAI is the primary transcription provider when ASSEMBLYAI_API_KEY is
 *  set (2026-09-09): it bills per audio MINUTE like Whisper but at ~40% of the
 *  price, auto-detects 99 languages (Afrikaans included, which matters for a
 *  South African corpus), and — the reason it was adopted — accepts a media URL
 *  or an unbounded upload instead of a 25MB file. Same shape as
 *  WHISPER_PER_MINUTE: MODEL_PRICING cannot express per-minute pricing. */
export const ASSEMBLYAI_PER_MINUTE = 0.0025

/** ESTIMATED cost of one video through the Apify speech-to-text actor (the
 *  second transcript path, by PLATFORM URL — see APIFY_ACTORS.speech). Measured
 *  live 2026-09-09 on one Instagram reel and one TikTok: $0.0552 per run of one
 *  ≤1-minute video = $0.005 actor start + $0.02 platform fetch + $0.03 per
 *  STARTED audio minute (+$0.0002 compute). Batching N urls into one run pays
 *  the start once, so the per-video estimate excludes it and the batch adds it.
 *  Estimates, not a bill: exact per-run Apify usage lands in Phase 3. */
export const SPEECH_ACTOR_START_USD = 0.005
export const SPEECH_ACTOR_PER_VIDEO_USD = 0.02
export const SPEECH_ACTOR_PER_MINUTE_USD = 0.03

/** Same, for the YouTube-only actor (codepoetry/youtube-transcript-ai-scraper).
 *  Read off its pricing 2026-09-09: $0.0025 per start event and AI fallback
 *  raises the actor to 4GB = 4 events, $0.001 per video whose captions existed,
 *  $0.012 per STARTED AI minute when they didn't. A 2-video live run charged
 *  $0.02 total. */
export const YT_SPEECH_START_USD = 0.01
export const YT_SPEECH_PER_CAPTION_USD = 0.001
export const YT_SPEECH_PER_AI_MINUTE_USD = 0.012

/** Guards on the YouTube AI fallback, which bills per minute and runs at ~1x
 *  real time: never spend more than this many AI minutes in one batch, and skip
 *  any single video longer than this (a 40-minute upload is $0.48 and would eat
 *  the whole step; its captions, when it has them, still come through). */
export const YT_SPEECH_MAX_AI_MINUTES = 20
export const YT_SPEECH_SKIP_LONGER_THAN_MIN = 20

/** Transcript attempts a video gets before 'failed' is terminal. A transcript
 *  is a precondition of analysis (Phase 2, 2026-09-09), so one bad fetch — an
 *  expired CDN link, a flaky actor, an AssemblyAI timeout — must not
 *  permanently exclude a video the way a single 'failed' stamp used to. */
export const TRANSCRIPT_MAX_ATTEMPTS = 3

/** Videos per transcript-backfill Inngest step. The platform-URL path is one
 *  Apify actor run per batch (all urls in one input), and the actor measured
 *  ~20s per short video end to end, so 8 ≈ 170s — under the 300s step cap with
 *  room for the content gate. YouTube runs its own, slower actor (AI fallback
 *  measured ~90s/video), hence its own smaller batch. */
export const BACKFILL_BATCH = 8
export const BACKFILL_BATCH_YOUTUBE = 2
/** Backfill steps dispatched per parallel wave (the transcribe wave pattern). */
export const BACKFILL_PARALLEL = 4

/** Runaway BACKSTOP on the platform-URL backfill, in videos per run — NOT a
 *  quality budget. That path costs ~$0.055 a video (the actor downloads the
 *  video), so an unbounded first backfill over a corpus with hundreds of
 *  transcript-less videos could spend $40+ in one run and exhaust the $200
 *  monthly Apify cap, which would take the whole gather down with it. Videos
 *  are attempted richest-first, so a capped run takes the highest-signal ones
 *  and the rest come on the next run; the run log says how many were left. */
export const BACKFILL_CAP = 400

/** Max transcript characters injected into a Pass A prompt (~600 tokens),
 *  clipped code-point-safe (clipText). Short reels rarely reach this. */
export const TRANSCRIPT_PROMPT_CHARS = 2400

/** Max length of a video-sourced (transcript) evidence quote. Keeps transcript
 *  quotes sentence-scale so everything downstream that assumes comment-sized
 *  quotes (D-b pools, cards) holds. */
export const PASS_A_VIDEO_QUOTE_MAX = 200

// --- Transcript translation (`transcript_en`, WP6 2026-09-11) ----------------
// Pass A reads ~27% of transcripts in their original language ("read it as-is",
// 2026-08-08). That held while nobody could show a loss, but the decision it
// rested on was "build translation only if measurement demands it" and the
// standing instruction since is accuracy first. So every non-English transcript
// now also carries an English rendering, and Pass A is given BOTH: it reasons
// from the translation and quotes only from the original, which is what keeps
// the verbatim-evidence invariant (and the quote validator) intact.

/** Master switch for the translation wave. Default ON — unlike every other
 *  flag here, which defaults off because it gates spend on a path that did not
 *  exist before. This one gates a path whose whole purpose is that analysis
 *  stops silently degrading on a quarter of the corpus, so the safe default is
 *  "on" and the switch exists to turn it OFF in a hurry (TRANSLATION_ENABLED=0)
 *  if a run ever needs the pennies or the wall-time back. Read at call time so
 *  it works in serverless; frozen per run by captureRunFlags. */
export function translationEnabled(): boolean {
  const v = process.env.TRANSLATION_ENABLED
  return v !== '0' && v !== 'false'
}

/** Model for the translation call. Deliberately the FULL gpt-4.1, not mini:
 *  this is the text Pass A reasons from for a quarter of the corpus, and a
 *  mistranslated complaint becomes a wrong insight that nothing downstream can
 *  catch (the quote validator checks the ORIGINAL, so it cannot). ~$0.012 per
 *  non-English video at the 2400-char prompt budget — a 300-video backlog is
 *  ~$3, one
 *  run's worth of Apify is four times that. Quality over pennies. */
export const TRANSLATE_MODEL = 'gpt-4.1'

// There is no separate translation input budget on purpose. The span sent for
// translation is exactly TRANSCRIPT_PROMPT_CHARS of the original — the span
// Pass A can actually quote from — so the two blocks in the prompt describe the
// SAME speech. An independent budget (this was 4000 for a day) does not achieve
// that: characters are not content. Measured 2026-09-12 on a Traditional
// Chinese sample, 2051 source chars became 6508 English chars, so a translation
// clipped to the original's 2400 covered ~37% of what the original block said
// and Pass A read the other 63% "as-is" — the degradation this feature exists
// to remove. Hence: clip the INPUT, never the output (usableTranslation returns
// the English whole). If TRANSCRIPT_PROMPT_CHARS ever rises, that is a
// deliberate act that re-translates.

/** Videos per translate Inngest step. Latency tracks OUTPUT tokens, not source
 *  length, and CJK/Indic sources generate 2-3x the output per source character:
 *  measured 2026-09-12, a 4000-char Bengali source took 7.3s and a 2051-char
 *  Traditional Chinese one 21.2s. At 4 per step even a pathological batch —
 *  every call the 21s worst case, rounded up to 25s — is 100s, a third of the
 *  300s Inngest step cap. (8 would have been 200s at that rate, and the
 *  now-removed 4000-char input budget would have pushed it past 300s.) */
export const TRANSLATE_BATCH = 4

/** Translate steps dispatched per parallel wave (the transcribe wave pattern). */
export const TRANSLATE_PARALLEL = 4

/** Runaway BACKSTOP on translation, in videos per run — like BACKFILL_CAP, not
 *  a quality budget. The first run after this ships faces the whole historical
 *  non-English backlog at once; 400 caps that at ~$5 and the rest come on the
 *  next run. Steady state is a handful of new videos a week.
 *
 *  400 now covers more ground than it did: since the language-detection change
 *  (2026-09-12) the unknown-language rows are candidates too, which on Sealand
 *  is 249 videos on top of its 290 known non-English ones. The first two runs
 *  clear the backlog instead of the first one. */
export const TRANSLATE_CAP = 400

// --- Quote translation (Phase 1 WP6, item 8, decision A, 2026-09-18) ---------
// A DIFFERENT THING FROM THE FOUR CONSTANTS ABOVE, and the numbers look alike
// enough to be wired together by accident. Those translate a TRANSCRIPT — a
// creator's speech, one 2,400-char text per call, on the full gpt-4.1, as a
// reading aid the extraction model consumes and nobody ever sees. These
// translate a QUOTED COMMENT — a stranger's 90 characters, twenty-five of them
// per call, shown to a client beside the original. TRANSLATE_CAP is 400 VIDEOS
// per run and has nothing to do with the design's "~400 comments per update",
// which is itself a measurement error (see below).

/** Model for the quote-translation call. gpt-4.1-mini, not the full gpt-4.1 the
 *  transcript wave uses, and the asymmetry is deliberate: a transcript
 *  translation is what Pass A REASONS from for a quarter of the corpus, so a
 *  mistranslation there becomes a wrong finding nothing downstream can catch. A
 *  quote translation is shown to a reader beside the words it renders, stamped
 *  as a machine translation, with the original above it — the reader is the
 *  check, and a comment is short, whole and unclipped where a transcript is
 *  machine-made, garbled and cut. */
export const TRANSLATE_QUOTES_MODEL = 'gpt-4.1-mini'

/** Comments per model call. 25 is the design's number and it survives
 *  measurement: the non-English cited comments run 87–94 characters (25.7–28.8
 *  tokens) each, so a 25-item call is ~550 tokens of fixed system block plus
 *  ~700 of source — near the transcript call's measured 752-token input, which
 *  is the shape the live ledger says is efficient. */
export const TRANSLATE_QUOTES_BATCH = 25

/** Calls per Inngest step. The step cap is 300 s and this is the only bound
 *  that matters: 27–28 calls of ~1,100 output tokens cannot ride one step, and
 *  a translate-quotes step that times out is a step that re-bills every call in
 *  it on the retry. Eight calls of a measured few seconds each leaves the cap
 *  an order of magnitude of headroom. */
export const TRANSLATE_QUOTES_CALLS_PER_STEP = 8

/** Steps dispatched per parallel wave. Two, not four: the account has a hard
 *  5-slot Inngest concurrency shared with the rest of the pipeline, and this
 *  step maintains a cache rather than producing the report. */
export const TRANSLATE_QUOTES_PARALLEL = 2

/** Runaway BACKSTOP in TEXTS per run — TRANSLATE_CAP's shape, not a quality
 *  budget. TEXTS, because a text is what is billed and what a cache row is:
 *  `planQuoteCalls` slices the uncached (comment, text) targets, so at the
 *  measured 1.22–1.24 texts per comment 3,000 reaches about 2,450 comments.
 *
 *  It is a backstop and not an exact ceiling, deliberately. The plan step hands
 *  its batches on as COMMENT ids, and translateQuotesBatch re-derives every
 *  uncached text of those comments — including a sibling text the cap cut off
 *  mid-comment. So a capped run spends slightly OVER the cap, by at most one
 *  comment's remaining texts per batch. Splitting a comment across two runs to
 *  hold the line exactly would cost a second planning pass over the whole
 *  corpus to save a fraction of a cent. Measured on production 2026-09-15, one update newly cites 2,386
 *  (Össur) / 3,988 (Sealand) distinct comments, of which 627–684 are
 *  confidently not English; the design's "~400 newly-cited non-English
 *  comments per update" is 1.6× low. Everything cited and uncached goes to the
 *  model (there is no stored language signal to pre-filter on — the video's
 *  transcript_lang is 34–58% precise per comment), so the first run after this
 *  ships faces the whole ever-cited backlog: ~7,000 comments a tenant.
 *
 *  Measured read-only 2026-09-15: the current analysis cites 7,019 (Össur) /
 *  7,543 (Sealand) comments, carrying 8,574 / 9,342 distinct displayable texts
 *  (an excerpt and its whole comment are two texts, and about a quarter of
 *  cited comments are quoted in part). 3,000 caps a run at roughly $0.25–0.55
 *  and clears a tenant's backlog over three runs, or in one invocation of
 *  scripts/translate-quotes.ts. Steady state after the cache fills is
 *  ~$0.015–0.05 per tenant per update. */
export const TRANSLATE_QUOTES_CAP = 3000

// --- On-screen text from the cover frame (WP7b, 2026-09-12) ------------------
// The 2026-09-02 blind benchmark found, independently and twice, that every
// incumbent listening tool misses on-screen text on TikTok/YouTube — and that
// TikTok hooks are very often TYPED, never spoken. This reads the text on the
// one frame we can actually get: the cover.
//
// What it is NOT, and the copy must never say otherwise (standing rule,
// v5-Ideas.md): scene understanding, thumbnail analysis, or "we analyse the
// visuals". It is on-screen text from the cover frame. Full-frame sampling needs
// a video download plus ffmpeg, which Vercel serverless does not have, and the
// media URLs expire in days regardless.

/** Master switch for the OCR wave. Default ON, for the translation flag's
 *  reason: it gates a path whose absence is a known, measured hole in the
 *  analysis, so the safe default is "on" and the switch exists to turn it OFF
 *  in a hurry (OCR_ENABLED=0) if a run needs the pennies or the wall-time back.
 *  Read at call time so it works in serverless; frozen per run by
 *  captureRunFlags. */
export function ocrEnabled(): boolean {
  const v = process.env.OCR_ENABLED
  return v !== '0' && v !== 'false'
}

/** Model for the cover-frame read. gpt-4.1-mini takes image input and is the
 *  cheapest vision-capable model already priced in MODEL_PRICING. Measured
 *  2026-09-12 on real covers: $0.0003 to $0.0035 a call, depending on the
 *  image's pixel size (see OCR_IMAGE_DETAIL — this model family ignores the
 *  low/high detail flag). Transcribing text off a still is not a reasoning task
 *  — the failure mode to guard against is the model DESCRIBING the picture, and
 *  that is a prompt problem, not a model-size one.
 *
 *  IMAGE FORMAT: the vision input takes PNG, JPEG, WEBP and non-animated GIF
 *  only. HEIC — which TikTok serves for about 9% of its covers — is rejected,
 *  and no url rewrite gets a JPEG instead (verified live: the tplv transform is
 *  inside the signed path). lib/pipeline/ocr.ts sniffs the magic bytes and
 *  records those as 'no_image' rather than as a failed read. */
export const OCR_MODEL = 'gpt-4.1-mini'

/** Image detail level. Sent as 'low' — but measured live on 2026-09-12,
 *  gpt-4.1-mini IGNORES it: this model family prices an image by its pixel
 *  dimensions (a patch count), not by the 85/170-token low/high scheme the 4o
 *  family uses. Eight real covers billed 576 prompt tokens for a YouTube
 *  hqdefault (480x360) and up to 5,676 for a full-resolution Instagram still —
 *  $0.00024 to $0.0024 of input, a 10x spread the flag does not close.
 *
 *  Left set deliberately: it costs nothing, it is honoured by every other
 *  vision model, and if OCR_MODEL ever moves back to the 4o family it starts
 *  working again. What actually bounds the cost is OpenAI's own patch cap, so
 *  even a pathological image lands under ~$0.004 — see scripts/ocr-videos.ts
 *  for the measured per-platform ranges. Downscaling before the call would
 *  close the spread properly, but it needs an image library
 *  (`sharp` is only a transitive dependency here, not one this repo declares),
 *  and $0.0035 a worst-case image does not justify taking one on. */
export const OCR_IMAGE_DETAIL = 'low' as const

/** Cap on a cover image we will fetch and inline, in bytes. OpenAI's limit is
 *  20MB of REQUEST, and base64 inflates by 4/3, so 8MB of source is a wide
 *  margin. Real covers measured 2026-09-12: 30KB (YouTube hqdefault) to 2.4MB
 *  (a full-resolution Instagram still). */
export const OCR_MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Wall-clock budget for fetching one cover before the read is called failed.
 *  Eight seconds keeps a batch of 8 inside the 300s step cap even if every
 *  fetch times out. */
export const OCR_FETCH_TIMEOUT_MS = 8_000

/** Max characters of extracted text STORED per video. A cover frame carries a
 *  hook card, not an essay; 600 is a generous ceiling that bounds a runaway
 *  model output before it reaches the DB. */
export const OCR_MAX_CHARS = 600

/**
 * Shortest an on-screen-text quote may be to count as evidence.
 *
 * A bare single token off a cover frame is a logo, a watermark, a handle or a
 * price — never an insight, and it is also where the OCR model's per-token
 * guessing is worst: measured 2026-09-12, a 480x360 YouTube thumbnail whose
 * chest logo is genuinely illegible came back as "RB". The validator cannot
 * catch that (it matches the quote against the model's own output), so the only
 * defence is refusing to build a finding out of a fragment. A quote clears the
 * bar by containing whitespace — i.e. being more than one word — or by being at
 * least this long.
 */
export const PASS_A_OCR_MIN_QUOTE_CHARS = 12

/** Max characters of on-screen text injected into the Pass A prompt. Same
 *  number as OCR_MAX_CHARS deliberately — the stored text is already bounded to
 *  prompt scale, so the two clips are the same clip and the quote validator
 *  matches against exactly what the model saw. */
export const OCR_PROMPT_CHARS = 600

/** Videos per OCR Inngest step. One image call is ~2s; 8 is ~16s, far inside
 *  the 300s step cap, and matches TRANSCRIBE_BATCH so the two gather-time waves
 *  chunk the same corpus the same way. */
export const OCR_BATCH = 8

/** OCR steps dispatched per parallel wave (the transcribe wave pattern). */
export const OCR_PARALLEL = 4

/**
 * Runaway BACKSTOP on the gather-time OCR wave, in videos PER RUN — shared
 * across platforms, not per platform.
 *
 * TRANSCRIBE_CAP's precedent is per-platform, and this deliberately is not.
 * `plan-ocr` runs inside the gather loop, so a per-platform cap would have made
 * the real ceiling 3 x 1200 + OCR_BACKFILL_CAP = 3,900 images a run, three
 * times the number written here. An unstated 3x is exactly the kind of number
 * that turns up on a bill. The plan step is handed the REMAINDER instead, so
 * the three platforms share one budget in gather order.
 *
 * Worst case, stated so nobody has to derive it — measured 2026-09-12, a cover
 * costs $0.0003 (YouTube's 480x360 hqdefault, a flat 576 prompt tokens) to
 * $0.0035 (a full-resolution Instagram still, ~5,700 tokens, at OpenAI's patch
 * cap):
 *
 *   OCR_CAP 1200 + OCR_BACKFILL_CAP 300 = 1,500 images per run per tenant
 *   → $0.37 (all YouTube) to $4.36 (all full-resolution) per run, worst case
 *   → at most 7.3% of RUN_MODEL_BUDGET_USD
 *
 * (scripts/ocr-videos.ts prints that same line from the same constants, so the
 * two cannot drift.)
 *
 * Steady state is nothing like that: a week's new videos is a few hundred
 * covers, i.e. cents. The cap exists so a pathological run cannot spend
 * unbounded, not to ration a real one.
 */
export const OCR_CAP = 1200

/** Attempts a cover read gets before 'failed'/'no_image' becomes terminal, on
 *  the platforms where retrying can help at all (see needsOcr). Three, matching
 *  TRANSCRIPT_MAX_ATTEMPTS: enough that a CDN blip or an OpenAI 5xx cannot
 *  permanently remove a video whose cover is still there, few enough that a
 *  weekly run stops chasing a genuine dead end. */
export const OCR_MAX_ATTEMPTS = 3

/** Runaway backstop on the YouTube OCR BACKFILL — the second wave, over
 *  historical rows whose cover is still reachable because it is derived from
 *  the video id rather than a signed URL. Smaller than OCR_CAP because it is
 *  paying down a backlog that has no deadline: a few hundred a run clears it
 *  over a handful of weeks without any single run noticing. */
export const OCR_BACKFILL_CAP = 300

/**
 * Embedding model for Step A2 theme clustering (Analysis-Passes §Step A2 — the
 * pre-approved fallback when string-match clustering fails, which the first real
 * run confirmed it does: free-text slugs almost never collide exactly).
 */
export const EMBEDDING_MODEL = 'text-embedding-3-small'

/**
 * Cosine-similarity threshold for merging two insights into one theme cluster.
 * Higher = stricter (more, smaller clusters); lower = looser (fewer, broader).
 *
 * Retuned 2026-07-11 for AVERAGE-LINKAGE clustering (cluster.ts swapped off
 * single-linkage union-find, whose transitive chaining built a 119-video
 * grab-bag on the Sealand run-1 corpus). Under average linkage the threshold
 * compares cluster-average similarity, so it sits lower than the old
 * single-linkage 0.62. Calibrated on the regenerated Sealand run-1 insights
 * (435): 0.50 re-grows 46–65-video grab-bags; 0.55 blurs seams (durability
 * slugs in the gift cluster); 0.58 = coherent multi-video themes (price,
 * design-praise, purchase-intent), no tripwire hits, residual duplicates left
 * for the theme-merge pass; 0.62 over-fragments. (Historical single-linkage
 * tuning 2026-06-28: 0.62 on the Ossur corpus — superseded with the linkage.)
 */
export const CLUSTER_SIMILARITY_THRESHOLD = 0.58

/**
 * Cosine threshold for mini theme-matching (Redesign Spec §8): a latest-run
 * theme whose label+description embedding matches any previous-run theme at or
 * above this is the SAME theme (first_seen = false); below it, it's new ("New"
 * badge + email delta). Deliberately looser than the intra-run merge threshold —
 * Pass B rephrases labels run to run. PROVISIONAL until tuned on the first real
 * consecutive-run pair.
 */
export const THEME_MATCH_THRESHOLD = 0.7

/**
 * Cosine floor a Pass D-a supporting_themes ref must clear against its market
 * insight's text to survive (the existence-vs-relevance gap, teardown
 * 2026-07-09 §Run 1: refs were checked to exist, never to relate, so padding
 * inflated "Grounded in N conversations"). Calibrated on Sealand run 1 via
 * scripts/citation-floor.ts: genuine citations sat at median 0.594 / min 0.364,
 * uncited theme pairs at median 0.240 / p75 0.312 — 0.35 keeps every genuine
 * run-1 citation while cutting the padding space. Deliberately a floor, not a
 * classifier: a related-but-uncited theme surviving is fine; an unrelated
 * cited one is the defect.
 */
export const CITATION_RELEVANCE_FLOOR = 0.35

/**
 * USD per 1M tokens, per model. APPROXIMATE — verify against OpenAI's current
 * pricing page and your usage dashboard; used only to estimate ai_call_log.cost_usd
 * and the live burn log. Actual billing is the source of truth.
 */
export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'gpt-4.1-nano': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gpt-4.1': { inputPer1M: 2.0, outputPer1M: 8.0 },
  // gpt-5.4 family (verified against the OpenAI pricing page 2026-07-03).
  // Reasoning tokens bill as output tokens.
  'gpt-5.4': { inputPer1M: 2.5, outputPer1M: 15.0 },
  'gpt-5.4-mini': { inputPer1M: 0.75, outputPer1M: 4.5 },
  'gpt-5.4-nano': { inputPer1M: 0.2, outputPer1M: 1.25 },
  'text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
}

/** Estimate USD cost from token usage for a given model. Returns 0 if unknown. */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PRICING[model]
  if (!p) return 0
  return (promptTokens / 1e6) * p.inputPer1M + (completionTokens / 1e6) * p.outputPer1M
}

// --- Gather (Apify) configuration -------------------------------------------
// The n8n gather called Apify *tasks* (actor + input saved in the console). In
// code we call the underlying store actors directly by their Apify actor id (the
// API accepts the id form as well as the username~name slug). These ids were
// confirmed from Heinrich's Apify account on 2026-06-28; env-overridable per
// deployment. Set APIFY_TOKEN before the first live run.
export const APIFY_ACTORS = {
  tiktok: {
    video: process.env.APIFY_TT_VIDEO_ACTOR ?? '5K30i8aFccKNF5ICs',
    comment: process.env.APIFY_TT_COMMENT_ACTOR ?? 'XomSRf7d0qf3mVj1y',
  },
  // YouTube discovery + comments use the official Data API v3 (2026-07-05,
  // YOUTUBE_API_KEY, no actor). Only its TRANSCRIPTS go through Apify (Wave 4,
  // 2026-08-16): the free caption route is pot-gated from datacenter IPs. Chosen
  // by live bake-off over supreme_coder (8/10 vs 6/10, auto-language, 7s vs
  // 41s); pay-per-event $0.001/item, charged for caption-less items too.
  youtube: {
    transcript: process.env.APIFY_YT_TRANSCRIPT_ACTOR ?? 'scrape-creators~best-youtube-transcripts-scraper',
  },
  instagram: {
    // The flagship apify/instagram-scraper drives discovery too (2026-09-09).
    // apify/instagram-hashtag-scraper (reGe1ST3OBgYZSsZJ) has NO date input, so
    // every IG search paid for whatever the hashtag page happened to show and
    // the window was enforced afterwards by throwing results away. The flagship
    // takes `onlyPostsNewerThan` and a `resultsType`, which buys both a dated
    // search and the reels/posts split IG needs to be covered at all.
    video: process.env.APIFY_IG_VIDEO_ACTOR ?? 'shu8hvrXbJbY3Eb9W', // apify/instagram-scraper
    // apify/instagram-scraper (flagship) in `comments` mode — replaced
    // apify/instagram-comment-scraper (SbK00X0JYCPblD2wp), which returned 0.
    comment: process.env.APIFY_IG_COMMENT_ACTOR ?? 'shu8hvrXbJbY3Eb9W',
    // Same flagship actor as `comment`, driven in `posts` mode: the hashtag
    // scraper can only search, so re-fetching ONE known post (to refresh its
    // expiring media url for transcription) has to go through this one.
    post: process.env.APIFY_IG_POST_ACTOR ?? 'shu8hvrXbJbY3Eb9W',
  },
  // Reddit (Wave 3): one actor drives both search and per-post comments, like
  // Instagram's flagship. Env-swappable because every Reddit actor is ToS-grey
  // post-lockdown and may break without notice — prodiger~reddit-scraper is the
  // researched fallback. Pay-per-event: $0.02/start + $0.002/result.
  reddit: {
    video: process.env.APIFY_REDDIT_ACTOR ?? 'harshmaur~reddit-scraper',
    comment: process.env.APIFY_REDDIT_ACTOR ?? 'harshmaur~reddit-scraper',
  },
  // The SECOND transcript path (Phase 2, 2026-09-09): transcription from the
  // PLATFORM URL, so a video whose signed media link expired weeks ago is still
  // reachable. Not a platform — a provider — so it sits outside the per-platform
  // keys above.
  //
  //  media   — andronixmd/speech-to-text-transcriber. Downloads the video itself
  //            (yt-dlp) and transcribes it. Live-tested 2026-09-09: Instagram
  //            reel and TikTok both SUCCEEDED (~22s, $0.055 each); YouTube
  //            failed on both URLs tried with "this URL could not be fetched or
  //            transcribed" (yt-dlp is blocked from its IPs), so YouTube uses:
  //  youtube — codepoetry/youtube-transcript-ai-scraper with enableAiFallback,
  //            which reads captions when they exist and Whispers the audio when
  //            they don't. Slower (~90s/video) and flakier (1 of 2 test videos
  //            returned AI_TRANSCRIPTION_FAILED) — hence its own batch size.
  speech: {
    media: process.env.APIFY_SPEECH_ACTOR ?? '9gGHAFoDt1HgX35A5',
    youtube: process.env.APIFY_YT_SPEECH_ACTOR ?? 'wEsIUWo0tpwtzpjf3',
  },
} as const

/** Max comments scraped per Reddit post. The actor bills per saved result and
 *  the spine scrapes one post per actor run, so an unusually fat thread would
 *  otherwise dominate a run's Reddit spend. Rarely binds: Reddit threads in our
 *  segment run 3–8 comments. */
export const REDDIT_COMMENT_DEPTH_CAP = 40

/** Posts pulled per community per run. A harvest ignores keywords, so without a
 *  cap it would pull `max_videos` (70 for Ossur) from EVERY active community. */
export const REDDIT_HARVEST_POSTS = 25

/**
 * Posts per KEYWORD search on Reddit — deliberately far below max_videos.
 *
 * Site-wide keyword search was the whole Reddit plan before community harvest
 * existed. Harvest is strictly better at that job: measured 2026-08-16, 15 of 20
 * harvested r/amputee posts contained no tracked keyword at all, so a keyword
 * search cannot see three quarters of the relevant conversation. What keyword
 * search still adds is reach OUTSIDE the active communities.
 *
 * It can't be dropped: a tenant whose discovery hasn't converged yet has no
 * active communities, and this is then their only Reddit source. So it stays,
 * at a fraction of the volume — 8 keywords x 70 posts was ~$1.28/run, the
 * single largest Reddit line item, for the weaker of the two sources.
 */
export const REDDIT_KEYWORD_SEARCH_POSTS = 20

/** Fresh comment scrapes per run for Reddit. The dominant cost by far: the actor
 *  bills $0.02 per START and the spine scrapes one post per run, so ~$0.06 a
 *  post once a thread's comments are counted. Uncapped, two harvested
 *  communities would run ~$8/run. TikTok/Instagram don't need this — their
 *  per-scrape cost is a fraction and their corpora are keyword-bounded already.
 *
 *  HONEST CEILING: this caps FRESH scrapes only. Delta re-scrapes are a second,
 *  independent budget (RECHECK_CAP), and harvest makes re-checks the steady
 *  state rather than an edge case — a harvest re-pulls a community's newest
 *  posts weekly and Reddit threads keep accruing comments, with no free count
 *  lookup to avoid paying. So Reddit's real comment-scrape ceiling is this cap
 *  plus that one — the dominant line by far.
 *
 *  25 → 100 (2026-09-09, approved with the wider envelope). "Every gathered
 *  item that clears the check gets its comments" is the requirement, and at 25
 *  the cap — not the check — was deciding, on the platform whose comments are
 *  the most considered text in the corpus. That takes Reddit's ceiling to
 *  ~$6/run at the shape above, inside the raised monthly cap.
 *
 *  Worst case at the Ossur shape (8 keywords, 5 active communities) is
 *  ~$3.2-3.5/run after REDDIT_KEYWORD_SEARCH_POSTS cut the keyword-search line
 *  from ~$1.28 to ~$0.48. NOT the ~$2 the original budget note assumed.
 *
 *  Note what is NOT a useful lever: the number of active communities. These caps
 *  are per-run and per-platform, not per-community, so each extra community adds
 *  only its own harvest search (~$0.07) — and since the fixed scrape budget is
 *  spent richest-first, MORE communities means a better candidate pool for the
 *  same money. To go lower, cut these two caps, not the community count.
 *  Measured 2026-08-16. */
export const REDDIT_COMMENT_SCRAPE_CAP = 100

// --- Subreddit discovery probe (Wave 3) --------------------------------------
// A GPT-proposed subreddit is only a candidate. Before it can be searched on
// real runs it must survive a live sample judged by the existing relevance gate
// — the structural answer to the Poler/Patagonia homonym lesson, where a name
// matching a brand word proved nothing about the customers being there.

/** Posts sampled per candidate. Each probe is one actor run: $0.02 start +
 *  $0.002/post ≈ $0.044 here, so this is a spend lever. Big enough that one
 *  off-topic post doesn't sink a good community. */
export const SUBREDDIT_PROBE_SAMPLE = 12

/** Share of the sample the relevance gate must KEEP for a candidate to go
 *  active. Deliberately not a majority: a genuinely useful community (r/amputee)
 *  carries plenty of off-category daily chatter around the product talk. */
export const SUBREDDIT_PROBE_MIN_RATIO = 0.34

/** …and an absolute floor, so a tiny or half-empty sample can't pass on ratio
 *  alone (2 of 4 is 50% and proves nothing). */
export const SUBREDDIT_PROBE_MIN_KEPT = 3

/** Probes per run. Bounds BOTH spend and wall-clock. They run SEQUENTIALLY in
 *  one Inngest step against a 300s cap, so the budget is probes x per-probe
 *  timeout: 3 x 75s = 225s, plus the gate calls, fits. (At the default 120s
 *  timeout three would need 360s and blow the cap — the probe sets 75s for
 *  exactly this reason; change them together.) Discovery therefore ramps over a
 *  few weeks rather than trying to settle in one run. */
export const SUBREDDIT_PROBES_PER_RUN = 3

/** Stop proposing once the tenant has this many ACTIVE communities. Without a
 *  convergence rule the proposal prompt — which excludes everything already
 *  known — returns the *next* plausible names every week forever, each costing
 *  a paid probe, eventually inventing them. */
export const SUBREDDIT_TARGET_ACTIVE = 5

/** …and a hard ceiling on total communities ever considered, so a tenant whose
 *  category simply lacks 5 good communities still stops paying to look. */
export const SUBREDDIT_MAX_KNOWN = 20

/** Consecutive barren runs before an ACTIVE community is demoted for re-judging.
 *  One week is too twitchy — communities have quiet weeks — and five is a month
 *  of a run closing 'partial' every time before anything self-corrects. */
export const SUBREDDIT_STRIKE_LIMIT = 3

/** Default min comments before a video is worth a comment scrape (TikTok/Instagram). */
export const COMMENT_THRESHOLD = 5

/**
 * Min comments before a video is worth a Pass A GPT call, per platform.
 *
 * One global floor of 5 was tuned for TikTok/Instagram, where a thread with
 * four comments really is noise. Reddit threads in our segment run 3–8 comments
 * and are far denser per comment (paragraphs, not emoji), so the same floor
 * would skip most of the platform. Falls back to 5 for anything unlisted.
 *
 * Applied at BOTH gates: the plan step (raw counts, inngest/functions/pipeline.ts)
 * and runPassA itself (kept counts, after the spam filter).
 */
export const PASS_A_MIN_COMMENTS_BY_PLATFORM: Record<string, number> = { reddit: 3 }
export const PASS_A_MIN_COMMENTS_DEFAULT = 5

export function passAMinComments(platform: string): number {
  return PASS_A_MIN_COMMENTS_BY_PLATFORM[platform] ?? PASS_A_MIN_COMMENTS_DEFAULT
}

/** Incremental Pass A (Theme Registry shape A, 2026-08-17). OFF unless set, so
 *  merging the branch changes nothing until it is switched on in Vercel. Gates
 *  SELECTION only — with the flag off, plan-pass-a still selects every eligible
 *  video (today's corpus-wide re-read) while the new per-video bookkeeping,
 *  the *_current views and the prune step run unconditionally. Flipping it on
 *  makes plan-pass-a select only videos that changed since their last analysis
 *  (see lib/pipeline/pass-a-plan.ts). Read at call-time (serverless). */
export function incrementalPassAEnabled(): boolean {
  const v = process.env.INCREMENTAL_PASS_A
  return v === '1' || v === 'true'
}

/** Re-analysis growth rule: a video is re-read when its STORED comment rows
 *  grew by at least min(PASS_A_RECHECK_MIN, ceil(PASS_A_RECHECK_SHARE × count
 *  at last analysis)) since that analysis — cumulative, so a trickle across
 *  several scrapes still adds up. Small videos (5–14 comments) re-read on +1/+2
 *  because that is a ≥20% change of the whole prompt input; ≥15 comments need
 *  +3. Measured on Össur run 147899d3 vs ef1e28a3 under exactly this rule:
 *  153 of 496 analysed videos qualified (342 had no new comments at all).
 *  Analogous to RECHECK_MIN_GROWTH on the scrape side; kept separate because
 *  the baselines differ (platform-reported count vs stored rows). */
export const PASS_A_RECHECK_MIN = 3
export const PASS_A_RECHECK_SHARE = 0.2

// --- Pass B chunking (Tier 0 T0-5, 2026-08-18) -------------------------------
// One gpt-5.4 call labelled every theme in the run. Measured durations against
// the route's 300s cap: 237.6s (518 themes), 212s (550), 189s (537), 167s
// (373), 165s (334). The input is the client's whole current theme set, which
// grows with every gather, so this was ~60s from timing out and re-spending
// ~$0.35 or failing the run. Chunks are cut inside entity buckets first, so
// themes competing to be distinguished from each other stay in one call.

/** Themes per labelling call. 120 keeps the worst measured run (550 themes)
 *  under ~60s per call. */
export const PASS_B_CHUNK = 120
/** Labelling calls in flight at once. Sequential chunks would not fix the
 *  wall clock. 3 was "well inside the cap" until 2026-09-15, when gpt-5.4
 *  answered 53% slower than two days earlier (mean 46 → 71 s a call, same
 *  prompts) and Sealand's 12 chunks in 4 waves ran 257–273 s three times
 *  against the route's 300 s ceiling and failed the rehearsal run; Össur's
 *  8 chunks would have had ~24 s to spare. 6 halves the waves: the same
 *  measured durations replay at ~175 s (Sealand) and ~115 s (Össur). The
 *  cost of 6 in flight is a 429, which a chunk already survives — it keeps
 *  its slug labels and logs `parse_error` — where a timeout takes the run. */
export const PASS_B_PARALLEL = 6

// --- Data retention (Tier 0 T0-9, 2026-08-18) --------------------------------
// The windows the privacy notice states. Nothing in the product deleted source
// data before this: video_raw held whole actor payloads (IG owner names, tagged
// users, locations, TikTok lat/long) forever, ai_call_log held every prompt
// with its comment text, and YouTube rows were never refreshed or purged
// (against YouTube API Services Developer Policy III.E.4.d).

/**
 * The eval contract's one hard floor today (Tier 1, 2026-08-18).
 *
 * Share of stored insight quotes that must still verify verbatim against the
 * comment they cite. Pass A enforces this at write time, so the honest
 * expectation is ~1.0 and anything below it means either drift (a comment was
 * re-scraped and changed under a stored quote) or a hole in the check. Set at
 * 0.98 rather than 1.0 to leave room for genuine re-scrape drift without
 * hiding a systematic failure. Enforced only above 100 checkable rows.
 */
export const EVAL_GROUNDING_FLOOR = 0.98

/**
 * Hard ceiling on MODEL spend within one pipeline run (Tier 1, 2026-08-18).
 *
 * A runaway run had no stop at all: the only lever was `clients.is_active`,
 * flipped by hand, and it was written under pressure the day a run had to be
 * killed and there was nothing to kill it with. It is a KILL SWITCH, not a
 * budget: it has to sit far enough above an honest run that meeting it always
 * means something is wrong. Set too close, it truncates real work silently —
 * the exact failure a spend guard exists to prevent.
 *
 * $15 → $60 (2026-09-09, approved). Real runs cost $2.18-$2.70 at the old
 * corpus size, and this pass multiplies that corpus: Instagram searches two
 * surfaces, own posts are a census rather than a top-12 slice, three
 * competitors' own accounts are gathered and analysed, and every analysed
 * video is meant to arrive with a transcript. $15 was ~6x the worst observed
 * run; $60 restores that headroom on the other side of the change.
 *
 * Checked at every step boundary against ai_call_log, alongside the abort
 * switch, so it costs no extra round trip.
 */
export const RUN_MODEL_BUDGET_USD = Number(process.env.RUN_MODEL_BUDGET_USD ?? 60)

/**
 * Minimum analysed videos in an entity's bucket before the product will draw a
 * comparison involving it (Tier 1, 2026-08-18).
 *
 * Nothing gated this: Pass C was handed every bucket with no coverage signal
 * and asked to find contrasts, so a competitor with a handful of videos could
 * anchor a "competitive threat" the client reads as a finding about their
 * market. Set at 10 to match the numerator floor the share bands already use
 * (lib/report-bands SHARE_BAND.minK). Measured for reference: Össur's period
 * buckets are client 27 / Ottobock 75 / category 366, and Sealand's thinnest
 * tracked competitor sits at 22 videos all-time, so this excludes the genuinely
 * empty ones without touching a real tenant's comparisons.
 */
export const COMPETITIVE_MIN_VIDEOS = 10

/**
 * The feature flags a run's behaviour depends on, captured once (Tier 1,
 * 2026-08-18).
 *
 * Every flag is read from `process.env` at call time so it works in a
 * serverless function. Inngest invokes each STEP as its own request, so an env
 * change or a deploy part-way through a run means later steps see different
 * values than earlier ones. The worst version is `transcripts`: it decides
 * `passAPromptVersion`, which is the key incremental Pass A bookkeeps against,
 * so a flip mid-run stamps half the corpus `pass_a_v4` and half `pass_a_v3`
 * and the next run re-reads everything.
 *
 * Captured in the `open-run` step, which Inngest memoises — so the snapshot is
 * frozen for the life of the run, replays included, and is persisted on the
 * run row so a strange run can be explained after the fact.
 */
export interface RunFlags {
  transcripts: boolean
  /** Default ON (translationEnabled) — see the translation block above. */
  translation: boolean
  /** Default ON (ocrEnabled) — see the on-screen-text block above. */
  ocr: boolean
  incrementalPassA: boolean
  themeRegistry: boolean
  redditDiscovery: boolean
  consumerProfile: boolean
}

export function captureRunFlags(): RunFlags {
  return {
    transcripts: transcriptsEnabled(),
    translation: translationEnabled(),
    ocr: ocrEnabled(),
    incrementalPassA: incrementalPassAEnabled(),
    themeRegistry: themeRegistryEnabled(),
    redditDiscovery: redditDiscoveryEnabled(),
    consumerProfile: consumerProfileEnabled(),
  }
}

/** The demo tenant (scripts/seed-demo.ts). Its comment authors are one-way
 *  pseudonyms; the retention refresh must never write real names back into it,
 *  and the erasure script looks for clones in it. */
export const DEMO_CLIENT_ID = 'de300055-0000-4000-8000-000000000001'

/** The two live tenants. Every CLI script defaults to one of them and twenty
 *  of them held their own copy of the uuid; a tenant that ever needed moving
 *  would have been moved in nineteen places and missed in one. The `--client`
 *  flags are unchanged — these are defaults, not the only value a script can
 *  take. */
export const SEALAND_CLIENT_ID = 'ac16988e-c4f3-4baf-b388-73895852a554'
export const OSSUR_CLIENT_ID = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

/** Master switch for the retention sweep. OFF unless set, so the cron deploys
 *  dormant and its first pass is something an operator watches rather than
 *  something that happens at 04:00. It is the only destructive job in the
 *  product. Since Tier 1.5 the YouTube branch REFRESHES rather than deletes
 *  (see inngest/functions/retention.ts): on the corpus as it stands the first
 *  sweep re-fetches ~589 stale YouTube comment ids and ~605 videos, strips
 *  ~1,638 prompt bodies, and deletes only what YouTube itself no longer serves.
 *  Preview with scripts/retention-dry.ts. Read at call-time (serverless). */
export function retentionEnabled(): boolean {
  const v = process.env.RETENTION_ENABLED
  return v === '1' || v === 'true'
}

/** Raw platform payloads. Only the transcribe step reads them, within the run. */
export const RAW_PAYLOAD_RETENTION_DAYS = 30
/** Prompt/response bodies in the AI audit log. Metadata (cost, tokens, timing,
 *  validation status) is kept indefinitely; only the bodies are stripped. */
export const AI_LOG_BODY_RETENTION_DAYS = 30
/** YouTube-sourced rows: the HARD limit (Developer Policy III.E.4.d). Rows are
 *  refreshed on a rolling 25-day cadence (lib/retention/youtube-refresh.ts);
 *  anything still unrefreshed at 30 days falls back to the delete path. */
export const YOUTUBE_RETENTION_DAYS = 30
/** Nightly ceilings for the refresh (comment ids / video ids per night). At
 *  50 ids per quota unit these are ~100 + ~20 units a night against a 10,000
 *  daily quota — guards, not budgets: a 30-day cadence at these caps supports
 *  150k YouTube comments before the cap binds. */
export const YOUTUBE_REFRESH_NIGHTLY_CAP = 5000
export const YOUTUBE_VIDEO_REFRESH_NIGHTLY_CAP = 1000
/** The BACKSTOP's nightly ceiling. It only fires when the refresh has failed
 *  for 30 days, which is exactly when the unrefreshed set is the whole corpus,
 *  and the shared delete path does all of its reads (evidence, samples, hero
 *  quotes, the snapshots to stale) BEFORE the first delete. Unbounded, that
 *  work exceeds the route's 300 s at corpus scale and the step times out
 *  having deleted nothing, every night, forever. Bounded, each night is
 *  durable progress. Raise it only with a measurement. */
export const YOUTUBE_BACKSTOP_NIGHTLY_CAP = 5000

// --- Gather spend ceilings (Tier 0 T0-2, 2026-08-18) -------------------------
// tracking_configs now carries CHECK ceilings on the individual knobs; these
// two bound the RUN, which is what actually spends. Sized well above the real
// tenants at the time (Ossur ~33 searches, Sealand ~57) so an operator never
// meets them, and a pathological config cannot outrun the Apify credit.

/** Hard cap on keyword searches dispatched by one run, across all platforms.
 *  Each search is an Apify actor run; the plan is keywords x platforms, so a
 *  config at every ceiling (45 keywords, 4 platforms) would otherwise plan 180.
 *
 *  80 → 120 (2026-09-09): Instagram plans TWO searches per keyword now, since
 *  its actor answers with reels or feed posts but never both, so the same
 *  config costs one platform's worth of searches more. Sealand's shape is 13
 *  keywords x 4 platforms + 13 Instagram variants + 4 community harvests = 69,
 *  still well clear — which is the point. An operator should never meet this. */
export const GATHER_MAX_SEARCHES_PER_RUN = 120

/** Hard ceilings applied to the config as READ, so a row that predates the
 *  CHECK constraints (or is edited by an operator with service-role access)
 *  still cannot make a run unbounded. Matches the migration's CHECKs. */
export const GATHER_MAX_VIDEOS_PER_SEARCH = 100
export const GATHER_MAX_COMMENT_DEPTH = 500

/** Pass A failure tolerance (Tier 0, 2026-08-18). A run whose live Pass A
 *  calls failed above this share of attempts — or that saw ANY 429 (rate
 *  limit / exhausted credits) — closes 'partial' and alerts, instead of
 *  presenting the analysis as complete. Below it, the failed videos keep their
 *  old pointer and the next run's plan simply re-reads them. Run ef1e28a3
 *  (2026-08-09) had 340 calls fail on "no credits remaining" and still closed
 *  'completed' with errors=[]. */
export const PASS_A_ERROR_RATIO = 0.05

/**
 * Output ceiling for ONE Pass A call, in completion tokens (2026-09-24).
 *
 * Pass A sent no ceiling at all, so a call could generate up to gpt-4.1-mini's
 * whole 32,768-token output window. Four calls on run b67b56de did exactly
 * that: structured output degenerated into repetition, each ran ~220 s, each
 * died inside the SDK with "Could not parse response content as the length
 * limit was reached", and because the throw happens before `completion.usage`
 * is read, all four were logged with 0 tokens — the spend is real and the
 * ledger cannot see it. The inputs were not the problem (one of the four
 * showed the model 29 comments and a 2.6 kB prompt), so a smaller batch fixes
 * nothing; a bound does.
 *
 * 4,000 is sized to the SCHEMA, not to the corpus: the widest honest Pass A
 * answer measured on this tenant is an order of magnitude under it, so a call
 * that reaches this ceiling is a runaway and not a rich video. It costs ~8 s
 * instead of ~220 s to find that out, and `PASS_A_LENGTH_RETRY_REFS` decides
 * what happens next.
 */
export const PASS_A_MAX_OUTPUT_TOKENS = 4000

/** Share of a video's comments the ONE length-limit retry shows the model.
 *  Halving is the in-call analogue of halving a batch: the unit of a Pass A
 *  call is one video, so the only thing there is to make smaller is how much
 *  of that video it reads. Exactly one retry — a video that runs away twice is
 *  counted as an error and re-planned next run, which is what every other Pass
 *  A failure already does. */
export const PASS_A_LENGTH_RETRY_REFS = 0.5

/** Recovered caption-batch tolerance (2026-09-13). A run-failed caption batch
 *  whose ids the isolation pass then re-fetched one by one cost Apify a dead
 *  actor run but lost no data, so it takes MORE of them than a per-video failure
 *  (PASS_A_ERROR_RATIO) before a run is honestly 'partial': run d346b0f7
 *  isolated 3 of 37 batches (8%) and produced a complete update. Past a quarter
 *  of the batches the actor itself is the problem, not the inputs. */
export const ISOLATED_BATCH_ERROR_RATIO = 0.25

/** Theme registry (shape B-lite, 2026-08-17). OFF unless set, so merging the
 *  branch changes nothing until it is switched on in Vercel. Gates the registry
 *  write + the `first_seen`-from-registry rule only; the tables and the
 *  `themes.registry_id` column are inert without it. */
export function themeRegistryEnabled(): boolean {
  const v = process.env.THEME_REGISTRY
  return v === '1' || v === 'true'
}

// --- Consumer profile (Pass E, 2026-08-19) -----------------------------------
// The profile answers "who is talking" from the insight population a run
// already produced. It is a synthesis over existing data — no new gather — and
// its own Inngest step, so it can never fail a client's report.

/** Master switch for Pass E. OFF unless set: the pass, the step and the table
 *  are inert without it, so merging this branch changes no run. Deliberately
 *  left off for the first scheduled run after merge — the profile for that run
 *  is produced offline by scripts/consumer-profile.ts instead, which keeps a
 *  brand-new GPT call off the run the clean-run gate depends on. */
export function consumerProfileEnabled(): boolean {
  const v = process.env.CONSUMER_PROFILE
  return v === '1' || v === 'true'
}

/** Hard cap on personas kept per scope. Five is the point where a switcher
 *  still reads as a set of people rather than a list; beyond it the marginal
 *  persona is a re-cut of one already kept. */
export const PERSONA_MAX = 5

/** Evidence floors. A persona below EITHER floor is dropped with a reason
 *  rather than shown thin — the product contract bans invented personas, and a
 *  persona resting on 4 comments from one video is invention with a citation.
 *  Provisional: tuned against real Össur output before the page ships. */
export const PERSONA_MIN_INSIGHTS = 12
export const PERSONA_MIN_VIDEOS = 3

/** Theme lines sent to the synthesis call. Össur run 2 produced 120 themes for
 *  the whole corpus, so 140 covers a normal run whole; larger runs lose the
 *  weakest themes first (they are ordered by evidence). Keeps the prompt near
 *  ~20k input tokens, ~$0.05 a run. */
export const PERSONA_DIGEST_THEMES = 140

// --- Ask engine (2026-08-19) ---------------------------------------------
// Test an idea or a whole plan against the conversation already mined. Claims
// are extracted, matched to themes by embedding, and judged echoes /
// contradicts / silent — with the model's own proposals kept in a separate
// register produced by a separate call.

/** Claims judged per submission. A marketing plan yields 15-40; past ~40 the
 *  verdict prompt stops fitting comfortably and the reader stops reading. */
export const ASK_MAX_CLAIMS = 40

/** Themes shown per claim. The shortlist is by embedding cosine, so this is
 *  how much benefit of the doubt a claim gets before "silent" is the answer. */
export const ASK_THEMES_PER_CLAIM = 8

/** Real comments shown per shortlisted theme. The verdict must be judged
 *  against what people said, not against a label — that was the measured
 *  under-recall in say_vs_hear, which sees labels only. */
export const ASK_QUOTES_PER_THEME = 3

/** Upload ceiling. Vercel caps a serverless request body at 4.5 MB, so a
 *  bigger file cannot arrive whole however generous we are here; 4 MB fails
 *  with a message we wrote instead of a platform error. Real text-heavy plans
 *  sit far below it — an image-heavy 60-page deck will not, and that is a
 *  known limit, not a surprise. */
export const ASK_PDF_MAX_BYTES = 4 * 1024 * 1024

/** Pages past which the reader is told the document is only partly read. */
export const ASK_PDF_MAX_PAGES = 60

/** Below this many extracted characters per page a PDF is treated as scanned
 *  or image-only. There is no OCR here, so the honest move is to say so rather
 *  than return "no claims found" for a document full of claims. */
export const ASK_PDF_MIN_CHARS_PER_PAGE = 200

/** Search-term suggestion calls per USER per rolling hour (WP5). One
 *  gpt-4.1-mini call each, ~$0.001 — small, but the onboarding one is reachable
 *  by any signed-in account before it has a tenant, so it needs a ceiling that
 *  is per person rather than per tenant. Counted in `suggestion_calls`. */
export const SUGGEST_HOURLY_LIMIT = 5

/** Stored checks re-tested per run. Each is one synthesis call, so a tenant
 *  with fifty saved plans must not quietly add fifty calls to every run.
 *  Newest first: a plan nobody has revisited in months is not the one they are
 *  steering by.
 *
 *  THREE, not ten: measured gpt-5.4 synthesis durations in this codebase are
 *  165-237s for a SINGLE call (see the Pass B chunking note), and the Inngest
 *  route caps at 300s. Ten sequential verdict passes in one step would time
 *  out, retry, and re-bill from the first check without ever producing a
 *  result. Raising this needs the loop split across steps first. */
export const ASK_REEVALUATE_MAX_CHECKS = 3

/** Characters of submitted document read (~15k tokens). A 60-page deck past
 *  this is clipped and the reader is told, rather than silently half-read. */
export const ASK_INPUT_CHARS = 60000

// ------------------------------------------------- Verbatim Agent (2026-08-22)
// The Ask engine's question-answering face. A client arrives with a question
// from their own work and gets an answer built from what their customers said.
// Retrieval reaches INSIGHT level here, not the ~334 theme headers the rest of
// the Ask engine sees — clients do not ask in theme labels.

/** Insights retrieved per expanded query, before fusion. Generous on purpose:
 *  this is the recall stage, and the register system downstream is what decides
 *  whether a weak match is allowed to look like evidence. Starving it here
 *  produces FALSE SILENCE, which is the worse failure — an answer suppressed
 *  when the corpus could genuinely have spoken. */
export const AGENT_INSIGHTS_PER_QUERY = 40

/** Insights carried into synthesis after fusion across queries. Bounded by what
 *  fits a prompt alongside their quotes, not by what retrieval can find. */
export const AGENT_INSIGHTS_TOTAL = 60

/**
 * Questions per TENANT per calendar month (Phase 1 WP21, decision B).
 *
 * It replaced AGENT_DAILY_LIMIT = 50, which could not fire underneath it: a
 * workspace hits forty in a month long before it hits fifty in a day, and a cap
 * that can never refuse anything teaches a reader that the other one will not
 * either.
 *
 * Priced from the question path, not from the pooled ledger. The $0.058 that
 * has been quoted for a question is a figure about the document builder — 141
 * of production's 151 `agent_answer` rows are its research calls. On the ten
 * rows that are a real question the mean is $0.0469 + $0.0003 interpret =
 * $0.047, spread $0.019-$0.068. Forty questions is therefore ~$1.90 a month,
 * and up to ~$20 if every one of them is a large document check
 * (lib/ask/quota.ts prices a big plan at $0.35-0.50).
 *
 * Counted on `agent_messages`, in lib/ask/quota.ts — which says why that table
 * and not the ledger. Raising it for one workspace is a code change today, not
 * a column; a per-tenant override is worth having the first time a client asks
 * for one, and not before.
 */
export const ASK_MONTHLY_CAP = 40

/** Reasoning effort for the agent's synthesis call, SEPARATE from the
 *  pipeline's SYNTHESIS_REASONING_EFFORT. A weekly report can afford to think
 *  for minutes; someone waiting on a page cannot. Measured on Ossur's corpus,
 *  2026-08-22 — see the plan doc for the numbers behind this value. */
export const AGENT_REASONING_EFFORT = 'medium' as const

/** Longest question accepted. Past this it is a document, and the document
 *  check is the right tool — pasting a plan into a question box gets a worse
 *  answer than uploading it. */
export const AGENT_QUESTION_CHARS = 2000

/** Turns of prior conversation shown to the agent. A thread is a refinement,
 *  not an archive — beyond a few turns the model starts answering the shape of
 *  the conversation instead of the question. */
export const AGENT_HISTORY_TURNS = 6

/** Angles one question is expanded into before retrieval. More angles is more
 *  recall and more embedding calls (cents); fewer is faster and blinder. */
export const AGENT_MAX_QUERIES = 5

/** Real comments attached to one grounded point. Enough that the reader sees
 *  the voices rather than a claim about them, few enough that the answer stays
 *  an answer. A point that cannot muster one is not grounded. */
export const AGENT_QUOTES_PER_POINT = 3

/** Calendar months of history the agent reads for a "has this changed?"
 *  question (Phase 1 WP21). Twelve is a year — long enough that a direction
 *  word has room to be earned three times over and a seasonal tenant is
 *  compared with its own year, short enough that the model is not handed a
 *  decade of numbers to find a pattern in. The THREE constants this replaced
 *  (AGENT_TREND_MAX_RUNS / MIN_POINTS / MIN_EVIDENCE) were floors on a
 *  run-indexed series and have no meaning on the monthly one: the floors are
 *  SHARE_BAND's, applied by the same band every other reading uses. */
export const AGENT_MOVEMENT_MONTHS = 12

/** Themes whose movement one answer's prompt carries. A question retrieves up
 *  to AGENT_INSIGHTS_TOTAL insights across many themes; every one of them with
 *  a year of months would be most of the prompt, and a specific question would
 *  get a general answer. Ranked by whether the line SAYS anything
 *  (lib/agent/movement.ts rankMovement), never by chance. */
export const AGENT_MOVEMENT_TOPICS = 8

// AGENT_ENABLED IS RETIRED (Phase 1 WP21, decision B). It was the master switch
// for the Verbatim Agent and it never switched the surface off: the pages
// rendered with the flag unset, and only the sidebar item and the send route
// read it. Ask is one of the nine surfaces now and the gate that decides who
// may spend is `canAsk` (lib/agent/access.ts) plus the monthly cap below. A
// flag whose only remaining job is to hide a menu entry is a flag that tells a
// reader the wrong thing about what is switched on.

/** How much evidence two personas must share for the newer one to BE the older
 *  one. A profile is not a weekly report — "Caregiver" should still be
 *  Caregiver in three months while what they want moves underneath. Matching is
 *  on the insight sets, not the name, for the reason theme_registry exists:
 *  a reasoning model takes no temperature, so identical input still produces
 *  different words. Set below REGISTRY_MATCH_STRONG (0.5) because a persona
 *  spans many themes and its evidence naturally turns over faster than a single
 *  theme's does — the corpus grows every week under the same person. */
export const PERSONA_MATCH_MIN = 0.35

/** Hero quotes attached per persona. Three is what the page shows behind one
 *  "see the voices" click; more is stored weight nobody reads. */
export const PERSONA_QUOTES = 3

/**
 * Theme identity is matched on MEMBERSHIP (which insights are in the theme),
 * not on the label — measured on two Sealand runs whose Pass A output was
 * byte-identical (shape A froze it): 507 of 537 themes had an exactly identical
 * supporting_insight_ids set, while 48 of the 58 themes the label-embedding rule
 * called "new" were the same theme with a new label. Cosine among
 * provably-identical themes ran 0.51-1.00 — overlapping the "different theme"
 * band, so no threshold rescues it.
 *
 * STRONG: Jaccard at or above this is the same theme outright (the exact-set
 * case scores 1.0). 0.5 sits below the measured merge/split band (0.3-0.9) but
 * far above unrelated pairs, which share almost no insights at all.
 * WEAK: the ambiguous band. A match here ALSO needs label cosine >=
 * THEME_MATCH_THRESHOLD — this is where a cluster genuinely reshaped and the
 * two signals have to agree before a time series is continued.
 */
export const REGISTRY_MATCH_STRONG = 0.5
export const REGISTRY_MATCH_WEAK = 0.25

/** Themed runs a registry entry can go unobserved before it is marked dormant.
 *  It revives on the next match — dormancy hides an entry, it never deletes it. */
export const REGISTRY_DORMANT_RUNS = 3

// --- Direction words on the run-indexed series (D1, 2026-09-15) -------------

/**
 * ALL OFF, and deliberately: nothing may tell a client a theme is gaining, fading
 * or gone quiet while the only series we hold is indexed by UPDATE.
 *
 * Every gaining / fading / New on a theme today compares two readings of one
 * cumulative corpus taken at two arbitrary moments — not two periods. A
 * fortnight between updates, an analysis-only re-read that gathered nothing, or
 * a week that was missed moves the number as much as the conversation does. It
 * shows: Voice filed "Audience identities and amputation types" under *Fading*
 * on a strength score of 8 → 7 — a model score nobody is ever shown — beside a
 * sparkline that went 167 → 182 conversations. The design forbids this surface
 * "including as a temporary measure", so it is gated off rather than reworded.
 *
 * What is NOT gated, because it is a period reading with an n and a band: the
 * digest's sentiment and share verdicts, and the registry-gated "N new themes"
 * count in the email. Every LEVEL — counts, shares, sentiment, the theme map,
 * the lists — is untouched.
 *
 * ONE FLAG PER READER (Phase 1 WP0, 2026-09-15). Phase 0 shipped a single
 * boolean, which made the flip all-or-nothing: the first reader re-based on
 * the comment-dated monthly series could not be turned on without turning on
 * six that were not. The constant is now a map, and `directionWordsFor` is the
 * only way to read it, so a reader flips the day its own series is honest and
 * not before.
 *
 * `profile.mix` joins the map having never been gated at all — the Consumer
 * Profile's "How the mix has moved" is a line across `consumer_profiles` rows
 * indexed by run_date, which is precisely the series D1 is about. It was
 * missed in Phase 0 because the surface draws a chart and prints no direction
 * WORD; a line that rises is a direction claim whether or not a word says so.
 *
 * Annotated `boolean` (the map's value type) rather than left to infer the
 * literal `false`: a literal narrows every gated branch to dead code, and
 * TypeScript then stops checking the half Phase 1 turns back on. For the same
 * reason every gated branch READS the map rather than deleting its code, and
 * every gated pure function takes the answer as an argument defaulting to it,
 * so both answers stay under test.
 */
export type DirectionReader =
  /**
   * Voice of Customer · "Gaining and fading" — the tile, its drawer, its deck slide.
   *
   * STILL FALSE AFTER VOICE SHIPPED (Phase 1 WP13), and the plan's "flips
   * `voice.movers` in the direction map" is answered by not flipping it —
   * the same answer WP11 gave `dashboard.themes` below, for the same reason
   * and one more that is this key's own.
   *
   * The shared reason: this key gates the LEGACY Voice of Customer module,
   * whose renderables are registered under the page key `voice`
   * (components/pages/registry.ts) and reached by the export route, the share
   * page, the Studio's catalogue and `lib/reports/templates.ts`. WP13 replaced
   * the ROUTE at /dashboard/voice; the module stays, because an artefact names
   * a module and not an address. Flipping this key would re-register
   * `voice.movers`, return it to the Studio picker and to the monthly-marketing
   * starter, and hand a NEW report a tile whose series is `themes` rows per RUN
   * with a per-update sparkline beside it — the exact object D1 exists to
   * suppress. Nothing stored names it today (checked read-only on production:
   * zero `reports` rows and zero `report_snapshots` name the page `voice`),
   * which is an argument for leaving it alone, not for switching it on.
   *
   * The reason of its own: VO2 does not read this map at all. It ranks the
   * comment-dated month series, bands each row against the month before it
   * (`monthChange`), and prints a direction word only where `directionWord`
   * earns one over three consecutive months inside one clustering regime. A
   * key flips when the surface it names RE-BASES; this surface has not
   * re-based, it has been replaced, and its replacement needs no permission
   * from here.
   */
  | 'voice.movers'
  /**
   * Dashboard · the themes list's "New" chip, the movement row, the email's chip.
   *
   * STILL FALSE AFTER OVERVIEW SHIPPED (Phase 1 WP11), and the plan's "the
   * reader flips `dashboard.themes`" is answered by not flipping it. This key
   * gates the LEGACY Dashboard's tiles and the digest's chip, and those read
   * the run-indexed series exactly as they always did; Overview replaced the
   * dashboard's ROUTE, not its module, which stays registered so one sent
   * snapshot, one live share link and two weekly schedules keep rendering
   * (WP9). Flipping this key would turn direction words back on inside those
   * artefacts, which is the thing D1 forbids.
   *
   * Overview earns its own direction words a different way and reads nothing
   * here: `directionWord` (lib/reading/bands.ts) takes three consecutive months
   * of the comment-dated series in one clustering regime, each clearing both
   * floors. That is the re-basing this map exists to make possible — the key
   * flips when the surface it names re-bases, and this surface has not; it has
   * been replaced.
   */
  | 'dashboard.themes'
  /** Reports & briefs · a theme's trajectory word in a document block. */
  | 'documents.trajectory'
  /**
   * Ask · the movement paragraph a "trend" question is answered from.
   *
   * TRUE SINCE PHASE 1 WP21, and the first key in this map to flip. The block
   * it gates no longer reads `theme_observations` — one row per theme per RUN,
   * dated by the wall clock at persist, with a ±25% ratio against the mean of
   * the prior readings and no denominator anywhere. It reads
   * `month_theme_readings` against `month_denominators`: calendar months dated
   * by the comment, each with its own n, compared by the product's own band,
   * and a direction word only where `directionWord` earns one over three
   * consecutive months in one clustering regime under one name.
   *
   * That is the re-basing this map exists for, and it is why this key flips
   * while the other six do not: the others still name a surface reading the
   * run-indexed series. The gated branch is KEPT and tested — turning this off
   * returns the agent to saying a topic's history is not readable, not to the
   * old series, which is deleted.
   */
  | 'agent.movement'
  /** Initiatives · whether the conversation went the way the client said they wanted. */
  | 'initiatives'
  /**
   * Competitive · share-point deltas "since your first update".
   *
   * NOT FLIPPED BY WP14, and the plan's "done when" says it should be. It must
   * not. This key gates the PARKED Competitive Intelligence page
   * (components/pages/competitive/index.tsx, via `shareDeltaShown`) and the
   * weekly digest's delta block (components/email/tiles.tsx), both of which
   * read `run_summary.period_share_of_voice` exactly as they always have —
   * two readings of one cumulative corpus taken at two arbitrary moments.
   * Flipping the key would turn direction words back on inside those, which
   * is what D1 forbids.
   *
   * The new Competitive surface (lib/pages/competitive-surface.ts) reads
   * nothing here. Its direction words are earned by a `Verdict` off the
   * comment-dated month rows, with an n and a band on both sides — the
   * re-basing this map exists to make possible. A key flips when the surface
   * it names re-bases; this one has not re-based, it has been replaced.
   * WP11 reached the same answer about `dashboard.themes` for the same reason.
   */
  | 'competitive.deltas'
  /** Consumer Profile · "How the mix has moved", the per-persona share line. */
  | 'profile.mix'

/** Every reader, for the tests and for a Settings surface that lists them. */
export const DIRECTION_READERS = [
  'voice.movers', 'dashboard.themes', 'documents.trajectory', 'agent.movement',
  'initiatives', 'competitive.deltas', 'profile.mix',
] as const satisfies readonly DirectionReader[]

/**
 * NOT named `RUN_INDEXED_DIRECTION_WORDS`. Phase 0's constant of that name was
 * a `boolean = false`, and `main` still exports it as one; an object under the
 * same identifier would make every `RUN_INDEXED_DIRECTION_WORDS ? on : off`
 * merged in from main — or written from memory by a later package — silently
 * take the ON branch, with tsc and eslint both quiet about it. The rename is
 * the gate; "never read the map directly" is only a rule.
 */
export const DIRECTION_WORDS_BY_READER: Record<DirectionReader, boolean> = {
  'voice.movers': false,
  'dashboard.themes': false,
  'documents.trajectory': false,
  // The one true key: Ask's movement block re-based on the comment-dated
  // monthly reading in WP21. See the type above for why this one and not the
  // other six.
  'agent.movement': true,
  'initiatives': false,
  'competitive.deltas': false,
  'profile.mix': false,
}

/** May this reader print a direction? Read it; never read the map directly. */
export function directionWordsFor(reader: DirectionReader): boolean {
  return DIRECTION_WORDS_BY_READER[reader]
}

/**
 * When the pages Phase 1 replaces stop being reachable (decision C). A
 * placeholder until Heinrich sets it at R2: the old Reports page, Dashboard,
 * Guide, Connections, Initiatives, Voice of Customer, Market Intelligence,
 * Competitive and Consumer Profile retire on this date, and the shell reads it
 * rather than each page carrying its own answer. ISO, no time: a retirement is
 * a day, and the reader's timezone decides when that day starts for them.
 */
export const OLD_PAGES_RETIRE_ON = '2026-11-30'

// Order-of-magnitude Apify spend per platform, for RANKING keywords in
// scripts/keyword-roi.ts — never invoicing. Apify doesn't land per-actor cost
// in our DB (runActor returns items only), so these are coarse constants
// anchored to run ef1e28a3 (2026-08-09, $4.35 total; IG historically ~85% of
// spend). Recalibrate against the Apify console when actors or depths change.
export const APIFY_COST_ESTIMATES: Record<string, { search: number; perVideoComments: number }> = {
  tiktok: { search: 0.03, perVideoComments: 0.02 },
  instagram: { search: 0.02, perVideoComments: 0.12 },
  youtube: { search: 0, perVideoComments: 0 }, // official Data API — free
  // Reddit: pay-per-event, so this one is arithmetic rather than a guess.
  // search = $0.02 start + 50 posts x $0.002; comments = $0.02 start + a ~15
  // comment thread x $0.002. Measured against the actor's published pricing
  // 2026-08-13; recheck if the actor changes.
  reddit: { search: 0.12, perVideoComments: 0.05 },
}

// --- Keyword candidate discovery (2026-09-13) --------------------------------
// The inverse of keyword ROI: terms the corpus keeps handing us that nobody
// configured. Mined per run from the gate-kept videos' classifier topics and
// hashtags (lib/pipeline/keyword-discovery.ts) — pure aggregation, no model call.

/** Platform noise a hashtag carries no matter what the video is about. Folded
 *  (lowercase, diacritics stripped) before comparison, so 'FYP' and 'fypシ'
 *  both land here. Numeric and 1-2 character tokens are dropped by rule rather
 *  than by list. Keep this short: the exclusion that matters is "already
 *  configured", and over-listing hides real terms. */
export const DISCOVERY_STOP_TERMS: string[] = [
  'fyp', 'fypシ', 'foryou', 'foryoupage', 'fy', 'xyzbca',
  'viral', 'trending', 'explore', 'reels', 'shorts',
  'tiktok', 'instagram', 'youtube', 'capcut', 'ad', 'sponsored',
]

/** Distinct videos a term needs in one run to be a candidate. Three is the
 *  repo's "more than once is not a pattern, three times is" floor (it is also
 *  THEME_MIN_VIDEOS' and PERSONA_MIN_VIDEOS' number). */
export const DISCOVERY_MIN_VIDEOS = 3

/** Candidates stored per run. A long tail of 3-video terms is noise an operator
 *  will never read; the cap keeps the table a shortlist. */
export const DISCOVERY_MAX_TERMS = 200

/** Longest term worth storing. Two reasons, both hard: a caption can carry a
 *  run-on pseudo-tag (the corpus already holds a 463-character one in
 *  `videos.hashtags`) and nobody will ever search it; and `keyword_candidates`
 *  puts `term` in a btree unique index, whose row cannot exceed 2704 BYTES — a
 *  long enough term is not a bad row, it is an insert that fails outright and
 *  costs the run its candidates. 120 characters is ~30x the median tag and
 *  drops 7 distinct tags in the whole corpus. */
export const DISCOVERY_MAX_TERM_CHARS = 120

// --- Delta-scraping (2026-07-16) ---------------------------------------------
// Corpus measurement behind the re-check layer: ~73% of an IG video's lifetime
// comments arrive within 7 days of upload, ~27% after — signal the one-shot
// scrape design permanently missed. See lib/gather/delta.ts.

/** Min NEW comments (fresh count − count at last scrape) before a known video
 *  earns a paid re-scrape. A scrape is a whole actor run; 1-2 stragglers don't
 *  cover it. */
export const RECHECK_MIN_GROWTH = 3

/** Max re-check scrapes per platform per run — cost guardrail so a viral spike
 *  across many old videos can't blow up a weekly run's Apify bill.
 *
 *  25 → 100 (2026-09-09). ~27% of a video's lifetime comments arrive after its
 *  first week and collecting them is the entire point of this layer; at 25 a
 *  corpus of a few hundred still-active videos met the cap most weeks, so the
 *  layer was sampling the tail rather than gathering it. A TikTok/Instagram
 *  re-scrape is a fraction of a Reddit one, so 100 stays single-digit dollars. */
export const RECHECK_CAP = 100

/** How far back (days) the native-API re-check looks for still-active stored
 *  videos (YouTube — free counts via videos.list). Days 8-30 hold ~11% of
 *  lifetime comments; past 30 days the tail (~16%) is mostly old-viral noise
 *  the weekly product shouldn't chase. */
export const RECHECK_WINDOW_DAYS = 30

/** report_period → TikTok actor `dateRange` (Technical.md scrape-window mapping). */
export function periodToTikTokRange(period: string): string {
  return period === 'daily' ? 'TODAY' : period === 'monthly' ? 'THIS_MONTH' : 'THIS_WEEK'
}

/** report_period → window length in days. The shared mapping behind the flow-run
 *  gather window and the period-metrics slice (YouTube's publishedAfter uses the
 *  same numbers). */
export function periodWindowDays(period: string): number {
  if (period === 'daily') return 1
  if (period === 'monthly') return 30
  // Everything else is a week, and 'paused' is spelled out because it is a LIVE
  // value, not a typo: Sealand's report_period is 'paused' today and 9 of the 17
  // run_summary rows in production carry it. 'paused' means "never due" to the
  // scheduler (schedule-due.ts) — it says nothing about how much a manual run on
  // that tenant should cover, and a week is what it has always covered. Reading
  // that answer out of a ternary's default arm made it look accidental.
  return 7
}

/** How far back an ANCHORED gather window may reach (D6, 2026-09-15). A run
 *  anchors its window on the previous run's end, so after a long silence the
 *  window would otherwise be as wide as the gap — and the gather's real cost is
 *  one paid comment scrape per eligible video, so a three-month window is a
 *  three-month bill. 30 days is the deepest cadence the product offers
 *  (monthly), so the cap can never narrow a tenant's configured window. */
export const MAX_ANCHOR_DAYS = 30

/** report_period → the window's inclusive lower bound as 'YYYY-MM-DD' (UTC day).
 *  The one date the whole gather agrees on: the flow-run window filter, the
 *  Instagram actor's `onlyPostsNewerThan`, and the owned-census stop condition
 *  all read it, so a search bound can never disagree with the filter that
 *  judges what the search returned. */
export function periodSince(period: string): string {
  return new Date(Date.now() - periodWindowDays(period) * 86_400_000).toISOString().slice(0, 10)
}

/**
 * A run's EFFECTIVE period, resolved ONCE per run: the trigger's
 * `options.period` override wins over the tenant's
 * `tracking_configs.report_period`, and 'weekly' is the fallback when neither
 * is set (the same default every call site used to inline).
 *
 * The whole point is that one value drives the run end to end — the gather
 * window and the search adapters' date bounds, the owned-post window, the
 * synthesis period slice, the owned census and `run_summary.period`. Before
 * this, only the gather half honoured the override: a manual `{period:
 * 'monthly'}` run on a tenant whose report_period is 'paused' gathered 30 days
 * and then reported the 7-day slice against it (run cb0d97b2, 2026-09-09 —
 * 1,149 videos gathered, period_videos=405).
 */
export function effectivePeriod(optionsPeriod?: string | null, configPeriod?: string | null): string {
  return optionsPeriod || configPeriod || 'weekly'
}


// ------------------------------------------------- Reports & Exports (2026-08-29)

/** Exports per tenant per UTC day. A render is ~5–12 s of a 2 GB function and
 *  a Storage object; uncapped, one account holding the button is a bill and a
 *  starved function pool. Same crude daily count as the Ask/Agent caps. */
export const EXPORT_DAILY_LIMIT = 50

/** Items the `full` page variant will render as their own slide. A Market
 *  page with sixty findings is a deck nobody presents; past this the export
 *  says so and stops. */
export const EXPORT_FULL_MAX_ITEMS = 40
/** A snapshot ref stores the page's URL params verbatim; these cap what a
 *  request body may put there (review B). */
export const EXPORT_PARAMS_MAX_KEYS = 20
export const EXPORT_PARAMS_MAX_CHARS = 200

// Report Studio (Stage 2, 2026-08-30).
/** The cover is written in the reader's register by a small model — three to
 *  five sentences over figures the code computed. Not SYNTHESIS_MODEL: that is
 *  a reasoning model measured in minutes, and a cover has nothing to reason
 *  about; every number is substituted by code (lib/reports/cover.ts). */
export const COVER_MODEL = 'gpt-5.4-mini'
/** Sections a report may hold; a deck past REPORT_SLIDES_WARN slides gets a
 *  note in the Studio (renders take longer, readers read less). */
export const REPORT_MAX_SECTIONS = 12
export const REPORT_SLIDES_WARN = 40
/** A build past this many slides is refused with a sentence — Chrome's
 *  maxDuration would refuse it less politely. */
export const REPORT_MAX_SLIDES = 120
/** A share link's default life, in days; the UI offers 7 / 30 / 90 / none. */
export const SHARE_DEFAULT_EXPIRY_DAYS = 30
export const SHARE_EXPIRY_CHOICES = [7, 30, 90, null] as const

// Schedules (Stage 3, 2026-08-30).
export const SCHEDULE_NAME_MAX = 80
/** Recipients per schedule — the cap tracking_configs.report_emails had. */
export const SCHEDULE_RECIPIENTS_MAX = 25
/** A send claimed this long ago that never finished may be tried again —
 *  wider than the route's 300 s cap plus Inngest's retry backoff, so a late
 *  retry finds a claim, not a second email. */
export const SCHEDULE_CLAIM_STALE_MS = 30 * 60_000

// Document reports (2026-08-31): the Sales brief and the templates after it.
/** Model spend one build may reach. Research stops asking past it; the
 *  writing pass always runs. A build is ~8 gpt-5.4 calls; this is a ceiling
 *  against a runaway, not a budget to spend. */
export const DOCUMENT_BUILD_BUDGET_USD = 3
/** Themes from different buckets (yours, a competitor's, the category's) that
 *  read as the same concern merge above this cosine on their stored label +
 *  description embeddings; between LEXICAL and this they merge only when the
 *  labels share a content word. Measured on Össur's 30 Aug run (541 themes):
 *  the same concern across buckets sits at 0.55–0.80, every pair above 0.70
 *  was a true merge, and the shared word told the true pairs below it. */
export const DOCUMENT_MERGE_THRESHOLD = 0.7
export const DOCUMENT_MERGE_LEXICAL_THRESHOLD = 0.6
/** Under this many conversations in the period the brief says the update was
 *  thin and writes fewer findings rather than padding. */
export const DOCUMENT_THIN_CONVERSATIONS = 300
/** A finding rests on grounded points totalling at least this many
 *  conversations, or it goes to "not sure yet". */
export const DOCUMENT_FINDING_MIN_CONVERSATIONS = 3
/** A grounded point or concern is cited by number only from this many
 *  conversations; under it the writer names the pattern, not the count. */
export const DOCUMENT_CITED_COUNT_MIN = 3
/** Questions the researcher asks the agent per build (five anchors, the rest
 *  from the update's own concerns), and how many run at once. */
export const DOCUMENT_QUESTIONS_MAX = 8
export const DOCUMENT_RESEARCH_PARALLEL = 3
/** Questions one per-competitor anchor turns into: a third competitor's card
 *  is written from the signals alone. */
export const COMPETITOR_QUESTIONS_MAX = 2
/** What one research question costs and what the writing and the self-check
 *  take out of the same build budget, both measured on the 2026-09-12 Sealand
 *  custom build (8 questions, $0.378 research; $0.134 write, $0.021 check).
 *  Used to say how many topic blocks a custom brief can afford to include. */
export const DOCUMENT_QUESTION_USD = 0.05
export const DOCUMENT_WRITE_CHECK_USD = 0.2
/** A build row younger than this and not finished belongs to whoever is on
 *  it (the Studio answers 409 with its id); older, it is taken as dead
 *  (function killed, deploy mid-run) and marked failed so a new one may start. */
export const DOCUMENT_BUILD_STALE_MS = 30 * 60_000
/** Characters an operator's edit of one block may hold (a long paragraph is ~1,200). */
export const DOCUMENT_EDIT_MAX = 4000
/** Characters an operator's own brief may hold on a custom document (2026-09-12):
 *  one instruction, long enough to name the question and the reader, short
 *  enough that it stays an instruction rather than a draft. */
export const DOCUMENT_BRIEF_MAX = 1200
/** Characters per block field: pages look alike every week because the
 *  writer cannot run long. Enforced in the schema description and by scrub. */
export const DOCUMENT_BLOCK_MAX: Record<string, number> = {
  summary: 1000, headline: 90, saw: 1050, heard: 260, means: 480, practice: 180, sure: 220,
  pitch: 520, praise: 520, hurt: 520, read: 420, persona: 260, not_sure: 180, care: 220,
  // "What others say about them" (2026-09-15) is the competitor page's fourth
  // column, and a fourth column is a narrower one — the same characters take
  // half again as many lines. Shorter than its three neighbours on purpose:
  // it is the block the page gained, not one it was built around.
  about: 420,
  // The pages the leadership, market and content briefs add (2026-09-02).
  standing: 900, gap: 330, asked: 220,
}

