/** One accepted navigation per native response, shared by startup and live taps. */
export function createPushNavigationIntent<T>({read, clear, identity}: {
  read: () => Promise<T | null>;
  clear: () => Promise<void>;
  identity: (response: T) => string;
}) {
  const accepted = new Set<string>();
  let initial: Promise<T | null> | undefined;

  async function clearMatching(response: T) {
    const latest = await read();
    if (latest && identity(latest) === identity(response)) await clear();
  }

  return {
    /** Native metadata only; a broken native task must not hold startup forever. */
    initial(timeoutMs = 450): Promise<T | null> {
      if (!initial) initial = new Promise(resolve => {
        let settled = false;
        const complete = (response: T | null) => {
          if (settled) return;
          settled = true; clearTimeout(timer); resolve(response);
        };
        const timer = setTimeout(() => complete(null), timeoutMs);
        void read().then(complete, () => complete(null));
      });
      return initial;
    },
    accepted(response: T) { return accepted.has(identity(response)); },
    deliver(response: T, dispatch: (response: T) => boolean, isCurrent: () => boolean): boolean {
      if (!isCurrent()) return false;
      const key = identity(response);
      if (accepted.has(key)) return true;
      if (!dispatch(response)) return false;
      accepted.add(key);
      if (accepted.size > 128) accepted.delete(accepted.values().next().value!);
      // Never clear a newer notification which arrived while startup resolved.
      void clearMatching(response).catch(() => {});
      return true;
    },
    async restore(dispatch: (response: T) => boolean, isCurrent: () => boolean) {
      const response = await read();
      if (!response) return false;
      return this.deliver(response, dispatch, isCurrent);
    },
  };
}
