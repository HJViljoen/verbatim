import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { openai, samplingParams } from '../openai'
import { SYNTHESIS_MODEL, estimateCost, AGENT_HISTORY_TURNS, AGENT_REASONING_EFFORT, directionWordsFor } from '../config'
import { logAiCall } from '../pipeline/ai-log'
import { CALIBRATED_PROSE_RULE, stripThemeRefs } from '../pipeline/prose-rules'
import { enforceRegisters, type RawAnswer } from './enforce'
import { interpretQuestion } from './interpret'
import { retrieveForQueries, latestRunId, embeddedInsightCount, type RetrievedInsight } from './retrieve'
import { loadMovement, renderMovement, NO_MOVEMENT_BLOCK, type MovementReading } from './movement'
import { OUT_OF_CORPUS_NOTICE, type AgentAnswer, type QuestionPlan } from './types'

// The answering half. Retrieval has already put real insights and real quotes
// on the table; this asks the model to answer the client's question FROM them,
// and then lib/agent/enforce.ts decides what the client is allowed to see as
// evidence.
//
// One call, not two. The Ask engine splits verdict and judgement across two
// calls so a proposal cannot drift into the evidence field — here the same
// guarantee comes from enforcement instead: a point is grounded because its ids
// resolve, not because the model put it under the right heading. One call keeps
// a conversational turn inside a sane latency budget, which two 165-237s
// synthesis calls would not.

export const PROMPT_VERSION_ANSWER = 'agent_answer_v1'

const AnswerSchema = z.object({
  answer: z.string(),
  // `ref` is the model's OWN label for the point, and it exists so judgement
  // can point at it. Without it the two registers cannot be linked at all: the
  // product used to assign G1..Gn after the reply, which the model had no way
  // to predict, so every proposal came back citing nothing.
  grounded: z.array(z.object({ ref: z.string(), text: z.string(), insight_ids: z.array(z.string()) })),
  judgement: z.array(z.object({ text: z.string(), based_on: z.array(z.string()) })),
  nearest: z.array(z.object({ text: z.string(), insight_ids: z.array(z.string()) })),
})

export function buildAnswerPrompt(companyName: string, allowNearest: boolean): string {
  return [
    `You are Verbatim, answering a question for someone at ${companyName} from public consumer conversation their category has already been mined for.`,
    'You are an analyst speaking in your own voice. You are NOT a persona and you never speak as a consumer.',
    '',
    'ANSWER FIRST. `answer` is 1-3 sentences that actually answer what was asked. Not a preamble, not a description of what you found.',
    '',
    'THREE REGISTERS, and the difference is the whole product:',
    '- `grounded[]`: points the evidence below supports. Give each one a short `ref` ("G1", "G2", …) and list the insight ids it rests on, copied exactly from the evidence. A point you cannot tie to an id does not belong here.',
    '- `judgement[]`: your own reading — what you would do, what connects, what it implies. Propose freely here. Each entry cites, in `based_on`, the `ref` values of the grounded points it reasons from. This register is welcome and expected; an answer that is only description is less useful than one that says what it means.', // em-dash-ok: model prompt
    allowNearest
      ? '- `nearest[]`: ONLY when the evidence does not address the question but does address something adjacent worth knowing. Say plainly that it is not what was asked. Leave empty otherwise.'
      : '- `nearest[]`: always empty. Leave it as an empty array.',
    '',
    'RULES:',
    '- Never invent an insight id. Use only ids present in the evidence.',
    '- Never quote a comment yourself — the product attaches the real quotes to your grounded points. Describe what people express; do not reproduce their words.', // em-dash-ok: model prompt
    '- If the evidence genuinely does not speak to the question, return an empty `grounded` array rather than stretching. Saying nothing is a real answer here and it is not a failure.',
    "- Do not describe the company's own metrics, spend or results. You cannot see them.",
    CALIBRATED_PROSE_RULE,
  ].join('\n')
}

function renderEvidence(insights: RetrievedInsight[]): string {
  return insights
    .map((i) => {
      const bits = [
        `id: ${i.id}`,
        `topic: ${i.theme.replace(/_/g, ' ')}`,
        i.emotion ? `mood: ${i.emotion}` : null,
        i.journeyStage ? `stage: ${i.journeyStage}` : null,
      ].filter(Boolean).join(' | ')
      // Up to two real comments per insight so the model reasons from what
      // people said and not from the pipeline's label — the measured
      // under-recall behind say_vs_hear, which sees labels only.
      const voices = i.quotes.slice(0, 2).map((q) => `      "${q.quote}"`).join('\n')
      return `- ${bits}\n    ${i.description}${voices ? `\n${voices}` : ''}`
    })
    .join('\n')
}

/** The MOVEMENT block for one question: nothing unless the question asked about
 *  change, the monthly readings when `agent.movement` is on, and the
 *  not-readable-yet line when it is off or when the months hold nothing for the
 *  topics retrieved.
 *
 *  THE GATE STAYS EVEN THOUGH THE READER IS NOW TRUE. D1 is a rule about WHICH
 *  SERIES may carry a direction word, not a switch that was flipped once: the
 *  gated branch is kept and tested so that turning `agent.movement` off — for a
 *  tenant, a bug, a regression in the reading — returns the agent to silence
 *  about direction rather than to the run-indexed series it used to read. That
 *  series is gone; this block is the only movement the agent has.
 *
 *  Pure, so both answers stay tested; the loader above it is skipped entirely
 *  in the gated case, so the gate costs no reads either. */
export function movementBlock(
  readings: readonly MovementReading[] | null,
  timeframe: string,
  directionWords = directionWordsFor('agent.movement'),
): string {
  if (timeframe !== 'trend') return ''
  return readings && directionWords ? renderMovement(readings) : NO_MOVEMENT_BLOCK
}

export interface AnswerArgs {
  clientId: string
  companyName: string
  question: string
  runId?: string
  /** Prior turns, oldest first. Trimmed to AGENT_HISTORY_TURNS. */
  history?: { role: 'user' | 'agent'; content: string }[]
  /** Document mode passes false — a silent claim in an annotated document gets
   *  clean space, never a tangent. */
  allowNearest?: boolean
  persist?: boolean
}

export async function answerQuestion(
  admin: ReturnType<typeof import('../supabase-admin').createAdminClient>,
  args: AnswerArgs,
): Promise<AgentAnswer & { plan: QuestionPlan; retrievedCount: number; emptyQueries: string[] }> {
  const persist = args.persist !== false
  const allowNearest = args.allowNearest !== false
  let costUsd = 0

  const runId = args.runId ?? (await latestRunId(admin, args.clientId))
  if (!runId) {
    // No corpus at all is not silence about the question — it is silence about
    // everything, and the page says so differently.
    throw new Error('No completed run for this workspace yet.')
  }

  const { plan, costUsd: interpretCost } = await interpretQuestion(admin, {
    clientId: args.clientId, runId, companyName: args.companyName, question: args.question, persist,
  })
  costUsd += interpretCost

  const context = await retrieveForQueries(admin, {
    clientId: args.clientId, runId, queries: plan.retrievalQueries,
  })

  if (context.insights.length === 0) {
    // Before calling this silence, prove the index exists. A tenant whose
    // insights were never embedded returns zero rows for EVERY question, and
    // "nothing in the conversation relates to this" would be a confident lie
    // about their own customers. Silence is a claim about the corpus and it
    // has to be earned.
    if ((await embeddedInsightCount(admin, args.clientId)) === 0) {
      throw new Error(
        'This workspace has no searchable index yet, so the agent cannot answer. This is our side, not your data: nothing has been read yet.',
      )
    }
    // A real silence: the index exists and nothing in it cleared the floor. No
    // synthesis call is made, so silence is also the cheap path.
    const empty = enforceRegisters({}, [], { allowNearest, runId, costUsd })
    return { ...empty, plan, retrievedCount: 0, emptyQueries: context.emptyQueries }
  }

  // D1: while the direction words are gated the series is not even read — the
  // block it feeds is the one place the agent is told it may name a direction.
  // The AUDIENCES are the ones the retrieved insights actually came off:
  // retrieval has already dropped every rival's voice (scopeToClientVoices), so
  // this is the client's own audience and the rest of the category, and Ask
  // never reads a rival's months to answer a question about the client.
  const readings = plan.timeframe === 'trend' && directionWordsFor('agent.movement')
    ? await loadMovement(admin, {
        clientId: args.clientId,
        registryIds: context.insights.map((i) => i.themeRef?.registryId).filter((r): r is string => Boolean(r)),
        audiences: context.insights.map((i) => i.bucket),
      })
    : null

  const movement = movementBlock(readings, plan.timeframe)
  const system = buildAnswerPrompt(args.companyName, allowNearest)
  const historyBlock = (args.history ?? [])
    .slice(-AGENT_HISTORY_TURNS)
    .map((h) => `${h.role === 'user' ? 'They asked' : 'You answered'}: ${h.content}`)
    .join('\n')

  const user = [
    historyBlock ? `EARLIER IN THIS CONVERSATION:\n${historyBlock}\n` : '',
    `QUESTION: ${args.question}`,
    '',
    `EVIDENCE — ${context.insights.length} findings drawn from ${context.conversationCount} conversations:`, // em-dash-ok: model prompt
    renderEvidence(context.insights),
    movement ? `\n${movement}` : '',
  ].filter(Boolean).join('\n')

  const started = Date.now()
  let usage = { prompt_tokens: 0, completion_tokens: 0 }
  let parsed: z.infer<typeof AnswerSchema> | null = null
  try {
    const completion = await openai.chat.completions.parse({
      model: SYNTHESIS_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: zodResponseFormat(AnswerSchema, 'agent_answer'),
      // The agent overrides the pipeline's sampling on purpose: a weekly report
      // can afford to think for four minutes, a conversational turn cannot.
      // See AGENT_REASONING_EFFORT for the measured trade.
      ...(SYNTHESIS_MODEL.startsWith('gpt-5')
        ? { reasoning_effort: AGENT_REASONING_EFFORT }
        : samplingParams(SYNTHESIS_MODEL)),
    })
    parsed = completion.choices[0]?.message?.parsed ?? null
    if (completion.usage) {
      usage = { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    if (persist) {
      await logAiCall(admin, {
        clientId: args.clientId, runId, pass: 'agent_answer', callIndex: 1, model: SYNTHESIS_MODEL,
        promptVersion: PROMPT_VERSION_ANSWER, systemPrompt: system, userPrompt: user,
        response: null, error, usage, durationMs: Date.now() - started, validationStatus: 'parse_error',
      })
    }
    // Fatal, and deliberately so: a failed answer must not be dressed up as
    // silence. "We have nothing on this" is a claim about the CORPUS, and it
    // must never be how a broken call looks to a client.
    throw new Error(`The agent could not answer: ${error}`)
  }

  costUsd += estimateCost(SYNTHESIS_MODEL, usage.prompt_tokens, usage.completion_tokens)
  if (persist) {
    await logAiCall(admin, {
      clientId: args.clientId, runId, pass: 'agent_answer', callIndex: 1, model: SYNTHESIS_MODEL,
      promptVersion: PROMPT_VERSION_ANSWER, systemPrompt: system, userPrompt: user,
      response: parsed, error: null, usage, durationMs: Date.now() - started,
      validationStatus: parsed ? 'ok' : 'parse_error',
    })
  }

  const raw: RawAnswer = {
    answer: stripThemeRefs(parsed?.answer ?? ''),
    grounded: (parsed?.grounded ?? []).map((g) => ({ ref: g.ref, text: stripThemeRefs(g.text), insightIds: g.insight_ids })),
    judgement: (parsed?.judgement ?? []).map((j) => ({ text: stripThemeRefs(j.text), basedOn: j.based_on })),
    nearest: (parsed?.nearest ?? []).map((n) => ({ text: stripThemeRefs(n.text), insightIds: n.insight_ids })),
  }

  const answer = enforceRegisters(raw, context.insights, { allowNearest, runId, costUsd })
  if (plan.intent === 'about_our_metrics') answer.notice = OUT_OF_CORPUS_NOTICE
  // emptyQueries is carried out, not discarded: which ANGLE found nothing is
  // the difference between "we do not cover this" and "that phrasing missed",
  // and it is the first thing to look at when an answer reads thin.
  return { ...answer, plan, retrievedCount: context.insights.length, emptyQueries: context.emptyQueries }
}
