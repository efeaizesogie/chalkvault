/**
 * Timetable solver. Pure functions, no Firebase.
 *
 * `generateTimetable` places every offering (a subject in an arm) its weekly
 * number of times into non-break periods, keeping each arm and each teacher to
 * one lesson at a time, avoiding the same subject twice in a day for an arm, and
 * spreading lessons across the week. It uses a deterministic, most-constrained-
 * first greedy, several rotated restarts and a bounded single-displacement repair
 * pass. `validateTimetable` re-checks a finished timetable and lists any clashes.
 */
import type { ClassRoom, Offering, TimetableSettings, TimetableSlot } from '../data/types';

/** Subjects that get more periods by default. */
const CORE = new Set(['mathematics', 'english language', 'english']);

/** Periods per week a subject gets when the settings don't say. */
export function defaultPerWeek(subject: string): number {
  return CORE.has(subject.trim().toLowerCase()) ? 5 : 3;
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Eight 40-minute teaching periods from 08:00, with a short and a long break, ending 14:00. */
export function defaultPeriods(): TimetableSettings['periods'] {
  const periods: TimetableSettings['periods'] = [];
  let t = 8 * 60;
  const push = (label: string, mins: number, isBreak?: boolean) => {
    const start = fmt(t);
    t += mins;
    periods.push(isBreak ? { label, start, end: fmt(t), isBreak: true } : { label, start, end: fmt(t) });
  };
  let taught = 0;
  for (let i = 1; i <= 8; i++) {
    push(`Period ${i}`, 40);
    taught++;
    if (taught === 2) push('Short break', 10, true);
    if (taught === 5) push('Long break', 30, true);
  }
  return periods;
}

/** A sensible starting timetable for a school: Monday–Friday, eight periods, per-subject counts. */
export function defaultSettings(subjects: string[]): TimetableSettings {
  const perWeek: Record<string, number> = {};
  for (const s of subjects) perWeek[s] = defaultPerWeek(s);
  return { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], periods: defaultPeriods(), perWeek };
}

/** Indices of the teaching (non-break) periods. */
export function teachingPeriods(settings: TimetableSettings): number[] {
  return settings.periods.map((p, i) => (p.isBreak ? -1 : i)).filter((i) => i >= 0);
}

export interface GenerateResult {
  slots: Record<string, TimetableSlot[]>;
  unplaced: { offeringId: string; missing: number }[];
}

interface Job {
  offeringId: string;
  classId: string;
  subject: string;
  teacherIds: string[];
  demand: number;
}

/**
 * Build a weekly timetable. Deterministic: the same inputs always give the same
 * result. Fast enough for 30 arms × 12 subjects in well under a second.
 */
export function generateTimetable(settings: TimetableSettings, classes: ClassRoom[], offerings: Offering[]): GenerateResult {
  const days = settings.days.length;
  const tIdx = teachingPeriods(settings);
  const classIds = new Set(classes.map((c) => c.id));

  const jobs: Job[] = [];
  for (const o of offerings) {
    if (!classIds.has(o.classId)) continue;
    const demand = Math.max(0, Math.round(settings.perWeek[o.subject] ?? defaultPerWeek(o.subject)));
    if (demand > 0) jobs.push({ offeringId: o.id, classId: o.classId, subject: o.subject, teacherIds: o.teacherIds ?? [], demand });
  }
  const jobMap = new Map(jobs.map((j) => [j.offeringId, j]));

  // Tightness: busier teachers and heavier demand are placed first.
  const teacherLoad = new Map<string, number>();
  for (const j of jobs) for (const t of j.teacherIds) teacherLoad.set(t, (teacherLoad.get(t) ?? 0) + j.demand);
  const tight = (j: Job) => j.demand * 100 + j.teacherIds.reduce((s, t) => s + (teacherLoad.get(t) ?? 0), 0);
  const ordered = [...jobs].sort((a, b) => tight(b) - tight(a) || a.offeringId.localeCompare(b.offeringId));

  const cells: { day: number; period: number }[] = [];
  for (let d = 0; d < days; d++) for (const p of tIdx) cells.push({ day: d, period: p });

  function runGreedy(offset: number): GenerateResult {
    const armSlot = new Map<string, string>(); // `${classId}|${d}:${p}` -> offeringId
    const teacherSlot = new Map<string, string>(); // `${uid}|${d}:${p}` -> offeringId
    const count = new Map<string, number>();
    const aKey = (classId: string, d: number, p: number) => `${classId}|${d}:${p}`;
    const tKey = (u: string, d: number, p: number) => `${u}|${d}:${p}`;
    const armHas = (classId: string, d: number, p: number) => armSlot.has(aKey(classId, d, p));
    const teacherHas = (u: string, d: number, p: number) => teacherSlot.has(tKey(u, d, p));
    const freeFor = (j: Job, d: number, p: number) => !armHas(j.classId, d, p) && j.teacherIds.every((t) => !teacherHas(t, d, p));
    const place = (j: Job, d: number, p: number) => {
      armSlot.set(aKey(j.classId, d, p), j.offeringId);
      for (const t of j.teacherIds) teacherSlot.set(tKey(t, d, p), j.offeringId);
      count.set(j.offeringId, (count.get(j.offeringId) ?? 0) + 1);
    };
    const unplace = (j: Job, d: number, p: number) => {
      armSlot.delete(aKey(j.classId, d, p));
      for (const t of j.teacherIds) teacherSlot.delete(tKey(t, d, p));
      count.set(j.offeringId, (count.get(j.offeringId) ?? 1) - 1);
    };
    const armDayLoad = (classId: string, d: number) => {
      let n = 0;
      for (const p of tIdx) if (armHas(classId, d, p)) n++;
      return n;
    };

    // Greedy pass: for each job, place its lessons on the best free cells.
    for (const j of ordered) {
      const daysUsed: number[] = [];
      for (let k = 0; k < j.demand; k++) {
        let best: { day: number; period: number } | null = null;
        let bestScore = Infinity;
        for (let ci = 0; ci < cells.length; ci++) {
          const c = cells[(ci + offset * 7) % cells.length];
          if (!freeFor(j, c.day, c.period)) continue;
          const sameDay = daysUsed.includes(c.day) ? 1 : 0;
          const score = sameDay * 1000 + armDayLoad(j.classId, c.day) * 10 + c.period;
          if (score < bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (!best) break;
        place(j, best.day, best.period);
        daysUsed.push(best.day);
      }
    }

    // Repair pass: try to fit any shortfall by displacing a single lesson.
    let budget = 3000;
    for (let pass = 0; pass < 2 && budget > 0; pass++) {
      for (const j of ordered) {
        let short = j.demand - (count.get(j.offeringId) ?? 0);
        while (short > 0 && budget > 0) {
          let placed = false;
          for (const c of cells) {
            if (budget <= 0) break;
            if (armHas(j.classId, c.day, c.period)) continue;
            if (freeFor(j, c.day, c.period)) {
              place(j, c.day, c.period);
              placed = true;
              break;
            }
            const blocker = j.teacherIds.find((t) => teacherHas(t, c.day, c.period));
            if (!blocker) continue;
            const victim = jobMap.get(teacherSlot.get(tKey(blocker, c.day, c.period))!);
            if (!victim) continue;
            for (const c2 of cells) {
              if (c2.day === c.day && c2.period === c.period) continue;
              if (armHas(victim.classId, c2.day, c2.period)) continue;
              if (!victim.teacherIds.every((t) => !teacherHas(t, c2.day, c2.period))) continue;
              unplace(victim, c.day, c.period);
              place(victim, c2.day, c2.period);
              budget--;
              break;
            }
            if (freeFor(j, c.day, c.period)) {
              place(j, c.day, c.period);
              placed = true;
              break;
            }
          }
          if (!placed) break;
          short--;
        }
      }
    }

    const slots: Record<string, TimetableSlot[]> = {};
    for (const [k, offeringId] of armSlot) {
      const bar = k.indexOf('|');
      const classId = k.slice(0, bar);
      const [d, p] = k.slice(bar + 1).split(':').map(Number);
      (slots[classId] ||= []).push({ day: d, period: p, offeringId });
    }
    for (const id in slots) slots[id].sort((a, b) => a.day - b.day || a.period - b.period);
    const unplaced: { offeringId: string; missing: number }[] = [];
    for (const j of jobs) {
      const missing = j.demand - (count.get(j.offeringId) ?? 0);
      if (missing > 0) unplaced.push({ offeringId: j.offeringId, missing });
    }
    return { slots, unplaced };
  }

  // Several rotated restarts; keep the one that leaves the fewest lessons unplaced.
  let best: GenerateResult = { slots: {}, unplaced: [] };
  let bestMissing = Infinity;
  const attempts = Math.max(6, days + 2);
  for (let a = 0; a < attempts; a++) {
    const res = runGreedy(a);
    const miss = res.unplaced.reduce((s, u) => s + u.missing, 0);
    if (miss < bestMissing) {
      bestMissing = miss;
      best = res;
      if (miss === 0) break;
    }
  }
  return best;
}

export interface ClashCheckInput {
  settings: TimetableSettings;
  slots: Record<string, TimetableSlot[]>;
  offerings: Offering[];
  classes: Pick<ClassRoom, 'id' | 'name'>[];
  members: { uid: string; name: string }[];
}

/** Re-check a finished timetable. Returns a plain-English list of clashes (empty means none). */
export function validateTimetable(input: ClashCheckInput): string[] {
  const { settings, slots, offerings, classes, members } = input;
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? 'an arm';
  const teacherName = (uid: string) => members.find((m) => m.uid === uid)?.name ?? 'A teacher';
  const dayName = (d: number) => settings.days[d] ?? `day ${d + 1}`;
  const periodLabel = (p: number) => settings.periods[p]?.label ?? `period ${p + 1}`;
  const breaks = new Set(settings.periods.map((p, i) => (p.isBreak ? i : -1)).filter((i) => i >= 0));

  const out: string[] = [];
  // Per teacher, which arms they are in at each day:period.
  const teacherAt = new Map<string, string[]>(); // `${uid}|${d}:${p}` -> classIds

  for (const [classId, list] of Object.entries(slots)) {
    const seen = new Set<string>();
    for (const s of list) {
      const key = `${s.day}:${s.period}`;
      if (seen.has(key)) out.push(`${className(classId)} has two lessons in ${periodLabel(s.period)} on ${dayName(s.day)}.`);
      seen.add(key);
      if (breaks.has(s.period)) out.push(`${className(classId)} has a lesson during ${periodLabel(s.period)} on ${dayName(s.day)}.`);
      const off = offeringById.get(s.offeringId);
      for (const t of off?.teacherIds ?? []) {
        const tk = `${t}|${key}`;
        const arms = teacherAt.get(tk) ?? [];
        if (arms.length) out.push(`${teacherName(t)} is in two arms in ${periodLabel(s.period)} on ${dayName(s.day)} (${className(arms[0])} and ${className(classId)}).`);
        arms.push(classId);
        teacherAt.set(tk, arms);
      }
    }
  }
  return out;
}
