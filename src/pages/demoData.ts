import type { Guardian, Pronoun } from '../data/types';
import { DEMO_STUDENTS, type DemoStudent } from '../sample';

// A fuller demo school: every arm has students, every subject has a teacher, comments are at different
// stages and fees are part-paid, so every chart on the overview has something real to show. All names are invented.

export const DEMO_LEVELS = ['Primary 4', 'Primary 5', 'Primary 6', 'JSS 1', 'JSS 2', 'JSS 3'];
export const DEMO_ARMS = ['A', 'B'];
export const DEMO_SUBJECTS = ['Mathematics', 'English Language', 'Basic Science', 'Social Studies', 'Computer Studies'];
export const PER_ARM = 7;

/** Small deterministic random numbers, so every demo school looks the same. */
export function rng(seed: number) {
  let x = seed >>> 0;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

const GIRLS = ['Amara', 'Chioma', 'Ifeoma', 'Kemi', 'Bisi', 'Halima', 'Aisha', 'Ngozi', 'Tolu', 'Funke', 'Ebere', 'Hadiza', 'Ronke', 'Nneka', 'Yetunde', 'Folake', 'Rukayat', 'Ese', 'Oluchi', 'Damilola', 'Zara', 'Ijeoma', 'Kaosi', 'Precious'];
const BOYS = ['Emeka', 'Tobi', 'Musa', 'Kelechi', 'Segun', 'Bayo', 'Uche', 'Yusuf', 'Obinna', 'Femi', 'Ahmed', 'Chidi', 'Dayo', 'Ikenna', 'Sadiq', 'Kayode', 'Osaze', 'Efosa', 'Nnamdi', 'Lanre', 'David', 'Victor', 'Daniel', 'Joshua'];
const SURNAMES: [string, string][] = [
  ['Okafor', 'Igbo'], ['Adebayo', 'Yoruba'], ['Mohammed', 'Hausa'], ['Ogunleye', 'Yoruba'], ['Nwachukwu', 'Igbo'], ['Balogun', 'Yoruba'], ['Danjuma', 'Hausa'], ['Okonkwo', 'Igbo'],
  ['Adeleke', 'Yoruba'], ['Usman', 'Hausa'], ['Obi', 'Igbo'], ['Akinola', 'Yoruba'], ['Nnadi', 'Igbo'], ['Ojo', 'Yoruba'], ['Abubakar', 'Hausa'], ['Igwe', 'Igbo'],
  ['Osagie', 'English'], ['Ekpo', 'English'], ['Lawal', 'Yoruba'], ['Chukwu', 'Igbo'], ['Edet', 'English'], ['Garba', 'Hausa'], ['Ogbonna', 'Igbo'], ['Fashola', 'Yoruba'],
];
const STRENGTHS = [
  'reads aloud with real expression', 'neat, careful workings in maths', 'always first to help a classmate', 'asks sharp questions in science', 'creative ideas in group projects',
  'great on the computer, typed the class newsletter', 'confident speaker, led the assembly reading', 'steady effort every week', 'excellent memory for facts and dates', 'very good at mental sums',
];
const GROWTH = [
  'rushes and makes careless errors', 'homework often late', 'quiet, rarely asks for help', 'spelling needs work', 'easily distracted after break',
  'struggles with word problems', 'handwriting hard to read', 'loses focus in long tasks', 'forgets to show working', 'reading at home has dropped off',
];

const phone = (r: () => number) => `080${Math.floor(10000000 + r() * 89999999)}`;
const g = (name: string, relationship: string, language: string, tel: string): Guardian[] => [{ name, relationship, phone: tel, email: '', language }];

/** Scores out of 20, 20 and 60 for one subject, around an ability between 0 and 1. */
function scoresFor(r: () => number, ability: number): [number, number, number] {
  const j = () => (r() - 0.5) * 0.25;
  const clamp = (v: number) => Math.max(0.15, Math.min(0.98, v));
  return [Math.round(20 * clamp(ability + j())), Math.round(20 * clamp(ability + j())), Math.round(60 * clamp(ability + j()))];
}

/** Every arm's students: the hand-written ones first, then invented ones up to PER_ARM, all with all subjects scored. */
export function demoRoster(): Record<string, DemoStudent[]> {
  const r = rng(20261125);
  const out: Record<string, DemoStudent[]> = {};
  let n = 0;
  for (const [li, level] of DEMO_LEVELS.entries()) {
    for (const arm of DEMO_ARMS) {
      const name = `${level}${arm}`;
      const given = (DEMO_STUDENTS[name] ?? []).map((s) => {
        const known = Object.values(s.scores);
        const ability = known.length ? known.reduce((a, [x, y, z]) => a + (x + y + z) / 100, 0) / known.length : 0.6;
        return { ...s, scores: Object.fromEntries(DEMO_SUBJECTS.map((sub) => [sub, s.scores[sub] ?? scoresFor(r, ability)])) as DemoStudent['scores'] };
      });
      const list: DemoStudent[] = [...given];
      while (list.length < PER_ARM) {
        n++;
        const girl = r() < 0.5;
        const first = (girl ? GIRLS : BOYS)[Math.floor(r() * 24)];
        const [surname, language] = SURNAMES[Math.floor(r() * SURNAMES.length)];
        const full = `${first} ${surname}`;
        if (Object.values(out).flat().concat(list).some((s) => s.name === full)) continue;
        // Most children do well; a few are struggling, so the attention list has someone in it.
        const ability = r() < 0.08 ? 0.32 + r() * 0.12 : 0.52 + r() * 0.4;
        const year = 25 - li;
        list.push({
          name: full,
          pronoun: (girl ? 'she' : 'he') as Pronoun,
          admissionNo: `GA/${year}/${String(100 + n).padStart(3, '0')}`,
          guardians: g(`${r() < 0.5 ? 'Mrs' : 'Mr'} ${surname}`, r() < 0.5 ? 'Mother' : 'Father', language, phone(r)),
          notes: `${STRENGTHS[Math.floor(r() * STRENGTHS.length)]}. ${GROWTH[Math.floor(r() * GROWTH.length)]}.`,
          scores: Object.fromEntries(DEMO_SUBJECTS.map((sub) => [sub, scoresFor(r, ability)])) as DemoStudent['scores'],
        });
      }
      out[name] = list;
    }
  }
  return out;
}

/** The staff room: a form teacher per primary arm who teaches every subject there, subject specialists in JSS, an admin and a bursar. */
export const DEMO_STAFF = {
  primary: ['Mrs Bukola Adeyemi', 'Mr Chinedu Okeke', 'Mrs Halima Garba', 'Miss Tolu Ajayi', 'Mrs Ngozi Eze', 'Mr Emmanuel Udo'],
  jss: [
    { name: 'Mr Babatunde Salami', subject: 'Mathematics' },
    { name: 'Mrs Ifeoma Nwosu', subject: 'English Language' },
    { name: 'Mr Ahmed Bello', subject: 'Basic Science' },
    { name: 'Mrs Grace Etim', subject: 'Social Studies' },
    { name: 'Mr Kunle Ogun', subject: 'Computer Studies' },
    { name: 'Mrs Patience Okoro', subject: '' },
  ],
  admin: 'Mrs Funmilayo Adebisi',
  bursar: 'Mr Daniel Ike',
};

/** A short comment in a form teacher's voice, from the notes and average. */
export function demoComment(first: string, pronoun: Pronoun, avg: number, notes: string) {
  const [strength, growth] = notes.split('. ').map((x) => x.replace(/\.$/, ''));
  const he = pronoun === 'she' ? 'she' : pronoun === 'he' ? 'he' : 'they';
  const tone = avg >= 70 ? 'an excellent term' : avg >= 55 ? 'a good, steady term' : 'a term with real effort to build on';
  return `${first} has had ${tone}. What stood out: ${strength}. To work on next term: ${growth}. With steady support at home, ${he} will keep growing.`;
}
