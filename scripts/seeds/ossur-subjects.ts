import type { RedescribeSeed } from '../../lib/subjects/redescribe'

// Össur's subjects, re-worded (14 Oct) after the calibration sheet of 198
// labelled pairs (~/ossur-labels.jsonl) put five of the six under the 85%
// floor. Heinrich, 14 Oct: tighter subjects that hold fewer conversations are
// fine; wrong filings are not.
//
// HOW IT IS LOADED: scripts/subject-redescribe.ts --client <uuid> --project
// <ref> --seed scripts/seeds/ossur-subjects.ts prints the plan; --apply writes
// it (lib/subjects/redescribe.ts says what a re-description is and why each
// one is a new subject). Cost & access (30 of 33) is left as it is.
//
// HOW THEY ARE WRITTEN. What belongs first, then ", excluding …" for what the
// sheet showed being filed wrongly. The judge reads the whole description;
// the phrase vector reads only the part before "excluding"
// (`subjectPositiveGloss`), so what belongs carries no word for what does not.
// `from` is each description as stored on 14 Oct: the script refuses a
// subject whose words have moved since.
//
// Community & encouragement follows the lead's ruling: someone saying they
// are an amputee is not community; support, encouragement and stories offered
// to others are.

export const OSSUR_SUBJECTS: RedescribeSeed = {
  clientId: 'e52cac94-30e1-426a-9a36-31b11e0b30b6',
  writtenOn: '2026-10-14',
  subjects: [
    {
      id: 'ebf98c7e-b194-4e5b-b6f1-a37e0c8f29f9',
      name: 'Choosing the right device',
      from: "Comments about choosing a prosthetic: which knee, foot or hand suits a person's daily life and activity level, comparing devices, personalisation, and advice from prosthetists and clinicians.",
      description: 'Comments about weighing one prosthetic against another before choosing: one knee, foot or hand against another, microprocessor against mechanical, a blade against an everyday foot, and picking or changing prosthetist or clinic, excluding wanting a device, asking what one can do, how it fits, and price.',
    },
    {
      id: '7f71c51b-fa4d-4437-b49e-6e60e178615b',
      name: 'Community & encouragement',
      from: 'Comments offering or asking for peer support, shared stories of limb loss, resilience and encouragement, and the community around amputees and prosthetic users, excluding device performance.',
      description: 'Comments about people encouraging and supporting someone: praise for their courage, strength or positive attitude, messages of support and blessings, and people sharing their own story to lift others, excluding people only saying they are amputees or have limb loss, wanting a device, and questions about rehab or devices.',
    },
    {
      id: '30c3475e-27a3-4a8f-aed2-cd440e4f8a9c',
      name: 'Fit & comfort',
      from: 'Comments about how the socket and liner fit, fit changing over time, pressure, pain, sores or skin problems, and whether the device feels secure and comfortable to wear all day, excluding how it looks.',
      description: 'Comments about how a prosthetic fits and feels on the body: socket and liner fit, fit changing over time, length, pressure, pain, sores and skin irritation, and whether it is comfortable to wear all day, excluding how hard it is to put on, which liner or part to buy, choosing a clinic, and footwear.',
    },
    {
      id: 'a9f119c0-127e-442b-883e-afd96395bcd3',
      name: 'Function & movement',
      from: 'Comments about what a prosthetic lets people do: walking, running, stairs, slopes and rough ground, how natural the movement feels, powered and bionic technology, and what a device cannot do.',
      description: 'Comments about how people move and what they can do with a prosthetic: walking, running, sport and dance, stairs, slopes and rough ground, balance, how natural the movement feels, and what powered and bionic parts can and cannot do, excluding wanting or choosing a device, how it fits or is put on, and footwear.',
    },
    {
      id: '7bf6170f-bea2-4d72-9d14-01d4ce719009',
      name: 'Look & style',
      from: 'Comments about how prosthetics look: design, covers and finishes, showing or hiding the device, and confidence in appearance, excluding how it works or fits.',
      description: 'Comments about how a prosthetic is decorated and shown: colours, covers, paint and finishes, patterns, tattoos, realistic skin tones, and showing it off or hiding it, excluding how it is built or works, praise for the person rather than the prosthetic, and characters in films or games.',
    },
  ],
}

export default OSSUR_SUBJECTS
