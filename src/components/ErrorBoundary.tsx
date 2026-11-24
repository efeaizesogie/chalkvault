import { Component, type ReactNode } from 'react';

/** Keeps one broken screen from blanking the whole app. Resets when `resetKey` changes (e.g. the route). */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Chalkvault screen error:', error);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <section className="panel">
          <h2 className="h3">This screen ran into a problem.</h2>
          <p className="muted">Your records are safe; nothing was lost. Try again, or go to another page from the menu.</p>
          <p className="mono muted small">{this.state.error.message}</p>
          <div>
            <button className="pill ink" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </section>
      </div>
    );
  }
}
