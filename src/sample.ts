import type { Guardian, Pronoun } from './data/types';

// A realistic demo school so judges and new schools can try Chalkvault in one click.
// The notes are deliberately blunt shorthand, the way teachers actually write them.
// All names are invented.

interface DemoStudent {
  name: string;
  pronoun: Pronoun;
  admissionNo: string;
  notes: string;
  guardians: Guardian[];
}

const g = (name: string, relationship: string, language: string): Guardian[] => [
  { name, relationship, phone: '', email: '', language },
];

export const DEMO_CLASSES: { name: string; level: string; subject: string; students: DemoStudent[] }[] = [
  {
    name: 'Primary 5 Maths',
    level: 'Primary 5',
    subject: 'Mathematics',
    students: [
      { name: 'Adaeze Okafor', pronoun: 'she', admissionNo: 'GA/21/014', guardians: g('Mrs Ngozi Okafor', 'Mother', 'English'), notes: 'v quick at mental maths, top of class on times tables. rushes written work, careless errors on word problems. 3 hw missing. chats w/ Tunde constantly' },
      { name: 'Tunde Bakare', pronoun: 'he', admissionNo: 'GA/21/022', guardians: g('Mr Femi Bakare', 'Father', 'Yoruba'), notes: 'lazy. hw rarely in. BUT built the best fractions model in the class project, explained it brilliantly to yr 3 visitors. needs to show working, loses marks' },
      { name: 'Maya Chen', pronoun: 'she', admissionNo: 'GA/22/003', guardians: g('Ms Lin Chen', 'Mother', 'Mandarin Chinese'), notes: 'quiet, never asks for help, struggling w/ long division (4/10 on test). neat books. mum emailed worried. try peer buddy?' },
      { name: 'Diego Ramírez', pronoun: 'he', admissionNo: 'GA/24/031', guardians: g('Mrs Lucía Ramírez', 'Mother', 'Spanish'), notes: 'new in Sept, english still developing. strong on geometry + shapes, loves the tangram challenge. avoids reading word problems out loud' },
      { name: 'Fatima Bello', pronoun: 'she', admissionNo: 'GA/21/009', guardians: g('Alhaji Musa Bello', 'Father', 'Hausa'), notes: 'consistently excellent. 19/20 on assessment. finishes early then gets bored + distracts others. needs extension work' },
      { name: 'Chinedu Eze', pronoun: 'he', admissionNo: 'GA/21/017', guardians: g('Mrs Amaka Eze', 'Mother', 'Igbo'), notes: 'disruptive in Oct, much better since seat change. effort up. still weak on place value. good attitude in group work recently' },
    ],
  },
  {
    name: 'JSS 1 English',
    level: 'JSS 1',
    subject: 'English Language',
    students: [
      { name: 'Zainab Yusuf', pronoun: 'she', admissionNo: 'GA/20/041', guardians: g('Mrs Hauwa Yusuf', 'Mother', 'Hausa'), notes: 'beautiful creative writing, story about her grandmother made me tear up. spelling weak (homophones). reads aloud too fast' },
      { name: 'Samuel Adeyemi', pronoun: 'he', admissionNo: 'GA/20/052', guardians: g('Mr Kunle Adeyemi', 'Father', 'Yoruba'), notes: 'doesnt read at home, admits it. comprehension 9/20. very good debater tho, won the class debate. needs a reading log' },
      { name: 'Grace Okon', pronoun: 'she', admissionNo: 'GA/20/060', guardians: g('Mrs Esther Okon', 'Mother', 'English'), notes: 'solid all round, 15/20. timid in class discussions. handwriting improved a lot since term start' },
      { name: 'Ibrahim Sule', pronoun: 'he', admissionNo: 'GA/20/066', guardians: g('Mr Sani Sule', 'Father', 'Hausa'), notes: 'often late, missed 2 tests. when present, sharp grammar, top score on parts of speech quiz. parents meeting booked' },
    ],
  },
];
