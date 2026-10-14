import type { RedescribeSeed } from '../../lib/subjects/redescribe'

// Össur's subjects, re-worded a third time (14 Oct), three of them only. Under
// Össur's strict judge (lib/subjects/types.ts `judgeFor`) the check sheet of
// 14 Oct (~/ossur-labels-v3.jsonl, 33 labelled pairs a subject) passed Cost &
// access (33/33), Fit & comfort (32/33) and Community & encouragement (33/33),
// and left these three under the 85% floor:
//   Function & movement 28/33: moving WITHOUT the prosthetic (two), someone
//     with no prosthesis, and praise of a person's attitude (two);
//   Look & style 26/33: prosthetic eyes, lips and a nose (five of the six);
//   Choosing the right device 26/33: praise or doubts about ONE device with
//     nothing weighed against it, a brand only named, surgery, an eye.
// The strict judge reads the words after "excluding" as hard rules, so each
// misfile group is named there. WHAT BELONGS (the words before "excluding",
// the only part the phrase vector reads) does not move, so the candidates
// the judge is asked about do not change.
//
// HOW IT IS LOADED: as the first two were (scripts/subject-redescribe.ts
// --client <uuid> --project <ref> --seed scripts/seeds/ossur-subjects-3.ts,
// read-only; --apply writes). Each `id` is a successor the second seed made
// on 14 Oct and `from` is its description exactly as that seed wrote it. The
// successors have no month rows yet (Össur's first update under them is
// 18 Oct), so re-wording them costs no history.

export const OSSUR_SUBJECTS_3: RedescribeSeed = {
  clientId: 'e52cac94-30e1-426a-9a36-31b11e0b30b6',
  writtenOn: '2026-10-14',
  subjects: [
    {
      id: '048098cb-5176-470b-bba5-7a5e30af05fd',
      name: 'Choosing the right device',
      from: 'Comments about weighing one prosthetic limb against another before choosing: one knee, foot or hand against another, microprocessor against mechanical, a blade against an everyday foot, and picking or changing prosthetist or clinic, excluding wanting a device, asking what one can do, how it fits, and price.',
      description: 'Comments about weighing one prosthetic limb against another before choosing: one knee, foot or hand against another, microprocessor against mechanical, a blade against an everyday foot, and picking or changing prosthetist or clinic, excluding wanting a device, asking what one can do, how it fits, price, one device judged on its own, a brand only named, surgery, and eye or face prostheses.',
    },
    {
      id: '795fafc4-ead2-4c34-8d51-7a3ab1976363',
      name: 'Function & movement',
      from: 'Comments about how people move and what they can do with a prosthetic limb: walking, running, sport and dance, stairs, slopes and rough ground, balance, how natural the movement feels, and what powered and bionic parts can and cannot do, excluding wanting or choosing a device, how it fits or is put on, and footwear.',
      description: 'Comments about how people move and what they can do with a prosthetic limb: walking, running, sport and dance, stairs, slopes and rough ground, balance, how natural the movement feels, and what powered and bionic parts can and cannot do, excluding wanting or choosing a device, how it fits or is put on, footwear, moving without a prosthetic limb on, and praise for a person\'s courage or attitude.',
    },
    {
      id: '66029392-8ccc-450a-b3a1-b9b2d4cb524f',
      name: 'Look & style',
      from: 'Comments about how a prosthetic limb is decorated and shown: colours, covers, paint and finishes, patterns, tattoos, realistic skin tones, and showing it off or hiding it, excluding how it is built or works, praise for the person rather than the prosthetic, and characters in films or games.',
      description: 'Comments about how a prosthetic limb is decorated and shown: colours, covers, paint and finishes, patterns, tattoos, realistic skin tones, and showing it off or hiding it, excluding how it is built or works, praise for the person rather than the prosthetic, characters in films or games, and prosthetic eyes and other facial prostheses.',
    },
  ],
}

export default OSSUR_SUBJECTS_3
