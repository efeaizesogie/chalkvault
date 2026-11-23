import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'warn' | 'error';
}
type ToastFn = (text: string, kind?: Toast['kind']) => void;
const Ctx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback<ToastFn>((text, kind = 'info') => {
    const id = crypto.randomUUID();
    setItems((t) => [...t, { id, text, kind }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
