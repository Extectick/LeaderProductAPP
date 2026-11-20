/** A foreground refresh has a finite budget. Slow/transient upstream failures are
 * retried within it; exhaustion stays explicitly unresolved and recoverable. */
export async function refreshUnresolvedSnapshot<T>(initial: T, unresolved: (value: T) => boolean,
  load: () => Promise<T>, update: (value: T) => void, signal: AbortSignal,
  options: {onExhausted?: (value: T) => void; delays?: readonly number[]} = {}) {
  let value = initial;
  for (const delay of options.delays ?? [2000, 5000, 10000, 20000, 30000, 45000]) {
    if (!unresolved(value) || signal.aborted) return;
    await new Promise<void>(resolve => {
      const finish = () => {clearTimeout(timer); signal.removeEventListener('abort', finish); resolve();};
      const timer = setTimeout(finish, delay); signal.addEventListener('abort', finish, {once: true});
    });
    if (signal.aborted) return;
    try {
      value = await load();
      if (signal.aborted) return;
      update(value);
    } catch (error) {
      if (signal.aborted) return;
      if ([401, 403].includes(Number((error as {status?: number})?.status))) {
        options.onExhausted?.(value); return;
      }
    }
  }
  if (!signal.aborted && unresolved(value)) options.onExhausted?.(value);
}
