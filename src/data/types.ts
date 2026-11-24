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

/** How each school chooses to run itself. Every rule is the school's call. */
export interface SchoolPolicy {
  /** Who takes the register: the form teacher once a day, each subject teacher per lesson, or admins only. */
  attendanceBy: 'form' | 'subject' | 'admin';
  /** Can a teacher be form teacher of more than one arm? */
  formClassesPerTeacher: 'one' | 'many';
  /** Can teachers add, edit and remove students in their arms? Otherwise admins only. */
  teachersManageStudents: boolean;
  /** Must comments be approved by an admin before results are published? */
  approvalRequired: boolean;
  /** Do subject teachers write a short remark per subject on the report card? */
  subjectRemarks: boolean;
  /** Show class and subject positions on report cards? */
  showPositions: boolean;
  /** Allow score-sheet photos (which show names) to be read in the cloud when on-device AI is unavailable. */
  cloudScanning: boolean;
  /** Allow comments to be written in the cloud (names removed) when on-device AI is unavailable. */
  cloudCommentFallback: boolean;
}

export const DEFAULT_POLICY: SchoolPolicy = {
  attendanceBy: 'form',
  formClassesPerTeacher: 'one',
  teachersManageStudents: true,
  approvalRequired: true,
  subjectRemarks: true,
  showPositions: true,
  cloudScanning: false,
  cloudCommentFallback: true,
};

export interface School {
  id: string;
  name: string;
  country: string;
  ownerId: string;
  currentTermId: string;
  levels: string[];
  /** Arm names used when creating classes, e.g. A, B, C or Gold, Diamond. */
  arms?: string[];
  subjects: string[];
  colour: ClassColour;
  demo?: boolean;
  createdAt: number;
  address?: string;
  motto?: string;
  principalName?: string;
  /** Score components, e.g. CA 1 (20), CA 2 (20), Exam (60). */
  assessments?: { key: string; label: string; max: number }[];
  /** Grade bands by percentage, highest first. */
  gradeBands?: { grade: string; min: number; remark: string }[];
  /** Maximum characters for a report comment. */
  commentLimit?: number;
  policy?: Partial<SchoolPolicy>;
}

export interface Member {
  uid: string;
  name: string;
  email: string;
  role: Role;
  /** Arms this person is form teacher of. (Field name kept from v1.) */
  classIds: string[];
  /** Subject offerings this person teaches. */
  offeringIds?: string[];
  /** Arms where this person teaches at least one subject (lets rules show them those students). */
  subjectClassIds?: string[];
  inviteCode?: string;
  joinedAt: number;
}

export interface Invite {
  code: string;
  role: Exclude<Role, 'owner'>;
  classIds: string[];
  offeringIds?: string[];
  subjectClassIds?: string[];
  label: string;
  createdBy: string;
  createdAt: number;
}

export interface Term {
  id: string;
  name: string;
  order: number;
  /** Academic session, e.g. 2026/2027. */
  session?: string;
  /** Shown on report cards. */
  nextTermBegins?: string;
}

/** An arm of a class level, e.g. JSS 1A. Stored in the `classes` collection. */
export interface ClassRoom {
  id: string;
  name: string;
  level: string;
  arm?: string;
  /** v1 field: a single subject per class. Unused in v2. */
  subject: string;
  colour: ClassColour;
  createdAt: number;
}

/** One subject taught in one arm, with its teachers and the students taking it. */
export interface Offering {
  id: string;
  classId: string;
  subject: string;
  teacherIds: string[];
  /** Students taking this subject. null means everyone in the arm. */
  studentIds: string[] | null;
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
  /** Private code a parent uses to see published results. */
  resultPin?: string;
}

export const SUPPORT_FLAGS = ['none', 'academic', 'attendance', 'wellbeing'] as const;
export type SupportFlag = (typeof SUPPORT_FLAGS)[number];
export const SUPPORT_LABEL: Record<SupportFlag, string> = { none: 'No concerns', academic: 'Academic support', attendance: 'Attendance', wellbeing: 'Wellbeing' };

export interface Draft {
  strength: string;
  growthArea: string;
  nextStep: string;
  comment: string;
  /** On-device classification: does this student need follow-up? */
  supportFlag?: SupportFlag;
  source: Source;
  tone: string;
  level: string;
  updatedAt: number;
}

/** The form teacher's record for one student for one term: private notes, the comment, the principal's comment. */
export interface TermRecord {
  termId: string;
  studentId: string;
  /** The student's arm when the record was written. Rules use it to limit teacher access. */
  classId: string;
  notes: string;
  draft?: Draft;
  final?: string;
  translation?: { language: string; text: string; at: number; source?: Source };
  /** v1 only: single-subject scores. */
  scores?: Record<string, number>;
  /** Approval: a teacher submits; an owner or admin approves, which locks the comment. */
  status?: 'submitted' | 'approved';
  approvedBy?: string;
  principalComment?: string;
  updatedAt: number;
  updatedBy: string;
}

/** One student's scores and remark in one subject for one term. */
export interface SubjectRecord {
  termId: string;
  offeringId: string;
  classId: string;
  studentId: string;
  subject: string;
  scores: Record<string, number>;
  remark?: string;
  remarkSource?: Source;
  updatedAt: number;
  updatedBy: string;
}

export type Mark = 'P' | 'L' | 'A';
export const MARK_LABEL: Record<Mark, string> = { P: 'Present', L: 'Late', A: 'Absent' };

/** One register for one day: for an arm (form teacher) or a subject lesson (subject teacher). */
export interface AttendanceDay {
  id: string; // `${classId}_${date}` or `${offeringId}_${date}`
  classId: string;
  offeringId?: string;
  termId: string;
  date: string; // YYYY-MM-DD
  marks: Record<string, Mark>; // studentId -> mark
  takenBy: string;
  updatedAt: number;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: 'staff' | 'parents';
  at: number;
  by: string;
  byName: string;
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

/** What the comment sheet and desk work with: a profile joined with this term's form record. */
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

/** A compiled report card, as printed and as published to the result portal. */
export interface ReportCard {
  termId: string;
  termName: string;
  session: string;
  className: string;
  assessments: { key: string; label: string; max: number }[];
  subjects: { subject: string; scores: Record<string, number>; total: number; grade: string; remark: string; position?: string; teacherRemark?: string }[];
  average: number;
  position?: string;
  classSize: number;
  attendance?: { present: number; days: number };
  formComment?: string;
  principalComment?: string;
  nextTermBegins?: string;
  gradeKey: { grade: string; min: number; remark: string }[];
  publishedAt?: number;
}

/** Top-level `results/{pin}`: what a parent sees with the result PIN. */
export interface PublishedResult {
  pin: string;
  schoolId: string;
  schoolName: string;
  schoolAddress?: string;
  studentName: string;
  admissionNo: string;
  reports: Record<string, ReportCard>;
  updatedAt: number;
}
