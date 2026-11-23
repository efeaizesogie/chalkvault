import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Shared frame for sign-in, setup and invite pages: wordmark on top, ruled paper behind. */
export function AuthShell({ eyebrow, title, children, wide }: { eyebrow: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth">
      <header className="auth-top">
        <Link to="/" className="wordmark">
          Chalkvault
        </Link>
      </header>
      <main className={`auth-main ${wide ? 'wide' : ''}`}>
        <p className="mono eyebrow">{eyebrow}</p>
        <h1 className="display-sm">{title}</h1>
        {children}
      </main>
    </div>
  );
}
