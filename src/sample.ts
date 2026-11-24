import type { Guardian, Pronoun } from './data/types';

// A realistic demo school so judges and new schools can try Chalkvault in one click.
// The notes are deliberately blunt shorthand, the way teachers actually write them. All names are invented.

export interface DemoStudent {
  name: string;
  pronoun: Pronoun;
  admissionNo: string;
  notes: string;
  guardians: Guardian[];
  /** Scores per subject: [CA 1 (20), CA 2 (20), Exam (60)]. */
  scores: Record<string, [number, number, number]>;
}

const g = (name: string, relationship: string, language: string, phone = ''): Guardian[] => [{ name, relationship, phone, email: '', language }];

export const DEMO_LEVELS = ['Primary 5', 'JSS 1'];
export const DEMO_ARMS = ['A', 'B'];
export const DEMO_SUBJECTS = ['Mathematics', 'English Language', 'Basic Science'];

/** Students by arm name. Arms not listed start empty. */
export const DEMO_STUDENTS: Record<string, DemoStudent[]> = {
  'Primary 5A': [
    { name: 'Adaeze Okafor', pronoun: 'she', admissionNo: 'GA/21/014', guardians: g('Mrs Ngozi Okafor', 'Mother', 'English', '08031234567'), notes: 'v quick at mental maths, top of class on times tables. rushes written work, careless errors on word problems. 3 hw missing. chats w/ Tunde constantly', scores: { Mathematics: [18, 15, 50], 'English Language': [14, 13, 41], 'Basic Science': [16, 15, 47] } },
    { name: 'Tunde Bakare', pronoun: 'he', admissionNo: 'GA/21/022', guardians: g('Mr Femi Bakare', 'Father', 'Yoruba'), notes: 'lazy. hw rarely in. BUT built the best fractions model in the class project, explained it brilliantly to yr 3 visitors. needs to show working, loses marks', scores: { Mathematics: [12, 10, 41], 'English Language': [11, 12, 38], 'Basic Science': [15, 14, 45] } },
    { name: 'Maya Chen', pronoun: 'she', admissionNo: 'GA/22/003', guardians: g('Ms Lin Chen', 'Mother', 'Mandarin Chinese'), notes: 'quiet, never asks for help, struggling w/ long division (4/10 on test). neat books. mum emailed worried. try peer buddy?', scores: { Mathematics: [9, 11, 22], 'English Language': [16, 17, 49], 'Basic Science': [13, 12, 36] } },
    { name: 'Diego Ramírez', pronoun: 'he', admissionNo: 'GA/24/031', guardians: g('Mrs Lucía Ramírez', 'Mother', 'Spanish'), notes: 'new in Sept, english still developing. strong on geometry + shapes, loves the tangram challenge. avoids reading word problems out loud', scores: { Mathematics: [16, 14, 44], 'English Language': [8, 10, 30], 'Basic Science': [14, 15, 43] } },
    { name: 'Fatima Bello', pronoun: 'she', admissionNo: 'GA/21/009', guardians: g('Alhaji Musa Bello', 'Father', 'Hausa'), notes: 'consistently excellent. 19/20 on assessment. finishes early then gets bored + distracts others. needs extension work', scores: { Mathematics: [19, 19, 57], 'English Language': [18, 17, 52], 'Basic Science': [18, 19, 55] } },
    { name: 'Chinedu Eze', pronoun: 'he', admissionNo: 'GA/21/017', guardians: g('Mrs Amaka Eze', 'Mother', 'Igbo'), notes: 'disruptive in Oct, much better since seat change. effort up. still weak on place value. good attitude in group work recently', scores: { Mathematics: [11, 12, 35], 'English Language': [13, 12, 40], 'Basic Science': [12, 13, 39] } },
  ],
  'JSS 1A': [
    { name: 'Zainab Yusuf', pronoun: 'she', admissionNo: 'GA/20/041', guardians: g('Mrs Hauwa Yusuf', 'Mother', 'Hausa'), notes: 'beautiful creative writing, story about her grandmother made me tear up. spelling weak (homophones). reads aloud too fast', scores: { Mathematics: [13, 12, 40], 'English Language': [17, 16, 50], 'Basic Science': [14, 13, 42] } },
    { name: 'Samuel Adeyemi', pronoun: 'he', admissionNo: 'GA/20/052', guardians: g('Mr Kunle Adeyemi', 'Father', 'Yoruba'), notes: 'doesnt read at home, admits it. comprehension 9/20. very good debater tho, won the class debate. needs a reading log', scores: { Mathematics: [15, 16, 46], 'English Language': [10, 11, 33], 'Basic Science': [15, 14, 44] } },
    { name: 'Grace Okon', pronoun: 'she', admissionNo: 'GA/20/060', guardians: g('Mrs Esther Okon', 'Mother', 'English'), notes: 'solid all round, 15/20. timid in class discussions. handwriting improved a lot since term start', scores: { Mathematics: [15, 14, 45], 'English Language': [15, 15, 44], 'Basic Science': [16, 15, 46] } },
    { name: 'Ibrahim Sule', pronoun: 'he', admissionNo: 'GA/20/066', guardians: g('Mr Sani Sule', 'Father', 'Hausa'), notes: 'often late, missed 2 tests. when present, sharp grammar, top score on parts of speech quiz. parents meeting booked', scores: { Mathematics: [7, 0, 31], 'English Language': [12, 0, 44], 'Basic Science': [10, 0, 35] } },
  ],
};
