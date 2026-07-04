// Shared prompt rule (Calibrated-Language doc 2026-07-04): magnitude words are
// assigned by code from measured data (lib/calibration.ts) — the model's prose
// must not free-style them. One string imported by Passes B/C/D so the wording
// never drifts between prompts.

export const CALIBRATED_PROSE_RULE =
  '- Your prose explains WHAT people express and WHY it matters — never HOW MUCH. ' +
  'Do not use intensity or frequency words: "very", "extremely", "significant", "overwhelming", ' +
  '"huge", "strong", "most", "many", "widespread", "frequent", "consistently", "growing", "increasingly", ' +
  'or their synonyms. The product renders measured counts next to your text, so a magnitude claim in ' +
  'prose is a defect. Comparisons ("X more than Y") are allowed only where the input data directly shows them.'
