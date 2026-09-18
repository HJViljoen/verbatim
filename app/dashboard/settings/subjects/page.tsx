import { SettingsCard, SettingsFrame } from '@/components/settings-frame'
import { SubjectEditor, type SubjectEditorRow } from '@/components/subjects/subject-editor'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { originLine, setLine } from '@/lib/pages/subjects'
import { subjectSetVerdict } from '@/lib/subjects/moves'
import { isMissingSubjects, TABLE_SUBJECTS, type Subject } from '@/lib/subjects/types'

// Settings › Subjects (Phase 1 WP16, design items 4 and 22, decision E) — the
// five to eight things this workspace wants to be known for, in its own words,
// and the candidates we can offer from what it already says.
//
// THE SUBJECT IS THE MEASUREMENT, WHICH IS WHY IT IS A FORM AND NOT A PICKER.
// A subject's name and its one sentence are read by the judge and both feed the
// phrase vector; they are the definition of what gets counted, not a label on a
// count. So a rename starts a new line and keeps the old one, and the editor
// says so before anyone uses it (lib/subjects/moves.ts nameSubject).
//
// PROPOSED IS NOT COUNTED. `subjects.status` defaults to 'proposed' and every
// reader that matters filters on 'active', so a named subject measures nothing
// until someone confirms it. The page draws the two as two lists rather than
// one list with a badge, because "we offered you this" and "you told us this"
// are different statements about the same workspace.
//
// THE EDITOR IS WP12'S, at WP12's path, in its `settings` variant — the design
// says in as many words that SU1 and this page are the same editor, and the
// reason is that they carry the same dangerous sentence about renaming. The
// role check this page used to make on its own moved into the write path
// (`lib/actions/subjects.ts`), so the two addresses refuse in one voice;
// `canEdit` here is the affordance, not the gate.

export default async function SettingsSubjectsPage() {
  const { supabase, clientId, role } = await getSessionContext()
  const canEdit = canManageTenant(role)

  const [{ data: client }, subjectRead] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase
      .from(TABLE_SUBJECTS)
      .select('id, client_id, name, description, origin, source_ref, named_at, status, superseded_by, embedded_at, embed_input_version, calibrated_at, calibration_precision, calibration_n, calibration_judge_version')
      .eq('client_id', clientId)
      .order('named_at', { ascending: true })
      .order('id', { ascending: true }),
  ])
  const tenant = (client?.company_name as string | undefined) ?? 'Your workspace'

  // Not switched on yet is a different answer from "you have named none", and
  // the page must not print the second when the first is true.
  const available = !isMissingSubjects(subjectRead.error)
  if (subjectRead.error && available) throw subjectRead.error

  const rows = ((subjectRead.data ?? []) as Subject[]).map((s): SubjectEditorRow => ({
    id: s.id,
    name: s.name,
    description: s.description,
    namedAt: s.named_at,
    status: s.status,
    because: originLine(s.origin),
    // NO LINK ON A STOPPED SUBJECT. `loadSubjectRows` excludes retired subjects
    // from the rail and `selectSubject` falls back to rail[0] with no notice —
    // the defect aa32043 fixed for `?themes=` — so this href opened a DIFFERENT
    // subject's page under the name the reader clicked.
    href: s.status === 'retired' ? undefined : `/dashboard/subjects?subject=${s.id}`,
  }))

  const named = rows.filter((s) => s.status !== 'proposed')
  const candidates = rows.filter((s) => s.status === 'proposed')
  const active = rows.filter((s) => s.status === 'active').length
  const verdict = subjectSetVerdict(active)

  return (
    <SettingsFrame
      active="subjects"
      title="Settings"
      context={`${tenant}${!canEdit ? ' · read-only' : ''}`}
      contentTitle="Subjects"
      contentMeta={available ? verdict.line : undefined}
      counts={available ? { subjects: { value: String(active), unit: `subject${active === 1 ? '' : 's'} being measured` } } : undefined}
    >
      <div className="flex flex-col gap-3">
        {!available ? (
          <SettingsCard title="Your subjects" description="What we read your market against.">
            <p className="text-[12px] text-muted-foreground">
              Subjects are not switched on for this workspace yet. When they are, we will bring you five to eight
              to look at, drawn from what your own videos already say.
            </p>
          </SettingsCard>
        ) : (
          <>
            <SettingsCard
              title="What we read your market against"
              description={`${verdict.line} Each one is counted by exactly the rule a theme is, so a subject and a theme can be read side by side.`}
            >
              <SubjectEditor
                rows={named}
                setLine={setLine(active, candidates.length)}
                variant="settings"
                canEdit={canEdit}
              />
            </SettingsCard>

            <SettingsCard
              title="Waiting for you"
              description="Drawn from what your own videos say and what the category keeps talking about. Nothing here is counted until you confirm it."
            >
              {candidates.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  Nothing is waiting. We bring new ones when your own videos start saying something we are not
                  already reading the market against.
                </p>
              ) : (
                <SubjectEditor
                  rows={candidates}
                  setLine={setLine(active, candidates.length)}
                  variant="settings"
                  canEdit={canEdit}
                />
              )}
            </SettingsCard>

            {verdict.state !== 'ready' && (
              <p className="text-[12px] text-muted-foreground">
                {verdict.state === 'short'
                  ? 'Below five, a month’s reading rests on too little to compare one subject against another. We would rather you named a few more before we start drawing them.'
                  : 'Above eight, no single subject gets enough of the conversation for a change in it to mean anything.'}
              </p>
            )}
          </>
        )}
      </div>
    </SettingsFrame>
  )
}
