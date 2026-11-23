import type { Pronoun } from './lib/db';

// A realistic sample class so judges and new teachers can try Chalkvault in one click.
// The notes are deliberately blunt shorthand, the way teachers actually write them.
export const SAMPLE_CLASS = { name: 'Year 5 Maths', subject: 'Mathematics', term: 'Autumn term', colour: 'chalk' as const };

export const SAMPLE_STUDENTS: { name: string; pronoun: Pronoun; notes: string }[] = [
  {
    name: 'Adaeze Okafor',
    pronoun: 'she',
    notes: 'v quick at mental maths, top of class on times tables. rushes written work, careless errors on word problems. 3 hw missing. chats w/ Tunde constantly',
  },
  {
    name: 'Tunde Bakare',
    pronoun: 'he',
    notes: 'lazy. hw rarely in. BUT built the best fractions model in the class project, explained it brilliantly to yr 3 visitors. needs to show working, loses marks',
  },
  {
    name: 'Maya Chen',
    pronoun: 'she',
    notes: 'quiet, never asks for help, struggling w/ long division (4/10 on test). neat books. mum emailed worried. try peer buddy?',
  },
  {
    name: 'Diego Ramírez',
    pronoun: 'he',
    notes: 'new in Sept, english still developing. strong on geometry + shapes, loves the tangram challenge. avoids reading word problems out loud',
  },
  {
    name: 'Fatima Bello',
    pronoun: 'she',
    notes: 'consistently excellent. 19/20 on assessment. finishes early then gets bored + distracts others. needs extension work',
  },
  {
    name: 'Liam O’Connor',
    pronoun: 'he',
    notes: 'disruptive in Oct, much better since seat change. effort up. still weak on place value. good attitude in group work recently',
  },
];
