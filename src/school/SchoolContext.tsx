import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { orderBy, query } from 'firebase/firestore';
import { paths } from '../data/api';
import { useDoc, useQuery } from '../data/hooks';
import type { ClassRoom, Member, School, Term } from '../data/types';
import { useAuth } from '../auth/AuthProvider';

export interface SchoolState {
  schoolId: string;
  school: School;
  me: Member;
  isAdmin: boolean;
  terms: Term[];
  term: Term | null;
  classes: ClassRoom[];
  /** Classes this user can work in (all for admins, assigned ones for teachers). */
  myClasses: ClassRoom[];
  members: Member[];
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

  const value = useMemo<SchoolState | null>(() => {
    if (!school.data || !me.data) return null;
    const isAdmin = me.data.role === 'owner' || me.data.role === 'admin';
    const myClasses = isAdmin ? classes.data : classes.data.filter((c) => me.data!.classIds.includes(c.id));
    return {
      schoolId,
      school: school.data,
      me: me.data,
      isAdmin,
      terms: terms.data,
      term: terms.data.find((t) => t.id === school.data!.currentTermId) ?? terms.data[terms.data.length - 1] ?? null,
      classes: classes.data,
      myClasses,
      members: members.data,
    };
  }, [schoolId, school.data, me.data, terms.data, classes.data, members.data]);

  if (school.loading || me.loading) return <>{fallback('loading')}</>;
  if (school.error || (!me.data && !me.loading)) return <>{fallback(school.error ? 'denied' : school.data ? 'denied' : 'missing')}</>;
  if (!value) return <>{fallback('missing')}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSchool() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSchool outside SchoolProvider');
  return v;
}
