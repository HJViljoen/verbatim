import { NextResponse } from 'next/server'
import { getRouteSession } from '@/lib/auth'
import { createAdminClient, isMissingColumnError, selectAll } from '@/lib/supabase-admin'
import { answerQuestion } from '@/lib/agent/answer'
import { runAsk, clipInput } from '@/lib/ask/engine'
import { extractPdfText, pageWarning, PdfTooLargeError, PdfUnreadableError } from '@/lib/ask/pdf'
import { latestRunId } from '@/lib/agent/retrieve'
import { canAsk, ASK_NOT_YOURS } from '@/lib/agent/access'
import { outcomeOf } from '@/lib/agent/types'
import { ASK_MONTHLY_CAP, AGENT_QUESTION_CHARS, ASK_PDF_MAX_BYTES } from '@/lib/config'
import { monthStartIso, evaluateMonthlyCap } from '@/lib/ask/quota'

// POST /api/agent — ask the Verbatim Agent a question.
//
// A route handler, not a server action: this will grow a document upload, and
// server actions cap a request body at 1 MB. No dot anywhere in the path —
// proxy.ts skips any path whose last segment contains one, and would skip the
// auth check with it.
//
// The tenant comes from the SESSION and never from the body. A request cannot
// ask about someone else's conversation by naming their client id.

export const runtime = 'nodejs'
// One cheap interpret call plus one synthesis call. gpt-5.4 has been measured
// at 165-237s for large pipeline prompts; an agent prompt is far smaller, but
// the ceiling stays generous so a slow answer fails as an answer, not a crash.
export const maxDuration = 300

export async function POST(request: Request) {
  const session = await getRouteSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  const { clientId, userId, role } = session

  // Decision B (2026-09-16): an owner or an admin may ask; a member reads.
  // AGENT_ENABLED is gone with it — an env var that hid the sidebar item while
  // the pages themselves rendered was never the gate it looked like, and the
  // gate that matters is this one, on the request that spends the money.
  if (!(await canAsk(role, userId))) {
    return NextResponse.json({ error: ASK_NOT_YOURS }, { status: 403 })
  }

  const admin0 = createAdminClient()

  // The monthly cap covers BOTH faces — one tenant, one budget. Counted on
  // questions asked, which a document check also is. The index this rides is
  // agent_messages_client_role_created_idx (client_id, role, created_at desc),
  // which is exactly this query.
  const { count: usedThisMonth, error: quotaErr } = await admin0
    .from('agent_messages')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('role', 'user')
    .gte('created_at', monthStartIso(new Date()))
  // Fail CLOSED. An unchecked error here made `count` undefined, which the cap
  // read as 0 — so the only spend limit in the product disappeared exactly when
  // the database was unhealthy.
  if (quotaErr) {
    console.error('[agent] cap read failed:', quotaErr)
    return NextResponse.json({ error: 'Could not start that just now. Try again shortly.' }, { status: 503 })
  }
  const cap = evaluateMonthlyCap(usedThisMonth ?? 0, ASK_MONTHLY_CAP)
  if (!cap.ok) return NextResponse.json({ error: cap.message }, { status: 429 })

  // ── Document mode ────────────────────────────────────────────────────────
  // A campaign or a plan, walked claim by claim. This delegates to the Ask
  // engine that already ships and is already proven on real documents — the
  // agent adds the surface and the thread, not a second engine.
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    return handleDocument(request, { clientId, userId })
  }

  let body: { question?: unknown; threadId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Could not read that request.' }, { status: 400 })
  }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) {
    return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 })
  }
  if (question.length > AGENT_QUESTION_CHARS) {
    return NextResponse.json(
      { error: `That is longer than a question — if it is a plan or a brief, the document check is the right tool for it.` },
      { status: 400 },
    )
  }
  const threadId = typeof body.threadId === 'string' ? body.threadId : null

  const admin = admin0

  const { data: client } = await admin
    .from('clients').select('company_name').eq('id', clientId).maybeSingle()
  const companyName = (client?.company_name as string | undefined) ?? 'the company'

  // Continue a thread only if it belongs to this tenant. A thread id in a body
  // is user input like any other.
  let thread: { id: string } | null = null
  let history: { role: 'user' | 'agent'; content: string }[] = []
  if (threadId) {
    const { data } = await admin
      .from('agent_threads').select('id').eq('id', threadId).eq('client_id', clientId).maybeSingle()
    if (data) {
      thread = data as { id: string }
      const prior = await selectAll<{ role: string; content: string }>(() =>
        admin.from('agent_messages').select('role, content')
          .eq('thread_id', (data as { id: string }).id)
          .order('created_at', { ascending: true }),
      )
      history = prior.map((p) => ({ role: p.role === 'user' ? 'user' : 'agent', content: p.content }))
    }
  }

  if (!thread) {
    const { data, error } = await admin
      .from('agent_threads')
      .insert({
        client_id: clientId,
        kind: 'question',
        // The question is the title. Trimmed for the list, never for the log.
        title: question.length > 90 ? `${question.slice(0, 87)}…` : question,
        created_by: userId,
      })
      .select('id')
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'Could not start that conversation.' }, { status: 500 })
    }
    thread = data as { id: string }
  }

  // The question is stored BEFORE the answer is attempted, on purpose. It is a
  // demand signal in its own right, and a question that made the agent fall
  // over is one of the more interesting rows in the table.
  //
  // CHECKED for the same reason as the document path's: since the monthly cap
  // counts these rows, this insert is the cap slot, and a fire-and-forget slot
  // is an uncapped spend whenever the write fails. The hole predates this
  // package — it was invisible while the only limit was fifty a day, which
  // could never fire — and it is closed here because the cap introduced by
  // this package is the thing that made it matter.
  const { error: slotErr } = await admin.from('agent_messages').insert({
    thread_id: thread.id, client_id: clientId, role: 'user', content: question,
  })
  if (slotErr) {
    console.error('[agent] could not record the question:', slotErr.message)
    return NextResponse.json({ error: 'Could not start that conversation.' }, { status: 500 })
  }

  try {
    const answer = await answerQuestion(admin, {
      clientId, companyName, question, history, allowNearest: true,
    })
    await admin.from('agent_messages').insert({
      thread_id: thread.id,
      client_id: clientId,
      run_id: answer.runId,
      role: 'agent',
      content: answer.answer,
      result: {
        answer: answer.answer,
        // NO QUOTE TEXT. A stored answer carries the ids it was grounded in and
        // nothing a commenter said; the words are resolved live when the thread
        // is read. This is the same rule consumer_profiles and plan_checks
        // already keep, and the reason it matters is erasure: a verbatim copy
        // here outlives the comment it came from, escapes erase-commenter, and
        // makes the published privacy promise false. It was written that way
        // first and a fresh-eyes review caught it.
        grounded: answer.grounded.map((g) => ({
          ...g,
          quotes: g.quotes.map((q) => ({ commentId: q.commentId, videoId: q.videoId })),
        })),
        judgement: answer.judgement,
        nearest: answer.nearest,
        notice: answer.notice ?? null,
        silent: answer.silent,
        retrievedCount: answer.retrievedCount,
        intent: answer.plan.intent,
        timeframe: answer.plan.timeframe,
        // The diagnostics, persisted rather than computed and thrown away.
        // Without these a thin or off-topic answer can only be found by a
        // human reading it; with them you can ask the table which questions
        // retrieved nothing, which expansions were bad, and how weak the
        // evidence behind an answer actually was.
        retrievalQueries: answer.plan.retrievalQueries,
        emptyQueries: answer.emptyQueries,
        groundedSpread: answer.grounded.map((g) => ({
          ref: g.id,
          insights: g.insightIds.length,
          conversations: g.conversationCount,
        })),
      },
      outcome: outcomeOf(answer),
      cost_usd: answer.costUsd,
    })
    return NextResponse.json({ threadId: thread.id, answer })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // The failure is NOT written as a silent answer. "Nothing relates to this"
    // is a claim about the corpus, and a broken call must never wear it.
    //
    // But the raw message does not go to the browser either: it carried the
    // Postgres function signature, the model-written retrieval queries and the
    // OpenAI org id straight onto the page. Logged in full, reported plainly.
    // The one exception is the unbuilt-index case, which is written FOR a
    // reader and says the fault is ours.
    console.error('[agent] answer failed:', message)
    const safe = message.startsWith('This workspace has no searchable index')
      ? message
      : 'That did not work — something went wrong on our side, not in your data. Asking again is safe.'
    return NextResponse.json({ threadId: thread.id, error: safe }, { status: 500 })
  }
}

// ── Document mode ──────────────────────────────────────────────────────────
//
// Stored in plan_checks, exactly as the Ask page's checks are, with an
// agent_thread pointing at it. Two reasons for reusing that table rather than
// inventing a parallel one: the weekly re-evaluation step already re-tests
// everything in it, so a document dropped here gets "what moved" for free; and
// erase-commenter already sweeps it.
async function handleDocument(request: Request, ctx: { clientId: string; userId: string }) {
  const { clientId, userId } = ctx
  const admin = createAdminClient()

  let text = ''
  let sourceFilename: string | null = null
  let notice: string | null = null
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (file instanceof File) {
      if (file.size > ASK_PDF_MAX_BYTES) {
        return NextResponse.json({ error: 'That file is too large to read in one go.' }, { status: 413 })
      }
      sourceFilename = file.name
      const out = await extractPdfText(Buffer.from(await file.arrayBuffer()))
      // A SCANNED DECK IS REFUSED, not read. /api/ask refused these from the
      // day it shipped and this route never did: `imageOnly` was computed and
      // ignored, so a deck of images reached runAsk, spent the extract call and
      // came back "I could not find any claims about customers or the market",
      // which blames the document for a limit that is ours. There is no OCR
      // here; saying so costs nothing and the client can paste the text.
      if (out.imageOnly) {
        return NextResponse.json(
          { error: 'This PDF has no readable text — it looks like scans or images. Paste the text instead.' },
          { status: 422 },
        )
      }
      text = out.text
      notice = pageWarning(out.pages)
    } else {
      text = typeof form.get('text') === 'string' ? (form.get('text') as string) : ''
    }
  } catch (e) {
    if (e instanceof PdfTooLargeError || e instanceof PdfUnreadableError) {
      return NextResponse.json({ error: e.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'That document could not be read.' }, { status: 400 })
  }

  text = text.trim()
  if (text.length < 20) {
    return NextResponse.json({ error: 'There was not enough readable text in that.' }, { status: 400 })
  }
  // Store exactly what was READ. Storing more would show a reader the whole
  // document beside verdicts covering only its first part.
  const clip = clipInput(text)
  text = clip.text

  const runId = await latestRunId(admin, clientId)
  if (!runId) {
    return NextResponse.json(
      { error: 'There is no analysed conversation to check this against yet.' },
      { status: 409 },
    )
  }

  const { data: client } = await admin
    .from('clients').select('company_name').eq('id', clientId).maybeSingle()

  // THE SLOT IS TAKEN BEFORE THE SPEND, as it is on the question path. It used
  // to be taken after the whole check had run and been stored, so a check that
  // failed late — the 502 below, or "no claims" — spent three model calls and
  // counted nothing, which under a monthly cap is an unbounded hole. The thread
  // and the submission row go in here, and the check attaches to them
  // afterwards; a failure leaves a thread saying a document was brought and not
  // answered, which is exactly what the question path leaves and exactly what
  // happened.
  const { data: thread, error: threadErr } = await admin
    .from('agent_threads')
    .insert({
      client_id: clientId, kind: 'document',
      title: sourceFilename || 'Document',
      created_by: userId,
    })
    .select('id')
    .single()
  if (threadErr || !thread) {
    return NextResponse.json({ error: 'Could not start that check.' }, { status: 500 })
  }
  const threadId = (thread as { id: string }).id
  // The submission counts as a question for the cap and for the demand log —
  // what a client brings to be checked is a demand signal like any other.
  //
  // CHECKED, because this insert IS the cap slot. Left fire-and-forget it was
  // the very hole moving it up here was meant to close: the row fails, the
  // three model calls below run regardless, and the workspace spends without
  // being counted — repeatably, since nothing about a failing insert gets
  // better on the next attempt. Refusing costs a client one check on a
  // transient write failure; not refusing costs an uncapped spend.
  const { error: slotErr } = await admin.from('agent_messages').insert({
    thread_id: threadId,
    client_id: clientId,
    run_id: runId,
    role: 'user',
    content: sourceFilename ? `Checked: ${sourceFilename}` : 'Checked a pasted document',
  })
  if (slotErr) {
    console.error('[agent:document] could not record the submission:', slotErr.message)
    return NextResponse.json({ error: 'Could not start that check.' }, { status: 500 })
  }

  let result
  try {
    result = await runAsk(admin, {
      clientId,
      runId,
      kind: 'plan',
      text,
      companyName: (client?.company_name as string) ?? 'the company',
    })
  } catch (e) {
    console.error('[agent:document] failed:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'That document could not be checked. Try again shortly.' }, { status: 502 })
  }

  if (!result.claims.length) {
    return NextResponse.json(
      { error: 'I could not find any claims about customers or the market in that document.' },
      { status: 422 },
    )
  }

  // What the reader must be told about the READING of this document, stored
  // with it (C11). It used to be computed, returned in the JSON body and thrown
  // away — the composer only navigates, and the thread page hard-coded
  // `notice={null}` — so a 90-page deck read to its first 60,000 characters was
  // shown verdicts over the whole thing with nothing saying where the reading
  // stopped.
  const readingNotice = clip.clipped || result.clipped
    ? 'That document was longer than I can read in one go — only the earlier part was checked.'
    : notice

  const checkRow = {
    client_id: clientId, run_id: runId, kind: 'plan',
    title: result.title || sourceFilename || null,
    input_text: text, source_filename: sourceFilename,
    claims: result.claims, summary: result.summary, judgement: result.judgement,
    created_by: userId,
  }
  let { data: check, error: checkErr } = await admin
    .from('plan_checks').insert({ ...checkRow, notice: readingNotice }).select('id').single()
  // The column arrives with its own migration and this deploy may land first.
  // A check that ran and cannot be saved over a notice would lose the whole
  // thing — three model calls and the client's document — so the retry drops
  // the notice and keeps the check, the recordConfigChanges precedent
  // (lib/config-log.ts). Once the migration is applied the retry never runs.
  if (isMissingColumnError(checkErr, 'notice')) {
    ;({ data: check, error: checkErr } = await admin
      .from('plan_checks').insert(checkRow).select('id').single())
  }
  if (checkErr || !check) {
    return NextResponse.json({ error: 'The check ran but could not be saved.' }, { status: 500 })
  }

  // CHECKED: this update is the only link between the thread the client lands
  // on and the check they just paid for. Unchecked, a failure here puts them on
  // a thread that says nothing was saved against their document while a stored
  // plan_checks row sits unreachable — the check is on the table and nobody can
  // read it. Reported as the save failure it is, and logged with the id so the
  // row can be re-attached by hand.
  const { error: linkErr } = await admin
    .from('agent_threads')
    .update({ title: result.title || sourceFilename || 'Document', plan_check_id: (check as { id: string }).id })
    .eq('id', threadId)
    .eq('client_id', clientId)
  if (linkErr) {
    console.error(
      `[agent:document] check ${(check as { id: string }).id} could not be attached to thread ${threadId}:`,
      linkErr.message,
    )
    return NextResponse.json({ error: 'The check ran but could not be saved.' }, { status: 500 })
  }

  // The notice travels with the thread now; the body keeps it so a caller that
  // does not navigate still has it.
  return NextResponse.json({ threadId, notice: readingNotice })
}
