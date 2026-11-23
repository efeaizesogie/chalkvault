export type Role = 'owner' | 'admin' | 'teacher';
export type Pronoun = 'she' | 'he' | 'they';
export type Source = 'on_device' | 'in_cloud';

export const CLASS_COLOURS = {
  chalk: { bg: '#dfef4f', ink: '#17191c', label: 'Chalk' },
  cobalt: { bg: '#2440e6', ink: '#ffffff', label: 'Cobalt' },
  vermilion: { bg: '#ff6b3d', ink: '#17191c', label: 'Vermilion' },
  moss: { bg: '#2f6b4f', ink: '#ffffff', label: 'Moss' },
  lilac: { bg: '#c9b8ff', ink: '#17191c', label: 'Lilac' },
  teal: { bg: '#0f7f86', ink: '#ffffff', label: 'Teal' },
} as const;
export type ClassColour = keyof typeof CLASS_COLOURS;
export const COLOUR_KEYS = Object.keys(CLASS_COLOURS) as ClassColour[];

export interface School {
  id: string;
  name: string;
  country: string;
  ownerId: string;
  currentTermId: string;
  levels: string[];
  subjects: string[];
  colour: ClassColour;
  demo?: boolean;
  createdAt: number;
  /** Score components, e.g. CA 1 (20), CA 2 (20), Exam (60). */
  assessments?: { key: string; label: string; max: number }[];
  /** Grade bands by percentage, highest first. */
  gradeBands?: { grade: string; min: number; remark: string }[];
  /** Maximum characters for a report comment. */
  commentLimit?: number;
}

export interface Member {
  uid: string;
  name: string;
  email: string;
  role: Role;
  classIds: string[];
  inviteCode?: string;
  joinedAt: number;
}

export interface Invite {
  code: string;
  role: Exclude<Role, 'owner'>;
  classIds: string[];
  label: string;
  createdBy: string;
  createdAt: number;
}

export interface Term {
  id: string;
  name: string;
  order: number;
}

export interface ClassRoom {
  id: string;
  name: string;
  level: string;
  subject: string;
  colour: ClassColour;
  createdAt: number;
}

export interface Guardian {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  language: string;
}

export interface StudentProfile {
  id: string;
  classId: string;
  name: string;
  preferredName: string;
  pronoun: Pronoun;
  dob: string;
  admissionNo: string;
  guardians: Guardian[];
  order: number;
  createdAt: number;
}

export interface Draft {
  strength: string;
  growthArea: string;
  nextStep: string;
  comment: string;
  source: Source;
  tone: string;
  level: string;
  updatedAt: number;
}

/** One student's work for one term: private notes and the report comment. */
export interface TermRecord {
  termId: string;
  studentId: string;
  /** The student's class when the record was written. Rules use it to limit teacher access. */
  classId: string;
  notes: string;
  draft?: Draft;
  final?: string;
  translation?: { language: string; text: string; at: number; source?: Source };
  /** Scores by assessment key. */
  scores?: Record<string, number>;
  /** Approval: a teacher submits; an owner or admin approves, which locks the comment. */
  status?: 'submitted' | 'approved';
  approvedBy?: string;
  updatedAt: number;
  updatedBy: string;
}

export type Mark = 'P' | 'L' | 'A';
export const MARK_LABEL: Record<Mark, string> = { P: 'Present', L: 'Late', A: 'Absent' };

/** One class register for one day. */
export interface AttendanceDay {
  id: string; // `${classId}_${date}`
  classId: string;
  termId: string;
  date: string; // YYYY-MM-DD
  marks: Record<string, Mark>; // studentId -> mark
  takenBy: string;
  updatedAt: number;
}

export interface LedgerEntry {
  id: string;
  at: number;
  uid: string;
  task: string;
  source: Source | 'blocked';
  charsSent: number;
  detail: string;
}

/** What the class sheet and student desk work with: a profile joined with this term's record. */
export interface Student {
  id: string;
  classId: string;
  name: string;
  pronoun: Pronoun;
  notes: string;
  draft?: Draft;
  final?: string;
  translation?: TermRecord['translation'];
  status?: TermRecord['status'];
  order: number;
}

export interface UserSchools {
  schools: Record<string, { name: string; role: Role }>;
}
