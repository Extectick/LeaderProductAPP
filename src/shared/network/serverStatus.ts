type ServerStatusSnapshot = {
  isReachable: boolean;
  lastChangedAt: number;
  lastReason: string | null;
};

type Listener = (snapshot: ServerStatusSnapshot) => void;

const listeners = new Set<Listener>();

const state: ServerStatusSnapshot = {
  isReachable: true,
  lastChangedAt: Date.now(),
  lastReason: null,
};

function emit() {
  const snapshot = getServerStatus();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // noop
    }
  });
}

export function getServerStatus(): ServerStatusSnapshot {
  return { ...state };
}

export function setServerReachable() {
  if (state.isReachable) return;
  state.isReachable = true;
  state.lastChangedAt = Date.now();
  state.lastReason = null;
  emit();
}

export function setServerUnavailable(reason?: string) {
  const nextReason = (reason || '').trim() || null;
  if (!state.isReachable && state.lastReason === nextReason) return;
  state.isReachable = false;
  state.lastChangedAt = Date.now();
  state.lastReason = nextReason;
  emit();
}

export function subscribeServerStatus(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

