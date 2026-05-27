import { makePage } from '@keystatic/astro/ui';
import keystaticConfig from '../../keystatic.config';
import React from 'react';

const KeystaticPage = makePage(keystaticConfig);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#fee', color: '#c00' }}>
          <h2>Keystatic Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function KeystaticApp() {
  return (
    <ErrorBoundary>
      <KeystaticPage />
    </ErrorBoundary>
  );
}
