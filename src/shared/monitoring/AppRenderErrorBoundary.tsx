import React from 'react';
import { ErrorBoundary as RouterFallback } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { captureException } from './index';

export class AppRenderErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, { source: 'router_error_boundary' }, { componentStack: info.componentStack });
    void SplashScreen.hideAsync().catch(() => {});
  }

  private retry = () => new Promise<void>(resolve => this.setState({ error: null }, resolve));

  render() {
    return this.state.error
      ? <RouterFallback error={this.state.error} retry={this.retry} />
      : this.props.children;
  }
}
