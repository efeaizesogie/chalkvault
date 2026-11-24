import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { orderBy, query } from 'firebase/firestore';
import { paths } from '../data/api';
import { useDoc, useQuery } from '../data/hooks';
import type { ClassRoom, Member, Offering, School, SchoolPolicy, Term } from '../data/types';
import { policyOf } from '../data/api';
import { useAuth } from '../auth/AuthProvider';

export interface SchoolState {
  schoolId: string;
  school: School;
  me: Member;
  isAdmin: boolean;
  terms: Term[];
  /** The term being looked at (the school's current term unless this person picked an earlier one). */
  term: Term | null;
  /** The school's current term. */
  currentTerm: Term | null;
  /** True when looking at a term other than the current one. */
  viewingPast: boolean;
  /** True when the viewed term is closed (read-only). */
  termClosed: boolean;
  setViewTerm: (termId: string | null) => void;
  classes: ClassRoom[];
  /** Arms this user can work in as form teacher (all for admins). */
  myClasses: ClassRoom[];
  /** Arms where this user is form teacher (empty for admins unless assigned). */
  formClasses: ClassRoom[];
  members: Member[];
  offerings: Offering[];
  /** Subject offerings this user teaches (all for admins). */
  myOfferings: Offering[];
  policy: SchoolPolicy;
}

const Ctx = createContext<SchoolState | null>(null);

export function SchoolProvider({ schoolId, children, fallback }: { schoolId: string; children: ReactNode; fallback: (state: 'loading' | 'denied' | 'missing') => ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const school = useDoc<School>(paths.school(schoolId), `school:${schoolId}`);
  const me = useDoc<Member>(uid ? paths.member(schoolId, uid) : null, `me:${schoolId}:${uid}`);
  const ok = !!school.data && !!me.data;
  const terms = useQuery<Term>(ok ? query(paths.terms(schoolId), orderBy('order')) : null, `terms:${schoolId}:${ok}`);
  const classes = useQuery<ClassRoom>(ok ? query(paths.classes(schoolId), orderBy('createdAt')) : null, `classes:${schoolId}:${ok}`);
  const members = useQuery<Member>(ok ? paths.members(schoolId) : null, `members:${schoolId}:${ok}`);
  const offerings = useQuery<Offering>(ok ? paths.offerings(schoolId) : null, `offerings:${schoolId}:${ok}`);
  const viewKey = `chalkvault.view.${schoolId}`;
  const [viewTermId, setViewTermId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(viewKey);
    } catch {
      return null;
    }
  });
  const setViewTerm = (id: string | null) => {
    setViewTermId(id);
    try {
      if (id) sessionStorage.setItem(viewKey, id);
      else sessionStorage.removeItem(viewKey);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<SchoolState | null>(() => {
    if (!school.data || !me.data) return null;
    const isAdmin = me.data.role === 'owner' || me.data.role === 'admin';
    const sortedClasses = [...classes.data].sort(byLevel(school.data.levels));
    const formClasses = sortedClasses.filter((c) => me.data!.classIds.includes(c.id));
    const myClasses = isAdmin ? sortedClasses : formClasses;
    const offeringList = [...offerings.data].sort((a, b) => a.subject.localeCompare(b.subject));
    const myOfferings = isAdmin ? offeringList : offeringList.filter((o) => (me.data!.offeringIds ?? []).includes(o.id));
    return {
      schoolId,
      school: school.data,
      me: me.data,
      isAdmin,
      terms: terms.data,
      ...(() => {
        const current = terms.data.find((t) => t.id === school.data!.currentTermId) ?? terms.data[terms.data.length - 1] ?? null;
        const viewed = (viewTermId && terms.data.find((t) => t.id === viewTermId)) || current;
        return { term: viewed, currentTerm: current, viewingPast: !!viewed && viewed.id !== current?.id, termClosed: viewed?.status === 'closed', setViewTerm };
      })(),
      classes: sortedClasses,
      myClasses,
      formClasses,
      members: members.data,
      offerings: offeringList,
      myOfferings,
      policy: policyOf(school.data),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, school.data, me.data, terms.data, classes.data, members.data, offerings.data, viewTermId]);

  if (school.loading || me.loading) return <>{fallback('loading')}</>;
  if (school.error || (!me.data && !me.loading)) return <>{fallback(school.error ? 'denied' : school.data ? 'denied' : 'missing')}</>;
  if (!value) return <>{fallback('missing')}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Sort arms by the school's level order, then by name (JSS 1A, JSS 1B, JSS 2A...). */
export const byLevel = (levels: string[]) => (a: ClassRoom, b: ClassRoom) => {
  const ia = levels.indexOf(a.level);
  const ib = levels.indexOf(b.level);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.name.localeCompare(b.name, undefined, { numeric: true });
};

export function useSchool() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSchool outside SchoolProvider');
  return v;
}
