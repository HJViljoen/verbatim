import type { RedescribeSeed } from '../../lib/subjects/redescribe'

// Össur's subjects, re-worded a second time (14 Oct): the five successors of
// scripts/seeds/ossur-subjects.ts say "limb". The lead's call, under
// Heinrich's approval of 14 Oct: the judge replay
// (plans/verbatim-depth-v2/judge-report.md) found prosthetic EYES filed under
// them (both of Fit & comfort's false keeps, one of Look & style's), because
// the words said "a prosthetic" and the sheet's labels meant a limb.
//
// NOTHING ELSE MOVES. Each description is the first seed's, with "limb" added
// where it names the prosthetic; Community & encouragement names none, so the
// person encouraged is "someone with limb loss", which is the community its
// June words were about. Cost & access is left as it is (its words are
// unchanged since June).
//
// HOW IT IS LOADED: as the first seed was (scripts/subject-redescribe.ts
// --client <uuid> --project <ref> --seed scripts/seeds/ossur-subjects-2.ts,
// read-only; --apply writes). Each `id` is a successor the first seed made on
// 14 Oct, and `from` is its description exactly as that seed wrote it: the
// script refuses a subject whose words have moved since. A successor of a
// successor is planned as any re-description is (lib/subjects/redescribe.ts):
// the first seed's subjects are retired already, so they are neither a live
// subject of the same name nor touched.

export const OSSUR_SUBJECTS_2: RedescribeSeed = {
  clientId: 'e52cac94-30e1-426a-9a36-31b11e0b30b6',
  writtenOn: '2026-10-14',
  subjects: [
    {
      id: '341e54eb-eb6a-4f12-a561-bd3e50d09572',
      name: 'Choosing the right device',
      from: 'Comments about weighing one prosthetic against another before choosing: one knee, foot or hand against another, microprocessor against mechanical, a blade against an everyday foot, and picking or changing prosthetist or clinic, excluding wanting a device, asking what one can do, how it fits, and price.',
      description: 'Comments about weighing one prosthetic limb against another before choosing: one knee, foot or hand against another, microprocessor against mechanical, a blade against an everyday foot, and picking or changing prosthetist or clinic, excluding wanting a device, asking what one can do, how it fits, and price.',
    },
    {
      id: 'da5bd724-d336-4756-8d1a-0ad648766b2e',
      name: 'Community & encouragement',
      from: 'Comments about people encouraging and supporting someone: praise for their courage, strength or positive attitude, messages of support and blessings, and people sharing their own story to lift others, excluding people only saying they are amputees or have limb loss, wanting a device, and questions about rehab or devices.',
      description: 'Comments about people encouraging and supporting someone with limb loss: praise for their courage, strength or positive attitude, messages of support and blessings, and people sharing their own story to lift others, excluding people only saying they are amputees or have limb loss, wanting a device, and questions about rehab or devices.',
    },
    {
      id: 'ae634614-4e04-433d-a2d6-63c013416a7c',
      name: 'Fit & comfort',
      from: 'Comments about how a prosthetic fits and feels on the body: socket and liner fit, fit changing over time, length, pressure, pain, sores and skin irritation, and whether it is comfortable to wear all day, excluding how hard it is to put on, which liner or part to buy, choosing a clinic, and footwear.',
      description: 'Comments about how a prosthetic limb fits and feels on the body: socket and liner fit, fit changing over time, length, pressure, pain, sores and skin irritation, and whether it is comfortable to wear all day, excluding how hard it is to put on, which liner or part to buy, choosing a clinic, and footwear.',
    },
    {
      id: '535d9c02-f251-4042-a835-d605577a7f43',
      name: 'Function & movement',
      from: 'Comments about how people move and what they can do with a prosthetic: walking, running, sport and dance, stairs, slopes and rough ground, balance, how natural the movement feels, and what powered and bionic parts can and cannot do, excluding wanting or choosing a device, how it fits or is put on, and footwear.',
      description: 'Comments about how people move and what they can do with a prosthetic limb: walking, running, sport and dance, stairs, slopes and rough ground, balance, how natural the movement feels, and what powered and bionic parts can and cannot do, excluding wanting or choosing a device, how it fits or is put on, and footwear.',
    },
    {
      id: 'aaf624f5-9710-4978-9da8-b960082346f5',
      name: 'Look & style',
      from: 'Comments about how a prosthetic is decorated and shown: colours, covers, paint and finishes, patterns, tattoos, realistic skin tones, and showing it off or hiding it, excluding how it is built or works, praise for the person rather than the prosthetic, and characters in films or games.',
      description: 'Comments about how a prosthetic limb is decorated and shown: colours, covers, paint and finishes, patterns, tattoos, realistic skin tones, and showing it off or hiding it, excluding how it is built or works, praise for the person rather than the prosthetic, and characters in films or games.',
    },
  ],
}

export default OSSUR_SUBJECTS_2
