import { NativeModules, Platform } from 'react-native';

type NativeDiagnostics = {
  enabled: boolean;
  version: number;
  installationId: string;
  sessionId: string;
  userId: string;
  setUser(id: string | null): Promise<void>;
  setRuntime(runtime: string, update: string): void;
  setScreen(screen: string): void;
  recordAction(action: string): void;
};

export function getNativeDiagnostics(): NativeDiagnostics | null {
  if (Platform.OS !== 'android') return null;
  try {
    const native = NativeModules.LeaderDiagnostics as NativeDiagnostics | undefined;
    return native?.enabled && native.version === 1 ? native : null;
  } catch { return null; }
}

export function invokeNativeDiagnostic(action: (native: NativeDiagnostics) => void) {
  try { const native = getNativeDiagnostics(); if (native) action(native); } catch { /* Never block a business action. */ }
}
