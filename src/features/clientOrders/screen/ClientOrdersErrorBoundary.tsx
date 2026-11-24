import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { captureException } from '@/src/shared/monitoring';
import { OrderScreenFailed } from './orderErrorRecovery';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  onExit: () => void;
};

type ErrorBoundaryState = {
  error: Error | null;
  showDetails: boolean;
};

export class ClientOrdersErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, showDetails: false };
  private componentNames = '';

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, showDetails: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep only component identifiers for the selectable diagnostic on the device.
    const names = (info.componentStack || '').split('\n')
      .map(line => /^\s*(?:at|in)\s+([A-Za-z_$][\w.$]*)(?=\s|$)/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name));
    this.componentNames = names.slice(0, 18).join(' → ');
    captureException(error, { contexts: { react_native_context: { componentStack: info.componentStack } } });
  }

  private readonly screenFailed = () => this.state.error !== null;

  render() {
    if (!this.state.error) return <OrderScreenFailed.Provider value={this.screenFailed}>{this.props.children}</OrderScreenFailed.Provider>;

    return (
      <View style={styles.errorRoot}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Не удалось открыть заказы клиентов</Text>
          <Text style={styles.errorText} selectable>
            {this.state.error.message || 'Произошла ошибка интерфейса.'}
          </Text>
          <Pressable accessibilityRole="button" style={styles.errorButton} onPress={() => this.setState({ error: null, showDetails: false })}>
            <Text style={styles.errorButtonText}>Вернуться в заказы</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.errorSecondaryButton} onPress={this.props.onExit}>
            <Text style={styles.errorSecondaryText}>В каталог сервисов</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: this.state.showDetails }}
            onPress={() => this.setState(({ showDetails }) => ({ showDetails: !showDetails }))}>
            <Text style={styles.errorSecondaryText}>{this.state.showDetails ? 'Скрыть подробности' : 'Подробности для поддержки'}</Text>
          </Pressable>
          {this.state.showDetails && <Text selectable style={styles.errorText}>
            {this.componentNames || 'Стек компонентов недоступен.'}
          </Text>}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  errorCard: {
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  errorTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  errorText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  errorButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
  },
  errorSecondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  errorSecondaryText: { color: '#2563EB', fontWeight: '700' },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
