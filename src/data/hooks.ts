import { useEffect, useState } from 'react';
import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Live document. `ref` may be null while its inputs are not ready. */
export function useDoc<T>(ref: DocumentReference | null, key: string): Live<T | null> {
  const [state, set] = useState<Live<T | null>>({ data: null, loading: !!ref, error: null });
  useEffect(() => {
    if (!ref) {
      set({ data: null, loading: false, error: null });
      return;
    }
    set((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      (snap) => set({ data: snap.exists() ? (snap.data() as T) : null, loading: false, error: null }),
      (error) => set({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Live query. `key` must change whenever the query changes. */
export function useQuery<T>(q: Query | null, key: string): Live<T[]> {
  const [state, set] = useState<Live<T[]>>({ data: [], loading: !!q, error: null });
  useEffect(() => {
    if (!q) {
      set({ data: [], loading: false, error: null });
      return;
    }
    set((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => set({ data: snap.docs.map((d) => d.data() as T), loading: false, error: null }),
      (error) => set({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
