const DELAYS = [2000, 5000, 10000, 30000];
function wait(delay: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const finish = (active: boolean) => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(active); };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(!signal.aborted), delay);
    signal.addEventListener('abort', abort, {once: true});
  });
}
/** A bounded, invisible refresh. A stopped loop must not leave an eternal loading placeholder. */
export async function refreshPendingSnapshot<T>(initial: T, pending: (value: T) => boolean,
  settled: (value: T) => T, load: () => Promise<T>, update: (value: T) => void, signal: AbortSignal) {
  let value = initial;
  for (let attempt = 0; attempt < DELAYS.length; attempt++) {
    if (!pending(value) || !(await wait(DELAYS[attempt], signal))) return;
    try {
      value = await load();
      if (signal.aborted) return;
      update(attempt === DELAYS.length - 1 ? settled(value) : value);
    } catch {
      if (!signal.aborted) update(settled(value));
      return;
    }
  }
}
